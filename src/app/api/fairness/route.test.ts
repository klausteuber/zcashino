import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requirePlayerSessionMock: vi.fn(),
  getProvablyFairModeMock: vi.fn(),
  getPublicFairnessStateMock: vi.fn(),
  setClientSeedMock: vi.fn(),
  rotateSeedMock: vi.fn(),
  ClientSeedLockedError: class ClientSeedLockedError extends Error {
    constructor() {
      super('Client seed is locked after the first hand in a seed stream.')
    }
  },
  SessionFairnessUnavailableError: class SessionFairnessUnavailableError extends Error {},
}))

const {
  requirePlayerSessionMock,
  getProvablyFairModeMock,
  getPublicFairnessStateMock,
  setClientSeedMock,
  rotateSeedMock,
  ClientSeedLockedError,
  SessionFairnessUnavailableError,
} = mocks

vi.mock('@/lib/auth/player-session', () => ({
  requirePlayerSession: mocks.requirePlayerSessionMock,
}))

vi.mock('@/lib/provably-fair/mode', () => ({
  LEGACY_PER_GAME_MODE: 'legacy_per_game_v1',
  getProvablyFairMode: mocks.getProvablyFairModeMock,
}))

vi.mock('@/lib/provably-fair/session-fairness', () => ({
  ClientSeedLockedError: mocks.ClientSeedLockedError,
  SessionFairnessUnavailableError: mocks.SessionFairnessUnavailableError,
  getPublicFairnessState: mocks.getPublicFairnessStateMock,
  setClientSeed: mocks.setClientSeedMock,
  rotateSeed: mocks.rotateSeedMock,
}))

import { GET, POST } from './route'

function makeGetRequest(sessionId: string | null = null): NextRequest {
  const search = sessionId ? `sessionId=${encodeURIComponent(sessionId)}` : ''
  return {
    nextUrl: {
      searchParams: new URLSearchParams(search),
    },
  } as unknown as NextRequest
}

function makePostRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

describe('/api/fairness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requirePlayerSessionMock.mockReturnValue({
      ok: true,
      session: {
        sessionId: 'session-1',
        walletAddress: 'demo_wallet',
        exp: Date.now() + 1000,
      },
      legacyFallback: false,
    })
  })

  it('GET returns legacy payload when fairness mode is legacy', async () => {
    getProvablyFairModeMock.mockReturnValue('legacy_per_game_v1')

    const response = await GET(makeGetRequest('session-1'))
    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload).toMatchObject({
      mode: 'legacy_per_game_v1',
      serverSeedHash: null,
      nextNonce: null,
      canEditClientSeed: false,
    })
    expect(getPublicFairnessStateMock).not.toHaveBeenCalled()
  })

  it('POST set-client-seed returns 409 when client seed is locked', async () => {
    getProvablyFairModeMock.mockReturnValue('session_nonce_v1')
    setClientSeedMock.mockRejectedValueOnce(new ClientSeedLockedError())

    const response = await POST(makePostRequest({
      action: 'set-client-seed',
      sessionId: 'session-1',
      clientSeed: 'test-seed',
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'CLIENT_SEED_LOCKED',
    })
  })

  it('POST rotate-seed returns reveal bundle and active fairness state', async () => {
    getProvablyFairModeMock.mockReturnValue('session_nonce_v1')
    rotateSeedMock.mockResolvedValueOnce({
      reveal: {
        mode: 'session_nonce_v1',
        serverSeed: 'seed-1',
        serverSeedHash: 'hash-1',
        clientSeed: 'client-1',
        lastNonceUsed: 14,
        txHash: 'tx-1',
        blockHeight: 123,
        blockTimestamp: new Date('2026-02-16T00:00:00Z'),
      },
      active: {
        mode: 'session_nonce_v1',
        serverSeedHash: 'hash-2',
        commitmentTxHash: 'tx-2',
        commitmentBlock: 124,
        commitmentTimestamp: new Date('2026-02-16T00:02:00Z'),
        clientSeed: 'client-2',
        nextNonce: 0,
        canEditClientSeed: true,
        fairnessVersion: 'hmac_sha256_v1',
      },
    })

    const response = await POST(makePostRequest({
      action: 'rotate-seed',
      sessionId: 'session-1',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      action: 'rotate-seed',
      reveal: {
        txHash: 'tx-1',
      },
      fairness: {
        commitmentTxHash: 'tx-2',
        nextNonce: 0,
      },
    })
  })
})
