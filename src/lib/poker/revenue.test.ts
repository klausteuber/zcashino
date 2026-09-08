// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ host: vi.fn(), auth: vi.fn(), aggregate: vi.fn(), transaction: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { pokerEvent: { aggregate: mocks.aggregate }, $transaction: mocks.transaction } }))
vi.mock('@/lib/admin/host-guard', () => ({ guardCypherAdminRequest: mocks.host }))
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: mocks.auth }))
vi.mock('@/lib/admin/audit', () => ({ logAdminEvent: mocks.audit }))
vi.mock('@/lib/admin/rate-limit', () => ({ checkAdminRateLimit: () => ({ allowed: true }), createRateLimitResponse: vi.fn() }))
import { GET } from '@/app/api/admin/poker/revenue/route'
const request = (host = 'cypherjester.com') => new NextRequest(`https://${host}/api/admin/poker/revenue`, { headers: { host } })
beforeEach(() => {
  vi.clearAllMocks(); mocks.host.mockReturnValue(null)
  mocks.auth.mockResolvedValue({ ok: true, session: { username: 'admin' } })
  mocks.transaction.mockResolvedValue([{ _sum: { amountZats: 123456789012345678n }, _count: 10 }, { _sum: { amountZats: null }, _count: 0 }])
})
it('requires a positively mapped admin host and authentication before accessing revenue', async () => {
  expect((await GET(request('21z.cash'))).status).toBe(404)
  expect(mocks.auth).not.toHaveBeenCalled()
  mocks.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) })
  expect((await GET(request())).status).toBe(401)
  expect(mocks.aggregate).not.toHaveBeenCalled()
})
it('reports exact zatoshis without number precision loss and excludes practice revenue', async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ allTime: { rakeZats: '123456789012345678', rakedHands: 10 }, last24h: { rakeZats: '0', rakedHands: 0 } })
  expect(mocks.aggregate).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { kind: 'rake', table: { mode: 'real' } } }))
  expect(mocks.aggregate).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { kind: 'rake', table: { mode: 'real' }, createdAt: { gte: expect.any(Date) } } }))
  expect(mocks.audit).toHaveBeenCalled()
})
