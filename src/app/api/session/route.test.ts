import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    session: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  validateAddressMock: vi.fn(),
  createDepositWalletForSessionMock: vi.fn(),
  checkPublicRateLimitMock: vi.fn(),
  createRateLimitResponseMock: vi.fn(),
  isKillSwitchActiveMock: vi.fn(),
  requirePlayerSessionMock: vi.fn(),
  parsePlayerSessionFromRequestMock: vi.fn(),
  setPlayerSessionCookieMock: vi.fn(),
  logPlayerCounterEventMock: vi.fn(),
  getProvablyFairModeMock: vi.fn(),
  getPublicFairnessStateMock: vi.fn(),
}))

const {
  prismaMock,
  validateAddressMock,
  createDepositWalletForSessionMock,
  checkPublicRateLimitMock,
  createRateLimitResponseMock,
  isKillSwitchActiveMock,
  requirePlayerSessionMock,
  parsePlayerSessionFromRequestMock,
  setPlayerSessionCookieMock,
  logPlayerCounterEventMock,
  getProvablyFairModeMock,
  getPublicFairnessStateMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/wallet', () => ({
  DEFAULT_NETWORK: 'testnet',
  validateAddress: mocks.validateAddressMock,
  roundZec: (value: number) => value,
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
  parsePlayerSessionFromRequest: mocks.parsePlayerSessionFromRequestMock,
  requirePlayerSession: mocks.requirePlayerSessionMock,
  setPlayerSessionCookie: mocks.setPlayerSessionCookieMock,
}))

vi.mock('@/lib/provably-fair/mode', () => ({
  LEGACY_PER_GAME_MODE: 'legacy_per_game_v1',
  getProvablyFairMode: mocks.getProvablyFairModeMock,
}))

vi.mock('@/lib/provably-fair/session-fairness', () => ({
  getPublicFairnessState: mocks.getPublicFairnessStateMock,
}))

vi.mock('@/lib/telemetry/player-events', () => ({
  PLAYER_COUNTER_ACTIONS: {
    LEGACY_SESSION_FALLBACK: 'player.auth.legacy_fallback',
  },
  logPlayerCounterEvent: mocks.logPlayerCounterEventMock,
}))

import { GET, POST } from './route'

describe('/api/session address selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPublicRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate-limited', { status: 429 }))
    isKillSwitchActiveMock.mockReturnValue(false)
    requirePlayerSessionMock.mockReturnValue({ ok: true })
    parsePlayerSessionFromRequestMock.mockReturnValue(null)
    validateAddressMock.mockReturnValue({ valid: true })
    logPlayerCounterEventMock.mockResolvedValue(undefined)
    getProvablyFairModeMock.mockReturnValue('legacy_per_game_v1')
    getPublicFairnessStateMock.mockResolvedValue(null)
    createDepositWalletForSessionMock.mockResolvedValue({
      id: 'wallet-1',
      unifiedAddr: 'utestUnifiedDepositAddress1234567890',
      transparentAddr: 'tmTransparentAddress1234567890123',
      network: 'testnet',
    })
  })

  it('GET returns unified deposit address when available', async () => {
    parsePlayerSessionFromRequestMock.mockReturnValue({
      sessionId: 'session-1',
      walletAddress: 'real_wallet',
      exp: Date.now() + 60_000,
    })
    prismaMock.session.findUnique.mockResolvedValueOnce({
      id: 'session-1',
      walletAddress: 'real_wallet',
      balance: 1,
      totalWagered: 0,
      totalWon: 0,
      depositLimit: null,
      lossLimit: null,
      sessionLimit: null,
      isAuthenticated: false,
      withdrawalAddress: null,
      authTxHash: null,
      excludedUntil: null,
      wallet: {
        unifiedAddr: 'utestUnifiedDepositAddress1234567890',
        transparentAddr: 'tmTransparentAddress1234567890123',
      },
    })
    prismaMock.session.update.mockResolvedValueOnce({})

    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams('sessionId=session-1') },
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as NextRequest)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.depositAddress).toBe('utestUnifiedDepositAddress1234567890')
    expect(payload.depositAddressType).toBe('unified')
    expect(payload.transparentAddress).toBe('tmTransparentAddress1234567890123')
    expect(setPlayerSessionCookieMock).toHaveBeenCalled()
  })

  it('GET rejects sessionId restore without a valid signed cookie', async () => {
    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams('sessionId=session-1') },
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as NextRequest)

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toContain('Session expired')
    expect(prismaMock.session.findUnique).not.toHaveBeenCalled()
  })

  it('GET rejects sessionId restore when cookie session does not match', async () => {
    parsePlayerSessionFromRequestMock.mockReturnValue({
      sessionId: 'session-2',
      walletAddress: 'real_wallet_2',
      exp: Date.now() + 60_000,
    })

    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams('sessionId=session-1') },
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as NextRequest)

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toContain('Session expired')
    expect(prismaMock.session.findUnique).not.toHaveBeenCalled()
  })

  it('POST set-withdrawal-address returns unified-first deposit fields', async () => {
    prismaMock.session.findUnique.mockResolvedValueOnce({
      id: 'session-1',
      walletAddress: 'real_wallet',
      withdrawalAddress: null,
      isAuthenticated: false,
      wallet: {
        unifiedAddr: 'utestUnifiedDepositAddress1234567890',
        transparentAddr: 'tmTransparentAddress1234567890123',
      },
    })
    prismaMock.session.update.mockResolvedValueOnce({
      id: 'session-1',
      withdrawalAddress: 'u1withdrawalAddress',
      isAuthenticated: false,
      wallet: {
        unifiedAddr: 'utestUnifiedDepositAddress1234567890',
        transparentAddr: 'tmTransparentAddress1234567890123',
      },
    })

    const response = await POST({
      json: vi.fn().mockResolvedValue({
        action: 'set-withdrawal-address',
        sessionId: 'session-1',
        withdrawalAddress: 'u1withdrawalAddress',
      }),
    } as unknown as NextRequest)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.depositAddress).toBe('utestUnifiedDepositAddress1234567890')
    expect(payload.depositAddressType).toBe('unified')
    expect(payload.transparentAddress).toBe('tmTransparentAddress1234567890123')
  })
})
