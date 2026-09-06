// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { browserMarker, POKER_BROWSER_COOKIE, setBrowserMarker, validateHumanToken } from './human-check'
import { humanProvider } from './access'
import { seal, unseal } from './integrity-crypto'
const nonce = 'cc71211c-8953-4e13-b990-7b9bade21662'
const now = 1800000000000
const request = (host = '21z.cash', cookie?: string) => new NextRequest(`https://${host}/api/poker/access`, { headers: { host, ...(cookie ? { cookie: `${POKER_BROWSER_COOKIE}=${cookie}` } : {}) } })
beforeEach(() => {
  vi.stubEnv('POKER_HUMAN_CHECK_MODE', 'turnstile'); vi.stubEnv('TURNSTILE_SITE_KEY', 'real-site-key'); vi.stubEnv('TURNSTILE_SECRET_KEY', 'real-secret-key')
  vi.stubEnv('TURNSTILE_HOSTNAMES', '21z.cash,cypherjester.com'); vi.stubEnv('POKER_INTEGRITY_SECRET', 'private-test-integrity-key-with-32-chars')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, hostname: '21z.cash', action: 'poker-entry', cdata: nonce, challenge_ts: new Date(now).toISOString() })))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('Server-side human verification', () => {
  it('accepts only matching action, hostname, nonce and a fresh provider timestamp', async () => {
    await expect(validateHumanToken('a-token', nonce, request(), now)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('https://challenges.cloudflare.com/turnstile/v0/siteverify', expect.objectContaining({ body: JSON.stringify({ secret: 'real-secret-key', response: 'a-token' }) }))
    for (const change of [{ action: 'login' }, { hostname: 'cypherjester.com' }, { cdata: 'another-player' }, { challenge_ts: new Date(now - 301000).toISOString() }, { challenge_ts: 'invalid' }, { success: false }]) {
      vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: true, hostname: '21z.cash', action: 'poker-entry', cdata: nonce, challenge_ts: new Date(now).toISOString(), ...change }))
      await expect(validateHumanToken('token', nonce, request(), now)).rejects.toThrow('expired or invalid')
    }
  })
  it('fails closed on missing keys, dummy production keys, unexpected hosts and provider outages', async () => {
    await expect(validateHumanToken('token', nonce, request('evil.example'), now)).rejects.toThrow('hostname')
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Timeout'))
    await expect(validateHumanToken('token', nonce, request(), now)).rejects.toThrow('temporarily unavailable')
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    expect(humanProvider().provider).toBe('unavailable')
    await expect(validateHumanToken('token', nonce, request(), now)).rejects.toThrow('not configured')
    vi.stubEnv('TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA')
    expect(humanProvider().provider).toBe('unavailable')
  })
  it('confines the explicit mock to non-production testnet localhost', async () => {
    vi.stubEnv('POKER_HUMAN_CHECK_MODE', 'local-test'); vi.stubEnv('ZCASH_NETWORK', 'testnet'); vi.stubEnv('NODE_ENV', 'development')
    await expect(validateHumanToken(`local-test:${nonce}`, nonce, request('localhost'), now)).resolves.toBeUndefined()
    await expect(validateHumanToken(`local-test:${nonce}`, nonce, request(), now)).rejects.toThrow('not configured')
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    await expect(validateHumanToken(`local-test:${nonce}`, nonce, request('localhost'), now)).rejects.toThrow('not configured')
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
