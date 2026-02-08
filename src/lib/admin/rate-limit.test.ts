import { NextRequest } from 'next/server'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'

function makeRequest(ip: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/auth', {
    headers: {
      'x-forwarded-for': ip,
      'user-agent': 'vitest',
    },
  })
}

describe('admin rate limit', () => {
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
})
