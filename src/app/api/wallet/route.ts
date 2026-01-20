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
  generateSaplingAddress,
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

    // Get deposit info
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
        saplingAddress: wallet.saplingAddr,
        unifiedAddress: wallet.unifiedAddr,
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
        return handleCheckDeposits(session)

      case 'withdraw':
        return handleWithdraw(session, body)

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
 */
async function createWalletForSession(sessionId: string) {
  const network = DEFAULT_NETWORK

  // For demo/testnet: Generate placeholder addresses
  // In production with RPC: Use generateTransparentAddress(), generateSaplingAddress()
  let transparentAddr: string
  let saplingAddr: string | null = null

  // Check if we have RPC connection
  const nodeStatus = await checkNodeStatus(network)

  if (nodeStatus.connected) {
    // Generate real addresses via RPC
    transparentAddr = await generateTransparentAddress(network)
    try {
      saplingAddr = await generateSaplingAddress(network)
    } catch {
      console.log('Sapling address generation not available')
    }
  } else {
    // Generate demo placeholder addresses
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

  // Create wallet record
  const wallet = await prisma.depositWallet.create({
    data: {
      sessionId,
      transparentAddr,
      saplingAddr,
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
      saplingAddress: wallet.saplingAddr,
      network: wallet.network,
    },
  })
}

/**
 * Check for new deposits on the wallet addresses
 */
async function handleCheckDeposits(session: {
  id: string
  balance: number
  wallet: {
    transparentAddr: string
    saplingAddr: string | null
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

  // Get balance of deposit addresses
  const tBalance = await getAddressBalance(session.wallet.transparentAddr, network)

  let zBalance = { confirmed: 0, pending: 0, total: 0 }
  if (session.wallet.saplingAddr) {
    zBalance = await getAddressBalance(session.wallet.saplingAddr, network)
  }

  // Calculate total new deposits
  const totalConfirmed = tBalance.confirmed + zBalance.confirmed
  const totalPending = tBalance.pending + zBalance.pending

  // Check for new confirmed deposits that haven't been credited
  const pendingTxs = await prisma.transaction.findMany({
    where: {
      sessionId: session.id,
      type: 'deposit',
      status: 'pending',
    },
  })

  // Update session balance with new confirmed deposits
  // In production, this would be more sophisticated with individual tx tracking
  const newDeposits: Array<{
    amount: number
    confirmations: number
    address: string
  }> = []

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
      // Record the deposit
      await prisma.transaction.create({
        data: {
          sessionId: session.id,
          type: 'deposit',
          amount: newDepositAmount,
          address: session.wallet.transparentAddr,
          confirmations: CONFIRMATIONS_REQUIRED,
          status: 'confirmed',
          confirmedAt: new Date(),
        },
      })

      // Update session balance
      await prisma.session.update({
        where: { id: session.id },
        data: {
          balance: { increment: newDepositAmount },
          totalDeposited: { increment: newDepositAmount },
        },
      })

      newDeposits.push({
        amount: newDepositAmount,
        confirmations: CONFIRMATIONS_REQUIRED,
        address: session.wallet.transparentAddr,
      })
    }
  }

  return NextResponse.json({
    success: true,
    balance: {
      confirmed: totalConfirmed,
      pending: totalPending,
      total: totalConfirmed + totalPending,
    },
    deposits: newDeposits,
    pendingCount: pendingTxs.length,
  })
}

/**
 * Handle withdrawal request
 */
async function handleWithdraw(
  session: { id: string; balance: number },
  body: { destinationAddress: string; amount: number; memo?: string }
) {
  const { destinationAddress, amount, memo } = body

  // Validate destination address
  const validation = validateAddress(destinationAddress)
  if (!validation.valid) {
    return NextResponse.json({
      error: `Invalid address: ${validation.error}`,
    }, { status: 400 })
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
      isShielded: validation.type !== 'transparent',
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
  // For now, return pending status
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
    message: 'Withdrawal queued for processing',
  })
}
