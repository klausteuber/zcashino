// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ host: vi.fn(), auth: vi.fn(), hand: vi.fn(), signal: vi.fn(), signals: vi.fn(), audit: vi.fn(), decrypt: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { pokerHand: { findFirst: mocks.hand }, pokerIntegritySignal: { findFirst: mocks.signal, findMany: mocks.signals } } }))
vi.mock('@/lib/admin/host-guard', () => ({ guardCypherAdminRequest: mocks.host }))
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: mocks.auth }))
vi.mock('@/lib/admin/audit', () => ({ logAdminEvent: mocks.audit }))
vi.mock('@/lib/admin/rate-limit', () => ({ checkAdminRateLimit: () => ({ allowed: true }), createRateLimitResponse: vi.fn() }))
vi.mock('@/lib/poker/integrity-crypto', () => ({ unseal: mocks.decrypt }))
import { guardPokerEvidenceHost } from './integrity-admin-host'
import { GET } from '@/app/api/admin/poker/integrity/route'
const request = (query = '') => new NextRequest(`https://cypherjester.com/api/admin/poker/integrity${query}`, { headers: { host: 'cypherjester.com' } })
beforeEach(() => { vi.clearAllMocks(); mocks.host.mockReturnValue(null); mocks.auth.mockResolvedValue({ ok: true, session: { username: 'reviewer' } }); mocks.signals.mockResolvedValue([]); mocks.decrypt.mockReturnValue({ private: true }) })
describe('Private poker evidence boundaries', () => {
  it('requires positive Cypher mapping even with single-brand mode or a forced brand', () => {
    vi.stubEnv('MULTI_BRAND_ENABLED', 'false'); vi.stubEnv('FORCE_BRAND', 'cypher'); vi.stubEnv('TRUST_PROXY_HOST_HEADER', 'false')
    try {
      for (const host of ['21z.cash', 'www.21z.cash', 'unmapped.example']) {
        expect(guardPokerEvidenceHost(new NextRequest('https://' + host, { headers: { host, 'x-forwarded-host': 'cypherjester.com' } }))?.status).toBe(404)
      }
      expect(guardPokerEvidenceHost(request())).toBeNull()
    } finally { vi.unstubAllEnvs() }
  })
  it('rejects an unmapped/21z admin host before authentication or evidence access', async () => {
    mocks.host.mockReturnValue(Response.json({}, { status: 404 }))
    expect((await GET(request())).status).toBe(404)
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled()
  })
  it('requires admin game-view permission and never decrypts for ordinary players', async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) })
    expect((await GET(request('?handId=live-hand'))).status).toBe(401)
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'view_games')
    expect(mocks.hand).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled()
  })
  it('filters out active or expired hands even for authenticated admins', async () => {
    mocks.hand.mockResolvedValue(null)
    expect((await GET(request('?handId=live-hand'))).status).toBe(404)
    expect(mocks.hand).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ completedAt: { not: null }, expiresAt: { gt: expect.any(Date) } }) }))
    expect(mocks.decrypt).not.toHaveBeenCalled()
  })
  it('audits access and never caches decrypted evidence', async () => {
    mocks.signal.mockResolvedValue({ id: 'signal', kind: 'shared-network', identityId: 'A', otherId: 'B', payload: 'ciphertext', createdAt: new Date() })
    const response = await GET(request('?signalId=signal'))
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actor: 'reviewer', action: 'admin.poker.integrity.read' }))
    expect(mocks.decrypt).toHaveBeenCalledWith('ciphertext', 'signal')
  })
})
