import {
  createSignedAdminToken,
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

