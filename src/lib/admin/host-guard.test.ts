import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { guardCypherAdminRequest, isCypherAdminRequest } from '@/lib/admin/host-guard'

const originalEnv = {
  MULTI_BRAND_ENABLED: process.env.MULTI_BRAND_ENABLED,
  CYPHER_HOSTS: process.env.CYPHER_HOSTS,
  BRAND_21Z_HOSTS: process.env.BRAND_21Z_HOSTS,
  FORCE_BRAND: process.env.FORCE_BRAND,
}

beforeEach(() => {
  process.env.MULTI_BRAND_ENABLED = 'true'
  process.env.CYPHER_HOSTS = 'cypherjester.com,localhost'
  process.env.BRAND_21Z_HOSTS = '21z.cash,www.21z.cash'
  delete process.env.FORCE_BRAND
})

describe('admin host guard', () => {
  it('allows cypher admin requests', () => {
    const request = new NextRequest('https://cypherjester.com/api/admin/overview', {
      headers: { host: 'cypherjester.com' },
    })

    expect(isCypherAdminRequest(request)).toBe(true)
    expect(guardCypherAdminRequest(request)).toBeNull()
  })

  it('returns 404 for 21z admin requests', async () => {
    const request = new NextRequest('https://21z.cash/api/admin/overview', {
      headers: { host: '21z.cash' },
    })

    expect(isCypherAdminRequest(request)).toBe(false)
    const guarded = guardCypherAdminRequest(request)
    expect(guarded?.status).toBe(404)
    await expect(guarded?.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('honors FORCE_BRAND override for emergencies', () => {
    process.env.FORCE_BRAND = 'cypher'
    const request = new NextRequest('https://21z.cash/api/admin/overview', {
      headers: { host: '21z.cash' },
    })

    expect(isCypherAdminRequest(request)).toBe(true)
  })
})

afterEach(() => {
  process.env.MULTI_BRAND_ENABLED = originalEnv.MULTI_BRAND_ENABLED
  process.env.CYPHER_HOSTS = originalEnv.CYPHER_HOSTS
  process.env.BRAND_21Z_HOSTS = originalEnv.BRAND_21Z_HOSTS
  process.env.FORCE_BRAND = originalEnv.FORCE_BRAND
})
