import { NextRequest, NextResponse } from 'next/server'
import {
  clearAdminSessionCookie,
  createAdminSessionToken,
  createTotpTempToken,
  ensureBootstrapAdmin,
  getAdminConfigStatus,
  parseAdminSessionToken,
  setAdminSessionCookie,
  verifyAdminCredentials,
  verifyTotpStep,
  ADMIN_SESSION_COOKIE,
} from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'

/**
 * GET /api/admin/auth
 * Check whether the current browser has a valid admin session cookie.
 * Returns role in the response for RBAC-aware UI.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.auth.status',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const configStatus = getAdminConfigStatus()
  if (!configStatus.configured) {
    return NextResponse.json(
      {
        configured: false,
        authenticated: false,
        missing: configStatus.missing,
      },
      { status: 503 }
    )
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  const session = parseAdminSessionToken(token)

  if (!session) {
    return NextResponse.json({
      configured: true,
      authenticated: false,
    })
  }

  return NextResponse.json({
    configured: true,
    authenticated: true,
    username: session.username,
    role: session.role,
    expiresAt: new Date(session.exp).toISOString(),
  })
}

/**
 * POST /api/admin/auth
 * Login — authenticates against AdminUser table with env var fallback.
 * On first call, bootstraps a super_admin from env vars if no DB users exist.
 */
export async function POST(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const loginLimit = checkAdminRateLimit(request, 'auth-login')
  if (!loginLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.auth.login',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: loginLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(loginLimit)
  }

  try {
    const body = await request.json()

    // --- Step 2: TOTP verification (if tempToken + totpCode provided) ---
    const tempToken = typeof body?.tempToken === 'string' ? body.tempToken : ''
    const totpCode = typeof body?.totpCode === 'string' ? body.totpCode.trim() : ''

    if (tempToken && totpCode) {
      const totpResult = await verifyTotpStep(tempToken, totpCode)
      if (!totpResult.ok) {
        const reason = totpResult.reason === 'invalid-code' ? 'Invalid 2FA code.' : 'Session expired. Please log in again.'
        await logAdminEvent({
          request,
          action: 'admin.auth.totp',
          success: false,
          details: `TOTP verification failed: ${totpResult.reason}`,
        })
        return NextResponse.json({ error: reason }, { status: 401 })
      }

      const response = NextResponse.json({
        success: true,
        username: totpResult.username,
        role: totpResult.role,
        expiresInHours: 8,
      })
      setAdminSessionCookie(response, totpResult.sessionToken)

      await logAdminEvent({
        request,
        action: 'admin.auth.totp',
        success: true,
        actor: totpResult.username,
        details: `2FA login successful (role: ${totpResult.role})`,
      })

      return response
    }

    // --- Step 1: Password verification ---
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!username || !password) {
      await logAdminEvent({
        request,
        action: 'admin.auth.login',
        success: false,
        actor: username || undefined,
        details: 'Missing username or password',
      })
      return NextResponse.json(
        { error: 'Username and password are required.' },
        { status: 400 }
      )
    }

    // Bootstrap super_admin from env vars on first login attempt
    await ensureBootstrapAdmin()

    const result = await verifyAdminCredentials(username, password)
    if (!result.ok) {
      if (result.reason === 'not-configured') {
        await logAdminEvent({
          request,
          action: 'admin.auth.login',
          success: false,
          actor: username || undefined,
          details: 'Admin auth not configured',
          metadata: { missing: result.missing || [] },
        })
        return NextResponse.json(
          {
            error: 'Admin dashboard is not configured.',
            missing: result.missing || [],
          },
          { status: 503 }
        )
      }

      if (result.reason === 'account-disabled') {
        await logAdminEvent({
          request,
          action: 'admin.auth.login',
          success: false,
          actor: username,
          details: 'Account disabled',
        })
        return NextResponse.json(
          { error: 'This account has been disabled.' },
          { status: 403 }
        )
      }

      await logAdminEvent({
        request,
        action: 'admin.auth.login',
        success: false,
        actor: username || undefined,
        details: 'Invalid credentials',
      })
      return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 })
    }

    // If user has 2FA enabled, return temp token and require TOTP step
    if (result.totpRequired) {
      const tempTk = createTotpTempToken(result.userId)

      await logAdminEvent({
        request,
        action: 'admin.auth.login',
        success: true,
        actor: result.username,
        details: 'Password verified, awaiting 2FA code',
      })

      return NextResponse.json({
        requires2fa: true,
        tempToken: tempTk,
        username: result.username,
      })
    }

    // No 2FA — issue session directly
    const token = createAdminSessionToken(result.username, result.role)
    const response = NextResponse.json({
      success: true,
      username: result.username,
      role: result.role,
      expiresInHours: 8,
    })
    setAdminSessionCookie(response, token)

    await logAdminEvent({
      request,
      action: 'admin.auth.login',
      success: true,
      actor: result.username,
      details: `Admin login successful (role: ${result.role})`,
    })

    return response
  } catch {
    await logAdminEvent({
      request,
      action: 'admin.auth.login',
      success: false,
      details: 'Invalid request body',
    })
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
}

/**
 * DELETE /api/admin/auth
 * Clears the admin session cookie.
 */
export async function DELETE(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.auth.logout',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  const session = parseAdminSessionToken(token)

  const response = NextResponse.json({ success: true })
  clearAdminSessionCookie(response)

  await logAdminEvent({
    request,
    action: 'admin.auth.logout',
    success: true,
    actor: session?.username,
    details: 'Admin logout',
  })

  return response
}
