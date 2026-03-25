import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import type { ZcashNetwork } from '@/types'
import prisma from '@/lib/db'
import { DEFAULT_NETWORK, roundZec } from '@/lib/wallet'
import { getOperationStatus, sendZec } from '@/lib/wallet/rpc'
import { releaseFunds } from '@/lib/services/ledger'
import { logPlayerCounterEvent, PLAYER_COUNTER_ACTIONS } from '@/lib/telemetry/player-events'

const UNPAID_ACTION_RETRY_PREFIX = 'retry_unpaid_action:'
const MAX_UNPAID_ACTION_OPERATION_RETRIES = 3
const ZIP317_MARGINAL_FEE_ZATS = 5000
const DEFAULT_RECONCILE_LIMIT = 200

const pendingWithdrawalSelect = {
  id: true,
  sessionId: true,
  amount: true,
  fee: true,
  address: true,
  memo: true,
  operationId: true,
  status: true,
  failReason: true,
  txHash: true,
  confirmedAt: true,
  session: {
    select: {
      wallet: {
        select: {
          network: true,
        },
      },
    },
  },
} as const satisfies Prisma.TransactionSelect

type PendingWithdrawalRecord = Prisma.TransactionGetPayload<{
  select: typeof pendingWithdrawalSelect
}>

type ReconcileOutcome = 'confirmed' | 'failed' | 'pending' | 'unknown' | 'skipped' | 'not_found'
type ReconcileOperationStatus = 'queued' | 'executing' | 'success' | 'failed' | 'unknown'

export interface ReconciledWithdrawal {
  id: string
  status: string
  txHash: string | null
  failReason: string | null
  amount: number
  fee: number
  confirmedAt: Date | null
  operationId: string | null
  address: string | null
}

export interface ReconciliationResult {
  id: string
  outcome: ReconcileOutcome
  transaction?: ReconciledWithdrawal
  operationStatus?: {
    status: ReconcileOperationStatus
    txid?: string
    error?: string
  }
  retryAttempt?: number
  message?: string
}

export interface ReconcilePendingWithdrawalsOptions {
  request?: NextRequest
  transactionIds?: string[]
  limit?: number
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
  const baseFeeZats = Math.round(0.0001 * 1e8)
  const extraPaidActions = unpaidActionDelta * (retryCount + 1)
  const retryFeeZats = baseFeeZats + (extraPaidActions * ZIP317_MARGINAL_FEE_ZATS)
  return roundZec(retryFeeZats / 1e8)
}

function isOperationNotFound(errorMessage: string | undefined): boolean {
  return errorMessage?.toLowerCase().includes('operation not found') ?? false
}

function getWithdrawalNetwork(transaction: PendingWithdrawalRecord): ZcashNetwork {
  const network = transaction.session?.wallet?.network
  return network === 'mainnet' || network === 'testnet' ? network : DEFAULT_NETWORK
}

function toTransactionSummary(
  transaction: Pick<
    PendingWithdrawalRecord,
    'id' | 'status' | 'txHash' | 'failReason' | 'amount' | 'fee' | 'confirmedAt' | 'operationId' | 'address'
  >
): ReconciledWithdrawal {
  return {
    id: transaction.id,
    status: transaction.status,
    txHash: transaction.txHash,
    failReason: transaction.failReason,
    amount: transaction.amount,
    fee: transaction.fee,
    confirmedAt: transaction.confirmedAt,
    operationId: transaction.operationId,
    address: transaction.address,
  }
}

async function refundWithdrawal(transaction: PendingWithdrawalRecord, reason: string) {
  const totalAmount = roundZec(transaction.amount + transaction.fee)

  await prisma.$transaction(async (tx) => {
    await releaseFunds(tx, transaction.sessionId, totalAmount, 'totalWithdrawn', transaction.amount)
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'failed',
        failReason: reason,
      },
    })
  })

  return {
    ...transaction,
    status: 'failed',
    failReason: reason,
  }
}

async function retryUnpaidActionWithdrawal(
  transaction: PendingWithdrawalRecord,
  operationError: string,
  network: ZcashNetwork,
  request?: NextRequest
): Promise<ReconciliationResult | null> {
  if (!transaction.address) {
    return null
  }

  const retryCount = getUnpaidActionRetryCount(transaction.failReason)
  if (retryCount >= MAX_UNPAID_ACTION_OPERATION_RETRIES) {
    return null
  }

  const houseAddress = network === 'mainnet'
    ? process.env.HOUSE_ZADDR_MAINNET
    : process.env.HOUSE_ZADDR_TESTNET

  if (!houseAddress) {
    return null
  }

  const retryAttempt = retryCount + 1
  const retryFee = estimateRetryFeeForUnpaidAction(operationError, retryCount)

  try {
    const { operationId } = await sendZec(
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
        operationId,
        failReason: buildUnpaidActionRetryMarker(retryAttempt),
      },
    })

    if (request) {
      await logPlayerCounterEvent({
        request,
        action: PLAYER_COUNTER_ACTIONS.WITHDRAW_UNPAID_ACTION_RETRY,
        details: `Withdrawal unpaid-action retry ${retryAttempt}/${MAX_UNPAID_ACTION_OPERATION_RETRIES}`,
        metadata: {
          sessionId: transaction.sessionId,
          transactionId: transaction.id,
          previousOperationId: transaction.operationId,
          retryOperationId: operationId,
          retryAttempt,
          retryFee,
          operationError,
        },
      })
    }

    return {
      id: transaction.id,
      outcome: 'pending',
      transaction: toTransactionSummary({
        ...transaction,
        failReason: buildUnpaidActionRetryMarker(retryAttempt),
        operationId,
      }),
      operationStatus: { status: 'queued' },
      retryAttempt,
      message: `Withdrawal retry ${retryAttempt}/${MAX_UNPAID_ACTION_OPERATION_RETRIES} submitted with adjusted fee.`,
    }
  } catch (retryError) {
    console.error('[Withdrawal] Unpaid-action retry failed:', retryError)
    return null
  }
}

async function reconcilePendingWithdrawal(
  transaction: PendingWithdrawalRecord,
  request?: NextRequest
): Promise<ReconciliationResult> {
  if (transaction.status !== 'pending') {
    return {
      id: transaction.id,
      outcome: 'skipped',
      transaction: toTransactionSummary(transaction),
      message: 'Withdrawal is no longer pending.',
    }
  }

  if (!transaction.operationId) {
    return {
      id: transaction.id,
      outcome: 'unknown',
      transaction: toTransactionSummary(transaction),
      message: 'Pending withdrawal has no operation ID and requires manual review.',
    }
  }

  const network = getWithdrawalNetwork(transaction)

  try {
    const operationStatus = await getOperationStatus(transaction.operationId, network)

    if (operationStatus.status === 'success' && operationStatus.txid) {
      const updated = await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'confirmed',
          txHash: operationStatus.txid,
          confirmedAt: new Date(),
          failReason: null,
        },
        select: pendingWithdrawalSelect,
      })

      return {
        id: transaction.id,
        outcome: 'confirmed',
        transaction: toTransactionSummary(updated),
        operationStatus: {
          status: 'success',
          txid: operationStatus.txid,
        },
      }
    }

    if (operationStatus.status === 'failed') {
      const operationError = operationStatus.error || 'Operation failed'

      if (isOperationNotFound(operationError)) {
        return {
          id: transaction.id,
          outcome: 'unknown',
          transaction: toTransactionSummary(transaction),
          operationStatus: {
            status: 'unknown',
            error: operationError,
          },
          message: 'Operation is no longer available from zcashd. Pending withdrawal requires manual confirmation or investigation.',
        }
      }

      const unpaidActionDelta = parseUnpaidActionDelta(operationError)
      if (unpaidActionDelta) {
        const retried = await retryUnpaidActionWithdrawal(transaction, operationError, network, request)
        if (retried) {
          return retried
        }
      }

      const failed = await refundWithdrawal(transaction, operationError)
      return {
        id: transaction.id,
        outcome: 'failed',
        transaction: toTransactionSummary(failed),
        operationStatus: {
          status: 'failed',
          error: operationError,
        },
      }
    }

    return {
      id: transaction.id,
      outcome: 'pending',
      transaction: toTransactionSummary(transaction),
      operationStatus: {
        status: operationStatus.status,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check operation status'
    return {
      id: transaction.id,
      outcome: 'pending',
      transaction: toTransactionSummary(transaction),
      message: 'Unable to check status. Node may be temporarily unavailable.',
      operationStatus: {
        status: 'unknown',
        error: message,
      },
    }
  }
}

export async function reconcilePendingWithdrawals(
  options: ReconcilePendingWithdrawalsOptions = {}
): Promise<ReconciliationResult[]> {
  const where: Prisma.TransactionWhereInput = {
    type: 'withdrawal',
    status: 'pending',
    operationId: { not: null },
  }

  if (options.transactionIds?.length) {
    where.id = { in: options.transactionIds }
  }

  const pendingWithdrawals = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: options.limit ?? DEFAULT_RECONCILE_LIMIT,
    select: pendingWithdrawalSelect,
  })

  const results: ReconciliationResult[] = []
  for (const transaction of pendingWithdrawals) {
    results.push(await reconcilePendingWithdrawal(transaction, options.request))
  }

  return results
}

export async function reconcileWithdrawalById(
  transactionId: string,
  options: { request?: NextRequest; sessionId?: string } = {}
): Promise<ReconciliationResult> {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      type: 'withdrawal',
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    },
    select: pendingWithdrawalSelect,
  })

  if (!transaction) {
    return {
      id: transactionId,
      outcome: 'not_found',
      message: 'Transaction not found.',
    }
  }

  return reconcilePendingWithdrawal(transaction, options.request)
}
