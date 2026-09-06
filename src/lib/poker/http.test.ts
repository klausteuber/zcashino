// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), geo: vi.fn(), command: vi.fn(), snapshot: vi.fn(), tick: vi.fn(), create: vi.fn(), lobby: vi.fn() }))
vi.mock('@/lib/auth/player-session', () => ({ requirePlayerSession: mocks.auth }))
vi.mock('@/lib/admin/rate-limit', () => ({ checkPublicRateLimit: () => ({ allowed: true }), createRateLimitResponse: vi.fn() }))
vi.mock('@/lib/geo/geo-block', () => ({ getGeoDecision: mocks.geo, GEO_BLOCK_MESSAGE: 'Region restricted' }))
vi.mock('@/lib/poker/service', () => ({ poker: mocks, realMoneyEnabled: () => true }))
vi.mock('@/lib/poker/worker', () => ({ startPokerWorker: vi.fn() }))
import { POST as CREATE } from '@/app/api/poker/tables/route'
import { POST, GET } from '@/app/api/poker/tables/[tableId]/route'
const ctx = { params: Promise.resolve({ tableId: 'test-table' }) }
function req(command: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/poker/tables/test-table', { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: JSON.stringify({ command, version: 1, requestId: 'fcf2d238-b97e-44aa-8c79-c09cbcc4c623' }) })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ ok: true, session: { sessionId: 'signed-player' } })
  mocks.geo.mockReturnValue({ allowed: true })
  mocks.snapshot.mockResolvedValue({ mode: 'real', version: 1 })
})
describe('Poker HTTP boundaries', () => {
  it('requires signed authentication before reading a table or ticking it', async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response('{}', { status: 401 }) })
    expect((await GET(new NextRequest('http://localhost/api/poker/tables/test-table'), ctx)).status).toBe(401)
    expect(mocks.tick).not.toHaveBeenCalled()
  })
  it('rejects cross-site actions and unknown identity fields', async () => {
    expect((await POST(req({ kind: 'leave' }, { origin: 'https://other.example' }), ctx)).status).toBe(403)
    expect((await POST(req({ kind: 'leave' }, { origin: 'invalid-origin' }), ctx)).status).toBe(403)
    expect((await POST(req({ kind: 'leave', sessionId: 'victim' }), ctx)).status).toBe(400)
    expect(mocks.command).not.toHaveBeenCalled()
  })
  it('blocks entering a real table from a restricted region while allowing exit', async () => {
    mocks.geo.mockReturnValue({ allowed: false })
    expect((await POST(req({ kind: 'join', seat: 0, name: 'Alice', buyIn: 1000000 }), ctx)).status).toBe(451)
    expect((await POST(req({ kind: 'ready', ready: true }), ctx)).status).toBe(451)
    expect((await POST(req({ kind: 'leave' }), ctx)).status).toBe(200)
    expect(mocks.command).toHaveBeenCalledWith('test-table', 'signed-player', { kind: 'leave' }, 1, expect.any(String))
  })
  it('accepts an all-in larger than a starting buy-in after a player wins chips', async () => {
    expect((await POST(req({ kind: 'act', action: { type: 'raise', to: 500000000 } }), ctx)).status).toBe(200)
  })
  it('accepts variant selection and bank/bring-in commands, but rejects invented variants and bank durations', async () => {
    for (const variant of ['holdem', 'omaha', 'stud', 'invented']) {
      const request = new NextRequest('http://localhost/api/poker/tables', { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Game table', playerName: 'Alice', mode: 'real', variant, bigBlind: 10000, buyIn: 1000000, requestId: 'fcf2d238-b97e-44aa-8c79-c09cbcc4c623' }) })
      expect((await CREATE(request)).status).toBe(variant === 'invented' ? 400 : 200)
    }
    expect((await POST(req({ kind: 'time-bank' }), ctx)).status).toBe(200)
    expect((await POST(req({ kind: 'act', action: { type: 'bring-in' } }), ctx)).status).toBe(200)
    expect((await POST(req({ kind: 'time-bank', milliseconds: 999999 }), ctx)).status).toBe(400)
  })
  it('marks snapshots private and non-cacheable', async () => {
    const response = await GET(new NextRequest('http://localhost/api/poker/tables/test-table'), ctx)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
