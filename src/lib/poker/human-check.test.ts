// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { browserMarker, POKER_BROWSER_COOKIE, setBrowserMarker, validateHumanToken } from './human-check'
import { humanProvider } from './access'
import { seal, unseal } from './integrity-crypto'
import { createSecurityChallenge, SECURITY_CHECK_MS } from './security-check'
import { solveSecurityChallenge } from '@/test/poker-security-proof'
const nonce = 'cc71211c-8953-4e13-b990-7b9bade21662', identity = 'test-poker-identity'
const request = (host = '21z.cash', cookie?: string) => new NextRequest(`https://${host}/api/poker/access`, { headers: { host, ...(cookie ? { cookie: `${POKER_BROWSER_COOKIE}=${cookie}` } : {}) } })
let proof: string, marker: string
function environment() { vi.stubEnv('POKER_HUMAN_CHECK_MODE', 'self-hosted'); vi.stubEnv('POKER_INTEGRITY_SECRET', 'private-test-integrity-key-with-32-chars') }
beforeAll(async () => {
  environment(); marker = browserMarker(request())
  const challenge = await createSecurityChallenge(identity, nonce, marker, request())
  if (!('challenge' in challenge)) throw new Error('Expected format 1')
  proof = solveSecurityChallenge(challenge)
}, 30_000)
beforeEach(() => { environment(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External requests forbidden') })) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('Self-hosted security verification', () => {
  it('validates genuine proof locally and binds it to identity, nonce, browser and host', async () => {
    await expect(validateHumanToken(proof, nonce, request('21z.cash', marker), identity)).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    for (const [id, n, host, cookie] of [
      ['other-player', nonce, '21z.cash', marker], [identity, crypto.randomUUID(), '21z.cash', marker],
      [identity, nonce, 'cypherjester.com', marker], [identity, nonce, '21z.cash', browserMarker(request())],
    ]) await expect(validateHumanToken(proof, n, request(host, cookie), id)).rejects.toThrow('expired or invalid')
  })
  it('rejects forged, unsolved, expired and altered verification payloads', async () => {
    const parsed = JSON.parse(proof)
    for (const bad of ['{}', 'not-json', JSON.stringify({ ...parsed, solutions: [] }), JSON.stringify({ ...parsed, token: parsed.token + 'x' }), JSON.stringify({ ...parsed, solutions: parsed.solutions.map(() => -1) }), JSON.stringify({ ...parsed, instr_blocked: true }), JSON.stringify({ ...parsed, verified: true })]) {
      await expect(validateHumanToken(bad, nonce, request('21z.cash', marker), identity)).rejects.toThrow('expired or invalid')
    }
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + SECURITY_CHECK_MS + 1000)
    await expect(validateHumanToken(proof, nonce, request('21z.cash', marker), identity)).rejects.toThrow('expired or invalid')
  })
  it('fails closed for unknown providers, missing secrets and unexpected hosts', async () => {
    await expect(validateHumanToken(proof, nonce, request('evil.example', marker), identity)).rejects.toThrow('hostname')
    vi.stubEnv('POKER_HUMAN_CHECK_MODE', 'turnstile')
    expect(humanProvider().provider).toBe('unavailable')
    vi.stubEnv('POKER_HUMAN_CHECK_MODE', 'self-hosted'); vi.stubEnv('POKER_INTEGRITY_SECRET', ''); vi.stubEnv('PLAYER_SESSION_SECRET', '')
    expect(humanProvider().provider).toBe('unavailable')
    await expect(validateHumanToken(proof, nonce, request(), identity)).rejects.toThrow('not configured')
  })
  it('confines the explicit mock to non-production testnet localhost', async () => {
    vi.stubEnv('POKER_HUMAN_CHECK_MODE', 'local-test'); vi.stubEnv('ZCASH_NETWORK', 'testnet'); vi.stubEnv('NODE_ENV', 'development')
    await expect(validateHumanToken(`local-test:${nonce}`, nonce, request('localhost'))).resolves.toBeUndefined()
    await expect(validateHumanToken(`local-test:${nonce}`, nonce, request())).rejects.toThrow('not configured')
    vi.stubEnv('NODE_ENV', 'production')
    await expect(validateHumanToken(`local-test:${nonce}`, nonce, request('localhost'))).rejects.toThrow('not configured')
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('ZCASH_NETWORK', 'mainnet')
    expect(humanProvider().provider).toBe('unavailable')
  })
  it('signs the opaque browser marker and replaces forged values', () => {
    const marker = browserMarker(request())
    expect(browserMarker(request('21z.cash', marker))).toBe(marker)
    expect(browserMarker(request('21z.cash', marker.slice(0, -5) + '00000'))).not.toBe(marker)
    const response = NextResponse.json({})
    setBrowserMarker(response, marker, request())
    expect(response.headers.get('set-cookie')).toContain('HttpOnly'); expect(response.headers.get('set-cookie')).toContain('Secure')
    expect(response.headers.get('set-cookie')).toContain('SameSite=strict')
  })
  it('encrypts private evidence with authenticated record binding', () => {
    const record = { cards: [1, 2], identityId: 'private-id' }, encoded = seal(record, 'hand-1')
    expect(encoded).not.toContain('private-id'); expect(unseal(encoded, 'hand-1')).toEqual(record)
    expect(() => unseal(encoded, 'hand-2')).toThrow()
    expect(() => unseal(encoded.slice(0, -4) + 'AAAA', 'hand-1')).toThrow()
  })
})
