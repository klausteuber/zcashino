// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), status: vi.fn(), setup: vi.fn(), verify: vi.fn(), marker: vi.fn(), setCookie: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $transaction: async (fn: (tx: unknown) => unknown) => fn({}) } }))
vi.mock('@/lib/poker/access', () => ({ accessStatus: mocks.status, setupIdentity: mocks.setup }))
vi.mock('@/lib/poker/human-check', () => ({ verifyHuman: mocks.verify, browserMarker: mocks.marker, setBrowserMarker: mocks.setCookie }))
// Use the actual HTTP schema and origin checks with only authentication/worker dependencies mocked.
vi.mock('@/lib/auth/player-session', () => ({ requirePlayerSession: mocks.auth }))
vi.mock('@/lib/poker/worker', () => ({ startPokerWorker: vi.fn() }))
vi.mock('@/lib/admin/rate-limit', () => ({ checkPublicRateLimit: () => ({ allowed: true }), createRateLimitResponse: vi.fn() }))
import { GET, POST } from '@/app/api/poker/access/route'
function request(body: unknown, origin = 'https://21z.cash') {
  return new NextRequest('https://21z.cash/api/poker/access', { method: 'POST', headers: { host: '21z.cash', origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ ok: true, session: { sessionId: 'owner' } }); mocks.status.mockResolvedValue({ identityId: 'poker-id' }); mocks.verify.mockResolvedValue({ entryVerified: true }) })
describe('Poker entry HTTP boundaries', () => {
  it('requires authentication before reading or mutating identity', async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) })
    expect((await GET(new NextRequest('https://21z.cash/api/poker/access'))).status).toBe(401)
    expect((await POST(request({ kind: 'setup', nickname: 'Alice', recoverySaved: true }))).status).toBe(401)
    expect(mocks.status).not.toHaveBeenCalled(); expect(mocks.setup).not.toHaveBeenCalled()
  })
  it('rejects cross-origin writes, identity spoofing, arbitrary grants and oversized bodies', async () => {
    expect((await POST(request({ kind: 'setup', nickname: 'Alice', recoverySaved: true }, 'https://evil.example'))).status).toBe(403)
    expect((await POST(request({ kind: 'setup', nickname: 'Alice', recoverySaved: true, sessionId: 'victim' }))).status).toBe(400)
    expect((await POST(request({ kind: 'verify', nonce: crypto.randomUUID(), token: 'token', verified: true }))).status).toBe(400)
    expect((await POST(request({ kind: 'verify', nonce: crypto.randomUUID(), token: 'x'.repeat(5000) }))).status).toBe(413)
    expect(mocks.setup).not.toHaveBeenCalled(); expect(mocks.verify).not.toHaveBeenCalled()
  })
  it('binds setup and verification to the authenticated session and returns no-store', async () => {
    expect((await POST(request({ kind: 'setup', nickname: 'Alice', recoverySaved: true }))).status).toBe(200)
    expect(mocks.setup).toHaveBeenCalledWith(expect.anything(), 'owner', 'Alice', true)
    const nonce = crypto.randomUUID()
    const result = await POST(request({ kind: 'verify', nonce, token: 'provider-token' }))
    expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.verify).toHaveBeenCalledWith(expect.anything(), 'owner', 'provider-token', nonce, expect.anything())
  })
})
