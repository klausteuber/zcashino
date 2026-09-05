import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const db = vi.hoisted(() => ({ adminUser: { findUnique: vi.fn(), update: vi.fn() } }))
vi.mock('@/lib/db', () => ({ default: db }))

import {
  createSignedAdminToken,
  createAdminSessionToken,
  requireAdmin,
  verifyAdminCredentials,
  setAdminSessionCookie,
  verifySignedAdminToken,
  type AdminSessionPayload,
} from '@/lib/admin/auth'

describe('admin auth token signing', () => {
  const secret = 'unit-test-admin-secret'

  it('creates and verifies a valid token', () => {
    const payload: AdminSessionPayload = {
      role: 'admin',
      username: 'admin',
      exp: Date.now() + 60_000,
    }

    const token = createSignedAdminToken(payload, secret)
    const verified = verifySignedAdminToken(token, secret)

    expect(verified).not.toBeNull()
    expect(verified?.username).toBe('admin')
    expect(verified?.role).toBe('admin')
  })

  it('rejects tampered tokens', () => {
    const payload: AdminSessionPayload = {
      role: 'admin',
      username: 'admin',
      exp: Date.now() + 60_000,
    }

    const token = createSignedAdminToken(payload, secret)
    const tamperedToken =
      token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')

    const verified = verifySignedAdminToken(tamperedToken, secret)
    expect(verified).toBeNull()
  })

  it('rejects expired tokens', () => {
    const payload: AdminSessionPayload = {
      role: 'admin',
      username: 'admin',
      exp: Date.now() - 1,
    }

    const token = createSignedAdminToken(payload, secret)
    const verified = verifySignedAdminToken(token, secret)
    expect(verified).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifySignedAdminToken('not-a-valid-token', secret)).toBeNull()
  })
})

describe('admin session cookies', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('marks admin session cookies secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('FORCE_HTTPS', 'false')
    const response = NextResponse.json({ ok: true })

    setAdminSessionCookie(response, 'signed-token')

    expect(response.headers.get('set-cookie')).toContain('Secure')
  })

  it('keeps admin session cookies usable over local HTTP by default', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('FORCE_HTTPS', 'false')
    const response = NextResponse.json({ ok: true })

    setAdminSessionCookie(response, 'signed-token')

    expect(response.headers.get('set-cookie')).not.toContain('Secure')
  })
})


describe('revocable admin authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('ADMIN_SESSION_SECRET', 'a'.repeat(40))
    vi.stubEnv('ADMIN_USERNAME', 'admin')
    vi.stubEnv('ADMIN_PASSWORD', 'old-environment-password')
  })
  afterEach(() => vi.unstubAllEnvs())
  const request = (version = 1) => ({ cookies: { get: () => ({ value: createAdminSessionToken('admin', 'super_admin', 'user-1', version) }) } }) as never
  it.each([
    { isActive: false, authVersion: 1, role: 'super_admin' },
    { isActive: true, authVersion: 2, role: 'super_admin' },
    { isActive: true, authVersion: 1, role: 'analyst' },
  ])('rejects revoked or demoted privileged tokens: %j', async changed => {
    db.adminUser.findUnique.mockResolvedValue({ id: 'user-1', username: 'admin', ...changed })
    expect((await requireAdmin(request(), 'manage_admin_users')).ok).toBe(false)
  })
  it('accepts current account permissions', async () => {
    db.adminUser.findUnique.mockResolvedValue({ id: 'user-1', username: 'admin', isActive: true, authVersion: 1, role: 'super_admin' })
    expect((await requireAdmin(request(), 'manage_admin_users')).ok).toBe(true)
  })
  it('fails closed during database outages even with valid environment credentials', async () => {
    db.adminUser.findUnique.mockRejectedValue(new Error('database unavailable'))
    expect((await requireAdmin(request())).ok).toBe(false)
    expect((await verifyAdminCredentials('admin', 'old-environment-password')).ok).toBe(false)
  })
  it('does not use environment credentials when the user is missing', async () => {
    db.adminUser.findUnique.mockResolvedValue(null)
    expect((await verifyAdminCredentials('admin', 'old-environment-password')).ok).toBe(false)
  })
})
