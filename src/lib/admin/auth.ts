import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { type AdminRole, type Permission, hasPermission, verifyPassword, hashPassword } from './rbac'
import { verifyTotpCode } from './totp'

export const ADMIN_SESSION_COOKIE = 'zcashino_admin_session'
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours
const TOTP_TEMP_TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes for TOTP step

export interface AdminSessionPayload {
  role: AdminRole
  username: string
  exp: number
}

export interface AdminConfigStatus {
  configured: boolean
  missing: string[]
  sessionSecret?: string
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function signSessionPayload(payloadEncoded: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadEncoded).digest('base64url')
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value.trim() : undefined
}

/**
 * Check whether admin auth is configured.
 * Requires ADMIN_SESSION_SECRET at minimum. DB users or env fallback provide credentials.
 */
export function getAdminConfigStatus(): AdminConfigStatus {
  const sessionSecret = getEnv('ADMIN_SESSION_SECRET')
  const isProduction = process.env.NODE_ENV === 'production'

  const missing: string[] = []
  if (!sessionSecret) missing.push('ADMIN_SESSION_SECRET')
  if (isProduction && sessionSecret && sessionSecret.length < 32) {
    missing.push('ADMIN_SESSION_SECRET (minimum 32 chars in production)')
  }

  if (missing.length > 0) {
    return { configured: false, missing }
  }

  return { configured: true, missing: [], sessionSecret: sessionSecret! }
}

/**
 * Bootstrap: ensure at least one super_admin exists.
 * If no AdminUser rows exist and ADMIN_USERNAME/ADMIN_PASSWORD are set,
 * auto-create a super_admin user from env vars.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const count = await prisma.adminUser.count()
  if (count > 0) return

  const username = getEnv('ADMIN_USERNAME') || 'admin'
  const password = getEnv('ADMIN_PASSWORD')
  if (!password) return

  const passwordHash = await hashPassword(password)
  await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      role: 'super_admin',
      isActive: true,
      createdBy: 'bootstrap',
    },
  })
}

/**
 * Verify credentials against AdminUser table, with env var fallback.
 * When the user has TOTP 2FA enabled, returns totpRequired instead of a full session.
 */
export async function verifyAdminCredentials(
  inputUsername: string,
  inputPassword: string
): Promise<
  | { ok: true; username: string; role: AdminRole; userId: string; totpRequired?: false }
  | { ok: true; username: string; role: AdminRole; userId: string; totpRequired: true }
  | { ok: false; reason: 'invalid-credentials' | 'not-configured' | 'account-disabled'; missing?: string[] }
> {
  const status = getAdminConfigStatus()
  if (!status.configured) {
    return { ok: false, reason: 'not-configured', missing: status.missing }
  }

  // Try DB-backed auth first
  const user = await prisma.adminUser.findUnique({
    where: { username: inputUsername },
  })

  if (user) {
    if (!user.isActive) {
      return { ok: false, reason: 'account-disabled' }
    }

    const passwordValid = await verifyPassword(inputPassword, user.passwordHash)
    if (!passwordValid) {
      return { ok: false, reason: 'invalid-credentials' }
    }

    // If 2FA is enabled, don't issue session yet — require TOTP step
    if (user.totpEnabled && user.totpSecret) {
      return { ok: true, username: user.username, role: user.role as AdminRole, userId: user.id, totpRequired: true }
    }

    // Update last login
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    return { ok: true, username: user.username, role: user.role as AdminRole, userId: user.id }
  }

  // Env var fallback (for bootstrapping before first DB user is created)
  const envUsername = getEnv('ADMIN_USERNAME') || 'admin'
  const envPassword = getEnv('ADMIN_PASSWORD')
  if (envPassword) {
    const usernameValid = safeEqual(inputUsername, envUsername)
    const passwordValid = safeEqual(inputPassword, envPassword)
    if (usernameValid && passwordValid) {
      return { ok: true, username: envUsername, role: 'super_admin', userId: 'env-fallback' }
    }
  }

  return { ok: false, reason: 'invalid-credentials' }
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
  if (!payloadEncoded || !signature) return null

  const expectedSignature = signSessionPayload(payloadEncoded, secret)
  if (!safeEqual(signature, expectedSignature)) return null

  try {
    const payloadJson = Buffer.from(payloadEncoded, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadJson) as AdminSessionPayload

    if (typeof payload.username !== 'string' || typeof payload.role !== 'string') return null
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null

    return payload
  } catch {
    return null
  }
}

export function createAdminSessionToken(username: string, role: AdminRole): string {
  const status = getAdminConfigStatus()
  if (!status.configured || !status.sessionSecret) {
    throw new Error('Admin auth is not configured')
  }

  return createSignedAdminToken(
    { role, username, exp: Date.now() + ADMIN_SESSION_TTL_MS },
    status.sessionSecret
  )
}

export function parseAdminSessionToken(token?: string): AdminSessionPayload | null {
  if (!token) return null

  const status = getAdminConfigStatus()
  if (!status.configured || !status.sessionSecret) return null

  return verifySignedAdminToken(token, status.sessionSecret)
}

// --- TOTP 2FA temp tokens ---

interface TotpTempPayload {
  purpose: 'totp-step'
  userId: string
  exp: number
}

/**
 * Create a short-lived temp token for the 2FA step.
 * Valid for 5 minutes — just enough time to enter the TOTP code.
 */
export function createTotpTempToken(userId: string): string {
  const status = getAdminConfigStatus()
  if (!status.configured || !status.sessionSecret) {
    throw new Error('Admin auth is not configured')
  }

  const payload: TotpTempPayload = {
    purpose: 'totp-step',
    userId,
    exp: Date.now() + TOTP_TEMP_TOKEN_TTL_MS,
  }
  const payloadEncoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = signSessionPayload(payloadEncoded, status.sessionSecret)
  return `${payloadEncoded}.${signature}`
}

/**
 * Parse and validate a TOTP temp token. Returns userId if valid.
 */
export function parseTotpTempToken(token: string): string | null {
  const status = getAdminConfigStatus()
  if (!status.configured || !status.sessionSecret) return null

  const [payloadEncoded, signature] = token.split('.')
  if (!payloadEncoded || !signature) return null

  const expectedSignature = signSessionPayload(payloadEncoded, status.sessionSecret)
  if (!safeEqual(signature, expectedSignature)) return null

  try {
    const payloadJson = Buffer.from(payloadEncoded, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadJson) as TotpTempPayload
    if (payload.purpose !== 'totp-step') return null
    if (typeof payload.userId !== 'string') return null
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null
    return payload.userId
  } catch {
    return null
  }
}

/**
 * Complete the 2FA login step: verify TOTP code + temp token, then issue full session.
 */
export async function verifyTotpStep(
  tempToken: string,
  totpCode: string
): Promise<
  | { ok: true; username: string; role: AdminRole; sessionToken: string }
  | { ok: false; reason: 'invalid-token' | 'invalid-code' | 'account-disabled' }
> {
  const userId = parseTotpTempToken(tempToken)
  if (!userId) {
    return { ok: false, reason: 'invalid-token' }
  }

  const user = await prisma.adminUser.findUnique({ where: { id: userId } })
  if (!user || !user.isActive) {
    return { ok: false, reason: 'account-disabled' }
  }

  if (!user.totpSecret || !user.totpEnabled) {
    return { ok: false, reason: 'invalid-token' }
  }

  const codeValid = verifyTotpCode(user.totpSecret, totpCode)
  if (!codeValid) {
    return { ok: false, reason: 'invalid-code' }
  }

  // Update last login
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  const sessionToken = createAdminSessionToken(user.username, user.role as AdminRole)
  return { ok: true, username: user.username, role: user.role as AdminRole, sessionToken }
}

export function setAdminSessionCookie(response: NextResponse, token: string): void {
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

function forbiddenResponse(permission: Permission) {
  return NextResponse.json(
    { error: `Forbidden. Required permission: ${permission}` },
    { status: 403 }
  )
}

function notConfiguredResponse(missing: string[]) {
  return NextResponse.json(
    { error: 'Admin dashboard is not configured.', missing },
    { status: 503 }
  )
}

/**
 * Require admin authentication.
 * Optionally checks a specific permission against the admin's role.
 */
export function requireAdmin(
  request: NextRequest,
  requiredPermission?: Permission
):
  | { ok: true; session: AdminSessionPayload }
  | { ok: false; response: NextResponse } {
  const status = getAdminConfigStatus()
  if (!status.configured) {
    return { ok: false, response: notConfiguredResponse(status.missing) }
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  const session = parseAdminSessionToken(token)

  if (!session) {
    return { ok: false, response: unauthorizedResponse() }
  }

  // Check permission if specified
  if (requiredPermission && !hasPermission(session.role, requiredPermission)) {
    return { ok: false, response: forbiddenResponse(requiredPermission) }
  }

  return { ok: true, session }
}
