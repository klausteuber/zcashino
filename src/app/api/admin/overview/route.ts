import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import { getPoolStatus } from '@/lib/provably-fair/commitment-pool'
import { checkNodeStatus } from '@/lib/wallet/rpc'
import { DEFAULT_NETWORK } from '@/lib/wallet'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { getKillSwitchStatus } from '@/lib/kill-switch'

/**
 * GET /api/admin/overview
 * Authenticated admin metrics and operational data.
 */
export async function GET(request: NextRequest) {
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
      recentAuditLogs,
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
      getPoolStatus(),
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
    ])

    const liabilities = sessionTotals._sum.balance || 0
    const totalDeposited = sessionTotals._sum.totalDeposited || 0
    const totalWithdrawn = sessionTotals._sum.totalWithdrawn || 0

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
        totalWagered: sessionTotals._sum.totalWagered || 0,
        totalWon: sessionTotals._sum.totalWon || 0,
        netFlow: totalDeposited - totalWithdrawn,
      },
      transactions: {
        pendingWithdrawalCount,
        failedWithdrawalCount,
        confirmedDepositCount,
        confirmedDepositVolume: confirmedDepositVolume._sum.amount || 0,
        confirmedWithdrawalCount,
        confirmedWithdrawalVolume: confirmedWithdrawalVolume._sum.amount || 0,
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
      pool: poolStatus,
      nodeStatus: {
        connected: nodeStatus.connected,
        synced: nodeStatus.synced,
        blockHeight: nodeStatus.blockHeight,
        error: nodeStatus.error,
      },
      security: {
        failedLoginAttempts24h: failedLogins24h,
        rateLimitedEvents24h,
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
