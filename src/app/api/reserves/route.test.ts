import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    depositWallet: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    session: {
      aggregate: vi.fn(),
    },
    sweepLog: {
      aggregate: vi.fn(),
    },
  },
  checkNodeStatusMock: vi.fn(),
  checkPublicRateLimitMock: vi.fn(),
  createRateLimitResponseMock: vi.fn(),
}))

const {
  prismaMock,
  checkNodeStatusMock,
  checkPublicRateLimitMock,
  createRateLimitResponseMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/wallet', () => ({
  DEFAULT_NETWORK: 'mainnet',
  NETWORK_CONFIG: {
    mainnet: {
      explorerUrl: 'https://explorer.example',
    },
  },
}))

vi.mock('@/lib/wallet/rpc', () => ({
  checkNodeStatus: mocks.checkNodeStatusMock,
}))

vi.mock('@/lib/admin/rate-limit', () => ({
  checkPublicRateLimit: mocks.checkPublicRateLimitMock,
  createRateLimitResponse: mocks.createRateLimitResponseMock,
}))

import { GET } from './route'

describe('/api/reserves', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPublicRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate limited', { status: 429 }))
    checkNodeStatusMock.mockResolvedValue({ connected: true, synced: true })
    prismaMock.depositWallet.findMany.mockResolvedValue([
      {
        id: 'wallet-1',
        transparentAddr: 't1reserve',
        cachedBalance: 1.25,
        balanceUpdatedAt: new Date('2026-05-15T12:00:00Z'),
        createdAt: new Date('2026-05-14T12:00:00Z'),
        session: {
          balance: 0.5,
          isAuthenticated: true,
          createdAt: new Date('2026-05-14T12:00:00Z'),
        },
      },
    ])
    prismaMock.session.aggregate.mockResolvedValue({
      _sum: {
        balance: 0.5,
        totalDeposited: 1,
        totalWithdrawn: 0.25,
        totalWagered: 2,
        totalWon: 1.5,
      },
      _count: 1,
    })
    prismaMock.sweepLog.aggregate.mockResolvedValue({
      _sum: { amount: 0.75, fee: 0.0001 },
      _count: 1,
    })
  })

  it('reports cached reserve balances without mutating wallet cache on public GET', async () => {
    const response = await GET({} as NextRequest)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.reserves.totalOnChainBalance).toBe(1.25)
    expect(payload.addresses[0].cachedBalance).toBe(1.25)
    expect(checkPublicRateLimitMock).toHaveBeenCalledWith(expect.anything(), 'reserves-read')
    expect(prismaMock.depositWallet.update).not.toHaveBeenCalled()
  })
})
