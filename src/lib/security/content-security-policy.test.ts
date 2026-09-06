import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from './content-security-policy'

describe('buildContentSecurityPolicy', () => {
  it('uses a request nonce and blocks executable inline script in production', () => {
    const policy = buildContentSecurityPolicy('test-nonce', false)

    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(policy).not.toContain("'unsafe-eval'")
    expect(policy).toContain("script-src-attr 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
  })

  it('allows the local solver only on poker pages without allowing JavaScript eval or Cloudflare', () => {
    const poker = buildContentSecurityPolicy('nonce', false, true)
    expect(poker).toContain("worker-src 'self' blob:")
    expect(poker).toContain("'wasm-unsafe-eval'")
    expect(poker).not.toContain("'unsafe-eval'")
    expect(poker).not.toContain('cloudflare.com')
    expect(buildContentSecurityPolicy('nonce', false)).not.toContain("'wasm-unsafe-eval'")
  })

  it('allows the React development debugger without weakening production', () => {
    expect(buildContentSecurityPolicy('dev-nonce', true)).toContain("'unsafe-eval'")
  })
})
