import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  DEFAULT_NETWORK,
  NETWORK_CONFIG,
} from '@/lib/wallet'
import {
  checkNodeStatus,
  getAddressBalance,
} from '@/lib/wallet/rpc'

/**
 * GET /api/reserves
 * Public endpoint for proof of reserves
 * Returns all deposit addresses and their balances for transparency
 */
export async function GET() {
  try {
    const network = DEFAULT_NETWORK
    const config = NETWORK_CONFIG[network]

    // Get all deposit wallets with their sessions
    const wallets = await prisma.depositWallet.findMany({
      where: {
        network,
      },
      include: {
        session: {
          select: {
            balance: true,
            isAuthenticated: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Check node status
    const nodeStatus = await checkNodeStatus(network)

    // Calculate totals
    let totalOnChainBalance = 0
    let totalUserLiabilities = 0

    // Build address list with balances
    const addresses: Array<{
      address: string
      cachedBalance: number
      userBalance: number
      isAuthenticated: boolean
      createdAt: Date
      balanceUpdatedAt: Date | null
    }> = []

    for (const wallet of wallets) {
      // Use cached balance or fetch fresh if node is connected
      let onChainBalance = wallet.cachedBalance

      if (nodeStatus.connected) {
        try {
          const balance = await getAddressBalance(wallet.transparentAddr, network)
          onChainBalance = balance.confirmed

          // Update cache
          await prisma.depositWallet.update({
            where: { id: wallet.id },
            data: {
              cachedBalance: onChainBalance,
              balanceUpdatedAt: new Date(),
            },
          })
        } catch (error) {
          console.error(`Error fetching balance for ${wallet.transparentAddr}:`, error)
          // Fall back to cached balance
        }
      }

      totalOnChainBalance += onChainBalance
      totalUserLiabilities += wallet.session.balance

      addresses.push({
        address: wallet.transparentAddr,
        cachedBalance: onChainBalance,
        userBalance: wallet.session.balance,
        isAuthenticated: wallet.session.isAuthenticated,
        createdAt: wallet.createdAt,
        balanceUpdatedAt: wallet.balanceUpdatedAt,
      })
    }

    // Calculate reserve ratio
    const reserveRatio = totalUserLiabilities > 0
      ? totalOnChainBalance / totalUserLiabilities
      : 1

    // Get aggregate stats
    const stats = await prisma.session.aggregate({
      _sum: {
        balance: true,
        totalDeposited: true,
        totalWithdrawn: true,
        totalWagered: true,
        totalWon: true,
      },
      _count: true,
    })

    return NextResponse.json({
      // Reserve proof
      reserves: {
        totalOnChainBalance,
        totalUserLiabilities,
        reserveRatio,
        isFullyBacked: reserveRatio >= 1,
      },

      // Aggregate statistics
      stats: {
        totalSessions: stats._count,
        totalDeposited: stats._sum.totalDeposited || 0,
        totalWithdrawn: stats._sum.totalWithdrawn || 0,
        totalWagered: stats._sum.totalWagered || 0,
        totalWon: stats._sum.totalWon || 0,
      },

      // Individual addresses for verification
      addresses,
      addressCount: addresses.length,

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
