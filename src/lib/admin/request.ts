import type { NextRequest } from 'next/server'
import { isIP } from 'node:net'

function normalizeIpAddress(value: string | null): string | null {
  if (!value) return null

  const candidate = value.trim()
  if (!candidate || candidate.includes(',')) return null

  if (isIP(candidate)) return candidate.toLowerCase()

  // Some proxies include an IPv4 port. IPv6 addresses must be passed without a
  // port (as Nginx's `$remote_addr` does) so there is no ambiguous parsing.
  const ipv4WithPort = candidate.match(/^(.+):(\d+)$/)
  if (ipv4WithPort?.[1] && isIP(ipv4WithPort[1]) === 4) {
    return ipv4WithPort[1]
  }

  return null
}

export function getClientIpAddress(request: NextRequest): string {
  // Forwarding headers are caller-controlled unless a trusted reverse proxy
  // overwrites them. Production enables this explicitly and Nginx supplies
  // X-Real-IP from `$remote_addr`; X-Forwarded-For is intentionally ignored.
  if (process.env.TRUST_PROXY_HEADERS === 'true') {
    return normalizeIpAddress(request.headers.get('x-real-ip')) || 'unknown'
  }

  return 'unknown'
}

export function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent')?.trim() || 'unknown'
}
