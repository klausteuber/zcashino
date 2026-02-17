import prisma from '@/lib/db'

/**
 * Alert generation functions for the admin dashboard.
 * These are called by the background alert-generator service,
 * NOT by the UI poll. Alerts are persisted in AdminAlert table.
 */

interface AlertInput {
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  sessionId?: string
  gameId?: string
  metadata?: Record<string, unknown>
}

/**
 * Create an alert if a duplicate doesn't already exist today.
 * Deduplicates by type + sessionId + date.
 */
async function createAlertIfNew(alert: AlertInput): Promise<boolean> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const existing = await prisma.adminAlert.findFirst({
    where: {
      type: alert.type,
      sessionId: alert.sessionId ?? null,
      gameId: alert.gameId ?? null,
      createdAt: { gte: today, lt: tomorrow },
    },
  })

  if (existing) return false

  await prisma.adminAlert.create({
    data: {
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      sessionId: alert.sessionId,
      gameId: alert.gameId,
      metadata: alert.metadata ? JSON.stringify(alert.metadata) : null,
    },
  })

  return true
}

/**
 * Check for large single-hand wins (payout > threshold).
 */
export async function checkLargeWins(since: Date, threshold = 1.0): Promise<number> {
  let created = 0

  const largeBJWins = await prisma.blackjackGame.findMany({
    where: {
      status: 'completed',
      payout: { gt: threshold },
      completedAt: { gte: since },
    },
    select: { id: true, sessionId: true, payout: true, mainBet: true, outcome: true },
    orderBy: { payout: 'desc' },
    take: 20,
  })

  for (const game of largeBJWins) {
    const wasCreated = await createAlertIfNew({
      type: 'large_win',
      severity: (game.payout ?? 0) >= threshold * 5 ? 'critical' : 'warning',
      title: `Large blackjack win: ${(game.payout ?? 0).toFixed(4)} ZEC`,
      description: `Session ${game.sessionId.slice(0, 8)}... won ${(game.payout ?? 0).toFixed(4)} ZEC on a ${game.mainBet.toFixed(4)} ZEC bet (${game.outcome}).`,
      sessionId: game.sessionId,
      gameId: game.id,
      metadata: { payout: game.payout, bet: game.mainBet, outcome: game.outcome, gameType: 'blackjack' },
    })
    if (wasCreated) created++
  }

  const largeVPWins = await prisma.videoPokerGame.findMany({
    where: {
      status: 'completed',
      payout: { gt: threshold },
      completedAt: { gte: since },
    },
    select: { id: true, sessionId: true, payout: true, totalBet: true, handRank: true },
    orderBy: { payout: 'desc' },
    take: 20,
  })

  for (const game of largeVPWins) {
    const wasCreated = await createAlertIfNew({
      type: 'large_win',
      severity: (game.payout ?? 0) >= threshold * 5 ? 'critical' : 'warning',
      title: `Large video poker win: ${(game.payout ?? 0).toFixed(4)} ZEC`,
      description: `Session ${game.sessionId.slice(0, 8)}... won ${(game.payout ?? 0).toFixed(4)} ZEC (${game.handRank}) on ${game.totalBet.toFixed(4)} ZEC bet.`,
      sessionId: game.sessionId,
      gameId: game.id,
      metadata: { payout: game.payout, bet: game.totalBet, handRank: game.handRank, gameType: 'videoPoker' },
    })
    if (wasCreated) created++
  }

  return created
}

/**
 * Check for players with anomalously high RTP (> 150% over 20+ hands).
 */
export async function checkHighRTPPlayers(since: Date): Promise<number> {
  let created = 0

  const sessions = await prisma.session.findMany({
    where: {
      totalWagered: { gt: 0 },
      lastActiveAt: { gte: since },
    },
    select: { id: true, totalWagered: true, totalWon: true },
  })

  for (const session of sessions) {
    const rtp = session.totalWon / session.totalWagered
    if (rtp <= 1.5) continue

    // Check hand count
    const handCount = await prisma.blackjackGame.count({
      where: { sessionId: session.id, status: 'completed' },
    })
    const vpCount = await prisma.videoPokerGame.count({
      where: { sessionId: session.id, status: 'completed' },
    })
    const total = handCount + vpCount
    if (total < 20) continue

    const wasCreated = await createAlertIfNew({
      type: 'high_rtp',
      severity: rtp > 2.0 ? 'critical' : 'warning',
      title: `High RTP player: ${(rtp * 100).toFixed(1)}%`,
      description: `Session ${session.id.slice(0, 8)}... has ${(rtp * 100).toFixed(1)}% RTP over ${total} hands. Wagered ${session.totalWagered.toFixed(4)} ZEC, won ${session.totalWon.toFixed(4)} ZEC.`,
      sessionId: session.id,
      metadata: { rtp: rtp * 100, hands: total, wagered: session.totalWagered, won: session.totalWon },
    })
    if (wasCreated) created++
  }

  return created
}

/**
 * Check for rapid deposit→play→withdraw cycles (within 30 minutes).
 */
export async function checkRapidCycles(since: Date): Promise<number> {
  let created = 0

  const recentDeposits = await prisma.transaction.findMany({
    where: {
      type: 'deposit',
      status: 'confirmed',
      confirmedAt: { gte: since },
    },
    select: { sessionId: true, confirmedAt: true, amount: true },
    orderBy: { confirmedAt: 'desc' },
  })

  for (const deposit of recentDeposits) {
    if (!deposit.confirmedAt) continue

    const windowEnd = new Date(deposit.confirmedAt.getTime() + 30 * 60 * 1000)

    const quickWithdrawal = await prisma.transaction.findFirst({
      where: {
        sessionId: deposit.sessionId,
        type: 'withdrawal',
        createdAt: { gte: deposit.confirmedAt, lte: windowEnd },
      },
    })

    if (!quickWithdrawal) continue

    const wasCreated = await createAlertIfNew({
      type: 'rapid_cycle',
      severity: 'warning',
      title: `Rapid deposit→withdraw cycle`,
      description: `Session ${deposit.sessionId.slice(0, 8)}... deposited ${deposit.amount.toFixed(4)} ZEC and initiated withdrawal within 30 minutes.`,
      sessionId: deposit.sessionId,
      metadata: {
        depositAmount: deposit.amount,
        depositTime: deposit.confirmedAt.toISOString(),
        withdrawalTime: quickWithdrawal.createdAt.toISOString(),
      },
    })
    if (wasCreated) created++
  }

  return created
}

/**
 * Check for unusual withdrawal velocity (same address > 3 withdrawals in 24h).
 */
export async function checkWithdrawalVelocity(since: Date): Promise<number> {
  let created = 0

  const withdrawalsByAddress = await prisma.$queryRaw<
    Array<{ address: string; count: bigint; total: number }>
  >`
    SELECT address, COUNT(*) as count, SUM(amount) as total
    FROM "Transaction"
    WHERE type = 'withdrawal'
      AND createdAt >= ${since}
      AND address IS NOT NULL
    GROUP BY address
    HAVING COUNT(*) > 3
    ORDER BY count DESC
  `

  for (const row of withdrawalsByAddress) {
    const count = Number(row.count)
    const wasCreated = await createAlertIfNew({
      type: 'withdrawal_velocity',
      severity: count > 5 ? 'critical' : 'warning',
      title: `High withdrawal frequency: ${count} withdrawals`,
      description: `Address ${(row.address).slice(0, 12)}... has ${count} withdrawals totaling ${(row.total ?? 0).toFixed(4)} ZEC in the last 24h.`,
      metadata: { address: row.address, count, total: row.total },
    })
    if (wasCreated) created++
  }

  return created
}

/**
 * Check commitment pool health.
 */
export async function checkPoolHealth(): Promise<number> {
  const available = await prisma.seedCommitment.count({
    where: { status: 'available' },
  })

  if (available >= 5) return 0

  const wasCreated = await createAlertIfNew({
    type: 'pool_critical',
    severity: available === 0 ? 'critical' : 'warning',
    title: available === 0
      ? 'Commitment pool EMPTY'
      : `Pool low: ${available} commitments`,
    description: available === 0
      ? 'No commitments available — new games cannot start. Refill immediately.'
      : `Only ${available} commitments remaining. Consider refilling the pool.`,
    metadata: { available },
  })

  return wasCreated ? 1 : 0
}

/**
 * Run all alert checks. Called by the background alert-generator service.
 */
export async function generateAlerts(): Promise<{
  largeWins: number
  highRTP: number
  rapidCycles: number
  withdrawalVelocity: number
  poolHealth: number
  total: number
}> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [largeWins, highRTP, rapidCycles, withdrawalVelocity, poolHealth] =
    await Promise.all([
      checkLargeWins(since24h),
      checkHighRTPPlayers(since24h),
      checkRapidCycles(since24h),
      checkWithdrawalVelocity(since24h),
      checkPoolHealth(),
    ])

  const total = largeWins + highRTP + rapidCycles + withdrawalVelocity + poolHealth

  if (total > 0) {
    console.log(
      `[alert-generator] Generated ${total} new alerts: wins=${largeWins} rtp=${highRTP} cycles=${rapidCycles} velocity=${withdrawalVelocity} pool=${poolHealth}`
    )
  }

  return { largeWins, highRTP, rapidCycles, withdrawalVelocity, poolHealth, total }
}
