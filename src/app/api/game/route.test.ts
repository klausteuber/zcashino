import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    blackjackGame: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
  createInitialStateMock: vi.fn(),
  startRoundMock: vi.fn(),
  executeActionMock: vi.fn(),
  takeInsuranceMock: vi.fn(),
  getAvailableActionsMock: vi.fn(),
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
  executeActionMock,
  takeInsuranceMock,
  getAvailableActionsMock,
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

vi.mock('@/lib/game/blackjack', () => ({
  createInitialState: mocks.createInitialStateMock,
  startRound: mocks.startRoundMock,
  executeAction: mocks.executeActionMock,
  takeInsurance: mocks.takeInsuranceMock,
  getAvailableActions: mocks.getAvailableActionsMock,
  MIN_BET: 0.01,
  MAX_BET: 10,
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
    WITHDRAW_IDEMPOTENCY_REPLAY: 'player.withdraw.idempotency_replay',
    WITHDRAW_RESERVE_REJECTED: 'player.withdraw.reserve_rejected',
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

function makeGetRequest(search: string): NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(search) },
  } as unknown as NextRequest
}

function buildGameState(phase: 'playerTurn' | 'complete', lastPayout = 0) {
  return {
    phase,
    playerHands: [
      {
        cards: [
          { rank: '10', suit: 'hearts', faceUp: true },
          { rank: 'Q', suit: 'clubs', faceUp: true },
        ],
        bet: 0.5,
        isBlackjack: false,
        isBusted: false,
        isSurrendered: false,
      },
    ],
    dealerHand: {
      cards: [
        { rank: '9', suit: 'spades', faceUp: true },
        { rank: '7', suit: 'diamonds', faceUp: true },
      ],
      isBusted: false,
    },
    currentHandIndex: 0,
    deck: Array.from({ length: 52 }, (_, i) => `card-${i}`),
    balance: 0.5,
    currentBet: 0.5,
    perfectPairsBet: 0,
    insuranceBet: 0,
    dealerPeeked: true,
    serverSeedHash: 'server-hash',
    clientSeed: 'client-seed',
    nonce: 0,
    lastPayout,
    message: phase === 'complete' ? 'Player wins' : 'Your turn',
    perfectPairsResult: null,
  }
}

describe('/api/game POST race/idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    checkPublicRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate-limited', { status: 429 }))
    isKillSwitchActiveMock.mockReturnValue(false)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock))
    reserveFundsMock.mockResolvedValue(true)
    creditFundsMock.mockResolvedValue(undefined)
    logPlayerCounterEventMock.mockResolvedValue(undefined)

    generateClientSeedMock.mockReturnValue('generated-client-seed')
    createInitialStateMock.mockReturnValue({})
    executeActionMock.mockImplementation((state: unknown) => state)
    takeInsuranceMock.mockImplementation((state: unknown) => state)
    getAvailableActionsMock.mockReturnValue(['hit', 'stand', 'double', 'split'])
    checkWagerAllowedMock.mockReturnValue({ allowed: true })
    requirePlayerSessionMock.mockReturnValue({ ok: true, legacyFallback: false })
    getProvablyFairModeMock.mockReturnValue('legacy_per_game_v1')
    ensureActiveFairnessStateMock.mockResolvedValue(undefined)
    allocateNonceMock.mockResolvedValue(undefined)
    setClientSeedMock.mockResolvedValue(undefined)
    getPublicFairnessStateMock.mockResolvedValue(null)
    getRevealableServerSeedMock.mockResolvedValue({ serverSeed: 'server-seed', isRevealed: true })
    getFairnessSeedByIdMock.mockResolvedValue({ seed: 'server-seed' })

    getOrCreateCommitmentMock.mockResolvedValue({
      id: 'commitment-1',
      serverSeed: 'server-seed',
      serverSeedHash: 'server-hash',
      txHash: 'tx-hash',
      blockHeight: 10,
      blockTimestamp: new Date('2026-02-14T00:00:00Z'),
    })
    markCommitmentUsedMock.mockResolvedValue(true)
    releaseClaimedCommitmentMock.mockResolvedValue(undefined)
    checkAndRefillPoolMock.mockResolvedValue(undefined)
    getExplorerUrlMock.mockReturnValue('https://explorer.example/tx-hash')

    prismaMock.blackjackGame.findFirst.mockResolvedValue(null)
    prismaMock.blackjackGame.create.mockResolvedValue({ id: 'game-1' })
    prismaMock.blackjackGame.updateMany.mockResolvedValue({ count: 1 })
  })

  it('rejects start when atomic reserve fails (concurrent spend protection)', async () => {
    startRoundMock.mockReturnValue(buildGameState('playerTurn'))
    reserveFundsMock.mockResolvedValueOnce(false)

    prismaMock.session.findUnique
      .mockResolvedValueOnce({
        id: 'session-1',
        balance: 2,
        walletAddress: 'demo_wallet',
        isAuthenticated: false,
        excludedUntil: null,
        totalWagered: 0,
        totalWon: 0,
        lossLimit: null,
        sessionLimit: null,
        createdAt: new Date('2026-02-16T00:00:00Z'),
      })

    const response = await POST(makeRequest({
      action: 'start',
      sessionId: 'session-1',
      bet: 0.5,
      perfectPairsBet: 0.2,
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Insufficient balance' })

    expect(reserveFundsMock).toHaveBeenCalled()
    expect(prismaMock.blackjackGame.create).not.toHaveBeenCalled()
  })

  it('returns 503 and triggers background refill when commitment creation fails', async () => {
    getOrCreateCommitmentMock.mockResolvedValueOnce(null)

    prismaMock.session.findUnique.mockResolvedValueOnce({
      id: 'session-1',
      balance: 1,
      walletAddress: 'demo_wallet',
      isAuthenticated: false,
      excludedUntil: null,
      totalWagered: 0,
      totalWon: 0,
      lossLimit: null,
      sessionLimit: null,
      createdAt: new Date('2026-02-16T00:00:00Z'),
    })

    const response = await POST(makeRequest({
      action: 'start',
      sessionId: 'session-1',
      bet: 0.5,
      perfectPairsBet: 0,
    }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Unable to create provably fair commitment. Please try again.'
    })
    expect(checkAndRefillPoolMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.blackjackGame.create).not.toHaveBeenCalled()
  })

  it('does not double-credit payout when completion transition is already consumed', async () => {
    startRoundMock.mockReturnValue(buildGameState('complete', 0.4))
    prismaMock.blackjackGame.updateMany.mockResolvedValue({ count: 0 }) // idempotent guard path

    prismaMock.session.findUnique
      .mockResolvedValueOnce({
        id: 'session-1',
        balance: 1,
        walletAddress: 'demo_wallet',
        isAuthenticated: false,
        excludedUntil: null,
        totalWagered: 0,
        totalWon: 0,
        lossLimit: null,
        sessionLimit: null,
        createdAt: new Date('2026-02-16T00:00:00Z'),
      })
      .mockResolvedValueOnce({
        id: 'session-1',
        balance: 0.5,
        totalWagered: 0.5,
        totalWon: 0,
      })
      .mockResolvedValueOnce({
        id: 'session-1',
        balance: 0.5,
        totalWagered: 0.5,
        totalWon: 0,
      })

    const response = await POST(makeRequest({
      action: 'start',
      sessionId: 'session-1',
      bet: 0.5,
      perfectPairsBet: 0,
    }))

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.gameId).toBe('game-1')

    expect(prismaMock.blackjackGame.updateMany).toHaveBeenCalledWith({
      where: { id: 'game-1', status: 'active' },
      data: {
        status: 'completed',
        completedAt: expect.any(Date),
        payout: 0.4,
      },
    })

    // No payout credit should be attempted when completion transition is already consumed.
    expect(creditFundsMock).not.toHaveBeenCalled()
  })

  it('rejects negative perfectPairsBet with INVALID_SIDE_BET code', async () => {
    const response = await POST(makeRequest({
      action: 'start',
      sessionId: 'session-1',
      bet: 0.2,
      perfectPairsBet: -0.01,
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request payload',
      code: 'INVALID_SIDE_BET',
  })
})

describe('/api/game GET session auth', () => {
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
    expect(prismaMock.blackjackGame.findMany).not.toHaveBeenCalled()
  })

  it('uses trusted cookie session for GET history query', async () => {
    prismaMock.blackjackGame.findMany.mockResolvedValueOnce([])

    const response = await GET(makeGetRequest('sessionId=attacker-session'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ games: [] })
    expect(prismaMock.blackjackGame.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-cookie' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        mainBet: true,
        status: true,
        outcome: true,
        payout: true,
        serverSeedHash: true,
        nonce: true,
        createdAt: true,
      },
    })
  })
})

  it('rejects perfectPairsBet above main bet with INVALID_SIDE_BET code', async () => {
    prismaMock.session.findUnique.mockResolvedValueOnce({
      id: 'session-1',
      balance: 2,
      walletAddress: 'demo_wallet',
      isAuthenticated: false,
      excludedUntil: null,
      totalWagered: 0,
      totalWon: 0,
      lossLimit: null,
      sessionLimit: null,
      createdAt: new Date('2026-02-16T00:00:00Z'),
    })

    const response = await POST(makeRequest({
      action: 'start',
      sessionId: 'session-1',
      bet: 0.2,
      perfectPairsBet: 0.3,
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_SIDE_BET',
    })
    expect(reserveFundsMock).not.toHaveBeenCalled()
  })

  it('routes surrender action to game handler', async () => {
    const response = await POST(makeRequest({
      action: 'surrender',
      sessionId: 'session-1',
      gameId: 'game-1',
    }))

    // Surrender is a valid action — passes Zod validation and routes through
    // to handleGameAction, which hits session lookup first (404, not 400).
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Session not found',
    })
  })

  it('returns 403 LOSS_LIMIT_REACHED for start wagers', async () => {
    checkWagerAllowedMock.mockReturnValueOnce({
      allowed: false,
      code: 'LOSS_LIMIT_REACHED',
      message: 'Loss limit reached. New wagers are blocked for this session.',
    })

    prismaMock.session.findUnique.mockResolvedValueOnce({
      id: 'session-1',
      balance: 2,
      walletAddress: 'demo_wallet',
      isAuthenticated: false,
      excludedUntil: null,
      totalWagered: 0.4,
      totalWon: 0,
      lossLimit: 0.5,
      sessionLimit: null,
      createdAt: new Date('2026-02-16T00:00:00Z'),
    })

    const response = await POST(makeRequest({
      action: 'start',
      sessionId: 'session-1',
      bet: 0.2,
      perfectPairsBet: 0,
    }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'LOSS_LIMIT_REACHED',
    })
    expect(getOrCreateCommitmentMock).not.toHaveBeenCalled()
  })

  it('persists and credits exactly once when insurance action completes game', async () => {
    prismaMock.session.findUnique
      .mockResolvedValueOnce({
        id: 'session-1',
        balance: 0.9,
        walletAddress: 'demo_wallet',
        isAuthenticated: false,
        excludedUntil: null,
        totalWagered: 0.1,
        totalWon: 0,
        lossLimit: null,
        sessionLimit: null,
        createdAt: new Date('2026-02-16T00:00:00Z'),
      })
      .mockResolvedValueOnce({
        id: 'session-1',
        balance: 1.0,
        totalWagered: 0.15,
        totalWon: 0.15,
      })

    prismaMock.blackjackGame.findUnique.mockResolvedValueOnce({
      id: 'game-1',
      sessionId: 'session-1',
      status: 'active',
      mainBet: 0.1,
      perfectPairsBet: 0,
      insuranceBet: 0,
      serverSeed: 'server-seed',
      serverSeedHash: 'server-hash',
      clientSeed: 'client-seed',
      nonce: 0,
      fairnessVersion: 'legacy_mulberry_v1',
      actionHistory: '[]',
    })

    startRoundMock.mockReturnValue({
      ...buildGameState('playerTurn'),
      dealerHand: {
        cards: [
          { rank: 'A', suit: 'spades', faceUp: true },
          { rank: 'K', suit: 'diamonds', faceUp: false },
        ],
        isBusted: false,
        isBlackjack: true,
      },
      dealerPeeked: false,
      currentBet: 0.1,
      insuranceBet: 0,
      balance: 0.9,
      lastPayout: 0,
    })

    takeInsuranceMock.mockReturnValue({
      ...buildGameState('complete', 0.15),
      dealerPeeked: true,
      insuranceBet: 0.05,
      settlement: {
        totalStake: 0.15,
        totalPayout: 0.15,
        net: 0,
        mainHandsPayout: 0,
        insurancePayout: 0.15,
        perfectPairsPayout: 0,
      },
    })

    const response = await POST(makeRequest({
      action: 'insurance',
      sessionId: 'session-1',
      gameId: 'game-1',
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.blackjackGame.updateMany).toHaveBeenCalledWith({
      where: { id: 'game-1', status: 'active' },
      data: {
        status: 'completed',
        completedAt: expect.any(Date),
        payout: 0.15,
      },
    })
    expect(creditFundsMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.blackjackGame.update).toHaveBeenCalledWith({
      where: { id: 'game-1' },
      data: expect.objectContaining({
        insuranceBet: 0.05,
        outcome: expect.any(String),
      }),
    })
  })

  it('returns limit codes for double, split, and insurance increments', async () => {
    const sessionRow = {
      id: 'session-1',
      balance: 1,
      walletAddress: 'demo_wallet',
      isAuthenticated: false,
      excludedUntil: null,
      totalWagered: 0.5,
      totalWon: 0,
      lossLimit: 0.6,
      sessionLimit: null,
      createdAt: new Date('2026-02-16T00:00:00Z'),
    }
    const gameRow = {
      id: 'game-1',
      sessionId: 'session-1',
      status: 'active',
      mainBet: 0.1,
      perfectPairsBet: 0,
      insuranceBet: 0,
      serverSeed: 'server-seed',
      serverSeedHash: 'server-hash',
      clientSeed: 'client-seed',
      nonce: 0,
      fairnessVersion: 'legacy_mulberry_v1',
      actionHistory: '[]',
    }

    startRoundMock.mockReturnValue({
      ...buildGameState('playerTurn'),
      dealerPeeked: true,
      dealerHand: {
        cards: [
          { rank: 'A', suit: 'spades', faceUp: true },
          { rank: '9', suit: 'diamonds', faceUp: false },
        ],
        isBusted: false,
        isBlackjack: false,
      },
      currentBet: 0.1,
      insuranceBet: 0,
    })
    executeActionMock.mockReturnValue(buildGameState('playerTurn'))

    prismaMock.session.findUnique.mockResolvedValue(sessionRow)
    prismaMock.blackjackGame.findUnique.mockResolvedValue(gameRow)

    checkWagerAllowedMock.mockReturnValue({
      allowed: false,
      code: 'SESSION_LIMIT_REACHED',
      message: 'Session time limit reached. New wagers are blocked, but withdrawals remain available.',
    })
    const doubleRes = await POST(makeRequest({
      action: 'double',
      sessionId: 'session-1',
      gameId: 'game-1',
    }))
    expect(doubleRes.status).toBe(403)
    await expect(doubleRes.json()).resolves.toMatchObject({ code: 'SESSION_LIMIT_REACHED' })

    checkWagerAllowedMock.mockReturnValue({
      allowed: false,
      code: 'LOSS_LIMIT_REACHED',
      message: 'Loss limit reached. New wagers are blocked for this session.',
    })
    const splitRes = await POST(makeRequest({
      action: 'split',
      sessionId: 'session-1',
      gameId: 'game-1',
    }))
    expect(splitRes.status).toBe(403)
    await expect(splitRes.json()).resolves.toMatchObject({ code: 'LOSS_LIMIT_REACHED' })

    const insuranceRes = await POST(makeRequest({
      action: 'insurance',
      sessionId: 'session-1',
      gameId: 'game-1',
    }))
    expect(insuranceRes.status).toBe(403)
    await expect(insuranceRes.json()).resolves.toMatchObject({ code: 'LOSS_LIMIT_REACHED' })
  })

})
