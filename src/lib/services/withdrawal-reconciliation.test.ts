import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const txContext = {
    transaction: {
      update: vi.fn(),
    },
  }

  return {
    prismaMock: {
      transaction: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    txContext,
    getOperationStatusMock: vi.fn(),
    sendZecMock: vi.fn(),
    releaseFundsMock: vi.fn(),
    logPlayerCounterEventMock: vi.fn(),
  }
})

const {
  prismaMock,
  txContext,
  getOperationStatusMock,
  sendZecMock,
  releaseFundsMock,
  logPlayerCounterEventMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/wallet', () => ({
  DEFAULT_NETWORK: 'testnet',
  roundZec: (value: number) => value,
}))

vi.mock('@/lib/wallet/rpc', () => ({
  getOperationStatus: mocks.getOperationStatusMock,
  sendZec: mocks.sendZecMock,
}))

vi.mock('@/lib/services/ledger', () => ({
  releaseFunds: mocks.releaseFundsMock,
}))

vi.mock('@/lib/telemetry/player-events', () => ({
  PLAYER_COUNTER_ACTIONS: {
    WITHDRAW_UNPAID_ACTION_RETRY: 'player.withdraw.unpaid_action_retry',
  },
  logPlayerCounterEvent: mocks.logPlayerCounterEventMock,
}))

import {
  reconcilePendingWithdrawals,
  reconcileWithdrawalById,
} from './withdrawal-reconciliation'

function pendingWithdrawal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    sessionId: 'session-1',
    amount: 1.0248,
    fee: 0.0001,
    address: 'u1destination123',
    memo: null,
    operationId: 'op-1',
    status: 'pending',
    failReason: null,
    txHash: null,
    confirmedAt: null,
    session: {
      wallet: {
        network: 'mainnet',
      },
    },
    ...overrides,
  }
}

describe('withdrawal reconciliation service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HOUSE_ZADDR_MAINNET = 'zs1housemainnetaddress1234567890'
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txContext) => Promise<unknown>) => fn(txContext))
  })

  it('marks pending withdrawals confirmed when the operation succeeds', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([pendingWithdrawal()])
    getOperationStatusMock.mockResolvedValue({ status: 'success', txid: 'a'.repeat(64) })
    prismaMock.transaction.update.mockResolvedValue(
      pendingWithdrawal({
        status: 'confirmed',
        txHash: 'a'.repeat(64),
        confirmedAt: new Date('2026-03-24T12:00:00Z'),
      })
    )

    const results = await reconcilePendingWithdrawals()

    expect(results).toHaveLength(1)
    expect(results[0]?.outcome).toBe('confirmed')
    expect(results[0]?.transaction?.txHash).toBe('a'.repeat(64))
    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: {
        status: 'confirmed',
        txHash: 'a'.repeat(64),
        confirmedAt: expect.any(Date),
        failReason: null,
      },
      select: expect.any(Object),
    })
  })

  it('refunds and marks the withdrawal failed on explicit operation failure', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([pendingWithdrawal()])
    getOperationStatusMock.mockResolvedValue({ status: 'failed', error: 'insufficient fee' })

    const results = await reconcilePendingWithdrawals()

    expect(results[0]?.outcome).toBe('failed')
    expect(results[0]?.transaction?.failReason).toBe('insufficient fee')
    expect(releaseFundsMock).toHaveBeenCalledWith(
      txContext,
      'session-1',
      1.0249,
      'totalWithdrawn',
      1.0248
    )
    expect(txContext.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: {
        status: 'failed',
        failReason: 'insufficient fee',
      },
    })
  })

  it('retries unpaid-action failures with an adjusted fee and keeps the withdrawal pending', async () => {
    const request = {} as never
    prismaMock.transaction.findMany.mockResolvedValue([pendingWithdrawal()])
    getOperationStatusMock.mockResolvedValue({
      status: 'failed',
      error: 'SendTransaction: Transaction commit failed:: tx unpaid action limit exceeded: 2 action(s) exceeds limit of 0',
    })
    sendZecMock.mockResolvedValue({ operationId: 'op-retry-1' })

    const results = await reconcilePendingWithdrawals({ request })

    expect(results[0]?.outcome).toBe('pending')
    expect(results[0]?.retryAttempt).toBe(1)
    expect(results[0]?.transaction?.operationId).toBe('op-retry-1')
    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: {
        status: 'pending',
        operationId: 'op-retry-1',
        failReason: 'retry_unpaid_action:1',
      },
    })
    expect(logPlayerCounterEventMock).toHaveBeenCalledTimes(1)
    expect(releaseFundsMock).not.toHaveBeenCalled()
  })

  it('treats operation-not-found as unknown and leaves the withdrawal pending', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([pendingWithdrawal()])
    getOperationStatusMock.mockResolvedValue({ status: 'failed', error: 'Operation not found' })

    const results = await reconcilePendingWithdrawals()

    expect(results[0]?.outcome).toBe('unknown')
    expect(results[0]?.transaction?.status).toBe('pending')
    expect(prismaMock.transaction.update).not.toHaveBeenCalled()
    expect(releaseFundsMock).not.toHaveBeenCalled()
    expect(sendZecMock).not.toHaveBeenCalled()
  })

  it('can reconcile a single withdrawal by id', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(pendingWithdrawal())
    getOperationStatusMock.mockResolvedValue({ status: 'failed', error: 'Operation not found' })

    const result = await reconcileWithdrawalById('tx-1')

    expect(result.outcome).toBe('unknown')
    expect(prismaMock.transaction.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'tx-1',
        type: 'withdrawal',
      },
      select: expect.any(Object),
    })
  })
})
