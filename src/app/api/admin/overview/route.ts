import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import { getPoolStatus } from '@/lib/provably-fair/commitment-pool'
import { checkNodeStatus, getAddressBalance } from '@/lib/wallet/rpc'
import { DEFAULT_NETWORK } from '@/lib/wallet'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { getKillSwitchStatus } from '@/lib/kill-switch'
import { PLAYER_COUNTER_ACTIONS } from '@/lib/telemetry/player-events'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { getAlertServiceStatus } from '@/lib/services/alert-generator'
import { getSweepServiceStatus } from '@/lib/services/deposit-sweep'
import { getManagerStatus } from '@/lib/services/commitment-pool-manager'
import { getSessionSeedPoolManagerStatus, getSessionSeedPoolStatus } from '@/lib/services/session-seed-pool-manager'
import { getProvablyFairMode, SESSION_NONCE_MODE } from '@/lib/provably-fair/mode'

/**
 * GET /api/admin/overview
 * Authenticated admin metrics and operational data.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.overview.read',
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
      action: 'admin.overview.read',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const fairnessMode = getProvablyFairMode()
    const isSessionMode = fairnessMode === SESSION_NONCE_MODE
    const raceRejectionActions = [
      PLAYER_COUNTER_ACTIONS.WITHDRAW_RESERVE_REJECTED,
      PLAYER_COUNTER_ACTIONS.BLACKJACK_RESERVE_REJECTED,
      PLAYER_COUNTER_ACTIONS.BLACKJACK_DUPLICATE_COMPLETION,
      PLAYER_COUNTER_ACTIONS.VIDEO_POKER_RESERVE_REJECTED,
      PLAYER_COUNTER_ACTIONS.VIDEO_POKER_DUPLICATE_COMPLETION,
    ]

    const [
      sessionTotals,
      totalSessions,
      authenticatedSessions,
      activeGames,
      pendingWithdrawalCount,
      failedWithdrawalCount,
      confirmedDepositCount,
      confirmedDepositVolume,
      confirmedWithdrawalCount,
      confirmedWithdrawalVolume,
      pendingWithdrawals,
      poolStatus,
      nodeStatus,
      failedLogins24h,
      rateLimitedEvents24h,
      legacyPlayerAuthFallback24h,
      legacyPlayerAuthFallbackAllTime,
      raceRejections24h,
      raceRejectionsAllTime,
      idempotencyReplays24h,
      idempotencyReplaysAllTime,
      unpaidActionRetries24h,
      unpaidActionRetriesAllTime,
      bjStats,
      vpStats,
      activeVPGames,
      recentWithdrawals,
      recentAuditLogs,
      houseBalance,
    ] = await Promise.all([
      prisma.session.aggregate({
        _sum: {
          balance: true,
          totalDeposited: true,
          totalWithdrawn: true,
          totalWagered: true,
          totalWon: true,
        },
      }),
      prisma.session.count(),
      prisma.session.count({ where: { isAuthenticated: true } }),
      prisma.blackjackGame.count({ where: { status: 'active' } }),
      prisma.transaction.count({
        where: { type: 'withdrawal', status: { in: ['pending', 'pending_approval'] } },
      }),
      prisma.transaction.count({
        where: { type: 'withdrawal', status: 'failed' },
      }),
      prisma.transaction.count({
        where: { type: 'deposit', status: 'confirmed' },
      }),
      prisma.transaction.aggregate({
        where: { type: 'deposit', status: 'confirmed' },
        _sum: { amount: true },
      }),
      prisma.transaction.count({
        where: { type: 'withdrawal', status: 'confirmed' },
      }),
      prisma.transaction.aggregate({
        where: { type: 'withdrawal', status: 'confirmed' },
        _sum: { amount: true },
      }),
      prisma.transaction.findMany({
        where: { type: 'withdrawal', status: { in: ['pending', 'pending_approval'] } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          sessionId: true,
          amount: true,
          fee: true,
          address: true,
          operationId: true,
          status: true,
          createdAt: true,
          session: {
            select: {
              walletAddress: true,
              balance: true,
              withdrawalAddress: true,
            },
          },
        },
      }),
      (async () => {
        if (isSessionMode) {
          const status = await getSessionSeedPoolStatus()
          return {
            available: status.available,
            used: status.assigned + status.revealed,
            expired: status.expired,
            total: status.total,
            isHealthy: status.isHealthy,
            blockchainAvailable: false,
          }
        }
        return getPoolStatus()
      })(),
      checkNodeStatus(DEFAULT_NETWORK),
      prisma.adminAuditLog.count({
        where: {
          action: 'admin.auth.login',
          success: false,
          createdAt: { gte: since24h },
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          details: { contains: 'Rate limit exceeded' },
          createdAt: { gte: since24h },
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          action: PLAYER_COUNTER_ACTIONS.LEGACY_SESSION_FALLBACK,
          createdAt: { gte: since24h },
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          action: PLAYER_COUNTER_ACTIONS.LEGACY_SESSION_FALLBACK,
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          action: { in: raceRejectionActions },
          createdAt: { gte: since24h },
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          action: { in: raceRejectionActions },
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          action: PLAYER_COUNTER_ACTIONS.WITHDRAW_IDEMPOTENCY_REPLAY,
          createdAt: { gte: since24h },
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          action: PLAYER_COUNTER_ACTIONS.WITHDRAW_IDEMPOTENCY_REPLAY,
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          action: PLAYER_COUNTER_ACTIONS.WITHDRAW_UNPAID_ACTION_RETRY,
          createdAt: { gte: since24h },
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          action: PLAYER_COUNTER_ACTIONS.WITHDRAW_UNPAID_ACTION_RETRY,
        },
      }),
      // GGR: completed blackjack game stats
      prisma.blackjackGame.aggregate({
        where: { status: 'completed' },
        _sum: { mainBet: true, perfectPairsBet: true, insuranceBet: true, payout: true },
        _count: true,
      }),
      // GGR: completed video poker game stats
      prisma.videoPokerGame.aggregate({
        where: { status: 'completed' },
        _sum: { totalBet: true, payout: true },
        _count: true,
      }),
      // Active video poker games (for exposure count)
      prisma.videoPokerGame.count({ where: { status: 'active' } }),
      // Recent withdrawals (all statuses, not just pending)
      prisma.transaction.findMany({
        where: { type: 'withdrawal' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          sessionId: true,
          amount: true,
          fee: true,
          address: true,
          operationId: true,
          status: true,
          failReason: true,
          createdAt: true,
          confirmedAt: true,
          session: {
            select: {
              walletAddress: true,
              balance: true,
              withdrawalAddress: true,
            },
          },
        },
      }),
      prisma.adminAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          action: true,
          actor: true,
          success: true,
          ipAddress: true,
          details: true,
          createdAt: true,
        },
      }),
      // House wallet balance — uses house UA from env
      (async () => {
        const houseUA = process.env.HOUSE_UNIFIED_ADDRESS
        if (!houseUA) return null
        try {
          return await getAddressBalance(houseUA, DEFAULT_NETWORK)
        } catch {
          return null
        }
      })(),
    ])

    const liabilities = sessionTotals._sum.balance || 0
    const totalDeposited = sessionTotals._sum.totalDeposited || 0
    const totalWithdrawn = sessionTotals._sum.totalWithdrawn || 0
    const totalWagered = sessionTotals._sum.totalWagered || 0
    const totalWon = sessionTotals._sum.totalWon || 0
    const ggr = totalWagered - totalWon
    const houseEdgePct = totalWagered > 0 ? (ggr / totalWagered) * 100 : 0

    const bjPayout = bjStats._sum.payout || 0
    const bjWagered = (bjStats._sum.mainBet || 0) + (bjStats._sum.perfectPairsBet || 0) + (bjStats._sum.insuranceBet || 0)
    const bjHands = bjStats._count
    const vpWagered = vpStats._sum.totalBet || 0
    const vpPayout = vpStats._sum.payout || 0
    const vpHands = vpStats._count
    const normalizedPoolStatus = isSessionMode
      ? { ...poolStatus, blockchainAvailable: nodeStatus.connected && nodeStatus.synced }
      : poolStatus

    await logAdminEvent({
      request,
      action: 'admin.overview.read',
      success: true,
      actor: adminCheck.session.username,
      details: 'Overview fetched',
    })

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      network: DEFAULT_NETWORK,
      fairnessMode,
      admin: {
        username: adminCheck.session.username,
      },
      platform: {
        totalSessions,
        authenticatedSessions,
        activeGames,
        liabilities,
        totalDeposited,
        totalWithdrawn,
        totalWagered,
        totalWon,
        netFlow: totalDeposited - totalWithdrawn,
      },
      houseEdge: {
        realizedGGR: {
          totalWagered,
          totalPayout: totalWon,
          ggr,
          houseEdgePct: Math.round(houseEdgePct * 100) / 100,
        },
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
          rtp: vpWagered > 0 ? Math.round((vpPayout / vpWagered) * 10000) / 100 : 0,
        },
        activeExposure: {
          activeGames: activeGames + activeVPGames,
        },
      },
      transactions: {
        pendingWithdrawalCount,
        failedWithdrawalCount,
        confirmedDepositCount,
        confirmedDepositVolume: confirmedDepositVolume._sum.amount || 0,
        confirmedWithdrawalCount,
        confirmedWithdrawalVolume: confirmedWithdrawalVolume._sum.amount || 0,
        raceRejections24h,
        raceRejectionsAllTime,
        idempotencyReplays24h,
        idempotencyReplaysAllTime,
        unpaidActionRetries24h,
        unpaidActionRetriesAllTime,
      },
      pendingWithdrawals: pendingWithdrawals.map((tx) => ({
        id: tx.id,
        sessionId: tx.sessionId,
        amount: tx.amount,
        fee: tx.fee,
        address: tx.address,
        operationId: tx.operationId,
        status: tx.status,
        createdAt: tx.createdAt,
        sessionWallet: tx.session.walletAddress,
        sessionBalance: tx.session.balance,
        withdrawalAddress: tx.session.withdrawalAddress,
      })),
      recentWithdrawals: recentWithdrawals.map((tx) => ({
        id: tx.id,
        sessionId: tx.sessionId,
        amount: tx.amount,
        fee: tx.fee,
        address: tx.address,
        operationId: tx.operationId,
        status: tx.status,
        failReason: tx.failReason,
        createdAt: tx.createdAt,
        confirmedAt: tx.confirmedAt,
        sessionWallet: tx.session.walletAddress,
        sessionBalance: tx.session.balance,
        withdrawalAddress: tx.session.withdrawalAddress,
      })),
      pool: normalizedPoolStatus,
      nodeStatus: {
        connected: nodeStatus.connected,
        synced: nodeStatus.synced,
        blockHeight: nodeStatus.blockHeight,
        rpcLatencyMs: (nodeStatus as { rpcLatencyMs?: number }).rpcLatencyMs ?? null,
        error: nodeStatus.error,
      },
      services: {
        alertGenerator: getAlertServiceStatus(),
        sweep: getSweepServiceStatus(),
        commitmentPoolManager: getManagerStatus(),
        sessionSeedPoolManager: getSessionSeedPoolManagerStatus(),
      },
      treasury: {
        houseBalance: houseBalance ? {
          confirmed: houseBalance.confirmed,
          pending: houseBalance.pending,
          total: houseBalance.total,
        } : null,
        liabilities,
        coverageRatio: houseBalance && liabilities > 0
          ? Math.round((houseBalance.confirmed / liabilities) * 100) / 100
          : houseBalance && liabilities === 0 ? Infinity : null,
      },
      security: {
        failedLoginAttempts24h: failedLogins24h,
        rateLimitedEvents24h,
        legacyPlayerAuthFallback24h,
        legacyPlayerAuthFallbackAllTime,
      },
      auditLogs: recentAuditLogs,
      killSwitch: getKillSwitchStatus(),
    })
  } catch (error) {
    console.error('Admin overview error:', error)
    await logAdminEvent({
      request,
      action: 'admin.overview.read',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch overview',
    })
    return NextResponse.json(
      { error: 'Failed to fetch admin overview.' },
      { status: 500 }
    )
  }
}
