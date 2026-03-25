import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    session: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    blackjackGame: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    transaction: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    adminAuditLog: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    videoPokerGame: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
  },
  requireAdminMock: vi.fn(),
  checkAdminRateLimitMock: vi.fn(),
  createRateLimitResponseMock: vi.fn(),
  logAdminEventMock: vi.fn(),
  guardCypherAdminRequestMock: vi.fn(),
  getPoolStatusMock: vi.fn(),
  checkNodeStatusMock: vi.fn(),
  getWalletBalanceMock: vi.fn(),
  getKillSwitchStatusMock: vi.fn(),
  getAlertServiceStatusMock: vi.fn(),
  getSweepServiceStatusMock: vi.fn(),
  getManagerStatusMock: vi.fn(),
  getSessionSeedPoolManagerStatusMock: vi.fn(),
  getSessionSeedPoolStatusMock: vi.fn(),
  getProvablyFairModeMock: vi.fn(),
  reconcilePendingWithdrawalsMock: vi.fn(),
}))

const {
  prismaMock,
  requireAdminMock,
  checkAdminRateLimitMock,
  createRateLimitResponseMock,
  logAdminEventMock,
  guardCypherAdminRequestMock,
  getPoolStatusMock,
  checkNodeStatusMock,
  getWalletBalanceMock,
  getKillSwitchStatusMock,
  getAlertServiceStatusMock,
  getSweepServiceStatusMock,
  getManagerStatusMock,
  getSessionSeedPoolManagerStatusMock,
  getSessionSeedPoolStatusMock,
  getProvablyFairModeMock,
  reconcilePendingWithdrawalsMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: mocks.requireAdminMock,
}))

vi.mock('@/lib/admin/query-filters', () => ({
  REAL_SESSIONS_WHERE: {},
  REAL_SESSION_RELATION: {},
}))

vi.mock('@/lib/provably-fair/commitment-pool', () => ({
  getPoolStatus: mocks.getPoolStatusMock,
}))

vi.mock('@/lib/wallet/rpc', () => ({
  checkNodeStatus: mocks.checkNodeStatusMock,
  getWalletBalance: mocks.getWalletBalanceMock,
}))

vi.mock('@/lib/wallet', () => ({
  DEFAULT_NETWORK: 'mainnet',
}))

vi.mock('@/lib/admin/rate-limit', () => ({
  checkAdminRateLimit: mocks.checkAdminRateLimitMock,
  createRateLimitResponse: mocks.createRateLimitResponseMock,
}))

vi.mock('@/lib/admin/audit', () => ({
  logAdminEvent: mocks.logAdminEventMock,
}))

vi.mock('@/lib/kill-switch', () => ({
  getKillSwitchStatus: mocks.getKillSwitchStatusMock,
}))

vi.mock('@/lib/telemetry/player-events', () => ({
  PLAYER_COUNTER_ACTIONS: {
    WITHDRAW_RESERVE_REJECTED: 'withdraw_reserve_rejected',
    BLACKJACK_RESERVE_REJECTED: 'blackjack_reserve_rejected',
    BLACKJACK_DUPLICATE_COMPLETION: 'blackjack_duplicate_completion',
    VIDEO_POKER_RESERVE_REJECTED: 'video_poker_reserve_rejected',
    VIDEO_POKER_DUPLICATE_COMPLETION: 'video_poker_duplicate_completion',
    WITHDRAW_IDEMPOTENCY_REPLAY: 'withdraw_idempotency_replay',
    WITHDRAW_UNPAID_ACTION_RETRY: 'withdraw_unpaid_retry',
    LEGACY_SESSION_FALLBACK: 'legacy_session_fallback',
  },
}))

vi.mock('@/lib/admin/host-guard', () => ({
  guardCypherAdminRequest: mocks.guardCypherAdminRequestMock,
}))

vi.mock('@/lib/services/alert-generator', () => ({
  getAlertServiceStatus: mocks.getAlertServiceStatusMock,
}))

vi.mock('@/lib/services/deposit-sweep', () => ({
  getSweepServiceStatus: mocks.getSweepServiceStatusMock,
}))

vi.mock('@/lib/services/commitment-pool-manager', () => ({
  getManagerStatus: mocks.getManagerStatusMock,
}))

vi.mock('@/lib/services/session-seed-pool-manager', () => ({
  getSessionSeedPoolManagerStatus: mocks.getSessionSeedPoolManagerStatusMock,
  getSessionSeedPoolStatus: mocks.getSessionSeedPoolStatusMock,
}))

vi.mock('@/lib/provably-fair/mode', () => ({
  SESSION_NONCE_MODE: 'session_nonce_v1',
  getProvablyFairMode: mocks.getProvablyFairModeMock,
}))

vi.mock('@/lib/services/withdrawal-reconciliation', () => ({
  reconcilePendingWithdrawals: mocks.reconcilePendingWithdrawalsMock,
}))

import { GET } from './route'

describe('/api/admin/overview reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    guardCypherAdminRequestMock.mockReturnValue(null)
    checkAdminRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate limited', { status: 429 }))
    requireAdminMock.mockReturnValue({
      ok: true,
      session: { username: 'admin' },
    })
    reconcilePendingWithdrawalsMock.mockResolvedValue([])
    getProvablyFairModeMock.mockReturnValue('legacy_per_game_v1')
    getPoolStatusMock.mockResolvedValue({
      available: 10,
      used: 2,
      expired: 0,
      total: 12,
      isHealthy: true,
      blockchainAvailable: true,
    })
    checkNodeStatusMock.mockResolvedValue({ connected: true, synced: true, blockHeight: 222 })
    getWalletBalanceMock.mockResolvedValue({ confirmed: 5, pending: 0, total: 5 })
    getKillSwitchStatusMock.mockReturnValue({ active: false })
    getAlertServiceStatusMock.mockReturnValue({ isRunning: true, lastRun: null, lastAlertCount: 0 })
    getSweepServiceStatusMock.mockReturnValue({ isRunning: true, lastSweep: null, lastStatusCheck: null, pendingSweeps: 0 })
    getManagerStatusMock.mockReturnValue({ isRunning: true, lastCheck: null, lastCleanup: null })
    getSessionSeedPoolManagerStatusMock.mockReturnValue({ isRunning: true, lastCheck: null })
    getSessionSeedPoolStatusMock.mockResolvedValue({ available: 10 })
    logAdminEventMock.mockResolvedValue(undefined)

    prismaMock.session.aggregate.mockResolvedValue({
      _sum: {
        balance: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalWagered: 0,
        totalWon: 0,
      },
    })
    prismaMock.session.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    prismaMock.blackjackGame.count.mockResolvedValue(0)
    prismaMock.transaction.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
    prismaMock.transaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
    prismaMock.transaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    prismaMock.adminAuditLog.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
    prismaMock.blackjackGame.aggregate.mockResolvedValue({
      _sum: { mainBet: 0, perfectPairsBet: 0, insuranceBet: 0, payout: 0 },
      _count: 0,
    })
    prismaMock.videoPokerGame.aggregate.mockResolvedValue({
      _sum: { totalBet: 0, payout: 0 },
      _count: 0,
    })
    prismaMock.videoPokerGame.count.mockResolvedValue(0)
    prismaMock.adminAuditLog.findMany.mockResolvedValue([])
  })

  it('reconciles before computing overview counters', async () => {
    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams() },
    } as unknown as NextRequest)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.transactions.pendingWithdrawalCount).toBe(0)
    expect(payload.pendingWithdrawals).toEqual([])
    expect(reconcilePendingWithdrawalsMock).toHaveBeenCalledTimes(1)
    expect(
      reconcilePendingWithdrawalsMock.mock.invocationCallOrder[0]
    ).toBeLessThan(prismaMock.session.aggregate.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER)
  })
})
