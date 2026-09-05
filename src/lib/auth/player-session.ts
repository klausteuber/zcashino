import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const PLAYER_SESSION_COOKIE = 'zcashino_player_session'
const PLAYER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export type PlayerSessionAuthMode = 'compat' | 'strict'

export interface PlayerSessionPayload {
  sessionId: string
  walletAddress: string
  exp: number
  authVersion: number
}

type PlayerSessionAuthResult =
  | { ok: true; session: PlayerSessionPayload; legacyFallback: boolean }
  | { ok: false; response: NextResponse }

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function signPayload(payloadEncoded: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadEncoded).digest('base64url')
}

function getPlayerSessionSecret(): string | null {
  const secret = process.env.PLAYER_SESSION_SECRET
  if (secret && secret.trim().length >= 32) {
    return secret.trim()
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'dev-player-session-secret-change-me-immediately'
  }

  return null
}

function unauthorizedResponse(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function getPlayerSessionAuthMode(): PlayerSessionAuthMode {
  return 'strict'
}

export function createPlayerSessionToken(payload: PlayerSessionPayload): string {
  const secret = getPlayerSessionSecret()
  if (!secret) {
    throw new Error('PLAYER_SESSION_SECRET is required in production (minimum 32 chars)')
  }

  const payloadEncoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = signPayload(payloadEncoded, secret)
  return `${payloadEncoded}.${signature}`
}

export function verifyPlayerSessionToken(token: string): PlayerSessionPayload | null {
  const secret = getPlayerSessionSecret()
  if (!secret) return null

  const [payloadEncoded, signature] = token.split('.')
  if (!payloadEncoded || !signature) return null

  const expected = signPayload(payloadEncoded, secret)
  if (!safeEqual(signature, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8')) as PlayerSessionPayload
    if (!payload || typeof payload !== 'object') return null
    if (typeof payload.sessionId !== 'string' || payload.sessionId.length === 0) return null
    if (typeof payload.walletAddress !== 'string' || payload.walletAddress.length === 0) return null
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null
    const authVersion = typeof (payload as { authVersion?: unknown }).authVersion === 'number'
      ? (payload as { authVersion: number }).authVersion
      : 1
    if (!Number.isInteger(authVersion) || authVersion < 1) return null

    return {
      ...payload,
      authVersion,
    }
  } catch {
    return null
  }
}

export function parsePlayerSessionFromRequest(request: NextRequest): PlayerSessionPayload | null {
  const cookieStore = (request as unknown as { cookies?: { get?: (name: string) => { value: string } | undefined } }).cookies
  const token = cookieStore?.get?.(PLAYER_SESSION_COOKIE)?.value
  if (!token) return null
  return verifyPlayerSessionToken(token)
}

export function setPlayerSessionCookie(
  response: NextResponse,
  sessionId: string,
  walletAddress: string,
  authVersion: number = 1
): void {
  let token: string
  try {
    token = createPlayerSessionToken({
      sessionId,
      walletAddress,
      exp: Date.now() + PLAYER_SESSION_TTL_MS,
      authVersion,
    })
  } catch (error) {
    console.error('[PlayerSession] Unable to set cookie:', error)
    return
  }
  const secure = process.env.NODE_ENV === 'production' || process.env.FORCE_HTTPS === 'true'

  response.cookies.set({
    name: PLAYER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: PLAYER_SESSION_TTL_MS / 1000,
    path: '/',
  })
}

export function clearPlayerSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: PLAYER_SESSION_COOKIE,
    value: '',
    maxAge: 0,
    path: '/',
  })
}

/** Signed cookies are mandatory; public identifiers are never credentials. */
async function loadCurrentSessionAuthState(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      walletAddress: true,
      playerAuthVersion: true,
    },
  })
}

export async function requirePlayerSession(
  request: NextRequest,
  requestedSessionId?: string
): Promise<PlayerSessionAuthResult> {
  const cookieSession = parsePlayerSessionFromRequest(request)

  if (cookieSession) {
    const currentSession = await loadCurrentSessionAuthState(cookieSession.sessionId)
    const isCookieCurrent =
      !!currentSession &&
      currentSession.walletAddress === cookieSession.walletAddress &&
      currentSession.playerAuthVersion === cookieSession.authVersion

    if (!isCookieCurrent) {
      return {
        ok: false,
        response: unauthorizedResponse('Player session expired. Please refresh your session.'),
      }
    }

    if (requestedSessionId && requestedSessionId !== cookieSession.sessionId) {
      return {
        ok: false,
        response: unauthorizedResponse('Session mismatch. Refresh and try again.'),
      }
    }
    return {
      ok: true,
      session: cookieSession,
      legacyFallback: false,
    }
  }

  return {
    ok: false,
    response: unauthorizedResponse('Session required.'),
  }
}
