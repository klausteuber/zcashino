/**
 * Geo-blocking for real-money play.
 *
 * Rejects players connecting from restricted jurisdictions (United States and
 * its territories by default). This is a compliance baseline — it stops casual
 * access from blocked regions but does NOT defeat VPNs/proxies (a determined
 * user can present an exit IP in an allowed country). Treat it as "reasonable
 * measures", not an absolute wall.
 *
 * Enforcement is applied at the real-money entry point (creating a non-demo
 * session). Demo/free play is unaffected. Withdrawals are intentionally NOT
 * blocked so anyone who already deposited can always cash out.
 *
 * Config (all optional, env-overridable):
 *   GEO_BLOCK_ENABLED       - "false" to disable entirely (default: enabled)
 *   GEO_BLOCKED_COUNTRIES   - CSV of ISO country codes (default: US + territories)
 *   GEO_ALLOWLIST_IPS       - CSV of IPs that always bypass the block (e.g. ops)
 */
import type { NextRequest } from 'next/server'
import geoip from 'geoip-lite'
import prisma from '@/lib/db'

// United States + US territories (ISO 3166-1 alpha-2, as returned by geoip-lite):
// US=United States, PR=Puerto Rico, GU=Guam, VI=US Virgin Islands,
// AS=American Samoa, MP=Northern Mariana Islands, UM=US Minor Outlying Islands.
const DEFAULT_BLOCKED_COUNTRIES = ['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM']

function parseCsvEnv(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function getBlockedCountries(): Set<string> {
  const fromEnv = parseCsvEnv('GEO_BLOCKED_COUNTRIES')
  const list = fromEnv.length > 0 ? fromEnv : DEFAULT_BLOCKED_COUNTRIES
  return new Set(list.map((code) => code.toUpperCase()))
}

function getAllowlistedIps(): Set<string> {
  return new Set(parseCsvEnv('GEO_ALLOWLIST_IPS'))
}

function isEnabled(): boolean {
  // Default ON. Set GEO_BLOCK_ENABLED=false to disable without a redeploy.
  return process.env.GEO_BLOCK_ENABLED !== 'false'
}

/**
 * Resolve the client IP for ENFORCEMENT.
 *
 * Prefer X-Real-IP: nginx sets it to the true TCP peer ($remote_addr) and
 * overwrites any client-supplied value, so it cannot be spoofed. X-Forwarded-For
 * is only a fallback because a client can prepend a forged entry to it.
 */
export function clientIpForGeo(request: NextRequest): string {
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  const forwardedFor = request.headers.get('x-forwarded-for')
  const first = forwardedFor?.split(',')[0]?.trim()
  return first || 'unknown'
}

export interface GeoDecision {
  allowed: boolean
  ip: string
  country: string | null
  reason: string
}

/**
 * Decide whether an IP is allowed to start real-money play.
 *
 * Fails OPEN for unknown / private / unresolvable IPs (internal health checks,
 * docker bridge, etc.) so legitimate internal traffic is never blocked. Real
 * external visitors always carry an nginx-set X-Real-IP.
 */
export function evaluateGeo(ip: string): GeoDecision {
  if (!isEnabled()) {
    return { allowed: true, ip, country: null, reason: 'disabled' }
  }
  if (!ip || ip === 'unknown') {
    return { allowed: true, ip, country: null, reason: 'no_ip' }
  }
  if (getAllowlistedIps().has(ip)) {
    return { allowed: true, ip, country: null, reason: 'allowlisted' }
  }

  const lookup = geoip.lookup(ip)
  const country = lookup?.country ?? null

  if (!country) {
    // Private/reserved IPs and addresses missing from the DB resolve to null.
    return { allowed: true, ip, country: null, reason: 'no_country' }
  }
  if (getBlockedCountries().has(country)) {
    return { allowed: false, ip, country, reason: `blocked:${country}` }
  }
  return { allowed: true, ip, country, reason: `allowed:${country}` }
}

export function getGeoDecision(request: NextRequest): GeoDecision {
  return evaluateGeo(clientIpForGeo(request))
}

/**
 * Persist a geo decision to the GeoCheck audit table (best-effort, never throws).
 */
export async function recordGeoCheck(decision: GeoDecision): Promise<void> {
  try {
    await prisma.geoCheck.create({
      data: {
        ipAddress: decision.ip,
        country: decision.country,
        allowed: decision.allowed,
        reason: decision.reason,
      },
    })
  } catch (error) {
    console.error('[Geo] Failed to record GeoCheck:', error)
  }
}

export const GEO_BLOCK_MESSAGE =
  'Real-money play is not available in your region.'
