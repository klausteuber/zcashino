import { describe, expect, it } from 'vitest'
import {
  normalizeHost,
  readHostFromHeaders,
  resolveBrandFromHeaders,
  resolveBrandIdFromHost,
} from '@/lib/brand/resolve-host'

describe('brand host resolution', () => {
  const multiBrandEnv = {
    MULTI_BRAND_ENABLED: 'true',
    CYPHER_HOSTS: 'cypherjester.com,www.cypherjester.com,localhost',
    BRAND_21Z_HOSTS: '21z.cash,www.21z.cash',
  } as NodeJS.ProcessEnv

  it('normalizes host casing, comma forwarding, and port suffixes', () => {
    expect(normalizeHost('WWW.21Z.CASH:443')).toBe('www.21z.cash')
    expect(normalizeHost('21z.cash:443, proxy.internal')).toBe('21z.cash')
    expect(normalizeHost('')).toBeNull()
    expect(normalizeHost(undefined)).toBeNull()
  })

  it('prefers x-forwarded-host when reading headers', () => {
    const headers = {
      get(name: string) {
        if (name === 'x-forwarded-host') return 'www.21z.cash:443'
        if (name === 'host') return 'cypherjester.com'
        return null
      },
    }

    expect(readHostFromHeaders(headers)).toBe('www.21z.cash')
  })

  it('uses FORCE_BRAND over host mapping', () => {
    const resolved = resolveBrandIdFromHost('cypherjester.com', {
      ...multiBrandEnv,
      FORCE_BRAND: '21z',
    })

    expect(resolved.id).toBe('21z')
    expect(resolved.source).toBe('forced')
  })

  it('maps known 21z hosts when multi-brand is enabled', () => {
    const resolved = resolveBrandIdFromHost('21z.cash', multiBrandEnv)
    expect(resolved.id).toBe('21z')
    expect(resolved.source).toBe('mapped')
  })

  it('falls back to cypher for unknown hosts', () => {
    const resolved = resolveBrandIdFromHost('unknown.example', multiBrandEnv)
    expect(resolved.id).toBe('cypher')
    expect(resolved.source).toBe('fallback')
  })

  it('returns single-brand cypher when multi-brand is disabled', () => {
    const resolved = resolveBrandIdFromHost('21z.cash', {
      MULTI_BRAND_ENABLED: 'false',
      BRAND_21Z_HOSTS: '21z.cash',
    } as NodeJS.ProcessEnv)

    expect(resolved.id).toBe('cypher')
    expect(resolved.source).toBe('single-brand')
  })

  it('resolves full brand config from forwarded headers', () => {
    const headers = {
      get(name: string) {
        if (name === 'x-forwarded-host') return '21z.cash'
        return null
      },
    }

    const resolved = resolveBrandFromHeaders(headers, multiBrandEnv)
    expect(resolved.id).toBe('21z')
    expect(resolved.config.name).toBe('21z')
  })
})
