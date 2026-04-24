import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    transaction: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    session: {
      update: vi.fn(),
    },
  },
  getPoolStatusMock: vi.fn(),
  checkAndRefillPoolMock: vi.fn(),
  cleanupExpiredCommitmentsMock: vi.fn(),
  initializePoolMock: vi.fn(),
  getOperationStatusMock: vi.fn(),
  sendZecMock: vi.fn(),
  checkNodeStatusMock: vi.fn(),
  getAddressBalanceMock: vi.fn(),
  requireAdminMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  checkAdminRateLimitMock: vi.fn(),
  createRateLimitResponseMock: vi.fn(),
  logAdminEventMock: vi.fn(),
  isKillSwitchActiveMock: vi.fn(),
  setKillSwitchMock: vi.fn(),
  getKillSwitchStatusMock: vi.fn(),
  sweepDepositsMock: vi.fn(),
  checkSweepStatusMock: vi.fn(),
  getSweepHistoryMock: vi.fn(),
  getSweepServiceStatusMock: vi.fn(),
  getProvablyFairModeMock: vi.fn(),
  getSessionSeedPoolStatusMock: vi.fn(),
  initializeSessionSeedPoolMock: vi.fn(),
  triggerSessionSeedPoolCheckMock: vi.fn(),
  guardCypherAdminRequestMock: vi.fn(),
  reserveFundsMock: vi.fn(),
  releaseFundsMock: vi.fn(),
  reconcilePendingWithdrawalsMock: vi.fn(),
  reconcileWithdrawalByIdMock: vi.fn(),
}))

const {
  prismaMock,
  getPoolStatusMock,
  checkAndRefillPoolMock,
  cleanupExpiredCommitmentsMock,
  initializePoolMock,
  getOperationStatusMock,
  sendZecMock,
  checkNodeStatusMock,
  getAddressBalanceMock,
  requireAdminMock,
  hasPermissionMock,
  checkAdminRateLimitMock,
  createRateLimitResponseMock,
  logAdminEventMock,
  isKillSwitchActiveMock,
  setKillSwitchMock,
  getKillSwitchStatusMock,
  sweepDepositsMock,
  checkSweepStatusMock,
  getSweepHistoryMock,
  getSweepServiceStatusMock,
  getProvablyFairModeMock,
  getSessionSeedPoolStatusMock,
  initializeSessionSeedPoolMock,
  triggerSessionSeedPoolCheckMock,
  guardCypherAdminRequestMock,
  reserveFundsMock,
  releaseFundsMock,
  reconcilePendingWithdrawalsMock,
  reconcileWithdrawalByIdMock,
} = mocks

vi.mock('@/lib/provably-fair/commitment-pool', () => ({
  getPoolStatus: mocks.getPoolStatusMock,
  checkAndRefillPool: mocks.checkAndRefillPoolMock,
  cleanupExpiredCommitments: mocks.cleanupExpiredCommitmentsMock,
  initializePool: mocks.initializePoolMock,
}))

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/wallet/rpc', () => ({
  getOperationStatus: mocks.getOperationStatusMock,
  sendZec: mocks.sendZecMock,
  checkNodeStatus: mocks.checkNodeStatusMock,
  getAddressBalance: mocks.getAddressBalanceMock,
}))

vi.mock('@/lib/wallet', () => ({
  DEFAULT_NETWORK: 'mainnet',
  roundZec: (value: number) => value,
  WITHDRAWAL_FEE: 0.0001,
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: mocks.requireAdminMock,
}))

vi.mock('@/lib/admin/rbac', () => ({
  hasPermission: mocks.hasPermissionMock,
}))

vi.mock('@/lib/admin/rate-limit', () => ({
  checkAdminRateLimit: mocks.checkAdminRateLimitMock,
  createRateLimitResponse: mocks.createRateLimitResponseMock,
}))

vi.mock('@/lib/admin/audit', () => ({
  logAdminEvent: mocks.logAdminEventMock,
}))

vi.mock('@/lib/kill-switch', () => ({
  isKillSwitchActive: mocks.isKillSwitchActiveMock,
  setKillSwitch: mocks.setKillSwitchMock,
  getKillSwitchStatus: mocks.getKillSwitchStatusMock,
}))

vi.mock('@/lib/services/deposit-sweep', () => ({
  sweepDeposits: mocks.sweepDepositsMock,
  checkSweepStatus: mocks.checkSweepStatusMock,
  getSweepHistory: mocks.getSweepHistoryMock,
  getSweepServiceStatus: mocks.getSweepServiceStatusMock,
}))

vi.mock('@/lib/provably-fair/mode', () => ({
  SESSION_NONCE_MODE: 'session_nonce_v1',
  getProvablyFairMode: mocks.getProvablyFairModeMock,
}))

vi.mock('@/lib/services/session-seed-pool-manager', () => ({
  getSessionSeedPoolStatus: mocks.getSessionSeedPoolStatusMock,
  initializeSessionSeedPool: mocks.initializeSessionSeedPoolMock,
  triggerSessionSeedPoolCheck: mocks.triggerSessionSeedPoolCheckMock,
}))

vi.mock('@/lib/admin/host-guard', () => ({
  guardCypherAdminRequest: mocks.guardCypherAdminRequestMock,
}))

vi.mock('@/lib/services/ledger', () => ({
  reserveFunds: mocks.reserveFundsMock,
  releaseFunds: mocks.releaseFundsMock,
}))

vi.mock('@/lib/services/withdrawal-reconciliation', () => ({
  reconcilePendingWithdrawals: mocks.reconcilePendingWithdrawalsMock,
  reconcileWithdrawalById: mocks.reconcileWithdrawalByIdMock,
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

function makePendingApprovalWithdrawal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    sessionId: 'session-1',
    type: 'withdrawal',
    amount: 1,
    fee: 0.0001,
    address: 'zs1destination',
    memo: null,
    isShielded: true,
    status: 'pending_approval',
    session: {
      wallet: {
        network: 'mainnet',
      },
    },
    ...overrides,
  }
}

async function approveWithdrawal(transactionId = 'tx-1') {
  return POST(makeRequest({
    action: 'approve-withdrawal',
    transactionId,
  }))
}

async function rejectWithdrawal(transactionId = 'tx-1', reason?: string) {
  return POST(makeRequest({
    action: 'reject-withdrawal',
    transactionId,
    ...(reason ? { reason } : {}),
  }))
}

describe('/api/admin/pool', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.HOUSE_ZADDR_MAINNET = 'zs1house'
    guardCypherAdminRequestMock.mockReturnValue(null)
    checkAdminRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate limited', { status: 429 }))
    requireAdminMock.mockReturnValue({
      ok: true,
      session: { username: 'admin', role: 'operator' },
    })
    getProvablyFairModeMock.mockReturnValue('legacy_per_game_v1')
    logAdminEventMock.mockResolvedValue(undefined)
    prismaMock.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === 'function') {
        return (input as (tx: typeof prismaMock) => unknown)(prismaMock)
      }
      return Promise.all(input as Promise<unknown>[])
    })
    checkNodeStatusMock.mockResolvedValue({ connected: true })
    getAddressBalanceMock.mockResolvedValue({ confirmed: 10 })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.HOUSE_ZADDR_MAINNET
  })

  it('rejects manual confirmation without withdrawal approval permission', async () => {
    hasPermissionMock.mockReturnValue(false)

    const response = await POST(makeRequest({
      action: 'manual-confirm-withdrawal',
      transactionId: 'tx-1',
      txHash: 'a'.repeat(64),
    }))

    expect(response.status).toBe(403)
    expect(prismaMock.transaction.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.session.update).not.toHaveBeenCalled()
  })

  it('manually confirms a pending withdrawal without touching session balances', async () => {
    hasPermissionMock.mockReturnValue(true)
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      operationId: 'op-1',
    })
    prismaMock.transaction.update.mockResolvedValue({
      id: 'tx-1',
      status: 'confirmed',
      txHash: 'a'.repeat(64),
    })

    const response = await POST(makeRequest({
      action: 'manual-confirm-withdrawal',
      transactionId: 'tx-1',
      txHash: 'A'.repeat(64),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: {
        status: 'confirmed',
        txHash: 'a'.repeat(64),
        confirmedAt: expect.any(Date),
        failReason: null,
      },
    })
    expect(prismaMock.session.update).not.toHaveBeenCalled()
  })

  it('claims a withdrawal before sending ZEC for approval', async () => {
    vi.useFakeTimers()
    hasPermissionMock.mockReturnValue(true)
    prismaMock.transaction.findFirst.mockResolvedValue(makePendingApprovalWithdrawal())
    prismaMock.transaction.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
    sendZecMock.mockResolvedValue({ operationId: 'op-1' })
    getOperationStatusMock.mockResolvedValue({ status: 'success' })

    const responsePromise = approveWithdrawal()
    await vi.advanceTimersByTimeAsync(3000)
    const response = await responsePromise
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      action: 'approve-withdrawal',
      transactionId: 'tx-1',
      operationId: 'op-1',
      amount: 1,
    })
    expect(prismaMock.transaction.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'tx-1', type: 'withdrawal', status: 'pending_approval' },
      data: { status: 'processing_approval', failReason: null },
    })
    expect(sendZecMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.transaction.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      sendZecMock.mock.invocationCallOrder[0]
    )
    expect(prismaMock.transaction.updateMany.mock.calls[1]?.[0]).toMatchObject({
      where: { id: 'tx-1', type: 'withdrawal', status: 'processing_approval' },
      data: { status: 'pending', operationId: 'op-1' },
    })
  })

  it('returns an idempotent approval response when another request already claimed it', async () => {
    hasPermissionMock.mockReturnValue(true)
    prismaMock.transaction.findFirst
      .mockResolvedValueOnce(makePendingApprovalWithdrawal())
      .mockResolvedValueOnce({
        id: 'tx-1',
        status: 'processing_approval',
        operationId: null,
        txHash: null,
        failReason: null,
      })
    prismaMock.transaction.updateMany.mockResolvedValueOnce({ count: 0 })

    const response = await approveWithdrawal()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      action: 'approve-withdrawal',
      transactionId: 'tx-1',
      status: 'processing_approval',
      alreadyProcessing: true,
    })
    expect(sendZecMock).not.toHaveBeenCalled()
  })

  it('refunds a claimed withdrawal exactly once when the send RPC fails', async () => {
    hasPermissionMock.mockReturnValue(true)
    prismaMock.transaction.findFirst.mockResolvedValue(makePendingApprovalWithdrawal())
    prismaMock.transaction.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
    sendZecMock.mockRejectedValue(new Error('RPC offline'))

    const response = await approveWithdrawal()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toMatchObject({
      error: 'RPC failed: RPC offline',
      refunded: true,
    })
    expect(prismaMock.transaction.updateMany.mock.calls[1]?.[0]).toMatchObject({
      where: { id: 'tx-1', type: 'withdrawal', status: 'processing_approval' },
      data: { status: 'failed', failReason: 'RPC offline' },
    })
    expect(releaseFundsMock).toHaveBeenCalledTimes(1)
    expect(releaseFundsMock).toHaveBeenCalledWith(
      prismaMock,
      'session-1',
      1.0001,
      'totalWithdrawn',
      1
    )
  })

  it('rejects and refunds a pending approval inside one guarded transaction', async () => {
    hasPermissionMock.mockReturnValue(true)
    prismaMock.transaction.findFirst.mockResolvedValue(makePendingApprovalWithdrawal())
    prismaMock.transaction.updateMany.mockResolvedValueOnce({ count: 1 })

    const response = await rejectWithdrawal('tx-1', 'bad address')
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      action: 'reject-withdrawal',
      transactionId: 'tx-1',
      refundedAmount: 1.0001,
    })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: 'tx-1', type: 'withdrawal', status: 'pending_approval' },
      data: { status: 'failed', failReason: 'bad address' },
    })
    expect(releaseFundsMock).toHaveBeenCalledTimes(1)
    expect(releaseFundsMock).toHaveBeenCalledWith(
      prismaMock,
      'session-1',
      1.0001,
      'totalWithdrawn',
      1
    )
  })

  it('does not refund when another rejection already moved the withdrawal to failed', async () => {
    hasPermissionMock.mockReturnValue(true)
    prismaMock.transaction.findFirst
      .mockResolvedValueOnce(makePendingApprovalWithdrawal())
      .mockResolvedValueOnce({
        id: 'tx-1',
        status: 'failed',
        operationId: null,
        txHash: null,
        failReason: 'Rejected by admin',
      })
    prismaMock.transaction.updateMany.mockResolvedValueOnce({ count: 0 })

    const response = await rejectWithdrawal()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      action: 'reject-withdrawal',
      transactionId: 'tx-1',
      status: 'failed',
      alreadyProcessed: true,
    })
    expect(releaseFundsMock).not.toHaveBeenCalled()
  })
})
