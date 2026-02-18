/**
 * Player risk assessment engine.
 * Computes risk flags from existing game/session data (no new tables needed).
 */

import prisma from '@/lib/db'

export interface PlayerRiskFlags {
  isHighRoller: boolean
  velocityAlert: boolean
  lossChasingAlert: boolean
  rtpOutlier: boolean
  sessionMarathon: boolean
  rapidCycle: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Assess risk for a single player session.
 * Designed to be called on-demand per player (player detail page)
 * or in batch (player list with risk badges).
 */
export async function assessPlayerRisk(sessionId: string): Promise<PlayerRiskFlags> {
  const flags: PlayerRiskFlags = {
    isHighRoller: false,
    velocityAlert: false,
    lossChasingAlert: false,
    rtpOutlier: false,
    sessionMarathon: false,
    rapidCycle: false,
    riskLevel: 'low',
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      totalWagered: true,
      totalWon: true,
      createdAt: true,
      lastActiveAt: true,
      totalDeposited: true,
      totalWithdrawn: true,
    },
  })

  if (!session) return flags

  // 1. High roller: top tier by totalWagered (>1 ZEC wagered)
  flags.isHighRoller = session.totalWagered > 1

  // 2. Session marathon: active for >4 hours
  const sessionDurationHours =
    (session.lastActiveAt.getTime() - session.createdAt.getTime()) / (1000 * 60 * 60)
  flags.sessionMarathon = sessionDurationHours > 4

  // 3. RTP outlier: player's realized RTP > 150% over 50+ hands
  const [bjCount, vpCount] = await Promise.all([
    prisma.blackjackGame.count({ where: { sessionId, status: 'completed' } }),
    prisma.videoPokerGame.count({ where: { sessionId, status: 'completed' } }),
  ])
  const totalHands = bjCount + vpCount
  if (totalHands >= 50 && session.totalWagered > 0) {
    const playerRtp = (session.totalWon / session.totalWagered) * 100
    flags.rtpOutlier = playerRtp > 150
  }

  // 4. Velocity alert: compare recent 1h wager rate vs overall average
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const [recentBJ, recentVP] = await Promise.all([
    prisma.blackjackGame.aggregate({
      where: { sessionId, status: 'completed', completedAt: { gte: oneHourAgo } },
      _sum: { mainBet: true, perfectPairsBet: true, insuranceBet: true },
      _count: true,
    }),
    prisma.videoPokerGame.aggregate({
      where: { sessionId, status: 'completed', completedAt: { gte: oneHourAgo } },
      _sum: { totalBet: true },
      _count: true,
    }),
  ])
  const recentWagered =
    (recentBJ._sum.mainBet || 0) +
    (recentBJ._sum.perfectPairsBet || 0) +
    (recentBJ._sum.insuranceBet || 0) +
    (recentVP._sum.totalBet || 0)

  if (sessionDurationHours > 1 && session.totalWagered > 0) {
    const hourlyAvg = session.totalWagered / sessionDurationHours
    flags.velocityAlert = recentWagered > hourlyAvg * 3
  }

  // 5. Loss chasing: look at last 10 games — increasing bets after consecutive losses
  const recentGames = await prisma.blackjackGame.findMany({
    where: { sessionId, status: 'completed' },
    orderBy: { completedAt: 'desc' },
    take: 10,
    select: { mainBet: true, outcome: true },
  })

  if (recentGames.length >= 5) {
    let consecutiveLosses = 0
    let betIncreasesAfterLoss = 0
    for (let i = recentGames.length - 1; i > 0; i--) {
      if (recentGames[i].outcome === 'lose') {
        consecutiveLosses++
        if (consecutiveLosses >= 2 && recentGames[i - 1].mainBet > recentGames[i].mainBet * 1.3) {
          betIncreasesAfterLoss++
        }
      } else {
        consecutiveLosses = 0
      }
    }
    flags.lossChasingAlert = betIncreasesAfterLoss >= 2
  }

  // 6. Rapid cycle: deposit → heavy wagering → withdrawal attempt within 1 hour
  const oneHourTransactions = await prisma.transaction.findMany({
    where: {
      sessionId,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    select: { type: true, amount: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const hasRecentDeposit = oneHourTransactions.some((t) => t.type === 'deposit')
  const hasRecentWithdrawal = oneHourTransactions.some((t) => t.type === 'withdrawal')
  flags.rapidCycle = hasRecentDeposit && hasRecentWithdrawal && recentWagered > 0.1

  // Compute overall risk level
  const flagCount = [
    flags.velocityAlert,
    flags.lossChasingAlert,
    flags.rtpOutlier,
    flags.sessionMarathon,
    flags.rapidCycle,
  ].filter(Boolean).length

  if (flagCount >= 3) flags.riskLevel = 'critical'
  else if (flagCount === 2) flags.riskLevel = 'high'
  else if (flagCount === 1) flags.riskLevel = 'medium'
  else flags.riskLevel = 'low'

  return flags
}

/**
 * Batch risk assessment: returns risk level for multiple sessions.
 * Lighter-weight than full assessPlayerRisk — uses aggregate queries.
 */
export async function batchRiskLevels(
  sessionIds: string[]
): Promise<Map<string, { riskLevel: string; flagCount: number }>> {
  const result = new Map<string, { riskLevel: string; flagCount: number }>()

  // Get session durations and wagering data in bulk
  const sessions = await prisma.session.findMany({
    where: { id: { in: sessionIds } },
    select: {
      id: true,
      totalWagered: true,
      totalWon: true,
      createdAt: true,
      lastActiveAt: true,
      totalDeposited: true,
      totalWithdrawn: true,
    },
  })

  for (const s of sessions) {
    let flagCount = 0

    // Marathon
    const hours = (s.lastActiveAt.getTime() - s.createdAt.getTime()) / (1000 * 60 * 60)
    if (hours > 4) flagCount++

    // RTP outlier (approximate — uses totalWon/totalWagered without hand count check)
    if (s.totalWagered > 0.5) {
      const rtp = (s.totalWon / s.totalWagered) * 100
      if (rtp > 150) flagCount++
    }

    // Rapid cycle indicator (simple: both deposited and withdrawn)
    if (s.totalDeposited > 0 && s.totalWithdrawn > 0 && s.totalWagered > 0) {
      const sessionMinutes = hours * 60
      if (sessionMinutes > 0 && sessionMinutes < 60) flagCount++
    }

    let riskLevel: string = 'low'
    if (flagCount >= 3) riskLevel = 'critical'
    else if (flagCount === 2) riskLevel = 'high'
    else if (flagCount === 1) riskLevel = 'medium'

    result.set(s.id, { riskLevel, flagCount })
  }

  return result
}
