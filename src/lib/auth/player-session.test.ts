import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    session: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

import {
  createPlayerSessionToken,
  requirePlayerSession,
  verifyPlayerSessionToken,
} from './player-session'

describe('player session auth versioning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PLAYER_SESSION_AUTH_MODE
  })

  it('accepts legacy signed cookies without authVersion and defaults them to version 1', () => {
    const legacyPayload = Buffer.from(JSON.stringify({
      sessionId: 'session-1',
      walletAddress: 'wallet-1',
      exp: Date.now() + 60_000,
    }), 'utf8').toString('base64url')
    const signature = createHmac(
      'sha256',
      'dev-player-session-secret-change-me-immediately'
    ).update(legacyPayload).digest('base64url')

    const verified = verifyPlayerSessionToken(`${legacyPayload}.${signature}`)

    expect(verified).toMatchObject({
      sessionId: 'session-1',
      walletAddress: 'wallet-1',
      authVersion: 1,
    })
  })

  it('rejects stale cookies when the server auth version has moved on', async () => {
    const token = createPlayerSessionToken({
      sessionId: 'session-1',
      walletAddress: 'wallet-1',
      exp: Date.now() + 60_000,
      authVersion: 1,
    })

    mocks.prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      walletAddress: 'wallet-1',
      playerAuthVersion: 2,
    })

    const response = await requirePlayerSession({
      cookies: {
        get: vi.fn().mockReturnValue({ value: token }),
      },
    } as never, 'session-1')

    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.response.status).toBe(401)
      await expect(response.response.json()).resolves.toEqual({
        error: 'Player session expired. Please refresh your session.',
      })
    }
  })

  it('accepts a current cookie when auth version and wallet address still match', async () => {
    const token = createPlayerSessionToken({
      sessionId: 'session-1',
      walletAddress: 'wallet-1',
      exp: Date.now() + 60_000,
      authVersion: 3,
    })

    mocks.prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      walletAddress: 'wallet-1',
      playerAuthVersion: 3,
    })

    const response = await requirePlayerSession({
      cookies: {
        get: vi.fn().mockReturnValue({ value: token }),
      },
    } as never, 'session-1')

    expect(response).toEqual({
      ok: true,
      legacyFallback: false,
      session: {
        sessionId: 'session-1',
        walletAddress: 'wallet-1',
        exp: expect.any(Number),
        authVersion: 3,
      },
    })
  })
})
