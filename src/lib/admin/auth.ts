import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const ADMIN_SESSION_COOKIE = 'zcashino_admin_session'
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

interface AdminConfig {
  username: string
  password: string
  sessionSecret: string
}

export interface AdminSessionPayload {
  role: 'admin'
  username: string
  exp: number
}

export interface AdminConfigStatus {
  configured: boolean
  missing: string[]
  config?: AdminConfig
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

function signSessionPayload(payloadEncoded: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadEncoded).digest('base64url')
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value.trim() : undefined
}

export function getAdminConfigStatus(): AdminConfigStatus {
  const username = getEnv('ADMIN_USERNAME') || 'admin'
  const password = getEnv('ADMIN_PASSWORD')
  const sessionSecret = getEnv('ADMIN_SESSION_SECRET')
  const isProduction = process.env.NODE_ENV === 'production'

  const missing: string[] = []
  if (!password) missing.push('ADMIN_PASSWORD')
  if (!sessionSecret) missing.push('ADMIN_SESSION_SECRET')
  if (isProduction && password && password.length < 12) {
    missing.push('ADMIN_PASSWORD (minimum 12 chars in production)')
  }
  if (isProduction && sessionSecret && sessionSecret.length < 32) {
    missing.push('ADMIN_SESSION_SECRET (minimum 32 chars in production)')
  }

  if (missing.length > 0) {
    return {
      configured: false,
      missing,
    }
  }

  return {
    configured: true,
    missing: [],
    config: {
      username,
      password: password!,
      sessionSecret: sessionSecret!,
    },
  }
}

export function verifyAdminCredentials(
  inputUsername: string,
  inputPassword: string
):
  | { ok: true; username: string }
  | { ok: false; reason: 'invalid-credentials' | 'not-configured'; missing?: string[] } {
  const status = getAdminConfigStatus()
  if (!status.configured || !status.config) {
    return {
      ok: false,
      reason: 'not-configured',
      missing: status.missing,
    }
  }

  const usernameValid = safeEqual(inputUsername, status.config.username)
  const passwordValid = safeEqual(inputPassword, status.config.password)

  if (!usernameValid || !passwordValid) {
    return { ok: false, reason: 'invalid-credentials' }
  }

  return {
    ok: true,
    username: status.config.username,
  }
}

export function createSignedAdminToken(
  payload: AdminSessionPayload,
  secret: string
): string {
  const payloadEncoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = signSessionPayload(payloadEncoded, secret)
  return `${payloadEncoded}.${signature}`
}

export function verifySignedAdminToken(
  token: string,
  secret: string
): AdminSessionPayload | null {
  const [payloadEncoded, signature] = token.split('.')
  if (!payloadEncoded || !signature) {
    return null
  }

  const expectedSignature = signSessionPayload(payloadEncoded, secret)
  if (!safeEqual(signature, expectedSignature)) {
    return null
  }

  try {
    const payloadJson = Buffer.from(payloadEncoded, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadJson) as AdminSessionPayload

    if (payload.role !== 'admin' || typeof payload.username !== 'string') {
      return null
    }

    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export function createAdminSessionToken(username: string): string {
  const status = getAdminConfigStatus()
  if (!status.configured || !status.config) {
    throw new Error('Admin auth is not configured')
  }

  return createSignedAdminToken(
    {
      role: 'admin',
      username,
      exp: Date.now() + ADMIN_SESSION_TTL_MS,
    },
    status.config.sessionSecret
  )
}

export function parseAdminSessionToken(token?: string): AdminSessionPayload | null {
  if (!token) {
    return null
  }

  const status = getAdminConfigStatus()
  if (!status.configured || !status.config) {
    return null
  }

  return verifySignedAdminToken(token, status.config.sessionSecret)
}

export function setAdminSessionCookie(response: NextResponse, token: string): void {
  // Only set Secure flag when HTTPS is actually available.
  // Using secure cookies over plain HTTP causes browsers to silently reject the cookie.
  const useSecure = process.env.FORCE_HTTPS === 'true'
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: useSecure,
    sameSite: 'strict',
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
    path: '/',
  })
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    maxAge: 0,
    path: '/',
  })
}

function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Unauthorized. Admin login required.' },
    { status: 401 }
  )
}

function notConfiguredResponse(missing: string[]) {
  return NextResponse.json(
    {
      error: 'Admin dashboard is not configured.',
      missing,
    },
    { status: 503 }
  )
}

export function requireAdmin(
  request: NextRequest
):
  | { ok: true; session: AdminSessionPayload }
  | { ok: false; response: NextResponse } {
  const status = getAdminConfigStatus()
  if (!status.configured) {
    return {
      ok: false,
      response: notConfiguredResponse(status.missing),
    }
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  const session = parseAdminSessionToken(token)

  if (!session) {
    return {
      ok: false,
      response: unauthorizedResponse(),
    }
  }

  return {
    ok: true,
    session,
  }
}
