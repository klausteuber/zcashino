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
}))

const {
  prismaMock,
  createInitialStateMock,
  startRoundMock,
  executeActionMock,
  takeInsuranceMock,
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
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/game/blackjack', () => ({
  createInitialState: mocks.createInitialStateMock,
  startRound: mocks.startRoundMock,
  executeAction: mocks.executeActionMock,
  takeInsurance: mocks.takeInsuranceMock,
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

vi.mock('@/lib/telemetry/player-events', () => ({
  PLAYER_COUNTER_ACTIONS: {
    WITHDRAW_IDEMPOTENCY_REPLAY: 'player.withdraw.idempotency_replay',
    WITHDRAW_RESERVE_REJECTED: 'player.withdraw.reserve_rejected',
    BLACKJACK_RESERVE_REJECTED: 'player.game.reserve_rejected',
    BLACKJACK_DUPLICATE_COMPLETION: 'player.game.duplicate_completion_blocked',
    VIDEO_POKER_RESERVE_REJECTED: 'player.video_poker.reserve_rejected',
    VIDEO_POKER_DUPLICATE_COMPLETION: 'player.video_poker.duplicate_completion_blocked',
  },
  logPlayerCounterEvent: mocks.logPlayerCounterEventMock,
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
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
      })

    const response = await POST(makeRequest({
      action: 'start',
      sessionId: 'session-1',
      bet: 0.5,
      perfectPairsBet: 0.7,
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Insufficient balance' })

    expect(reserveFundsMock).toHaveBeenCalled()
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
})
