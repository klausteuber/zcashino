import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'

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

  const adminCheck = requireAdmin(request)
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
      // Session totals (lifetime — no period granularity on session aggregates)
      sessionTotals,
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
      prisma.session.aggregate({
        _sum: {
          totalWagered: true,
          totalWon: true,
        },
      }),
      prisma.blackjackGame.aggregate({
        where: { status: 'completed', completedAt: { gte: periodStart } },
        _sum: { payout: true },
        _count: true,
      }),
      prisma.videoPokerGame.aggregate({
        where: { status: 'completed', completedAt: { gte: periodStart } },
        _sum: { totalBet: true, payout: true },
        _count: true,
      }),
      prisma.videoPokerGame.groupBy({
        by: ['handRank'],
        where: { status: 'completed', completedAt: { gte: periodStart } },
        _count: true,
      }),
      prisma.blackjackGame.aggregate({
        where: {
          status: 'completed',
          perfectPairsBet: { gt: 0 },
          completedAt: { gte: periodStart },
        },
        _sum: { perfectPairsBet: true },
        _count: true,
      }),
      prisma.blackjackGame.aggregate({
        where: {
          status: 'completed',
          insuranceBet: { gt: 0 },
          completedAt: { gte: periodStart },
        },
        _sum: { insuranceBet: true },
        _count: true,
      }),
      prisma.blackjackGame.count({ where: { status: 'active' } }),
      prisma.videoPokerGame.count({ where: { status: 'active' } }),
    ])

    // Daily trends — raw SQL for date grouping
    const [dailyTx, dailyBJ, dailyVP, dailySessions] = await Promise.all([
      prisma.$queryRaw`
        SELECT DATE(confirmedAt) as date, type,
          COUNT(*) as count, SUM(amount) as volume
        FROM "Transaction"
        WHERE status = 'confirmed' AND confirmedAt >= ${periodStart}
        GROUP BY DATE(confirmedAt), type ORDER BY date
      ` as Promise<Array<{ date: string; type: string; count: bigint; volume: number }>>,

      prisma.$queryRaw`
        SELECT DATE(completedAt) as date,
          COUNT(*) as hands,
          SUM(payout) as payout
        FROM BlackjackGame
        WHERE status = 'completed' AND completedAt >= ${periodStart}
        GROUP BY DATE(completedAt) ORDER BY date
      ` as Promise<Array<{ date: string; hands: bigint; payout: number }>>,

      prisma.$queryRaw`
        SELECT DATE(completedAt) as date,
          COUNT(*) as hands,
          SUM(totalBet) as wagered,
          SUM(payout) as payout
        FROM VideoPokerGame
        WHERE status = 'completed' AND completedAt >= ${periodStart}
        GROUP BY DATE(completedAt) ORDER BY date
      ` as Promise<Array<{ date: string; hands: bigint; wagered: number; payout: number }>>,

      prisma.$queryRaw`
        SELECT DATE(lastActiveAt) as date, COUNT(DISTINCT id) as count
        FROM Session WHERE lastActiveAt >= ${periodStart}
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

    // Compute summary values
    const totalWagered = sessionTotals._sum.totalWagered || 0
    const totalWon = sessionTotals._sum.totalWon || 0
    const ggr = totalWagered - totalWon
    const houseEdgePct = totalWagered > 0 ? (ggr / totalWagered) * 100 : 0

    const bjPayout = bjStats._sum.payout || 0
    const bjHands = bjStats._count
    const vpWagered = vpStats._sum.totalBet || 0
    const vpPayout = vpStats._sum.payout || 0
    const vpHands = vpStats._count

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
          totalPayout: totalWon,
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
          payout: bjPayout,
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
        daily,
      },
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
