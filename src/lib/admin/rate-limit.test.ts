import { NextRequest } from 'next/server'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
  resetRateLimitStateForTests,
} from '@/lib/admin/rate-limit'
import { afterEach, beforeEach, vi } from 'vitest'

function makeRequest(ip: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/auth', {
    headers: {
      'x-real-ip': ip,
      'user-agent': 'vitest',
    },
  })
}

describe('admin rate limit', () => {
  const originalTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS

  beforeEach(() => {
    process.env.TRUST_PROXY_HEADERS = 'true'
    resetRateLimitStateForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalTrustProxyHeaders === undefined) {
      delete process.env.TRUST_PROXY_HEADERS
    } else {
      process.env.TRUST_PROXY_HEADERS = originalTrustProxyHeaders
    }
  })

  it('allows requests up to bucket limit and then blocks', () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 200) + 1}`
    const request = makeRequest(ip)

    for (let i = 0; i < 10; i++) {
      const result = checkAdminRateLimit(request, 'auth-login')
      expect(result.allowed).toBe(true)
    }

    const result = checkAdminRateLimit(request, 'auth-login')
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('returns 429 response with retry header for blocked request', () => {
    const response = createRateLimitResponse({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
      key: 'test-key',
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('42')
  })

  it('retains one-hour withdrawal buckets during periodic cleanup', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    const withdrawalRequest = makeRequest('203.0.113.10')
    for (let i = 0; i < 5; i++) {
      expect(checkAdminRateLimit(withdrawalRequest, 'wallet-withdraw').allowed).toBe(true)
    }

    vi.advanceTimersByTime(31 * 60 * 1000)

    // Trigger the every-100-requests cleanup while the withdrawal window is
    // still active. A cleanup horizon based only on admin buckets deletes it.
    for (let i = 0; i < 95; i++) {
      checkAdminRateLimit(makeRequest(`198.51.100.${(i % 250) + 1}`), 'admin-read')
    }

    expect(checkAdminRateLimit(withdrawalRequest, 'wallet-withdraw').allowed).toBe(false)
  })
})
