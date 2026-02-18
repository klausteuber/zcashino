import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { toCsvResponse, isCsvRequest } from '@/lib/admin/csv-export'
import { getHistoricalPrices, captureDaily } from '@/lib/admin/price-history'
import { REAL_SESSIONS_WHERE, REAL_SESSION_RELATION } from '@/lib/admin/query-filters'

type ValidPeriod = '24h' | '7d' | '30d' | 'all'
const VALID_PERIODS: ValidPeriod[] = ['24h', '7d', '30d', 'all']

function parsePeriod(param: string | null): { period: ValidPeriod; periodStart: Date } {
  const period = VALID_PERIODS.includes(param as ValidPeriod)
    ? (param as ValidPeriod)
    : '7d'

  let periodStart: Date
  switch (period) {
    case '24h':
      periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
      break
    case '7d':
      periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      break
    case '30d':
      periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      break
    case 'all':
      periodStart = new Date(0)
      break
  }

  return { period, periodStart }
}

/**
 * GET /api/admin/analytics?period=24h|7d|30d|all
 * Authenticated admin time-series analytics data.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.analytics.read',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const adminCheck = requireAdmin(request, 'view_analytics')
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.analytics.read',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const { period, periodStart } = parsePeriod(
      request.nextUrl.searchParams.get('period')
    )

    const [
      // Blackjack stats (period-filtered)
      bjStats,
      // Video poker stats (period-filtered)
      vpStats,
      // Video poker hand rank breakdown (period-filtered)
      vpHandRanks,
      // Side bets: perfect pairs (period-filtered)
      perfectPairsStats,
      // Side bets: insurance (period-filtered)
      insuranceStats,
      // Active games (current exposure)
      activeBJGames,
      activeVPGames,
    ] = await Promise.all([
      prisma.blackjackGame.aggregate({
        where: { status: 'completed', completedAt: { gte: periodStart }, ...REAL_SESSION_RELATION },
        _sum: { mainBet: true, perfectPairsBet: true, insuranceBet: true, payout: true },
        _count: true,
      }),
      prisma.videoPokerGame.aggregate({
        where: { status: 'completed', completedAt: { gte: periodStart }, ...REAL_SESSION_RELATION },
        _sum: { totalBet: true, payout: true },
        _count: true,
      }),
      prisma.videoPokerGame.groupBy({
        by: ['handRank'],
        where: { status: 'completed', completedAt: { gte: periodStart }, ...REAL_SESSION_RELATION },
        _count: true,
      }),
      prisma.blackjackGame.aggregate({
        where: {
          status: 'completed',
          perfectPairsBet: { gt: 0 },
          completedAt: { gte: periodStart },
          ...REAL_SESSION_RELATION,
        },
        _sum: { perfectPairsBet: true },
        _count: true,
      }),
      prisma.blackjackGame.aggregate({
        where: {
          status: 'completed',
          insuranceBet: { gt: 0 },
          completedAt: { gte: periodStart },
          ...REAL_SESSION_RELATION,
        },
        _sum: { insuranceBet: true },
        _count: true,
      }),
      prisma.blackjackGame.count({ where: { status: 'active', ...REAL_SESSION_RELATION } }),
      prisma.videoPokerGame.count({ where: { status: 'active', ...REAL_SESSION_RELATION } }),
    ])

    // Daily trends — raw SQL for date grouping
    const [dailyTx, dailyBJ, dailyVP, dailySessions] = await Promise.all([
      prisma.$queryRaw`
        SELECT DATE(t.confirmedAt) as date, t.type,
          COUNT(*) as count, SUM(t.amount) as volume
        FROM "Transaction" t
        JOIN Session s ON t.sessionId = s.id
        WHERE t.status = 'confirmed' AND t.confirmedAt >= ${periodStart}
          AND s.walletAddress NOT LIKE 'demo_%'
        GROUP BY DATE(t.confirmedAt), t.type ORDER BY date
      ` as Promise<Array<{ date: string; type: string; count: bigint; volume: number }>>,

      prisma.$queryRaw`
        SELECT DATE(bg.completedAt) as date,
          COUNT(*) as hands,
          SUM(bg.mainBet + bg.perfectPairsBet + bg.insuranceBet) as wagered,
          SUM(bg.payout) as payout
        FROM BlackjackGame bg
        JOIN Session s ON bg.sessionId = s.id
        WHERE bg.status = 'completed' AND bg.completedAt >= ${periodStart}
          AND s.walletAddress NOT LIKE 'demo_%'
        GROUP BY DATE(bg.completedAt) ORDER BY date
      ` as Promise<Array<{ date: string; hands: bigint; wagered: number; payout: number }>>,

      prisma.$queryRaw`
        SELECT DATE(vp.completedAt) as date,
          COUNT(*) as hands,
          SUM(vp.totalBet) as wagered,
          SUM(vp.payout) as payout
        FROM VideoPokerGame vp
        JOIN Session s ON vp.sessionId = s.id
        WHERE vp.status = 'completed' AND vp.completedAt >= ${periodStart}
          AND s.walletAddress NOT LIKE 'demo_%'
        GROUP BY DATE(vp.completedAt) ORDER BY date
      ` as Promise<Array<{ date: string; hands: bigint; wagered: number; payout: number }>>,

      prisma.$queryRaw`
        SELECT DATE(lastActiveAt) as date, COUNT(DISTINCT id) as count
        FROM Session WHERE lastActiveAt >= ${periodStart}
          AND walletAddress NOT LIKE 'demo_%'
        GROUP BY DATE(lastActiveAt) ORDER BY date
      ` as Promise<Array<{ date: string; count: bigint }>>,
    ])

    // Merge daily trends into a single array keyed by date
    const dateMap = new Map<
      string,
      {
        date: string
        deposits: number
        withdrawals: number
        netFlow: number
        bjWagered: number
        bjPayout: number
        vpWagered: number
        vpPayout: number
        activeSessions: number
      }
    >()

    const getOrCreate = (date: string) => {
      if (!dateMap.has(date)) {
        dateMap.set(date, {
          date,
          deposits: 0,
          withdrawals: 0,
          netFlow: 0,
          bjWagered: 0,
          bjPayout: 0,
          vpWagered: 0,
          vpPayout: 0,
          activeSessions: 0,
        })
      }
      return dateMap.get(date)!
    }

    for (const row of dailyTx) {
      const entry = getOrCreate(row.date)
      const volume = row.volume || 0
      if (row.type === 'deposit') {
        entry.deposits = volume
      } else if (row.type === 'withdrawal') {
        entry.withdrawals = volume
      }
    }

    for (const row of dailyBJ) {
      const entry = getOrCreate(row.date)
      entry.bjWagered = row.wagered || 0
      entry.bjPayout = row.payout || 0
    }

    for (const row of dailyVP) {
      const entry = getOrCreate(row.date)
      entry.vpWagered = row.wagered || 0
      entry.vpPayout = row.payout || 0
    }

    for (const row of dailySessions) {
      const entry = getOrCreate(row.date)
      entry.activeSessions = Number(row.count)
    }

    // Compute netFlow and sort by date
    const daily = Array.from(dateMap.values())
      .map((d) => ({
        ...d,
        netFlow: d.deposits - d.withdrawals,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // --- USD-adjusted GGR (Item 8) ---
    // Capture today's price if missing, then fetch historical prices for the range
    let priceMap = new Map<string, number>()
    try {
      await captureDaily()
      if (daily.length > 0) {
        priceMap = await getHistoricalPrices(daily[0].date, daily[daily.length - 1].date)
      }
    } catch {
      // Price data is best-effort; continue without it
    }

    // Enrich daily trends with USD values
    const dailyWithUsd = daily.map((d) => {
      const totalWagered = d.bjWagered + d.vpWagered
      const totalPayout = d.bjPayout + d.vpPayout
      const ggr = totalWagered - totalPayout
      const price = priceMap.get(d.date) ?? null
      return {
        ...d,
        totalWagered,
        totalPayout,
        ggr,
        priceUsd: price,
        ggrUsd: price !== null ? ggr * price : null,
        wageredUsd: price !== null ? totalWagered * price : null,
      }
    })

    // --- Retention & Acquisition (Item 5) ---
    const [newSessionsByDay, retentionCohorts] = await Promise.all([
      // New sessions per day (acquisition)
      prisma.$queryRaw`
        SELECT DATE(createdAt) as date, COUNT(*) as count
        FROM Session WHERE createdAt >= ${periodStart}
          AND walletAddress NOT LIKE 'demo_%'
        GROUP BY DATE(createdAt) ORDER BY date
      ` as Promise<Array<{ date: string; count: bigint }>>,

      // D1/D7/D30 retention cohorts
      prisma.$queryRaw`
        SELECT
          DATE(s.createdAt) as cohort_date,
          COUNT(DISTINCT s.id) as cohort_size,
          COUNT(DISTINCT CASE
            WHEN s.lastActiveAt >= datetime(s.createdAt, '+1 day') THEN s.id END) as d1,
          COUNT(DISTINCT CASE
            WHEN s.lastActiveAt >= datetime(s.createdAt, '+7 day') THEN s.id END) as d7,
          COUNT(DISTINCT CASE
            WHEN s.lastActiveAt >= datetime(s.createdAt, '+30 day') THEN s.id END) as d30
        FROM Session s
        WHERE s.createdAt >= ${periodStart} AND s.totalWagered > 0
          AND s.walletAddress NOT LIKE 'demo_%'
        GROUP BY DATE(s.createdAt) ORDER BY cohort_date
      ` as Promise<Array<{
        cohort_date: string
        cohort_size: bigint
        d1: bigint
        d7: bigint
        d30: bigint
      }>>,
    ])

    // First-wager activation: sessions whose FIRST game was in this period
    const firstWagerByDay = await prisma.$queryRaw`
      SELECT DATE(first_game) as date, COUNT(*) as count
      FROM (
        SELECT sessionId, MIN(completedAt) as first_game
        FROM (
          SELECT bg.sessionId, bg.completedAt FROM BlackjackGame bg
          JOIN Session s ON bg.sessionId = s.id
          WHERE bg.status = 'completed' AND s.walletAddress NOT LIKE 'demo_%'
          UNION ALL
          SELECT vp.sessionId, vp.completedAt FROM VideoPokerGame vp
          JOIN Session s ON vp.sessionId = s.id
          WHERE vp.status = 'completed' AND s.walletAddress NOT LIKE 'demo_%'
        )
        GROUP BY sessionId
        HAVING first_game >= ${periodStart}
      )
      GROUP BY DATE(first_game) ORDER BY date
    ` as Array<{ date: string; count: bigint }>

    const retention = {
      newSessionsByDay: newSessionsByDay.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
      firstWagerByDay: firstWagerByDay.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
      cohorts: retentionCohorts.map((r) => ({
        cohortDate: r.cohort_date,
        cohortSize: Number(r.cohort_size),
        d1: Number(r.d1),
        d7: Number(r.d7),
        d30: Number(r.d30),
        d1Pct: Number(r.cohort_size) > 0 ? Math.round((Number(r.d1) / Number(r.cohort_size)) * 100) : 0,
        d7Pct: Number(r.cohort_size) > 0 ? Math.round((Number(r.d7) / Number(r.cohort_size)) * 100) : 0,
        d30Pct: Number(r.cohort_size) > 0 ? Math.round((Number(r.d30) / Number(r.cohort_size)) * 100) : 0,
      })),
    }

    // --- Time-of-Day / Day-of-Week (Item 6) ---
    const activityHeatmap = await prisma.$queryRaw`
      SELECT
        CAST(strftime('%w', completedAt) AS INTEGER) as dow,
        CAST(strftime('%H', completedAt) AS INTEGER) as hour,
        COUNT(*) as hands,
        SUM(amount) as wagered
      FROM (
        SELECT bg.completedAt, bg.mainBet + bg.perfectPairsBet + bg.insuranceBet as amount
        FROM BlackjackGame bg
        JOIN Session s ON bg.sessionId = s.id
        WHERE bg.status = 'completed' AND bg.completedAt >= ${periodStart}
          AND s.walletAddress NOT LIKE 'demo_%'
        UNION ALL
        SELECT vp.completedAt, vp.totalBet as amount
        FROM VideoPokerGame vp
        JOIN Session s ON vp.sessionId = s.id
        WHERE vp.status = 'completed' AND vp.completedAt >= ${periodStart}
          AND s.walletAddress NOT LIKE 'demo_%'
      )
      GROUP BY dow, hour ORDER BY dow, hour
    ` as Array<{ dow: number; hour: number; hands: bigint; wagered: number }>

    const activityPatterns = {
      heatmap: activityHeatmap.map((r) => ({
        dow: r.dow,
        hour: r.hour,
        hands: Number(r.hands),
        wagered: r.wagered || 0,
      })),
    }

    // CSV export: daily trends with USD
    if (isCsvRequest(request)) {
      const rows = dailyWithUsd.map((d) => ({
        date: d.date,
        deposits: d.deposits,
        withdrawals: d.withdrawals,
        netFlow: d.netFlow,
        bjWagered: d.bjWagered,
        bjPayout: d.bjPayout,
        vpWagered: d.vpWagered,
        vpPayout: d.vpPayout,
        totalWagered: d.totalWagered,
        totalPayout: d.totalPayout,
        ggr: d.ggr,
        zecPriceUsd: d.priceUsd ?? '',
        ggrUsd: d.ggrUsd ?? '',
        wageredUsd: d.wageredUsd ?? '',
        activeSessions: d.activeSessions,
      }))

      await logAdminEvent({
        request,
        action: 'admin.analytics.export',
        success: true,
        actor: adminCheck.session.username,
        details: `Exported ${rows.length} daily analytics rows as CSV (period=${period})`,
      })

      return toCsvResponse(rows, `analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`)
    }

    // Compute summary values
    const bjWagered = (bjStats._sum.mainBet || 0) + (bjStats._sum.perfectPairsBet || 0) + (bjStats._sum.insuranceBet || 0)
    const bjPayout = bjStats._sum.payout || 0
    const bjHands = bjStats._count

    const vpWagered = vpStats._sum.totalBet || 0
    const vpPayout = vpStats._sum.payout || 0
    const vpHands = vpStats._count

    const totalWagered = bjWagered + vpWagered
    const totalPayout = bjPayout + vpPayout
    const ggr = totalWagered - totalPayout
    const houseEdgePct = totalWagered > 0 ? (ggr / totalWagered) * 100 : 0

    // Build hand rank breakdown (convert bigint counts)
    const handRankBreakdown: Record<string, number> = {}
    for (const row of vpHandRanks) {
      const rank = row.handRank ?? 'unknown'
      handRankBreakdown[rank] = row._count
    }

    await logAdminEvent({
      request,
      action: 'admin.analytics.read',
      success: true,
      actor: adminCheck.session.username,
      details: `Analytics fetched for period=${period}`,
    })

    return NextResponse.json({
      period,
      periodStart: periodStart.toISOString(),
      summary: {
        realizedGGR: {
          totalWagered,
          totalPayout,
          ggr,
          houseEdgePct: Math.round(houseEdgePct * 100) / 100,
        },
        activeExposure: {
          activeGames: activeBJGames + activeVPGames,
        },
      },
      byGame: {
        blackjack: {
          hands: bjHands,
          wagered: bjWagered,
          payout: bjPayout,
          rtp: bjWagered > 0 ? Math.round((bjPayout / bjWagered) * 10000) / 100 : 0,
        },
        videoPoker: {
          hands: vpHands,
          wagered: vpWagered,
          payout: vpPayout,
          rtp:
            vpWagered > 0
              ? Math.round((vpPayout / vpWagered) * 10000) / 100
              : 0,
          handRankBreakdown,
        },
      },
      sideBets: {
        perfectPairs: {
          count: perfectPairsStats._count,
          wagered: perfectPairsStats._sum.perfectPairsBet || 0,
        },
        insurance: {
          count: insuranceStats._count,
          wagered: insuranceStats._sum.insuranceBet || 0,
        },
      },
      theoretical: {
        blackjackRTP: 0.9950,
        videoPokerRTP: 0.9954,
      },
      trends: {
        daily: dailyWithUsd,
      },
      retention,
      activityPatterns,
    })
  } catch (error) {
    console.error('Admin analytics error:', error)
    await logAdminEvent({
      request,
      action: 'admin.analytics.read',
      success: false,
      actor: adminCheck.session.username,
      details:
        error instanceof Error ? error.message : 'Failed to fetch analytics',
    })
    return NextResponse.json(
      { error: 'Failed to fetch admin analytics.' },
      { status: 500 }
    )
  }
}
