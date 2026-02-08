import { NextRequest, NextResponse } from 'next/server'
import {
  clearAdminSessionCookie,
  createAdminSessionToken,
  getAdminConfigStatus,
  parseAdminSessionToken,
  setAdminSessionCookie,
  verifyAdminCredentials,
  ADMIN_SESSION_COOKIE,
} from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'

/**
 * GET /api/admin/auth
 * Check whether the current browser has a valid admin session cookie.
 */
export async function GET(request: NextRequest) {
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
    expiresAt: new Date(session.exp).toISOString(),
  })
}

/**
 * POST /api/admin/auth
 * Login using ADMIN_USERNAME + ADMIN_PASSWORD from environment variables.
 */
export async function POST(request: NextRequest) {
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

    const result = verifyAdminCredentials(username, password)
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

      await logAdminEvent({
        request,
        action: 'admin.auth.login',
        success: false,
        actor: username || undefined,
        details: 'Invalid credentials',
      })
      return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 })
    }

    const token = createAdminSessionToken(result.username)
    const response = NextResponse.json({
      success: true,
      username: result.username,
      expiresInHours: 8,
    })
    setAdminSessionCookie(response, token)

    await logAdminEvent({
      request,
      action: 'admin.auth.login',
      success: true,
      actor: result.username,
      details: 'Admin login successful',
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
