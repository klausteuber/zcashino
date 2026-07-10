import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'
import { getClientIpAddress, getUserAgent } from '@/lib/admin/request'

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', { headers })
}

describe('admin request metadata', () => {
  const originalTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS

  afterEach(() => {
    if (originalTrustProxyHeaders === undefined) {
      delete process.env.TRUST_PROXY_HEADERS
    } else {
      process.env.TRUST_PROXY_HEADERS = originalTrustProxyHeaders
    }
  })

  it('ignores forwarding headers unless a trusted proxy is configured', () => {
    delete process.env.TRUST_PROXY_HEADERS

    const request = makeRequest({
      'x-forwarded-for': '198.51.100.4',
      'x-real-ip': '203.0.113.7',
    })

    expect(getClientIpAddress(request)).toBe('unknown')
  })

  it('uses only the proxy-overwritten real IP when proxy trust is enabled', () => {
    process.env.TRUST_PROXY_HEADERS = 'true'

    const request = makeRequest({
      'x-forwarded-for': '192.0.2.55, 198.51.100.12',
      'x-real-ip': '203.0.113.7',
    })

    expect(getClientIpAddress(request)).toBe('203.0.113.7')
  })

  it('rejects malformed or chained real-IP values', () => {
    process.env.TRUST_PROXY_HEADERS = 'true'

    expect(getClientIpAddress(makeRequest({ 'x-real-ip': 'not-an-ip' }))).toBe('unknown')
    expect(getClientIpAddress(makeRequest({ 'x-real-ip': '203.0.113.7, 192.0.2.1' }))).toBe('unknown')
  })

  it('accepts canonical IPv6 and strips an IPv4 port', () => {
    process.env.TRUST_PROXY_HEADERS = 'true'

    expect(getClientIpAddress(makeRequest({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1')
    expect(getClientIpAddress(makeRequest({ 'x-real-ip': '203.0.113.7:443' }))).toBe('203.0.113.7')
  })

  it('normalizes the user agent fallback', () => {
    expect(getUserAgent(makeRequest({ 'user-agent': '  test-agent  ' }))).toBe('test-agent')
    expect(getUserAgent(makeRequest({}))).toBe('unknown')
  })
})
