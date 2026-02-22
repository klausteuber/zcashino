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
      findMany: vi.fn(),
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
  getProvablyFairModeMock: vi.fn(),
  allocateNonceMock: vi.fn(),
  ensureActiveFairnessStateMock: vi.fn(),
  setClientSeedMock: vi.fn(),
  getPublicFairnessStateMock: vi.fn(),
  getRevealableServerSeedMock: vi.fn(),
  getFairnessSeedByIdMock: vi.fn(),
  ClientSeedLockedError: class ClientSeedLockedError extends Error {},
  SessionFairnessUnavailableError: class SessionFairnessUnavailableError extends Error {},
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
  getProvablyFairModeMock,
  allocateNonceMock,
  ensureActiveFairnessStateMock,
  setClientSeedMock,
  getPublicFairnessStateMock,
  getRevealableServerSeedMock,
  getFairnessSeedByIdMock,
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

vi.mock('@/lib/provably-fair/mode', () => ({
  SESSION_NONCE_MODE: 'session_nonce_v1',
  getProvablyFairMode: mocks.getProvablyFairModeMock,
}))

vi.mock('@/lib/provably-fair/session-fairness', () => ({
  ClientSeedLockedError: mocks.ClientSeedLockedError,
  SessionFairnessUnavailableError: mocks.SessionFairnessUnavailableError,
  allocateNonce: mocks.allocateNonceMock,
  ensureActiveFairnessState: mocks.ensureActiveFairnessStateMock,
  setClientSeed: mocks.setClientSeedMock,
  getPublicFairnessState: mocks.getPublicFairnessStateMock,
  getRevealableServerSeed: mocks.getRevealableServerSeedMock,
  getFairnessSeedById: mocks.getFairnessSeedByIdMock,
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

import { GET, POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

function makeGetRequest(search: string): NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(search) },
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
    getProvablyFairModeMock.mockReturnValue('legacy_per_game_v1')
    ensureActiveFairnessStateMock.mockResolvedValue(undefined)
    allocateNonceMock.mockResolvedValue(undefined)
    setClientSeedMock.mockResolvedValue(undefined)
    getPublicFairnessStateMock.mockResolvedValue(null)
    getRevealableServerSeedMock.mockResolvedValue({ serverSeed: 'server-seed', isRevealed: true })
    getFairnessSeedByIdMock.mockResolvedValue({ seed: 'server-seed' })

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

describe('/api/video-poker GET session auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPublicRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate-limited', { status: 429 }))
    requirePlayerSessionMock.mockReturnValue({
      ok: true,
      legacyFallback: false,
      session: {
        sessionId: 'session-cookie',
        walletAddress: 'real_wallet',
        exp: Date.now() + 60_000,
      },
    })
  })

  it('rejects legacy fallback access for GET history', async () => {
    requirePlayerSessionMock.mockReturnValueOnce({
      ok: true,
      legacyFallback: true,
      session: {
        sessionId: 'session-legacy',
        walletAddress: 'legacy',
        exp: Date.now() + 60_000,
      },
    })

    const response = await GET(makeGetRequest('sessionId=session-legacy'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Player session expired. Please refresh your session.',
    })
    expect(prismaMock.videoPokerGame.findMany).not.toHaveBeenCalled()
  })

  it('uses trusted cookie session for GET history query', async () => {
    prismaMock.videoPokerGame.findMany.mockResolvedValueOnce([])

    const response = await GET(makeGetRequest('sessionId=attacker-session'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ games: [] })
    expect(prismaMock.videoPokerGame.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-cookie' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        variant: true,
        totalBet: true,
        status: true,
        handRank: true,
        payout: true,
        serverSeedHash: true,
        nonce: true,
        createdAt: true,
      },
    })
  })
})
