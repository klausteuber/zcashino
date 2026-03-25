import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    transaction: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  requireAdminMock: vi.fn(),
  checkAdminRateLimitMock: vi.fn(),
  createRateLimitResponseMock: vi.fn(),
  logAdminEventMock: vi.fn(),
  guardCypherAdminRequestMock: vi.fn(),
  toCsvResponseMock: vi.fn(),
  isCsvRequestMock: vi.fn(),
  reconcilePendingWithdrawalsMock: vi.fn(),
}))

const {
  prismaMock,
  requireAdminMock,
  checkAdminRateLimitMock,
  createRateLimitResponseMock,
  logAdminEventMock,
  guardCypherAdminRequestMock,
  toCsvResponseMock,
  isCsvRequestMock,
  reconcilePendingWithdrawalsMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: mocks.requireAdminMock,
}))

vi.mock('@/lib/admin/rate-limit', () => ({
  checkAdminRateLimit: mocks.checkAdminRateLimitMock,
  createRateLimitResponse: mocks.createRateLimitResponseMock,
}))

vi.mock('@/lib/admin/audit', () => ({
  logAdminEvent: mocks.logAdminEventMock,
}))

vi.mock('@/lib/admin/host-guard', () => ({
  guardCypherAdminRequest: mocks.guardCypherAdminRequestMock,
}))

vi.mock('@/lib/admin/csv-export', () => ({
  toCsvResponse: mocks.toCsvResponseMock,
  isCsvRequest: mocks.isCsvRequestMock,
}))

vi.mock('@/lib/services/withdrawal-reconciliation', () => ({
  reconcilePendingWithdrawals: mocks.reconcilePendingWithdrawalsMock,
}))

import { GET } from './route'

describe('/api/admin/withdrawals reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    guardCypherAdminRequestMock.mockReturnValue(null)
    checkAdminRateLimitMock.mockReturnValue({ allowed: true })
    createRateLimitResponseMock.mockReturnValue(new Response('rate limited', { status: 429 }))
    requireAdminMock.mockReturnValue({
      ok: true,
      session: { username: 'admin' },
    })
    isCsvRequestMock.mockReturnValue(false)
    reconcilePendingWithdrawalsMock.mockResolvedValue([])
    prismaMock.transaction.findMany.mockResolvedValue([])
    prismaMock.transaction.count.mockResolvedValue(0)
    logAdminEventMock.mockResolvedValue(undefined)
  })

  it('reconciles before loading paginated withdrawal rows', async () => {
    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams() },
    } as unknown as NextRequest)

    expect(response.status).toBe(200)
    expect(reconcilePendingWithdrawalsMock).toHaveBeenCalledTimes(1)
    expect(
      reconcilePendingWithdrawalsMock.mock.invocationCallOrder[0]
    ).toBeLessThan(prismaMock.transaction.findMany.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER)
  })
})
