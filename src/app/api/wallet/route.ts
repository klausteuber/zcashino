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
import { requirePlayerSession } from '@/lib/auth/player-session'
import { parseWithSchema, walletBodySchema } from '@/lib/validation/api-schemas'
import { reserveFunds, releaseFunds, creditFunds } from '@/lib/services/ledger'
import { logPlayerCounterEvent, PLAYER_COUNTER_ACTIONS } from '@/lib/telemetry/player-events'

type DepositAddressType = 'unified' | 'transparent'
const UNPAID_ACTION_RETRY_PREFIX = 'retry_unpaid_action:'
const MAX_UNPAID_ACTION_OPERATION_RETRIES = 3
const ZIP317_MARGINAL_FEE_ZATS = 5000

function getPreferredDepositAddress(wallet: {
  unifiedAddr: string | null
  transparentAddr: string
}): { depositAddress: string; depositAddressType: DepositAddressType } {
  if (wallet.unifiedAddr) {
    return { depositAddress: wallet.unifiedAddr, depositAddressType: 'unified' }
  }
  return { depositAddress: wallet.transparentAddr, depositAddressType: 'transparent' }
}

function parseUnpaidActionDelta(errorMessage: string): number | null {
  if (!errorMessage.toLowerCase().includes('tx unpaid action limit exceeded')) {
    return null
  }

  const match = errorMessage.match(/tx unpaid action limit exceeded:\s*(\d+)\s*action\(s\)\s*exceeds limit of\s*(\d+)/i)
  if (!match) {
    return 1
  }

  const unpaidActions = Number.parseInt(match[1], 10)
  const limit = Number.parseInt(match[2], 10)
  return Math.max(1, unpaidActions - limit)
}

function getUnpaidActionRetryCount(marker: string | null): number {
  if (!marker || !marker.startsWith(UNPAID_ACTION_RETRY_PREFIX)) {
    return 0
  }
  const count = Number.parseInt(marker.slice(UNPAID_ACTION_RETRY_PREFIX.length), 10)
  return Number.isFinite(count) && count > 0 ? count : 0
}

function buildUnpaidActionRetryMarker(count: number): string {
  return `${UNPAID_ACTION_RETRY_PREFIX}${count}`
}

function estimateRetryFeeForUnpaidAction(errorMessage: string, retryCount: number): number {
  const unpaidActionDelta = parseUnpaidActionDelta(errorMessage) || 1
  const baseFeeZats = Math.round(WITHDRAWAL_FEE * 1e8)
  const extraPaidActions = unpaidActionDelta * (retryCount + 1)
  const retryFeeZats = baseFeeZats + (extraPaidActions * ZIP317_MARGINAL_FEE_ZATS)
  return roundZec(retryFeeZats / 1e8)
}

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

    const { depositAddress, depositAddressType } = getPreferredDepositAddress(wallet)

    const depositInfo = getDepositInfo(
      depositAddress,
      depositAddressType,
      wallet.network as 'mainnet' | 'testnet'
    )

    // Check node status (optional, for display)
    const nodeStatus = await checkNodeStatus(wallet.network as 'mainnet' | 'testnet')

    return NextResponse.json({
      wallet: {
        id: wallet.id,
        depositAddress,
        depositAddressType,
        transparentAddress: wallet.transparentAddr,
        network: wallet.network,
      },
      depositInfo,
      nodeStatus: {
        connected: nodeStatus.connected,
        synced: nodeStatus.synced,
      },
      balance: {
        confirmed: roundZec(session.balance),
        pending: 0, // TODO: Calculate from pending transactions
        total: roundZec(session.balance),
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
    const parsed = parseWithSchema(walletBodySchema, body)
    if (!parsed.success) {
      return NextResponse.json(parsed.payload, { status: 400 })
    }

    const payload = parsed.data
    const sessionId = payload.sessionId

    const playerSession = requirePlayerSession(request, sessionId)
    if (!playerSession.ok) {
      return playerSession.response
    }

    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { wallet: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    switch (payload.action) {
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
        }, payload, request)
      }

      case 'withdrawal-status':
        return handleWithdrawalStatus(session.id, payload.transactionId)

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
  const { depositAddress, depositAddressType } = getPreferredDepositAddress(wallet)

  return NextResponse.json({
    success: true,
    wallet: {
      id: wallet.id,
      depositAddress,
      depositAddressType,
      transparentAddress: wallet.transparentAddr,
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
    unifiedAddr: string | null
    network: string
  } | null
}) {
  if (!session.wallet) {
    return NextResponse.json({ error: 'No wallet found' }, { status: 400 })
  }

  const network = session.wallet.network as 'mainnet' | 'testnet'
  const { depositAddress: monitorAddress, depositAddressType } = getPreferredDepositAddress(session.wallet)

  // Check node status
  const nodeStatus = await checkNodeStatus(network)
  if (!nodeStatus.connected) {
    return NextResponse.json({
      success: false,
      error: 'Zcash node not connected',
      deposits: [],
      pendingDeposits: [],
      newDeposit: false,
      depositAmount: null,
      authenticated: session.isAuthenticated,
      session: {
        isAuthenticated: session.isAuthenticated,
        balance: session.balance,
      },
    })
  }

  // Keep an address-level balance snapshot for reserves UI only.
  const tBalance = await getAddressBalance(session.wallet.transparentAddr, network)
  let totalConfirmed = 0
  let totalPending = 0

  const chainTxs = await listAddressTransactions(monitorAddress, 200, network)
  const receiveMap = new Map<string, { amount: number; confirmations: number }>()
  for (const tx of chainTxs) {
    if (tx.category !== 'receive' || !tx.txid || tx.amount <= 0) continue
    const current = receiveMap.get(tx.txid)
    if (!current) {
      receiveMap.set(tx.txid, {
        amount: roundZec(tx.amount),
        confirmations: tx.confirmations,
      })
      continue
    }

    current.amount = roundZec(current.amount + tx.amount)
    current.confirmations = Math.max(current.confirmations, tx.confirmations)
  }

  if (depositAddressType === 'transparent') {
    totalConfirmed = tBalance.confirmed
    totalPending = tBalance.pending
  } else {
    for (const tx of receiveMap.values()) {
      if (tx.confirmations >= CONFIRMATIONS_REQUIRED) {
        totalConfirmed = roundZec(totalConfirmed + tx.amount)
      } else {
        totalPending = roundZec(totalPending + tx.amount)
      }
    }
  }

  const txHashes = Array.from(receiveMap.keys())
  const existingDeposits = txHashes.length > 0
    ? await prisma.transaction.findMany({
        where: {
          sessionId: session.id,
          type: 'deposit',
          txHash: { in: txHashes },
        },
        orderBy: { createdAt: 'asc' },
      })
    : []

  const existingByHash = new Map<string, (typeof existingDeposits)[number]>()
  for (const row of existingDeposits) {
    if (row.txHash && !existingByHash.has(row.txHash)) {
      existingByHash.set(row.txHash, row)
    }
  }

  const newDeposits: Array<{
    amount: number
    confirmations: number
    address: string
    isAuthDeposit: boolean
  }> = []
  let justAuthenticated = false
  let isAuthenticatedNow = session.isAuthenticated

  for (const [txHash, tx] of receiveMap.entries()) {
    const existing = existingByHash.get(txHash)
    const isConfirmedOnChain = tx.confirmations >= CONFIRMATIONS_REQUIRED
    const eligibleAmount = tx.amount >= MIN_DEPOSIT

    if (!existing) {
      let authenticatedThisTx = false
      let createdTx = false
      try {
        await prisma.$transaction(async (dbTx) => {
          await dbTx.transaction.create({
            data: {
              sessionId: session.id,
              type: 'deposit',
              amount: tx.amount,
              address: monitorAddress,
              txHash,
              confirmations: tx.confirmations,
              status: isConfirmedOnChain ? 'confirmed' : 'pending',
              confirmedAt: isConfirmedOnChain ? new Date() : null,
            },
          })

          if (!isConfirmedOnChain || !eligibleAmount) return
          await creditFunds(dbTx, session.id, tx.amount, 'totalDeposited')

          const shouldAuthenticate = !isAuthenticatedNow && !!session.withdrawalAddress
          if (shouldAuthenticate) {
            await dbTx.session.update({
              where: { id: session.id },
              data: {
                isAuthenticated: true,
                authTxHash: txHash,
                authConfirmedAt: new Date(),
              },
            })
            isAuthenticatedNow = true
            justAuthenticated = true
            authenticatedThisTx = true
          }
        })
        createdTx = true
      } catch (error) {
        // Another request already inserted this tx hash.
        if (!(error instanceof Error) || !error.message.includes('Unique constraint')) {
          throw error
        }
      }

      if (createdTx && isConfirmedOnChain && eligibleAmount) {
        newDeposits.push({
          amount: tx.amount,
          confirmations: tx.confirmations,
          address: monitorAddress,
          isAuthDeposit: authenticatedThisTx,
        })
      }
      continue
    }

    if (existing.status === 'confirmed') {
      if (existing.confirmations !== tx.confirmations) {
        await prisma.transaction.update({
          where: { id: existing.id },
          data: { confirmations: tx.confirmations },
        })
      }
      continue
    }

    if (!isConfirmedOnChain) {
      if (existing.confirmations !== tx.confirmations) {
        await prisma.transaction.update({
          where: { id: existing.id },
          data: { confirmations: tx.confirmations },
        })
      }
      continue
    }

    let authenticatedThisTx = false
    await prisma.$transaction(async (dbTx) => {
      const promoted = await dbTx.transaction.updateMany({
        where: {
          id: existing.id,
          status: { not: 'confirmed' },
        },
        data: {
          status: 'confirmed',
          confirmations: tx.confirmations,
          confirmedAt: new Date(),
        },
      })
      if (promoted.count === 0 || !eligibleAmount) return

      await creditFunds(dbTx, session.id, existing.amount, 'totalDeposited')

      const shouldAuthenticate = !isAuthenticatedNow && !!session.withdrawalAddress
      if (shouldAuthenticate) {
        await dbTx.session.update({
          where: { id: session.id },
          data: {
            isAuthenticated: true,
            authTxHash: txHash,
            authConfirmedAt: new Date(),
          },
        })
        isAuthenticatedNow = true
        justAuthenticated = true
        authenticatedThisTx = true
      }
    })

    if (eligibleAmount) {
      newDeposits.push({
        amount: existing.amount,
        confirmations: tx.confirmations,
        address: monitorAddress,
        isAuthDeposit: authenticatedThisTx,
      })
    }
  }

  await prisma.depositWallet.update({
    where: { sessionId: session.id },
    data: {
      cachedBalance: tBalance.confirmed,
      balanceUpdatedAt: new Date(),
    },
  })

  const pendingCount = await prisma.transaction.count({
    where: {
      sessionId: session.id,
      type: 'deposit',
      status: 'pending',
    },
  })

  // Get updated session to return current state
  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id },
  })

  const pendingDeposits = Array.from(receiveMap.entries())
    .filter(([, tx]) => tx.confirmations < CONFIRMATIONS_REQUIRED)
    .map(([txHash, tx]) => ({
      txHash,
      amount: tx.amount,
      confirmations: tx.confirmations,
      address: monitorAddress,
    }))

  const authenticated = updatedSession?.isAuthenticated ?? session.isAuthenticated
  const sessionBalance = roundZec(updatedSession?.balance ?? session.balance)
  const depositAmount = newDeposits.length > 0 ? newDeposits[0].amount : null

  return NextResponse.json({
    success: true,
    balance: {
      confirmed: totalConfirmed,
      pending: totalPending,
      total: totalConfirmed + totalPending,
    },
    sessionBalance,
    deposits: newDeposits,
    pendingCount,
    // Compatibility fields for onboarding polling hook
    pendingDeposits,
    newDeposit: newDeposits.length > 0,
    depositAmount,
    authenticated,
    session: {
      isAuthenticated: authenticated,
      balance: roundZec(sessionBalance),
    },
    // Authentication status
    auth: {
      isAuthenticated: authenticated,
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
  body: { amount: number; memo?: string; idempotencyKey: string },
  request: NextRequest
) {
  const { amount, memo, idempotencyKey } = body

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

  // Check withdrawal approval threshold
  const approvalThreshold = parseFloat(process.env.WITHDRAWAL_APPROVAL_THRESHOLD || '0')
  const holdForApproval = approvalThreshold > 0 && amount >= approvalThreshold && !isDemo

  const reservation = await prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: {
        sessionId: session.id,
        type: 'withdrawal',
        idempotencyKey,
      },
      orderBy: { createdAt: 'asc' },
    })
    if (existing) {
      return { replay: true as const, transaction: existing }
    }

    const reserved = await reserveFunds(tx, session.id, totalAmount, 'totalWithdrawn', amount)
    if (!reserved) {
      return { replay: false as const, transaction: null }
    }

    const created = await tx.transaction.create({
      data: {
        sessionId: session.id,
        type: 'withdrawal',
        amount,
        fee: WITHDRAWAL_FEE,
        address: destinationAddress,
        isShielded: !isDemo && !destinationAddress.startsWith('t'),
        memo,
        status: holdForApproval ? 'pending_approval' : 'pending',
        idempotencyKey,
      },
    })

    return { replay: false as const, transaction: created }
  })

  if (!reservation.transaction) {
    await logPlayerCounterEvent({
      request,
      action: PLAYER_COUNTER_ACTIONS.WITHDRAW_RESERVE_REJECTED,
      details: 'Conditional withdrawal reserve rejected',
      metadata: {
        sessionId: session.id,
        amount,
        totalAmount,
      },
    })
    return NextResponse.json({
      error: `Insufficient balance. Need ${totalAmount} ZEC (including ${WITHDRAWAL_FEE} ZEC fee)`,
    }, { status: 400 })
  }

  const transaction = reservation.transaction

  if (reservation.replay) {
    await logPlayerCounterEvent({
      request,
      action: PLAYER_COUNTER_ACTIONS.WITHDRAW_IDEMPOTENCY_REPLAY,
      details: 'Withdrawal idempotency replay returned existing transaction',
      metadata: {
        sessionId: session.id,
        transactionId: transaction.id,
        idempotencyKey,
      },
    })
    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        fee: transaction.fee,
        destinationAddress: transaction.address,
        status: transaction.status,
        txHash: transaction.txHash,
        operationId: transaction.operationId,
      },
      message: 'Duplicate request detected. Returning existing withdrawal transaction.',
      idempotentReplay: true,
    })
  }

  if (holdForApproval) {
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
    // Match z_sendmany minconf=1 to avoid false negatives from stricter prechecks.
    const houseBalance = await getAddressBalance(houseAddress, network, 1)
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
  await prisma.$transaction(async (tx) => {
    await releaseFunds(tx, sessionId, totalAmount, 'totalWithdrawn', withdrawnAmount)
    await tx.transaction.update({
      where: { id: transactionId },
      data: { status: 'failed', failReason: reason },
    })
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
            failReason: null,
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
        const operationError = opStatus.error || 'Operation failed'
        const unpaidActionDelta = parseUnpaidActionDelta(operationError)

        if (unpaidActionDelta && transaction.address) {
          const retryCount = getUnpaidActionRetryCount(transaction.failReason)

          if (retryCount < MAX_UNPAID_ACTION_OPERATION_RETRIES) {
            const houseAddress = network === 'mainnet'
              ? process.env.HOUSE_ZADDR_MAINNET
              : process.env.HOUSE_ZADDR_TESTNET

            if (houseAddress) {
              const retryAttempt = retryCount + 1
              const retryFee = estimateRetryFeeForUnpaidAction(operationError, retryCount)

              try {
                const { operationId: retryOperationId } = await sendZec(
                  houseAddress,
                  transaction.address,
                  transaction.amount,
                  transaction.memo || undefined,
                  network,
                  1,
                  retryFee
                )

                await prisma.transaction.update({
                  where: { id: transaction.id },
                  data: {
                    status: 'pending',
                    operationId: retryOperationId,
                    failReason: buildUnpaidActionRetryMarker(retryAttempt),
                  },
                })

                return NextResponse.json({
                  success: true,
                  transaction: {
                    id: transaction.id,
                    status: 'pending',
                    operationId: retryOperationId,
                    operationStatus: 'queued',
                    amount: transaction.amount,
                    retryAttempt,
                  },
                  message: `Withdrawal retry ${retryAttempt}/${MAX_UNPAID_ACTION_OPERATION_RETRIES} submitted with adjusted fee.`,
                })
              } catch (retryError) {
                console.error('[Withdrawal] Unpaid-action retry failed:', retryError)
              }
            }
          }
        }

        const totalAmount = transaction.amount + transaction.fee
        await refundWithdrawal(
          sessionId,
          transaction.id,
          totalAmount,
          transaction.amount,
          operationError
        )
        return NextResponse.json({
          success: true,
          transaction: {
            id: transaction.id,
            status: 'failed',
            failReason: operationError,
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
