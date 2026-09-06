import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  DEFAULT_NETWORK,
  NETWORK_CONFIG,
} from '@/lib/wallet'
import { checkNodeStatus, getWalletBalanceCached } from '@/lib/wallet/rpc'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { REAL_SESSIONS_WHERE } from '@/lib/admin/query-filters'

/**
 * GET /api/reserves
 * Public aggregate reserve report. Individual player deposit addresses remain private.
 */
export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'reserves-read')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

  try {
    const network = DEFAULT_NETWORK
    const config = NETWORK_CONFIG[network]

    // Get real-money deposit wallets with their sessions.
    // Demo sessions receive synthetic balances and should never count as liabilities.
    const wallets = await prisma.depositWallet.findMany({
      where: {
        network,
        session: REAL_SESSIONS_WHERE,
      },
      select: { cachedBalance: true },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Check node status
    const [nodeStatus, walletBalance] = await Promise.all([
      checkNodeStatus(network),
      getWalletBalanceCached(network, 3, {
        includePools: false,
        timeoutMs: 12_000,
        throwOnError: false,
      }),
    ])

    // Calculate totals
    let totalTransparentBalance = 0

    for (const wallet of wallets) totalTransparentBalance += wallet.cachedBalance

    // Get aggregate stats for real-money sessions only.
    const stats = await prisma.session.aggregate({
      where: REAL_SESSIONS_WHERE,
      _sum: {
        balance: true,
        pokerLockedZats: true,
        totalDeposited: true,
        totalWithdrawn: true,
        totalWagered: true,
        totalWon: true,
      },
      _count: true,
    })

    const totalUserLiabilities = (stats._sum.balance || 0) + Number(stats._sum.pokerLockedZats ?? 0n) / 100_000_000
    const totalWalletBalance = walletBalance.confirmed + walletBalance.pending
    const totalOnChainBalance = totalWalletBalance > 0
      ? totalWalletBalance
      : totalTransparentBalance

    // Calculate reserve ratio
    const reserveRatio = totalUserLiabilities > 0
      ? totalOnChainBalance / totalUserLiabilities
      : 1

    // Get sweep totals (funds consolidated to house wallet)
    const sweepStats = await prisma.sweepLog.aggregate({
      where: { status: 'confirmed' },
      _sum: { amount: true, fee: true },
      _count: true,
    })

    const totalSwept = sweepStats._sum.amount || 0

    return NextResponse.json({
      // Reserve proof
      reserves: {
        totalOnChainBalance,
        totalUserLiabilities,
        reserveRatio,
        isFullyBacked: reserveRatio >= 1,
        transparentAddressBalance: totalTransparentBalance,
        walletBalance: {
          confirmed: walletBalance.confirmed,
          pending: walletBalance.pending,
          total: walletBalance.total,
        },
        // Swept funds are held in house shielded address (not publicly verifiable)
        totalSweptToHouseWallet: totalSwept,
        sweepCount: sweepStats._count,
      },

      // Aggregate statistics
      stats: {
        totalSessions: stats._count,
        totalDeposited: stats._sum.totalDeposited || 0,
        totalWithdrawn: stats._sum.totalWithdrawn || 0,
        totalWagered: stats._sum.totalWagered || 0,
        totalWon: stats._sum.totalWon || 0,
      },

      // Compatibility fields contain no per-player information.
      addresses: [],
      addressCount: wallets.length,
      reportingMode: 'aggregate',

      // Network info
      network,
      explorerBaseUrl: config.explorerUrl,

      // Node status
      nodeStatus: {
        connected: nodeStatus.connected,
        synced: nodeStatus.synced,
      },

      // Timestamp
      lastUpdated: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Reserves API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reserves data' },
      { status: 500 }
    )
  }
}
