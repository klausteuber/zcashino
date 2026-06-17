import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Avoid instantiating a real Prisma client during import.
vi.mock('@/lib/db', () => ({ default: { geoCheck: { create: vi.fn() } } }))

import { evaluateGeo, clientIpForGeo, getGeoDecision } from './geo-block'

// Stable, well-known IPs (country mappings here essentially never change).
const US_IP = '8.8.8.8' // Google DNS, United States
const DE_IP = '78.46.1.1' // Hetzner, Germany
const PRIVATE_IP = '10.0.0.1'

const GEO_ENV_KEYS = ['GEO_BLOCK_ENABLED', 'GEO_BLOCKED_COUNTRIES', 'GEO_ALLOWLIST_IPS']

describe('evaluateGeo', () => {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of GEO_ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })
  afterEach(() => {
    for (const k of GEO_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('blocks a US IP by default', () => {
    const d = evaluateGeo(US_IP)
    expect(d.allowed).toBe(false)
    expect(d.country).toBe('US')
    expect(d.reason).toBe('blocked:US')
  })

  it('allows a non-blocked country (DE)', () => {
    const d = evaluateGeo(DE_IP)
    expect(d.allowed).toBe(true)
    expect(d.country).toBe('DE')
  })

  it('honors a custom blocked-country list', () => {
    process.env.GEO_BLOCKED_COUNTRIES = 'DE,FR'
    expect(evaluateGeo(DE_IP).allowed).toBe(false)
    expect(evaluateGeo(US_IP).allowed).toBe(true) // US no longer in list
  })

  it('allows an allowlisted IP even if it is in a blocked country', () => {
    process.env.GEO_ALLOWLIST_IPS = `1.2.3.4, ${US_IP}`
    const d = evaluateGeo(US_IP)
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('allowlisted')
  })

  it('fails open when disabled', () => {
    process.env.GEO_BLOCK_ENABLED = 'false'
    expect(evaluateGeo(US_IP).allowed).toBe(true)
  })

  it('fails open for unknown / empty IPs (internal traffic)', () => {
    expect(evaluateGeo('unknown').allowed).toBe(true)
    expect(evaluateGeo('').allowed).toBe(true)
  })

  it('fails open for private/unresolvable IPs', () => {
    const d = evaluateGeo(PRIVATE_IP)
    expect(d.allowed).toBe(true)
    expect(d.country).toBeNull()
  })
})

describe('clientIpForGeo', () => {
  function req(headers: Record<string, string>) {
    return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as unknown as Parameters<typeof clientIpForGeo>[0]
  }

  it('prefers the un-spoofable X-Real-IP over X-Forwarded-For', () => {
    const r = req({ 'x-real-ip': DE_IP, 'x-forwarded-for': `${US_IP}, ${DE_IP}` })
    expect(clientIpForGeo(r)).toBe(DE_IP)
  })

  it('falls back to the first X-Forwarded-For entry when X-Real-IP is absent', () => {
    const r = req({ 'x-forwarded-for': `${DE_IP}, 9.9.9.9` })
    expect(clientIpForGeo(r)).toBe(DE_IP)
  })

  it('returns "unknown" when no IP headers are present', () => {
    expect(clientIpForGeo(req({}))).toBe('unknown')
  })

  it('getGeoDecision blocks a request whose real IP is US', () => {
    const r = req({ 'x-real-ip': US_IP })
    expect(getGeoDecision(r).allowed).toBe(false)
  })
})
