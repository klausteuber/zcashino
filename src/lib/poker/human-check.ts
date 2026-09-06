import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { NextRequest, NextResponse } from 'next/server'
import { getClientIpAddress } from '@/lib/admin/request'
import { PokerError } from './engine'
import { accessStatus, ENTRY_GRANT_MS, HUMAN_CHECK_MS, humanProvider, localHumanTestEnabled } from './access'
import { integrityDigest, INTEGRITY_RETENTION_MS } from './integrity-crypto'

export const POKER_BROWSER_COOKIE = 'poker_browser'
function hostname(request: NextRequest) {
  try { return new URL(`https://${request.headers.get('host') || ''}`).hostname.toLowerCase() }
  catch { return '' }
}
export function browserMarker(request: NextRequest) {
  const value = request.cookies.get(POKER_BROWSER_COOKIE)?.value
  if (value) {
    const [id, expiry, signature] = value.split('.')
    if (/^[a-f0-9-]{36}$/.test(id || '') && /^\d+$/.test(expiry || '') && Number(expiry) > Date.now() && Number(expiry) <= Date.now() + INTEGRITY_RETENTION_MS && /^[a-f0-9]{64}$/.test(signature || '')) {
      const expected = integrityDigest('browser-cookie', `${id}.${expiry}`)
      if (timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return value
    }
  }
  const valueToSign = `${randomUUID()}.${Date.now() + INTEGRITY_RETENTION_MS}`
  return `${valueToSign}.${integrityDigest('browser-cookie', valueToSign)}`
}
export function setBrowserMarker(response: NextResponse, marker: string, request: NextRequest) {
  response.cookies.set(POKER_BROWSER_COOKIE, marker, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' || request.nextUrl.protocol === 'https:', path: '/', maxAge: Math.max(0, Math.floor((Number(marker.split('.')[1]) - Date.now()) / 1000)) })
}
export async function validateHumanToken(token: string, nonce: string, request: NextRequest, now = Date.now()) {
  const host = hostname(request)
  const provider = humanProvider()
  if (provider.provider === 'local-test' && localHumanTestEnabled() && ['localhost', '127.0.0.1', '[::1]'].includes(host) && token === `local-test:${nonce}`) return
  if (provider.provider !== 'turnstile') throw new PokerError('Human verification is not configured. Taking new seats is paused.', 503)
  const allowedHosts = (process.env.TURNSTILE_HOSTNAMES || '').split(',').map(h => h.trim().toLowerCase())
  if (!allowedHosts.includes(host)) throw new PokerError('Human verification is unavailable on this hostname.', 403)
  let result: { success?: boolean; hostname?: string; action?: string; cdata?: string; challenge_ts?: string }
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token }),
    })
    if (!response.ok) throw new Error('Provider unavailable')
    result = await response.json()
  } catch { throw new PokerError('Human verification is temporarily unavailable. Please try again.', 503) }
  const age = now - Date.parse(result.challenge_ts || '')
  if (result.success !== true || result.hostname !== host || result.action !== 'poker-entry' || result.cdata !== nonce || !Number.isFinite(age) || age < -30_000 || age > ENTRY_GRANT_MS) {
    throw new PokerError('Human check expired or invalid. Please try a new check.', 403)
  }
}
export async function verifyHuman(db: PrismaClient, sessionId: string, token: string, nonce: string, request: NextRequest) {
  const status = await accessStatus(db, sessionId)
  if (!status.setupComplete) throw new PokerError('Finish your poker identity setup first.', 403)
  if (status.nonce !== nonce) throw new PokerError('Human check already used. Refresh and try again.', 409)
  const marker = browserMarker(request)
  if (request.cookies.get(POKER_BROWSER_COOKIE)?.value !== marker) throw new PokerError('Enable the poker browser cookie and reload the human check.', 403)
  const digest = createHash('sha256').update(token).digest('hex')
  if (await db.pokerHumanToken.findUnique({ where: { digest } })) throw new PokerError('Human check already used.', 409)
  await validateHumanToken(token, nonce, request)
  const now = Date.now()
  await db.$transaction(async tx => {
    const session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } })
    const result = await tx.pokerIdentity.updateMany({ where: { sessionId, nonce }, data: {
      nonce: randomUUID(), humanVerifiedAt: new Date(now), humanVerifiedUntil: new Date(now + HUMAN_CHECK_MS), entryVerifiedUntil: new Date(now + ENTRY_GRANT_MS), verifiedHands: session.pokerHandsDealt, recheckRequired: false,
    } })
    if (result.count !== 1) throw new PokerError('Human check already used. Refresh and try again.', 409)
    await tx.pokerHumanToken.create({ data: { digest, expiresAt: new Date(now + ENTRY_GRANT_MS * 2) } })
    const browserKey = integrityDigest('browser-observation', marker.split('.')[0])
    const ip = getClientIpAddress(request), day = new Date(now).toISOString().slice(0, 10)
    const networkKey = ip === 'unknown' ? null : integrityDigest(`network-${day}`, ip)
    const id = integrityDigest('observation', `${status.identityId}:${browserKey}:${networkKey}:${day}`)
    await tx.pokerObservation.upsert({ where: { id }, update: {}, create: { id, identityId: status.identityId, browserKey, networkKey, expiresAt: new Date(now + INTEGRITY_RETENTION_MS) } })
  })
  return accessStatus(db, sessionId)
}
