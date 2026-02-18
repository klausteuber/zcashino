import prisma from '@/lib/db'
import { getAdminSettings } from '@/lib/admin/runtime-settings'
import { isKillSwitchActive, getKillSwitchStatus } from '@/lib/kill-switch'
import { getProvablyFairMode, SESSION_NONCE_MODE } from '@/lib/provably-fair/mode'
import { sendTelegramMessage } from '@/lib/notifications/telegram'

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

  const created = await prisma.adminAlert.create({
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

  if (alert.severity === 'critical' || alert.severity === 'warning') {
    const baseUrl = (process.env.NEXT_PUBLIC_URL || '').replace(/\/$/, '')
    const link = baseUrl ? `${baseUrl}/admin/alerts` : '/admin/alerts'
    const msg =
      `[${alert.severity.toUpperCase()}] ${created.title}\n` +
      `${created.description}\n` +
      link
    await sendTelegramMessage(msg)
  }

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
 * Check for players with anomalously high RTP (threshold over 20+ hands).
 */
export async function checkHighRTPPlayers(since: Date, threshold = 1.5): Promise<number> {
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
    if (rtp <= threshold) continue

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
      severity: rtp > threshold * 1.333 ? 'critical' : 'warning',
      title: `High RTP player: ${(rtp * 100).toFixed(1)}%`,
      description: `Session ${session.id.slice(0, 8)}... has ${(rtp * 100).toFixed(1)}% RTP over ${total} hands. Wagered ${session.totalWagered.toFixed(4)} ZEC, won ${session.totalWon.toFixed(4)} ZEC.`,
      sessionId: session.id,
      metadata: { rtp: rtp * 100, threshold, hands: total, wagered: session.totalWagered, won: session.totalWon },
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
 * Check if the kill switch is active (platform maintenance mode).
 */
export async function checkKillSwitchAlert(): Promise<number> {
  if (!isKillSwitchActive()) return 0

  const status = getKillSwitchStatus()
  const wasCreated = await createAlertIfNew({
    type: 'kill_switch_active',
    severity: 'critical',
    title: 'Kill switch ACTIVE',
    description: `Kill switch is active${status.activatedBy ? ` (by ${status.activatedBy})` : ''}. New games and withdrawals are paused.`,
    metadata: {
      activatedAt: status.activatedAt?.toISOString() ?? null,
      activatedBy: status.activatedBy,
    },
  })

  return wasCreated ? 1 : 0
}

/**
 * Check for a backlog of failed withdrawals (potential liquidity or RPC issues).
 */
export async function checkFailedWithdrawalsBacklog(): Promise<number> {
  // Use a longer window than 48h so we still alert on long-lived backlogs.
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const failed = await prisma.transaction.findMany({
    where: { type: 'withdrawal', status: 'failed', createdAt: { gte: since14d } },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true, createdAt: true, failReason: true },
  })

  if (failed.length === 0) return 0

  const oldest = failed[0]?.createdAt ?? new Date()
  const ageMs = Date.now() - oldest.getTime()
  const ageHours = Math.round(ageMs / (60 * 60 * 1000))
  const examples = failed
    .map((t) => t.failReason)
    .filter((r): r is string => !!r)
    .slice(0, 2)
    .join(' | ')

  const severity: 'warning' | 'critical' =
    failed.length >= 5 || ageMs >= 24 * 60 * 60 * 1000 ? 'critical' : 'warning'

  const wasCreated = await createAlertIfNew({
    type: 'withdrawals_failed_backlog',
    severity,
    title: `Failed withdrawals backlog: ${failed.length} in 14d`,
    description:
      `There are ${failed.length} failed withdrawals in the last 14d. ` +
      `Oldest is ~${ageHours}h old.` +
      (examples ? ` Examples: ${examples}` : ''),
    metadata: { count: failed.length, oldestAt: oldest.toISOString(), examples },
  })

  return wasCreated ? 1 : 0
}

/**
 * Check for pending withdrawals that have been stuck too long.
 */
export async function checkPendingWithdrawalsStuck(): Promise<number> {
  const oldest = await prisma.transaction.findFirst({
    where: { type: 'withdrawal', status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })

  if (!oldest) return 0

  const ageMs = Date.now() - oldest.createdAt.getTime()
  const warningMs = 60 * 60 * 1000
  const criticalMs = 24 * 60 * 60 * 1000

  if (ageMs < warningMs) return 0

  const count = await prisma.transaction.count({
    where: { type: 'withdrawal', status: 'pending' },
  })

  const severity: 'warning' | 'critical' = ageMs >= criticalMs ? 'critical' : 'warning'
  const ageHours = Math.round(ageMs / (60 * 60 * 1000))

  const wasCreated = await createAlertIfNew({
    type: 'withdrawals_pending_stuck',
    severity,
    title: `Pending withdrawals stuck: ${count}`,
    description: `There are ${count} pending withdrawals. Oldest is ~${ageHours}h old.`,
    metadata: { count, oldestAt: oldest.createdAt.toISOString(), ageHours },
  })

  return wasCreated ? 1 : 0
}

/**
 * Check commitment pool health.
 */
export async function checkPoolHealth(): Promise<number> {
  const settings = await getAdminSettings()
  const threshold = settings.pool.minHealthy
  const fairnessMode = getProvablyFairMode()
  const now = new Date()

  const available = fairnessMode === SESSION_NONCE_MODE
    ? await prisma.fairnessSeed.count({ where: { status: 'available' } })
    : await prisma.seedCommitment.count({
        where: { status: 'available', expiresAt: { gt: now } },
      })

  if (available >= threshold) return 0

  const wasCreated = await createAlertIfNew({
    type: 'pool_critical',
    severity: available === 0 ? 'critical' : 'warning',
    title: available === 0
      ? 'Commitment pool EMPTY'
      : `Pool low: ${available} commitments`,
    description: available === 0
      ? 'No commitments available — new games cannot start. Refill immediately.'
      : `Only ${available} commitments remaining. Consider refilling the pool.`,
    metadata: { available, threshold, fairnessMode },
  })

  return wasCreated ? 1 : 0
}

/**
 * Check if house balance is low relative to player liabilities.
 * Alerts when coverage ratio drops below 1.5x (warning) or 1.0x (critical).
 */
export async function checkLowHouseBalance(): Promise<number> {
  const houseAddress = process.env.ZCASH_NETWORK === 'mainnet' || !process.env.ZCASH_NETWORK
    ? process.env.HOUSE_ZADDR_MAINNET
    : process.env.HOUSE_ZADDR_TESTNET

  if (!houseAddress) return 0

  const { getAddressBalance } = await import('@/lib/wallet/rpc')
  const network = (process.env.ZCASH_NETWORK || 'mainnet') as 'mainnet' | 'testnet'

  let houseBalance: { confirmed: number }
  try {
    houseBalance = await getAddressBalance(houseAddress, network, 1)
  } catch {
    return 0 // Can't check if node is down — other alerts will fire for that
  }

  const liabilities = await prisma.session.aggregate({
    _sum: { balance: true },
    where: { balance: { gt: 0 } },
  })

  const totalLiabilities = liabilities._sum.balance ?? 0
  if (totalLiabilities === 0) return 0

  const coverage = houseBalance.confirmed / totalLiabilities

  if (coverage >= 1.5) return 0

  const severity: 'warning' | 'critical' = coverage < 1.0 ? 'critical' : 'warning'

  const wasCreated = await createAlertIfNew({
    type: 'low_house_balance',
    severity,
    title: coverage < 1.0
      ? `House balance below liabilities: ${coverage.toFixed(2)}x`
      : `House balance low: ${coverage.toFixed(2)}x coverage`,
    description:
      `House confirmed balance is ${houseBalance.confirmed.toFixed(4)} ZEC ` +
      `against ${totalLiabilities.toFixed(4)} ZEC in player liabilities ` +
      `(${coverage.toFixed(2)}x coverage).`,
    metadata: {
      houseBalance: houseBalance.confirmed,
      liabilities: totalLiabilities,
      coverageRatio: coverage,
    },
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
  failedWithdrawals: number
  pendingWithdrawals: number
  killSwitch: number
  poolHealth: number
  lowHouseBalance: number
  total: number
}> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const settings = await getAdminSettings()

  const [largeWins, highRTP, rapidCycles, withdrawalVelocity, failedWithdrawals, pendingWithdrawals, killSwitch, poolHealth, lowHouseBalance] =
    await Promise.all([
      checkLargeWins(since24h, settings.alerts.largeWinThreshold),
      checkHighRTPPlayers(since24h, settings.alerts.highRtpThreshold),
      checkRapidCycles(since24h),
      checkWithdrawalVelocity(since24h),
      checkFailedWithdrawalsBacklog(),
      checkPendingWithdrawalsStuck(),
      checkKillSwitchAlert(),
      checkPoolHealth(),
      checkLowHouseBalance(),
    ])

  const total = largeWins + highRTP + rapidCycles + withdrawalVelocity + failedWithdrawals + pendingWithdrawals + killSwitch + poolHealth + lowHouseBalance

  if (total > 0) {
    console.log(
      `[alert-generator] Generated ${total} new alerts: wins=${largeWins} rtp=${highRTP} cycles=${rapidCycles} velocity=${withdrawalVelocity} failedW=${failedWithdrawals} pendingW=${pendingWithdrawals} kill=${killSwitch} pool=${poolHealth} balance=${lowHouseBalance}`
    )
  }

  return { largeWins, highRTP, rapidCycles, withdrawalVelocity, failedWithdrawals, pendingWithdrawals, killSwitch, poolHealth, lowHouseBalance, total }
}
