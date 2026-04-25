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
  getAdminSettingsMock: vi.fn(),
  sendPlayerSessionStartedAlertMock: vi.fn(),
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
  getAdminSettingsMock,
  sendPlayerSessionStartedAlertMock,
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

vi.mock('@/lib/admin/runtime-settings', () => ({
  getAdminSettings: mocks.getAdminSettingsMock,
}))

vi.mock('@/lib/notifications/player-activity', () => ({
  sendPlayerSessionStartedAlert: mocks.sendPlayerSessionStartedAlertMock,
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
    getAdminSettingsMock.mockResolvedValue({
      rg: {
        defaultDepositLimit: null,
        defaultLossLimit: null,
        defaultSessionLimit: null,
      },
    })
    sendPlayerSessionStartedAlertMock.mockResolvedValue(undefined)
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

    prismaMock.session.findUnique.mockResolvedValueOnce({
      id: 'session-2',
      walletAddress: 'real_wallet_2',
      wallet: null,
    })

    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams('sessionId=session-1') },
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as NextRequest)

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toContain('Session expired')
    expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
      where: { id: 'session-2' },
      include: { wallet: true },
    })
  })

  it('GET creates a new real session instead of reusing the current demo cookie session', async () => {
    parsePlayerSessionFromRequestMock.mockReturnValue({
      sessionId: 'demo-session',
      walletAddress: 'demo_wallet',
      exp: Date.now() + 60_000,
    })

    prismaMock.session.findUnique
      .mockResolvedValueOnce({
        id: 'demo-session',
        walletAddress: 'demo_wallet',
        balance: 10,
        totalWagered: 0,
        totalWon: 0,
        depositLimit: null,
        lossLimit: null,
        sessionLimit: null,
        isAuthenticated: true,
        withdrawalAddress: null,
        authTxHash: null,
        excludedUntil: null,
        wallet: null,
      })
      .mockResolvedValueOnce({
        id: 'real-session',
        walletAddress: 'real_wallet_new',
        balance: 0,
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

    prismaMock.session.create.mockResolvedValueOnce({
      id: 'real-session',
      walletAddress: 'real_wallet_new',
      balance: 0,
      totalWagered: 0,
      totalWon: 0,
      depositLimit: null,
      lossLimit: null,
      sessionLimit: null,
      isAuthenticated: false,
      withdrawalAddress: null,
      authTxHash: null,
      excludedUntil: null,
      wallet: null,
    })
    prismaMock.session.update.mockResolvedValueOnce({})

    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams('wallet=real_wallet_new') },
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as NextRequest)

    expect(createDepositWalletForSessionMock).toHaveBeenCalledWith('real-session')
    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletAddress: 'real_wallet_new',
        balance: 0,
        totalDeposited: 0,
        isAuthenticated: false,
      }),
      include: { wallet: true },
    })

    const payload = await response.json()
    expect(payload.id).toBe('real-session')
    expect(payload.walletAddress).toBe('real_wallet_new')
    expect(payload.isDemo).toBe(false)
    expect(payload.depositAddress).toBe('utestUnifiedDepositAddress1234567890')
    expect(sendPlayerSessionStartedAlertMock).toHaveBeenCalledWith({
      sessionId: 'real-session',
      walletAddress: 'real_wallet_new',
      isDemo: false,
      depositAddress: 'utestUnifiedDepositAddress1234567890',
      depositAddressType: 'unified',
    })
  })

  it('GET repairs a real session missing its deposit wallet', async () => {
    parsePlayerSessionFromRequestMock.mockReturnValue({
      sessionId: 'real-session',
      walletAddress: 'real_wallet',
      exp: Date.now() + 60_000,
    })

    prismaMock.session.findUnique
      .mockResolvedValueOnce({
        id: 'real-session',
        walletAddress: 'real_wallet',
        balance: 0,
        totalWagered: 0,
        totalWon: 0,
        depositLimit: null,
        lossLimit: null,
        sessionLimit: null,
        isAuthenticated: false,
        withdrawalAddress: null,
        authTxHash: null,
        excludedUntil: null,
        wallet: null,
      })
      .mockResolvedValueOnce({
        id: 'real-session',
        walletAddress: 'real_wallet',
        balance: 0,
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
      nextUrl: { searchParams: new URLSearchParams() },
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as NextRequest)

    expect(createDepositWalletForSessionMock).toHaveBeenCalledWith('real-session')
    expect(prismaMock.session.create).not.toHaveBeenCalled()

    const payload = await response.json()
    expect(payload.id).toBe('real-session')
    expect(payload.depositAddress).toBe('utestUnifiedDepositAddress1234567890')
    expect(payload.isDemo).toBe(false)
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
