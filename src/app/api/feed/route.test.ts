import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    blackjackGame: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    videoPokerGame: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
  checkPublicRateLimitMock: vi.fn(),
  createRateLimitResponseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ default: mocks.prismaMock }))
vi.mock('@/lib/admin/rate-limit', () => ({
  checkPublicRateLimit: mocks.checkPublicRateLimitMock,
  createRateLimitResponse: mocks.createRateLimitResponseMock,
}))

import { NextRequest } from 'next/server'

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/feed')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new NextRequest(url, { method: 'GET' })
}

// Each test re-imports the route module to get a fresh in-memory cache
async function importGET() {
  vi.resetModules()
  const mod = await import('./route')
  return mod.GET
}

describe('/api/feed GET', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('FEED_ENABLED', 'true')
    mocks.checkPublicRateLimitMock.mockReturnValue({ allowed: true, remaining: 9, retryAfterSeconds: 60, key: 'feed-read:127.0.0.1' })
  })

  it('returns 404 when FEED_ENABLED is not true', async () => {
    vi.stubEnv('FEED_ENABLED', 'false')
    const GET = await importGET()
    const response = await GET(makeRequest())
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Feed not available')
  })

  it('returns 404 when FEED_ENABLED is unset', async () => {
    vi.stubEnv('FEED_ENABLED', '')
    const GET = await importGET()
    const response = await GET(makeRequest())
    expect(response.status).toBe(404)
  })

  it('returns 429 when rate limited', async () => {
    mocks.checkPublicRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, retryAfterSeconds: 30, key: 'feed-read:127.0.0.1' })
    const fakeRateLimitResponse = new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })
    mocks.createRateLimitResponseMock.mockReturnValue(fakeRateLimitResponse)

    const GET = await importGET()
    const response = await GET(makeRequest())
    expect(response.status).toBe(429)
    expect(mocks.checkPublicRateLimitMock).toHaveBeenCalledWith(expect.anything(), 'feed-read')
  })

  it('returns empty hands with volumeFloor=true when <3 games in last hour', async () => {
    mocks.prismaMock.blackjackGame.count.mockResolvedValue(1)
    mocks.prismaMock.videoPokerGame.count.mockResolvedValue(1)

    const GET = await importGET()
    const response = await GET(makeRequest())
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.hands).toEqual([])
    expect(data.volumeFloor).toBe(true)
    expect(data.message).toMatch(/low-activity/)
  })

  it('returns hands when volume floor is met', async () => {
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000)

    mocks.prismaMock.blackjackGame.count.mockResolvedValue(3)
    mocks.prismaMock.videoPokerGame.count.mockResolvedValue(1)
    mocks.prismaMock.blackjackGame.findMany.mockResolvedValue([
      {
        id: 'game-1',
        outcome: 'dealer_bust',
        payout: 0.2,
        mainBet: 0.1,
        perfectPairsBet: 0,
        completedAt: sixMinAgo,
        commitmentTxHash: 'abc123',
        fairnessMode: 'session_nonce_v1',
      },
    ])
    mocks.prismaMock.videoPokerGame.findMany.mockResolvedValue([])

    const GET = await importGET()
    const response = await GET(makeRequest())
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.volumeFloor).toBe(false)
    expect(data.hands).toHaveLength(1)
    expect(data.hands[0].gameType).toBe('blackjack')
    expect(data.hands[0].outcome).toBe('dealer_bust')
    expect(data.hands[0].commitmentTxHash).toBe('abc123')
  })

  it('buckets bet amounts into ranges', async () => {
    mocks.prismaMock.blackjackGame.count.mockResolvedValue(5)
    mocks.prismaMock.videoPokerGame.count.mockResolvedValue(0)
    mocks.prismaMock.blackjackGame.findMany.mockResolvedValue([
      {
        id: 'g1', outcome: 'win', payout: 0.04, mainBet: 0.02, perfectPairsBet: 0,
        completedAt: new Date(Date.now() - 6 * 60 * 1000),
        commitmentTxHash: null, fairnessMode: 'session_nonce_v1',
      },
      {
        id: 'g2', outcome: 'win', payout: 0.5, mainBet: 0.1, perfectPairsBet: 0,
        completedAt: new Date(Date.now() - 7 * 60 * 1000),
        commitmentTxHash: null, fairnessMode: 'session_nonce_v1',
      },
      {
        id: 'g3', outcome: 'lose', payout: 0, mainBet: 0.5, perfectPairsBet: 0,
        completedAt: new Date(Date.now() - 8 * 60 * 1000),
        commitmentTxHash: null, fairnessMode: 'session_nonce_v1',
      },
      {
        id: 'g4', outcome: 'win', payout: 3, mainBet: 1.5, perfectPairsBet: 0,
        completedAt: new Date(Date.now() - 9 * 60 * 1000),
        commitmentTxHash: null, fairnessMode: 'session_nonce_v1',
      },
    ])
    mocks.prismaMock.videoPokerGame.findMany.mockResolvedValue([])

    const GET = await importGET()
    const response = await GET(makeRequest())
    const data = await response.json()
    expect(data.hands[0].betRange).toBe('< 0.05')
    expect(data.hands[1].betRange).toBe('0.05 – 0.25')
    expect(data.hands[2].betRange).toBe('0.25 – 1')
    expect(data.hands[3].betRange).toBe('1+')
  })

  it('coarsens timestamps to nearest minute', async () => {
    mocks.prismaMock.blackjackGame.count.mockResolvedValue(5)
    mocks.prismaMock.videoPokerGame.count.mockResolvedValue(0)
    mocks.prismaMock.blackjackGame.findMany.mockResolvedValue([
      {
        id: 'g1', outcome: 'win', payout: 0.2, mainBet: 0.1, perfectPairsBet: 0,
        completedAt: new Date('2026-02-20T12:34:56.789Z'),
        commitmentTxHash: null, fairnessMode: 'session_nonce_v1',
      },
    ])
    mocks.prismaMock.videoPokerGame.findMany.mockResolvedValue([])

    const GET = await importGET()
    const response = await GET(makeRequest())
    const data = await response.json()
    expect(data.hands[0].timestamp).toBe('2026-02-20T12:34:00.000Z')
  })

  it('includes video poker hands with variant field', async () => {
    mocks.prismaMock.blackjackGame.count.mockResolvedValue(2)
    mocks.prismaMock.videoPokerGame.count.mockResolvedValue(2)
    mocks.prismaMock.blackjackGame.findMany.mockResolvedValue([])
    mocks.prismaMock.videoPokerGame.findMany.mockResolvedValue([
      {
        id: 'vp-1',
        handRank: 'Full House',
        payout: 0.9,
        totalBet: 0.1,
        completedAt: new Date(Date.now() - 6 * 60 * 1000),
        commitmentTxHash: 'def456',
        fairnessMode: 'session_nonce_v1',
        variant: 'jacks_or_better',
      },
    ])

    const GET = await importGET()
    const response = await GET(makeRequest())
    const data = await response.json()
    expect(data.hands).toHaveLength(1)
    expect(data.hands[0].gameType).toBe('video_poker')
    expect(data.hands[0].outcome).toBe('Full House')
    expect(data.hands[0].variant).toBe('jacks_or_better')
  })

  it('filters by game type when type param is provided', async () => {
    mocks.prismaMock.blackjackGame.count.mockResolvedValue(3)
    mocks.prismaMock.videoPokerGame.count.mockResolvedValue(2)
    mocks.prismaMock.blackjackGame.findMany.mockResolvedValue([])
    mocks.prismaMock.videoPokerGame.findMany.mockResolvedValue([])

    const GET = await importGET()
    await GET(makeRequest({ type: 'blackjack' }))

    expect(mocks.prismaMock.blackjackGame.findMany).toHaveBeenCalled()
    expect(mocks.prismaMock.videoPokerGame.findMany).not.toHaveBeenCalled()
  })

  it('clamps limit param between 1 and 50', async () => {
    mocks.prismaMock.blackjackGame.count.mockResolvedValue(5)
    mocks.prismaMock.videoPokerGame.count.mockResolvedValue(0)
    mocks.prismaMock.blackjackGame.findMany.mockResolvedValue([])
    mocks.prismaMock.videoPokerGame.findMany.mockResolvedValue([])

    const GET = await importGET()
    await GET(makeRequest({ limit: '100' }))
    expect(mocks.prismaMock.blackjackGame.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    )
  })

  it('does not expose session IDs or wallet addresses', async () => {
    mocks.prismaMock.blackjackGame.count.mockResolvedValue(5)
    mocks.prismaMock.videoPokerGame.count.mockResolvedValue(0)
    mocks.prismaMock.blackjackGame.findMany.mockResolvedValue([
      {
        id: 'g1', outcome: 'win', payout: 0.2, mainBet: 0.1, perfectPairsBet: 0,
        completedAt: new Date(Date.now() - 6 * 60 * 1000),
        commitmentTxHash: null, fairnessMode: 'session_nonce_v1',
      },
    ])
    mocks.prismaMock.videoPokerGame.findMany.mockResolvedValue([])

    const GET = await importGET()
    const response = await GET(makeRequest())
    const data = await response.json()
    const hand = data.hands[0]

    // Should have these privacy-preserving fields
    expect(hand).toHaveProperty('id')
    expect(hand).toHaveProperty('gameType')
    expect(hand).toHaveProperty('outcome')
    expect(hand).toHaveProperty('betRange')
    expect(hand).toHaveProperty('payoutRange')
    expect(hand).toHaveProperty('timestamp')
    expect(hand).toHaveProperty('commitmentTxHash')
    expect(hand).toHaveProperty('fairnessMode')

    // Must NOT have these sensitive fields
    expect(hand).not.toHaveProperty('sessionId')
    expect(hand).not.toHaveProperty('walletAddress')
    expect(hand).not.toHaveProperty('depositAddress')
    expect(hand).not.toHaveProperty('mainBet')
    expect(hand).not.toHaveProperty('payout')
    expect(hand).not.toHaveProperty('perfectPairsBet')
  })

  it('returns 500 on database error', async () => {
    mocks.prismaMock.blackjackGame.count.mockRejectedValue(new Error('DB error'))

    const GET = await importGET()
    const response = await GET(makeRequest())
    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Failed to load feed')
  })
})
