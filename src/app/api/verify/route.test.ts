import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    blackjackGame: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    videoPokerGame: {
      findUnique: vi.fn(),
    },
  },
  hashServerSeedMock: vi.fn(),
  verifyGameMock: vi.fn(),
  replayGameMock: vi.fn(),
  replayVideoPokerGameMock: vi.fn(),
  verifyCommitmentMock: vi.fn(),
  getExplorerUrlMock: vi.fn(),
  getRevealableServerSeedMock: vi.fn(),
}))

const {
  prismaMock,
  hashServerSeedMock,
  verifyGameMock,
  replayGameMock,
  replayVideoPokerGameMock,
  verifyCommitmentMock,
  getExplorerUrlMock,
  getRevealableServerSeedMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/provably-fair', () => ({
  hashServerSeed: mocks.hashServerSeedMock,
  verifyGame: mocks.verifyGameMock,
  replayGame: mocks.replayGameMock,
  replayVideoPokerGame: mocks.replayVideoPokerGameMock,
}))

vi.mock('@/lib/provably-fair/blockchain', () => ({
  verifyCommitment: mocks.verifyCommitmentMock,
  getExplorerUrl: mocks.getExplorerUrlMock,
}))

vi.mock('@/lib/provably-fair/mode', () => ({
  LEGACY_PER_GAME_MODE: 'legacy_per_game_v1',
  SESSION_NONCE_MODE: 'session_nonce_v1',
}))

vi.mock('@/lib/provably-fair/session-fairness', () => ({
  getRevealableServerSeed: mocks.getRevealableServerSeedMock,
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

describe('/api/verify versioned replay selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    hashServerSeedMock.mockResolvedValue('server-hash')
    verifyCommitmentMock.mockResolvedValue({ valid: true })
    getExplorerUrlMock.mockReturnValue('https://explorer.example/tx')
    verifyGameMock.mockResolvedValue({
      valid: true,
      message: 'ok',
      expectedDeckOrder: [],
      fairnessVersion: 'legacy_mulberry_v1',
    })
    getRevealableServerSeedMock.mockResolvedValue({
      serverSeed: 'server-seed',
      isRevealed: true,
    })
    replayGameMock.mockReturnValue({
      playerCards: [['10hearts', 'Qclubs']],
      dealerCards: ['9spades', '7diamonds'],
      outcome: 'win',
      payout: 0.2,
    })
  })

  it('uses stored fairnessVersion for verify-by-gameId replay', async () => {
    prismaMock.blackjackGame.findUnique.mockResolvedValueOnce({
      id: 'game-1',
      sessionId: 'session-1',
      status: 'completed',
      serverSeed: 'server-seed',
      serverSeedHash: 'server-hash',
      clientSeed: 'client-seed',
      nonce: 7,
      fairnessVersion: 'legacy_mulberry_v1',
      commitmentTxHash: 'tx',
      commitmentBlock: 123,
      commitmentTimestamp: new Date('2026-02-16T00:00:00Z'),
      createdAt: new Date('2026-02-16T00:01:00Z'),
      actionHistory: '[]',
      mainBet: 0.1,
      perfectPairsBet: 0,
      insuranceBet: 0,
      payout: 0.2,
      outcome: 'win',
      completedAt: new Date('2026-02-16T00:02:00Z'),
      verifiedOnChain: false,
    })

    const response = await POST(makeRequest({
      gameId: 'game-1',
      gameType: 'blackjack',
    }))

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(verifyGameMock).toHaveBeenCalledWith(
      'server-seed',
      'server-hash',
      'client-seed',
      7,
      312,
      'legacy_mulberry_v1'
    )
    expect(replayGameMock).toHaveBeenCalledWith(expect.objectContaining({
      fairnessVersion: 'legacy_mulberry_v1',
    }))
    expect(payload.data.fairnessVersion).toBe('legacy_mulberry_v1')
  })
})
