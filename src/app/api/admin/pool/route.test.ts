import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    transaction: {
      findFirst: vi.fn(),
      update: vi.fn(),
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

describe('/api/admin/pool manual-confirm-withdrawal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    guardCypherAdminRequestMock.mockReturnValue(null)
    checkAdminRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate limited', { status: 429 }))
    requireAdminMock.mockReturnValue({
      ok: true,
      session: { username: 'admin', role: 'operator' },
    })
    getProvablyFairModeMock.mockReturnValue('legacy_per_game_v1')
    logAdminEventMock.mockResolvedValue(undefined)
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
})
