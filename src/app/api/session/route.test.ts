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
  setPlayerSessionCookieMock: vi.fn(),
  logPlayerCounterEventMock: vi.fn(),
}))

const {
  prismaMock,
  validateAddressMock,
  createDepositWalletForSessionMock,
  checkPublicRateLimitMock,
  createRateLimitResponseMock,
  isKillSwitchActiveMock,
  requirePlayerSessionMock,
  setPlayerSessionCookieMock,
  logPlayerCounterEventMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/wallet', () => ({
  DEFAULT_NETWORK: 'testnet',
  validateAddress: mocks.validateAddressMock,
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
  setPlayerSessionCookie: mocks.setPlayerSessionCookieMock,
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
    validateAddressMock.mockReturnValue({ valid: true })
    logPlayerCounterEventMock.mockResolvedValue(undefined)
    createDepositWalletForSessionMock.mockResolvedValue({
      id: 'wallet-1',
      unifiedAddr: 'utestUnifiedDepositAddress1234567890',
      transparentAddr: 'tmTransparentAddress1234567890123',
      network: 'testnet',
    })
  })

  it('GET returns unified deposit address when available', async () => {
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
