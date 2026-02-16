import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
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
  logPlayerCounterEventMock: vi.fn(),
  requirePlayerSessionMock: vi.fn(),
  reserveFundsMock: vi.fn(),
  releaseFundsMock: vi.fn(),
  creditFundsMock: vi.fn(),
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
  logPlayerCounterEventMock,
  requirePlayerSessionMock,
  reserveFundsMock,
  releaseFundsMock,
  creditFundsMock,
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

vi.mock('@/lib/auth/player-session', () => ({
  requirePlayerSession: mocks.requirePlayerSessionMock,
}))

vi.mock('@/lib/services/ledger', () => ({
  reserveFunds: mocks.reserveFundsMock,
  releaseFunds: mocks.releaseFundsMock,
  creditFunds: mocks.creditFundsMock,
}))

vi.mock('@/lib/telemetry/player-events', () => ({
  PLAYER_COUNTER_ACTIONS: {
    WITHDRAW_IDEMPOTENCY_REPLAY: 'player.withdraw.idempotency_replay',
    WITHDRAW_RESERVE_REJECTED: 'player.withdraw.reserve_rejected',
    WITHDRAW_UNPAID_ACTION_RETRY: 'player.withdraw.unpaid_action_retry',
    BLACKJACK_RESERVE_REJECTED: 'player.game.reserve_rejected',
    BLACKJACK_DUPLICATE_COMPLETION: 'player.game.duplicate_completion_blocked',
    VIDEO_POKER_RESERVE_REJECTED: 'player.video_poker.reserve_rejected',
    VIDEO_POKER_DUPLICATE_COMPLETION: 'player.video_poker.duplicate_completion_blocked',
    LEGACY_SESSION_FALLBACK: 'player.auth.legacy_fallback',
  },
  logPlayerCounterEvent: mocks.logPlayerCounterEventMock,
}))

import { GET, POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

describe('/api/wallet POST withdrawal-status transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    process.env.HOUSE_ZADDR_TESTNET = 'ztestsaplinghouseaddress1234567890'

    checkPublicRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate-limited', { status: 429 }))
    isKillSwitchActiveMock.mockReturnValue(false)
    requirePlayerSessionMock.mockReturnValue({ ok: true })
    logPlayerCounterEventMock.mockResolvedValue(undefined)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock))
    checkNodeStatusMock.mockResolvedValue({ connected: true, synced: true })
    getAddressBalanceMock.mockResolvedValue({ confirmed: 0, pending: 0 })
    sendZecMock.mockResolvedValue({ operationId: 'op-1' })
    listAddressTransactionsMock.mockResolvedValue([])
    validateAddressViaRPCMock.mockResolvedValue({ isvalid: true })
    getDepositInfoMock.mockReturnValue({})
    creditFundsMock.mockResolvedValue(undefined)
    createDepositWalletForSessionMock.mockResolvedValue({
      id: 'wallet-1',
      unifiedAddr: null,
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
        unifiedAddr: null,
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
        failReason: null,
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

    expect(releaseFundsMock).toHaveBeenCalledWith(
      prismaMock,
      'session-1',
      0.4001,
      'totalWithdrawn',
      0.4
    )

    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-2' },
      data: { status: 'failed', failReason: 'insufficient fee' },
    })
  })

  it('resubmits withdrawal with higher fee when operation fails for unpaid actions', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: 'tx-ua-1',
      sessionId: 'session-1',
      type: 'withdrawal',
      status: 'pending',
      operationId: 'op-ua-1',
      amount: 0.4,
      fee: 0.0001,
      address: 'u1dest',
      memo: 'retry-memo',
      txHash: null,
      failReason: null,
      confirmedAt: null,
    })
    getOperationStatusMock.mockResolvedValue({
      status: 'failed',
      error: 'SendTransaction: Transaction commit failed:: tx unpaid action limit exceeded: 2 action(s) exceeds limit of 0',
    })
    sendZecMock.mockResolvedValue({ operationId: 'op-ua-retry-1' })

    const response = await POST(makeRequest({
      action: 'withdrawal-status',
      sessionId: 'session-1',
      transactionId: 'tx-ua-1',
    }))

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.transaction.status).toBe('pending')
    expect(payload.transaction.operationId).toBe('op-ua-retry-1')
    expect(payload.transaction.retryAttempt).toBe(1)

    expect(sendZecMock).toHaveBeenCalledWith(
      'ztestsaplinghouseaddress1234567890',
      'u1dest',
      0.4,
      'retry-memo',
      'testnet',
      1,
      0.0002
    )

    expect(prismaMock.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-ua-1' },
      data: {
        status: 'pending',
        operationId: 'op-ua-retry-1',
        failReason: 'retry_unpaid_action:1',
      },
    })
    expect(logPlayerCounterEventMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'player.withdraw.unpaid_action_retry',
      details: 'Withdrawal unpaid-action retry 1/3',
      metadata: expect.objectContaining({
        sessionId: 'session-1',
        transactionId: 'tx-ua-1',
        retryOperationId: 'op-ua-retry-1',
        retryAttempt: 1,
        retryFee: 0.0002,
      }),
    }))
    expect(releaseFundsMock).not.toHaveBeenCalled()
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

  it('returns unified-first wallet metadata on GET', async () => {
    prismaMock.session.findUnique.mockResolvedValueOnce({
      id: 'session-1',
      balance: 1,
      walletAddress: 'demo_wallet',
      isAuthenticated: true,
      withdrawalAddress: 'u1dest',
      authTxHash: null,
      authConfirmedAt: null,
      wallet: {
        id: 'wallet-ua',
        unifiedAddr: 'utestUnifiedDepositAddress1234567890',
        transparentAddr: 'tmock',
        network: 'testnet',
      },
    })

    getDepositInfoMock.mockReturnValueOnce({
      address: 'utestUnifiedDepositAddress1234567890',
      addressType: 'unified',
      network: 'testnet',
      minimumDeposit: 0.001,
      confirmationsRequired: 3,
      qrCodeData: 'utestUnifiedDepositAddress1234567890',
    })

    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams('sessionId=session-1') },
    } as unknown as NextRequest)

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.wallet.depositAddress).toBe('utestUnifiedDepositAddress1234567890')
    expect(payload.wallet.depositAddressType).toBe('unified')
    expect(payload.wallet.transparentAddress).toBe('tmock')
    expect(getDepositInfoMock).toHaveBeenCalledWith(
      'utestUnifiedDepositAddress1234567890',
      'unified',
      'testnet'
    )
  })

  it('returns compatibility fields and monitors unified deposit address on check-deposits', async () => {
    prismaMock.session.findUnique
      .mockResolvedValueOnce({
        id: 'session-1',
        balance: 1,
        walletAddress: 'real_wallet',
        isAuthenticated: false,
        withdrawalAddress: 'u1withdrawal',
        authTxHash: null,
        authConfirmedAt: null,
        wallet: {
          id: 'wallet-1',
          unifiedAddr: 'utestUnifiedDepositAddress1234567890',
          transparentAddr: 'tmTransparentAddress1234567890123',
          network: 'testnet',
        },
      })
      .mockResolvedValueOnce({
        id: 'session-1',
        balance: 1,
        isAuthenticated: false,
        withdrawalAddress: 'u1withdrawal',
        authTxHash: null,
      })

    getAddressBalanceMock.mockResolvedValueOnce({ confirmed: 0.25, pending: 0 })
    listAddressTransactionsMock.mockResolvedValueOnce([
      {
        txid: 'tx-pending',
        category: 'receive',
        amount: 0.5,
        confirmations: 1,
        time: 1,
      },
    ])
    prismaMock.transaction.findMany.mockResolvedValueOnce([])
    prismaMock.transaction.count.mockResolvedValueOnce(1)

    const response = await POST(makeRequest({
      action: 'check-deposits',
      sessionId: 'session-1',
    }))

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(listAddressTransactionsMock).toHaveBeenCalledWith(
      'utestUnifiedDepositAddress1234567890',
      200,
      'testnet'
    )
    expect(prismaMock.depositWallet.update).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      data: {
        cachedBalance: 0.25,
        balanceUpdatedAt: expect.any(Date),
      },
    })

    expect(payload.pendingDeposits).toEqual([
      {
        txHash: 'tx-pending',
        amount: 0.5,
        confirmations: 1,
        address: 'utestUnifiedDepositAddress1234567890',
      },
    ])
    expect(payload.newDeposit).toBe(false)
    expect(payload.depositAmount).toBeNull()
    expect(payload.authenticated).toBe(false)
    expect(payload.session).toEqual({
      isAuthenticated: false,
      balance: 1,
    })
  })
})
