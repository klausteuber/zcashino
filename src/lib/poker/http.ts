import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requirePlayerSession } from '@/lib/auth/player-session'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { getGeoDecision, GEO_BLOCK_MESSAGE } from '@/lib/geo/geo-block'
import { PokerError } from './engine'
import { startPokerWorker } from './worker'

export const pokerName = z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N} _'-]+$/u, 'Use letters, numbers, spaces, apostrophes or dashes.')
export const requestId = z.string().uuid()
export const zats = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
export async function pokerAuth(request: NextRequest, write = false) {
  const limit = checkPublicRateLimit(request, write ? 'poker-action' : 'poker-read')
  if (!limit.allowed) return { ok: false as const, response: createRateLimitResponse(limit) }
  if (write) {
    // JSON plus SameSite=Strict cookies and same-origin browser requests are mandatory.
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')
    let foreignOrigin = false
    if (origin) {
      try { foreignOrigin = new URL(origin).host !== host }
      catch { foreignOrigin = true }
    }
    if (request.headers.get('sec-fetch-site') === 'cross-site' || foreignOrigin) {
      return { ok: false as const, response: NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 }) }
    }
    if (!request.headers.get('content-type')?.startsWith('application/json')) return { ok: false as const, response: NextResponse.json({ error: 'JSON required.' }, { status: 415 }) }
  }
  const auth = await requirePlayerSession(request)
  // Also initialize on the first authenticated request, including development
  // runtimes that do not execute instrumentation registration.
  if (auth.ok) startPokerWorker()
  return auth
}
export function checkPokerGeo(request: NextRequest) {
  if (!getGeoDecision(request).allowed) throw new PokerError(GEO_BLOCK_MESSAGE, 451)
}
export async function pokerBody(request: NextRequest) {
  const body = await request.text()
  if (body.length > 2_048) throw new PokerError('Request too large.', 413)
  try { return JSON.parse(body) } catch { throw new PokerError('Invalid JSON.') }
}
export function pokerResponse(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } }) }
export function pokerFailure(error: unknown) {
  if (error instanceof PokerError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034', 'P2028'].includes(error.code)) {
    return NextResponse.json({ error: 'The table changed. Refresh and try again.' }, { status: 409 })
  }
  console.error('[Poker] Request failed:', error)
  return NextResponse.json({ error: 'Poker is temporarily unavailable. Your last confirmed balance is saved.' }, { status: 503 })
}
