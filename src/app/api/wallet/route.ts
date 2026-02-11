import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  DEFAULT_NETWORK,
  MIN_DEPOSIT,
  CONFIRMATIONS_REQUIRED,
  validateAddress,
  WITHDRAWAL_FEE,
  MIN_WITHDRAWAL,
  roundZec,
} from '@/lib/wallet'
import {
  checkNodeStatus,
  getAddressBalance,
  sendZec,
  getOperationStatus,
  listAddressTransactions,
  validateAddressViaRPC,
} from '@/lib/wallet/rpc'
import { getDepositInfo } from '@/lib/wallet/addresses'
import { createDepositWalletForSession } from '@/lib/wallet/session-wallet'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { isKillSwitchActive } from '@/lib/kill-switch'

/**
 * GET /api/wallet
 * Get wallet info for a session including deposit address
 */
export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'wallet-action')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

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
      wallet = await createDepositWalletForSession(sessionId)
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
  const rateLimit = checkPublicRateLimit(request, 'wallet-action')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

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

      case 'withdraw': {
        // Kill switch blocks withdrawals
        if (isKillSwitchActive()) {
          return NextResponse.json({
            error: 'Withdrawals are temporarily paused for maintenance.',
            maintenanceMode: true,
          }, { status: 503 })
        }
        const withdrawLimit = checkPublicRateLimit(request, 'wallet-withdraw')
        if (!withdrawLimit.allowed) {
          return createRateLimitResponse(withdrawLimit)
        }
        return handleWithdraw({
          id: session.id,
          balance: session.balance,
          isAuthenticated: session.isAuthenticated,
          withdrawalAddress: session.withdrawalAddress,
          walletAddress: session.walletAddress,
          wallet: session.wallet,
        }, body)
      }

      case 'withdrawal-status':
        return handleWithdrawalStatus(session.id, body.transactionId)

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Wallet POST error:', error)
    return NextResponse.json({ error: 'Wallet operation failed' }, { status: 500 })
  }
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

  const wallet = await createDepositWalletForSession(session.id)

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
    const newDepositAmount = roundZec(totalConfirmed - previouslyDeposited)

    if (newDepositAmount >= MIN_DEPOSIT) {
      // Get real txHash from RPC if available, fall back to generated hash
      let txHash: string
      try {
        const txs = await listAddressTransactions(session.wallet.transparentAddr, 10, network)
        const receiveTx = txs.find(
          (tx) => tx.category === 'receive' && tx.confirmations >= CONFIRMATIONS_REQUIRED
        )
        txHash = receiveTx?.txid || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
      } catch {
        txHash = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
      }

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
    wallet: { transparentAddr: string; network: string } | null
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

    // On mainnet, also validate via RPC to catch invalid checksums
    if (DEFAULT_NETWORK === 'mainnet') {
      const rpcValidation = await validateAddressViaRPC(destinationAddress, DEFAULT_NETWORK)
      if (!rpcValidation.isvalid && !rpcValidation.error) {
        return NextResponse.json({
          error: 'Withdrawal address failed checksum validation. Please verify the address.',
        }, { status: 400 })
      }
    }
  }

  // Validate amount
  if (!amount || amount < MIN_WITHDRAWAL) {
    return NextResponse.json({
      error: `Minimum withdrawal is ${MIN_WITHDRAWAL} ZEC`,
    }, { status: 400 })
  }

  const totalAmount = roundZec(amount + WITHDRAWAL_FEE)
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

  // Check withdrawal approval threshold
  const approvalThreshold = parseFloat(process.env.WITHDRAWAL_APPROVAL_THRESHOLD || '0')
  if (approvalThreshold > 0 && amount >= approvalThreshold && !isDemo) {
    // Large withdrawal: hold for admin approval instead of processing immediately
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'pending_approval' },
    })
    console.log(
      `[Withdrawal] Amount ${amount} ZEC >= threshold ${approvalThreshold} ZEC — held for admin approval (tx: ${transaction.id})`
    )
    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        amount,
        fee: WITHDRAWAL_FEE,
        destinationAddress,
        status: 'pending_approval',
      },
      message: `Withdrawal of ${amount} ZEC requires admin approval. Your balance has been reserved.`,
    })
  }

  // Demo mode: instant confirmation
  if (isDemo) {
    const fakeTxHash = `demo_tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'confirmed',
        txHash: fakeTxHash,
        confirmedAt: new Date(),
      },
    })
    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        amount,
        fee: WITHDRAWAL_FEE,
        destinationAddress,
        status: 'confirmed',
        txHash: fakeTxHash,
      },
      message: 'Demo withdrawal processed.',
    })
  }

  // Real mode: send ZEC via RPC
  const network = (session.wallet?.network as 'mainnet' | 'testnet') || DEFAULT_NETWORK

  // Check node connectivity
  const nodeStatus = await checkNodeStatus(network)
  if (!nodeStatus.connected) {
    await refundWithdrawal(session.id, transaction.id, totalAmount, amount, 'Zcash node not connected')
    return NextResponse.json({
      error: 'Zcash node not connected. Balance has been refunded.',
    }, { status: 503 })
  }

  // Resolve house z-address (source of funds)
  const houseAddress = network === 'mainnet'
    ? process.env.HOUSE_ZADDR_MAINNET
    : process.env.HOUSE_ZADDR_TESTNET

  if (!houseAddress) {
    await refundWithdrawal(session.id, transaction.id, totalAmount, amount, 'House wallet not configured')
    return NextResponse.json({
      error: 'Withdrawal service unavailable. Balance has been refunded.',
    }, { status: 503 })
  }

  // SAFETY: Check house wallet has sufficient balance before sending
  try {
    const houseBalance = await getAddressBalance(houseAddress, network)
    if (houseBalance.confirmed < amount) {
      console.error(
        `[Withdrawal] House wallet insufficient balance: ${houseBalance.confirmed} ZEC available, ` +
        `${amount} ZEC requested. House address: ${houseAddress.substring(0, 16)}...`
      )
      await refundWithdrawal(session.id, transaction.id, totalAmount, amount, 'Insufficient house funds')
      return NextResponse.json({
        error: 'Withdrawal temporarily unavailable. Balance has been refunded.',
      }, { status: 503 })
    }
  } catch (balanceErr) {
    console.error('[Withdrawal] Failed to check house balance:', balanceErr)
    await refundWithdrawal(session.id, transaction.id, totalAmount, amount, 'Failed to verify house balance')
    return NextResponse.json({
      error: 'Unable to verify withdrawal availability. Balance has been refunded.',
    }, { status: 503 })
  }

  try {
    const { operationId } = await sendZec(
      houseAddress,
      destinationAddress,
      amount,
      memo,
      network
    )

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { operationId },
    })

    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        amount,
        fee: WITHDRAWAL_FEE,
        destinationAddress,
        status: 'pending',
        operationId,
      },
      message: 'Withdrawal submitted. Track progress with the withdrawal-status action.',
    })
  } catch (rpcError) {
    const reason = rpcError instanceof Error ? rpcError.message : 'RPC call failed'
    await refundWithdrawal(session.id, transaction.id, totalAmount, amount, reason)
    return NextResponse.json({
      error: 'Withdrawal failed. Balance has been refunded.',
    }, { status: 500 })
  }
}

/**
 * Refund a failed withdrawal: restore balance and mark transaction failed
 */
async function refundWithdrawal(
  sessionId: string,
  transactionId: string,
  totalAmount: number,
  withdrawnAmount: number,
  reason: string
) {
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      balance: { increment: totalAmount },
      totalWithdrawn: { decrement: withdrawnAmount },
    },
  })
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: 'failed', failReason: reason },
  })
}

/**
 * Check withdrawal status by polling the Zcash operation
 */
async function handleWithdrawalStatus(sessionId: string, transactionId: string) {
  if (!transactionId) {
    return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
  }

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, sessionId, type: 'withdrawal' },
  })

  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // Already finalized or awaiting approval
  if (transaction.status === 'confirmed' || transaction.status === 'failed' || transaction.status === 'pending_approval') {
    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        txHash: transaction.txHash,
        failReason: transaction.failReason,
        amount: transaction.amount,
        fee: transaction.fee,
        confirmedAt: transaction.confirmedAt,
      },
    })
  }

  // Pending with operation ID: poll RPC
  if (transaction.operationId) {
    const network = DEFAULT_NETWORK
    try {
      const opStatus = await getOperationStatus(transaction.operationId, network)

      if (opStatus.status === 'success' && opStatus.txid) {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'confirmed',
            txHash: opStatus.txid,
            confirmedAt: new Date(),
          },
        })
        return NextResponse.json({
          success: true,
          transaction: {
            id: transaction.id,
            status: 'confirmed',
            txHash: opStatus.txid,
            amount: transaction.amount,
            fee: transaction.fee,
          },
        })
      }

      if (opStatus.status === 'failed') {
        const totalAmount = transaction.amount + transaction.fee
        await refundWithdrawal(
          sessionId,
          transaction.id,
          totalAmount,
          transaction.amount,
          opStatus.error || 'Operation failed'
        )
        return NextResponse.json({
          success: true,
          transaction: {
            id: transaction.id,
            status: 'failed',
            failReason: opStatus.error || 'Operation failed',
            amount: transaction.amount,
          },
        })
      }

      // Still queued or executing
      return NextResponse.json({
        success: true,
        transaction: {
          id: transaction.id,
          status: 'pending',
          operationStatus: opStatus.status,
          amount: transaction.amount,
        },
      })
    } catch {
      // RPC unreachable — don't refund yet, just report pending
      return NextResponse.json({
        success: true,
        transaction: {
          id: transaction.id,
          status: 'pending',
          message: 'Unable to check status. Node may be temporarily unavailable.',
          amount: transaction.amount,
        },
      })
    }
  }

  // No operation ID (demo or pre-RPC state)
  return NextResponse.json({
    success: true,
    transaction: {
      id: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
    },
  })
}
