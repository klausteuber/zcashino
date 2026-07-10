import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    sessionRecoveryCredential: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  checkPublicRateLimitMock: vi.fn(),
  createRateLimitResponseMock: vi.fn(),
  isKillSwitchActiveMock: vi.fn(),
  requirePlayerSessionMock: vi.fn(),
  setPlayerSessionCookieMock: vi.fn(),
  getProvablyFairModeMock: vi.fn(),
  getPublicFairnessStateIfExistsMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
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
  setPlayerSessionCookie: mocks.setPlayerSessionCookieMock,
}))

vi.mock('@/lib/wallet', () => ({
  roundZec: (value: number) => value,
}))

vi.mock('@/lib/provably-fair/mode', () => ({
  LEGACY_PER_GAME_MODE: 'legacy_per_game_v1',
  getProvablyFairMode: mocks.getProvablyFairModeMock,
}))

vi.mock('@/lib/provably-fair/session-fairness', () => ({
  getPublicFairnessStateIfExists: mocks.getPublicFairnessStateIfExistsMock,
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

describe('/api/session/recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkPublicRateLimitMock.mockReturnValue({ allowed: true })
    mocks.createRateLimitResponseMock.mockReturnValue(new Response('rate-limited', { status: 429 }))
    mocks.isKillSwitchActiveMock.mockReturnValue(false)
    mocks.requirePlayerSessionMock.mockResolvedValue({
      ok: true,
      legacyFallback: false,
      session: {
        sessionId: 'session-1',
        walletAddress: 'real_wallet',
        exp: Date.now() + 60_000,
        authVersion: 1,
      },
    })
    mocks.getProvablyFairModeMock.mockReturnValue('legacy_per_game_v1')
    mocks.getPublicFairnessStateIfExistsMock.mockResolvedValue(null)
    mocks.prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prismaMock) => unknown) => fn(mocks.prismaMock))
  })

  it('creates a recovery key for the current non-demo session', async () => {
    mocks.prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      walletAddress: 'real_wallet',
      recoveryCredential: null,
      wallet: {
        unifiedAddr: 'u1deposit',
        transparentAddr: 't1deposit',
      },
    })
    mocks.prismaMock.sessionRecoveryCredential.create.mockResolvedValue({
      sessionId: 'session-1',
      lastUsedAt: null,
    })

    const response = await POST(makeRequest({ action: 'create' }))

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.recoveryKey).toMatch(/^zrec_[a-f0-9]{64}$/)
    expect(payload.recovery).toEqual({
      enabled: true,
      lastUsedAt: null,
    })
    expect(mocks.prismaMock.sessionRecoveryCredential.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        keyHash: expect.any(String),
      },
    })
  })

  it('rejects recovery-key creation for demo sessions', async () => {
    mocks.prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      walletAddress: 'demo_wallet',
      recoveryCredential: null,
      wallet: null,
    })

    const response = await POST(makeRequest({ action: 'create' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Recovery keys are only available for real-money sessions.',
    })
  })

  it('restores a session from a valid recovery key and rotates auth version', async () => {
    mocks.prismaMock.sessionRecoveryCredential.findUnique.mockResolvedValue({
      sessionId: 'session-1',
      session: {
        id: 'session-1',
        walletAddress: 'real_wallet',
        playerAuthVersion: 1,
        balance: 1.25,
        totalWagered: 0.5,
        totalWon: 0.75,
        depositLimit: null,
        lossLimit: null,
        sessionLimit: null,
        isAuthenticated: true,
        withdrawalAddress: 'u1withdraw',
        authTxHash: 'tx-1',
        wallet: {
          unifiedAddr: 'u1deposit',
          transparentAddr: 't1deposit',
        },
        recoveryCredential: {
          lastUsedAt: null,
        },
      },
    })
    mocks.prismaMock.session.update.mockResolvedValue({})
    mocks.prismaMock.sessionRecoveryCredential.update.mockResolvedValue({})
    mocks.prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      walletAddress: 'real_wallet',
      playerAuthVersion: 2,
      balance: 1.25,
      totalWagered: 0.5,
      totalWon: 0.75,
      depositLimit: null,
      lossLimit: null,
      sessionLimit: null,
      isAuthenticated: true,
      withdrawalAddress: 'u1withdraw',
      authTxHash: 'tx-1',
      wallet: {
        unifiedAddr: 'u1deposit',
        transparentAddr: 't1deposit',
      },
      recoveryCredential: {
        lastUsedAt: new Date('2026-03-23T23:10:00Z'),
      },
    })

    const response = await POST(makeRequest({
      action: 'restore',
      recoveryKey: 'zrec_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
    }))

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.id).toBe('session-1')
    expect(payload.recovery).toEqual({
      enabled: true,
      lastUsedAt: new Date('2026-03-23T23:10:00Z').toISOString(),
    })
    expect(mocks.prismaMock.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        playerAuthVersion: { increment: 1 },
        lastActiveAt: expect.any(Date),
      },
    })
    expect(mocks.setPlayerSessionCookieMock).toHaveBeenCalledWith(
      expect.anything(),
      'session-1',
      'real_wallet',
      2
    )
  })

  it('returns a generic error when the recovery key is invalid', async () => {
    mocks.prismaMock.sessionRecoveryCredential.findUnique.mockResolvedValue(null)

    const response = await POST(makeRequest({
      action: 'restore',
      recoveryKey: 'zrec_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdead',
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Recovery key invalid or expired.',
    })
  })
})
