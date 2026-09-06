// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), issue: vi.fn(), verify: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: {} }))
vi.mock('@/lib/auth/player-session', () => ({ requirePlayerSession: mocks.auth }))
vi.mock('@/lib/poker/worker', () => ({ startPokerWorker: vi.fn() }))
vi.mock('@/lib/poker/human-check', () => ({ issueSecurityChallenge: mocks.issue, verifyHuman: mocks.verify }))
vi.mock('@/lib/admin/rate-limit', () => ({ checkPublicRateLimit: mocks.limit, createRateLimitResponse: () => Response.json({}, { status: 429 }) }))
import { POST } from '@/app/api/poker/check/[nonce]/[action]/route'
const nonce = 'cc71211c-8953-4e13-b990-7b9bade21662'
function run(action: string, body = '{}', origin = 'https://21z.cash', type = 'application/json') {
  return POST(new NextRequest(`https://21z.cash/api/poker/check/${nonce}/${action}`, { method: 'POST', headers: { host: '21z.cash', origin, 'content-type': type }, body }), { params: Promise.resolve({ nonce, action }) })
}
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ ok: true, session: { sessionId: 'owner' } }); mocks.limit.mockReturnValue({ allowed: true }); mocks.issue.mockResolvedValue({ token: 'challenge' }); mocks.verify.mockResolvedValue({ entryVerified: true }) })
it('requires signed authentication, same-origin JSON and rate limits before issuing work', async () => {
  mocks.auth.mockResolvedValueOnce({ ok: false, response: Response.json({}, { status: 401 }) })
  expect((await run('challenge')).status).toBe(401)
  expect((await run('challenge', '{}', 'https://evil.example')).status).toBe(403)
  expect((await run('challenge', '{}', 'https://21z.cash', 'text/plain')).status).toBe(415)
  mocks.limit.mockReturnValue({ allowed: false })
  expect((await run('challenge')).status).toBe(429)
  expect(mocks.issue).not.toHaveBeenCalled()
})
it('rejects oversized bodies, challenge configuration spoofing and unknown actions', async () => {
  expect((await run('challenge', JSON.stringify({ difficulty: 0 }))).status).toBe(400)
  expect((await run('redeem', 'x'.repeat(17000))).status).toBe(413)
  expect((await run('bypass')).status).toBe(400)
  expect(mocks.issue).not.toHaveBeenCalled(); expect(mocks.verify).not.toHaveBeenCalled()
})
it('uses authenticated identity and URL nonce and returns a receipt only after persistent verification', async () => {
  const ch = await run('challenge')
  expect(ch.status).toBe(200); expect(ch.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.issue).toHaveBeenCalledWith({}, 'owner', nonce, expect.anything())
  const res = await run('redeem', '{"token":"test","solutions":[]}')
  expect(res.status).toBe(200)
  expect(mocks.verify).toHaveBeenCalledWith({}, 'owner', '{"token":"test","solutions":[]}', nonce, expect.anything())
  expect((await res.json()).token).toBe('security-check-complete')
})
