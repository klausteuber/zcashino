import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  DEFAULT_NETWORK,
  MIN_DEPOSIT,
  CONFIRMATIONS_REQUIRED,
  validateAddress,
  WITHDRAWAL_FEE,
  MIN_WITHDRAWAL,
} from '@/lib/wallet'
import {
  checkNodeStatus,
  generateTransparentAddress,
  getAddressBalance,
} from '@/lib/wallet/rpc'
import { getDepositInfo } from '@/lib/wallet/addresses'

/**
 * GET /api/wallet
 * Get wallet info for a session including deposit address
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
  }

  try {
    // Get session with wallet
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { wallet: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // If no wallet exists, create one
    let wallet = session.wallet
    if (!wallet) {
      wallet = await createWalletForSession(sessionId)
    }

    // Get deposit info (transparent only for proof of reserves)
    const depositInfo = getDepositInfo(
      wallet.transparentAddr,
      'transparent',
      wallet.network as 'mainnet' | 'testnet'
    )

    // Check node status (optional, for display)
    const nodeStatus = await checkNodeStatus(wallet.network as 'mainnet' | 'testnet')

    return NextResponse.json({
      wallet: {
        id: wallet.id,
        depositAddress: wallet.transparentAddr,
        network: wallet.network,
      },
      depositInfo,
      nodeStatus: {
        connected: nodeStatus.connected,
        synced: nodeStatus.synced,
      },
      balance: {
        confirmed: session.balance,
        pending: 0, // TODO: Calculate from pending transactions
        total: session.balance,
      },
      // Authentication status
      auth: {
        isAuthenticated: session.isAuthenticated,
        withdrawalAddress: session.withdrawalAddress,
        authTxHash: session.authTxHash,
        authConfirmedAt: session.authConfirmedAt,
      },
    })
  } catch (error) {
    console.error('Wallet GET error:', error)
    return NextResponse.json(
      { error: 'Failed to get wallet info' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/wallet
 * Actions: create, check-deposits, withdraw
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, sessionId } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { wallet: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    switch (action) {
      case 'create':
        return handleCreateWallet(session)

      case 'check-deposits':
        return handleCheckDeposits({
          id: session.id,
          balance: session.balance,
          isAuthenticated: session.isAuthenticated,
          withdrawalAddress: session.withdrawalAddress,
          wallet: session.wallet,
        })

      case 'withdraw':
        return handleWithdraw({
          id: session.id,
          balance: session.balance,
          isAuthenticated: session.isAuthenticated,
          withdrawalAddress: session.withdrawalAddress,
          walletAddress: session.walletAddress,
        }, body)

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Wallet POST error:', error)
    return NextResponse.json({ error: 'Wallet operation failed' }, { status: 500 })
  }
}

/**
 * Create a new wallet for a session
 * Only generates transparent address for proof of reserves
 */
async function createWalletForSession(sessionId: string) {
  const network = DEFAULT_NETWORK

  // Only generate transparent address (for proof of reserves)
  let transparentAddr: string

  // Check if we have RPC connection
  const nodeStatus = await checkNodeStatus(network)

  if (nodeStatus.connected) {
    // Generate real address via RPC
    transparentAddr = await generateTransparentAddress(network)
  } else {
    // Generate demo placeholder address
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 10)
    transparentAddr = network === 'testnet'
      ? `tmDemo${timestamp}${random}`.substring(0, 35)
      : `t1Demo${timestamp}${random}`.substring(0, 35)
  }

  // Get next address index
  const lastWallet = await prisma.depositWallet.findFirst({
    orderBy: { addressIndex: 'desc' },
  })
  const addressIndex = (lastWallet?.addressIndex ?? -1) + 1

  // Create wallet record (transparent only)
  const wallet = await prisma.depositWallet.create({
    data: {
      sessionId,
      transparentAddr,
      network,
      addressIndex,
    },
  })

  return wallet
}

/**
 * Handle wallet creation request
 */
async function handleCreateWallet(session: { id: string; wallet: unknown }) {
  if (session.wallet) {
    return NextResponse.json({
      error: 'Wallet already exists for this session',
    }, { status: 400 })
  }

  const wallet = await createWalletForSession(session.id)

  return NextResponse.json({
    success: true,
    wallet: {
      id: wallet.id,
      depositAddress: wallet.transparentAddr,
      network: wallet.network,
    },
  })
}

/**
 * Check for new deposits on the wallet addresses
 * Also handles authentication on first deposit
 */
async function handleCheckDeposits(session: {
  id: string
  balance: number
  isAuthenticated: boolean
  withdrawalAddress: string | null
  wallet: {
    transparentAddr: string
    network: string
  } | null
}) {
  if (!session.wallet) {
    return NextResponse.json({ error: 'No wallet found' }, { status: 400 })
  }

  const network = session.wallet.network as 'mainnet' | 'testnet'

  // Check node status
  const nodeStatus = await checkNodeStatus(network)
  if (!nodeStatus.connected) {
    return NextResponse.json({
      success: false,
      error: 'Zcash node not connected',
      deposits: [],
    })
  }

  // Get balance of transparent deposit address only (for proof of reserves)
  const tBalance = await getAddressBalance(session.wallet.transparentAddr, network)

  // Calculate totals
  const totalConfirmed = tBalance.confirmed
  const totalPending = tBalance.pending

  // Check for pending deposit transactions
  const pendingTxs = await prisma.transaction.findMany({
    where: {
      sessionId: session.id,
      type: 'deposit',
      status: 'pending',
    },
  })

  // Track new deposits and authentication status
  const newDeposits: Array<{
    amount: number
    confirmations: number
    address: string
    isAuthDeposit: boolean
  }> = []
  let justAuthenticated = false

  if (totalConfirmed > 0) {
    // Check if this is a new deposit
    const existingDeposits = await prisma.transaction.aggregate({
      where: {
        sessionId: session.id,
        type: 'deposit',
        status: 'confirmed',
      },
      _sum: { amount: true },
    })

    const previouslyDeposited = existingDeposits._sum.amount || 0
    const newDepositAmount = totalConfirmed - previouslyDeposited

    if (newDepositAmount >= MIN_DEPOSIT) {
      // Record the deposit transaction
      // TODO: In production, get actual txHash from RPC
      const txHash = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`

      const transaction = await prisma.transaction.create({
        data: {
          sessionId: session.id,
          type: 'deposit',
          amount: newDepositAmount,
          address: session.wallet.transparentAddr,
          txHash,
          confirmations: CONFIRMATIONS_REQUIRED,
          status: 'confirmed',
          confirmedAt: new Date(),
        },
      })

      // Check if this should authenticate the session
      const isAuthDeposit = !session.isAuthenticated && session.withdrawalAddress

      // Update session balance and potentially authenticate
      const updateData: Record<string, unknown> = {
        balance: { increment: newDepositAmount },
        totalDeposited: { increment: newDepositAmount },
      }

      if (isAuthDeposit) {
        // First deposit authenticates the session
        updateData.isAuthenticated = true
        updateData.authTxHash = txHash
        updateData.authConfirmedAt = new Date()
        justAuthenticated = true
      }

      await prisma.session.update({
        where: { id: session.id },
        data: updateData,
      })

      // Update cached balance on wallet
      await prisma.depositWallet.update({
        where: { sessionId: session.id },
        data: {
          cachedBalance: totalConfirmed,
          balanceUpdatedAt: new Date(),
        },
      })

      newDeposits.push({
        amount: newDepositAmount,
        confirmations: CONFIRMATIONS_REQUIRED,
        address: session.wallet.transparentAddr,
        isAuthDeposit: !!isAuthDeposit,
      })
    }
  }

  // Get updated session to return current state
  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id },
  })

  return NextResponse.json({
    success: true,
    balance: {
      confirmed: totalConfirmed,
      pending: totalPending,
      total: totalConfirmed + totalPending,
    },
    sessionBalance: updatedSession?.balance ?? session.balance,
    deposits: newDeposits,
    pendingCount: pendingTxs.length,
    // Authentication status
    auth: {
      isAuthenticated: updatedSession?.isAuthenticated ?? session.isAuthenticated,
      justAuthenticated,
      withdrawalAddress: updatedSession?.withdrawalAddress,
      authTxHash: updatedSession?.authTxHash,
    },
  })
}

/**
 * Handle withdrawal request
 * Withdrawals can only go to the registered withdrawal address
 */
async function handleWithdraw(
  session: {
    id: string
    balance: number
    isAuthenticated: boolean
    withdrawalAddress: string | null
    walletAddress: string
  },
  body: { amount: number; memo?: string }
) {
  const { amount, memo } = body

  // Check if session is authenticated (or demo)
  const isDemo = session.walletAddress.startsWith('demo_')
  if (!isDemo && !session.isAuthenticated) {
    return NextResponse.json({
      error: 'Session not authenticated. Deposit ZEC to authenticate first.',
    }, { status: 403 })
  }

  // Ensure withdrawal address is set
  if (!isDemo && !session.withdrawalAddress) {
    return NextResponse.json({
      error: 'No withdrawal address set. Please set your withdrawal address first.',
    }, { status: 400 })
  }

  // Use the registered withdrawal address (or allow any for demo)
  const destinationAddress = session.withdrawalAddress || 'demo_withdrawal'

  // Validate destination address (for non-demo)
  if (!isDemo) {
    const validation = validateAddress(destinationAddress)
    if (!validation.valid) {
      return NextResponse.json({
        error: `Invalid withdrawal address: ${validation.error}`,
      }, { status: 400 })
    }
  }

  // Validate amount
  if (!amount || amount < MIN_WITHDRAWAL) {
    return NextResponse.json({
      error: `Minimum withdrawal is ${MIN_WITHDRAWAL} ZEC`,
    }, { status: 400 })
  }

  const totalAmount = amount + WITHDRAWAL_FEE
  if (totalAmount > session.balance) {
    return NextResponse.json({
      error: `Insufficient balance. Need ${totalAmount} ZEC (including ${WITHDRAWAL_FEE} ZEC fee)`,
    }, { status: 400 })
  }

  // Create pending withdrawal transaction
  const transaction = await prisma.transaction.create({
    data: {
      sessionId: session.id,
      type: 'withdrawal',
      amount,
      fee: WITHDRAWAL_FEE,
      address: destinationAddress,
      isShielded: !isDemo && !destinationAddress.startsWith('t'),
      memo,
      status: 'pending',
    },
  })

  // Deduct from balance immediately
  await prisma.session.update({
    where: { id: session.id },
    data: {
      balance: { decrement: totalAmount },
      totalWithdrawn: { increment: amount },
    },
  })

  // In production: Queue the withdrawal for processing
  // TODO: Implement actual withdrawal via RPC

  return NextResponse.json({
    success: true,
    transaction: {
      id: transaction.id,
      amount,
      fee: WITHDRAWAL_FEE,
      destinationAddress,
      status: 'pending',
    },
    message: 'Withdrawal queued for processing. Funds will be sent to your registered withdrawal address.',
  })
}
