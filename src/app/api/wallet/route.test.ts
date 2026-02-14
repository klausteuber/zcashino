import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    depositWallet: {
      update: vi.fn(),
    },
  },
  checkNodeStatusMock: vi.fn(),
  getAddressBalanceMock: vi.fn(),
  sendZecMock: vi.fn(),
  getOperationStatusMock: vi.fn(),
  listAddressTransactionsMock: vi.fn(),
  validateAddressViaRPCMock: vi.fn(),
  getDepositInfoMock: vi.fn(),
  createDepositWalletForSessionMock: vi.fn(),
  checkPublicRateLimitMock: vi.fn(),
  createRateLimitResponseMock: vi.fn(),
  isKillSwitchActiveMock: vi.fn(),
}))

const {
  prismaMock,
  checkNodeStatusMock,
  getAddressBalanceMock,
  sendZecMock,
  getOperationStatusMock,
  listAddressTransactionsMock,
  validateAddressViaRPCMock,
  getDepositInfoMock,
  createDepositWalletForSessionMock,
  checkPublicRateLimitMock,
  createRateLimitResponseMock,
  isKillSwitchActiveMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/wallet', () => ({
  DEFAULT_NETWORK: 'testnet',
  MIN_DEPOSIT: 0.0001,
  CONFIRMATIONS_REQUIRED: 3,
  WITHDRAWAL_FEE: 0.0001,
  MIN_WITHDRAWAL: 0.001,
  validateAddress: vi.fn(() => ({ valid: true })),
  roundZec: (value: number) => value,
}))

vi.mock('@/lib/wallet/rpc', () => ({
  checkNodeStatus: mocks.checkNodeStatusMock,
  getAddressBalance: mocks.getAddressBalanceMock,
  sendZec: mocks.sendZecMock,
  getOperationStatus: mocks.getOperationStatusMock,
  listAddressTransactions: mocks.listAddressTransactionsMock,
  validateAddressViaRPC: mocks.validateAddressViaRPCMock,
}))

vi.mock('@/lib/wallet/addresses', () => ({
  getDepositInfo: mocks.getDepositInfoMock,
}))

vi.mock('@/lib/wallet/session-wallet', () => ({
  createDepositWalletForSession: mocks.createDepositWalletForSessionMock,
}))

vi.mock('@/lib/admin/rate-limit', () => ({
  checkPublicRateLimit: mocks.checkPublicRateLimitMock,
  createRateLimitResponse: mocks.createRateLimitResponseMock,
}))

vi.mock('@/lib/kill-switch', () => ({
  isKillSwitchActive: mocks.isKillSwitchActiveMock,
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

describe('/api/wallet POST withdrawal-status transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    checkPublicRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate-limited', { status: 429 }))
    isKillSwitchActiveMock.mockReturnValue(false)
    checkNodeStatusMock.mockResolvedValue({ connected: true, synced: true })
    getAddressBalanceMock.mockResolvedValue({ confirmed: 0, pending: 0 })
    sendZecMock.mockResolvedValue({ operationId: 'op-1' })
    listAddressTransactionsMock.mockResolvedValue([])
    validateAddressViaRPCMock.mockResolvedValue({ isvalid: true })
    getDepositInfoMock.mockReturnValue({})
    createDepositWalletForSessionMock.mockResolvedValue({
      id: 'wallet-1',
      transparentAddr: 'tmock',
      network: 'testnet',
    })

    prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      balance: 1,
      walletAddress: 'demo_wallet',
      isAuthenticated: true,
      withdrawalAddress: 't1dest',
      wallet: {
        transparentAddr: 'tmock',
        network: 'testnet',
      },
    })
  })

  it('marks pending withdrawals confirmed when operation succeeds', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      sessionId: 'session-1',
      type: 'withdrawal',
      status: 'pending',
      operationId: 'op-1',
      amount: 0.25,
      fee: 0.0001,
      txHash: null,
      failReason: null,
      confirmedAt: null,
    })
    getOperationStatusMock.mockResolvedValue({ status: 'success', txid: 'zcash-tx-hash' })

    const response = await POST(makeRequest({
      action: 'withdrawal-status',
      sessionId: 'session-1',
      transactionId: 'tx-1',
    }))

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.transaction.status).toBe('confirmed')
    expect(payload.transaction.txHash).toBe('zcash-tx-hash')
    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: {
        status: 'confirmed',
        txHash: 'zcash-tx-hash',
        confirmedAt: expect.any(Date),
      },
    })
    expect(prismaMock.session.update).not.toHaveBeenCalled()
  })

  it('refunds and marks failed when operation status is failed', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: 'tx-2',
      sessionId: 'session-1',
      type: 'withdrawal',
      status: 'pending',
      operationId: 'op-2',
      amount: 0.4,
      fee: 0.0001,
      txHash: null,
      failReason: null,
      confirmedAt: null,
    })
    getOperationStatusMock.mockResolvedValue({ status: 'failed', error: 'insufficient fee' })

    const response = await POST(makeRequest({
      action: 'withdrawal-status',
      sessionId: 'session-1',
      transactionId: 'tx-2',
    }))

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.transaction.status).toBe('failed')
    expect(payload.transaction.failReason).toBe('insufficient fee')

    expect(prismaMock.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        balance: { increment: 0.4001 },
        totalWithdrawn: { decrement: 0.4 },
      },
    })

    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-2' },
      data: { status: 'failed', failReason: 'insufficient fee' },
    })
  })

  it('returns finalized transactions without polling RPC again', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: 'tx-3',
      sessionId: 'session-1',
      type: 'withdrawal',
      status: 'confirmed',
      operationId: null,
      amount: 0.2,
      fee: 0.0001,
      txHash: 'already-final',
      failReason: null,
      confirmedAt: new Date('2026-02-14T00:00:00Z'),
    })

    const response = await POST(makeRequest({
      action: 'withdrawal-status',
      sessionId: 'session-1',
      transactionId: 'tx-3',
    }))

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.transaction.status).toBe('confirmed')
    expect(getOperationStatusMock).not.toHaveBeenCalled()
  })
})
