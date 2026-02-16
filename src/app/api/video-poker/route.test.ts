import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    session: {
      findUnique: vi.fn(),
    },
    videoPokerGame: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
  createInitialStateMock: vi.fn(),
  startRoundMock: vi.fn(),
  holdAndDrawMock: vi.fn(),
  sanitizeStateForClientMock: vi.fn(),
  generateClientSeedMock: vi.fn(),
  getOrCreateCommitmentMock: vi.fn(),
  markCommitmentUsedMock: vi.fn(),
  releaseClaimedCommitmentMock: vi.fn(),
  checkAndRefillPoolMock: vi.fn(),
  getExplorerUrlMock: vi.fn(),
  checkPublicRateLimitMock: vi.fn(),
  createRateLimitResponseMock: vi.fn(),
  isKillSwitchActiveMock: vi.fn(),
  reserveFundsMock: vi.fn(),
  creditFundsMock: vi.fn(),
  logPlayerCounterEventMock: vi.fn(),
  checkWagerAllowedMock: vi.fn(),
  requirePlayerSessionMock: vi.fn(),
}))

const {
  prismaMock,
  createInitialStateMock,
  startRoundMock,
  holdAndDrawMock,
  sanitizeStateForClientMock,
  generateClientSeedMock,
  getOrCreateCommitmentMock,
  markCommitmentUsedMock,
  releaseClaimedCommitmentMock,
  checkAndRefillPoolMock,
  getExplorerUrlMock,
  checkPublicRateLimitMock,
  createRateLimitResponseMock,
  isKillSwitchActiveMock,
  reserveFundsMock,
  creditFundsMock,
  logPlayerCounterEventMock,
  checkWagerAllowedMock,
  requirePlayerSessionMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/game/video-poker', () => ({
  createInitialState: mocks.createInitialStateMock,
  startRound: mocks.startRoundMock,
  holdAndDraw: mocks.holdAndDrawMock,
  sanitizeStateForClient: mocks.sanitizeStateForClientMock,
  MIN_BET: 0.01,
  MAX_BET: 10,
  MAX_MULTIPLIER: 5,
}))

vi.mock('@/lib/provably-fair', () => ({
  generateClientSeed: mocks.generateClientSeedMock,
}))

vi.mock('@/lib/provably-fair/commitment-pool', () => ({
  getOrCreateCommitment: mocks.getOrCreateCommitmentMock,
  markCommitmentUsed: mocks.markCommitmentUsedMock,
  releaseClaimedCommitment: mocks.releaseClaimedCommitmentMock,
  checkAndRefillPool: mocks.checkAndRefillPoolMock,
}))

vi.mock('@/lib/provably-fair/blockchain', () => ({
  getExplorerUrl: mocks.getExplorerUrlMock,
}))

vi.mock('@/lib/admin/rate-limit', () => ({
  checkPublicRateLimit: mocks.checkPublicRateLimitMock,
  createRateLimitResponse: mocks.createRateLimitResponseMock,
}))

vi.mock('@/lib/kill-switch', () => ({
  isKillSwitchActive: mocks.isKillSwitchActiveMock,
}))

vi.mock('@/lib/wallet', () => ({
  roundZec: (value: number) => value,
}))

vi.mock('@/lib/services/ledger', () => ({
  reserveFunds: mocks.reserveFundsMock,
  creditFunds: mocks.creditFundsMock,
}))

vi.mock('@/lib/services/responsible-gambling', () => ({
  checkWagerAllowed: mocks.checkWagerAllowedMock,
}))

vi.mock('@/lib/auth/player-session', () => ({
  requirePlayerSession: mocks.requirePlayerSessionMock,
}))

vi.mock('@/lib/telemetry/player-events', () => ({
  PLAYER_COUNTER_ACTIONS: {
    VIDEO_POKER_RESERVE_REJECTED: 'player.video_poker.reserve_rejected',
    VIDEO_POKER_DUPLICATE_COMPLETION: 'player.video_poker.duplicate_completion_blocked',
    LEGACY_SESSION_FALLBACK: 'player.auth.legacy_fallback',
  },
  logPlayerCounterEvent: mocks.logPlayerCounterEventMock,
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

describe('/api/video-poker POST wager limit gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPublicRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate-limited', { status: 429 }))
    isKillSwitchActiveMock.mockReturnValue(false)
    requirePlayerSessionMock.mockReturnValue({ ok: true, legacyFallback: false })
    checkWagerAllowedMock.mockReturnValue({ allowed: true })

    prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      balance: 2,
      walletAddress: 'demo_wallet',
      isAuthenticated: false,
      excludedUntil: null,
      totalWagered: 1,
      totalWon: 0.2,
      lossLimit: 1.2,
      sessionLimit: 60,
      createdAt: new Date('2026-02-16T00:00:00Z'),
    })
  })

  it('blocks start wager with LOSS_LIMIT_REACHED', async () => {
    checkWagerAllowedMock.mockReturnValueOnce({
      allowed: false,
      code: 'LOSS_LIMIT_REACHED',
      message: 'Loss limit reached. New wagers are blocked for this session.',
    })

    const response = await POST(makeRequest({
      action: 'start',
      sessionId: 'session-1',
      variant: 'jacks_or_better',
      baseBet: 0.5,
      betMultiplier: 1,
    }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'LOSS_LIMIT_REACHED',
    })
    expect(getOrCreateCommitmentMock).not.toHaveBeenCalled()
    expect(reserveFundsMock).not.toHaveBeenCalled()
  })

  it('blocks start wager with SESSION_LIMIT_REACHED', async () => {
    checkWagerAllowedMock.mockReturnValueOnce({
      allowed: false,
      code: 'SESSION_LIMIT_REACHED',
      message: 'Session time limit reached. New wagers are blocked, but withdrawals remain available.',
    })

    const response = await POST(makeRequest({
      action: 'start',
      sessionId: 'session-1',
      variant: 'deuces_wild',
      baseBet: 0.25,
      betMultiplier: 2,
    }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'SESSION_LIMIT_REACHED',
    })
    expect(getOrCreateCommitmentMock).not.toHaveBeenCalled()
    expect(reserveFundsMock).not.toHaveBeenCalled()
  })
})
