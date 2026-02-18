import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { generateTotpSecret, verifyTotpCode } from '@/lib/admin/totp'

/**
 * POST /api/admin/users/[id]/totp
 * Start TOTP setup: generate secret and return QR URI.
 * Allowed for: super_admin (any user) or the user themselves.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const actionLimit = checkAdminRateLimit(request, 'admin-action')
  if (!actionLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.totp.setup',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: actionLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(actionLimit)
  }

  // Any authenticated admin can set up their own 2FA
  const adminCheck = requireAdmin(request)
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.totp.setup',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  const { id } = await params

  try {
    const user = await prisma.adminUser.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'Admin user not found.' }, { status: 404 })
    }

    // Only super_admin can set up 2FA for other users
    const isSelf = user.username === adminCheck.session.username
    if (!isSelf && adminCheck.session.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super_admin can manage 2FA for other users.' },
        { status: 403 }
      )
    }

    if (user.totpEnabled) {
      return NextResponse.json(
        { error: '2FA is already enabled. Reset it first to reconfigure.' },
        { status: 400 }
      )
    }

    const { secret, uri } = generateTotpSecret(user.username)

    // Store secret (not yet enabled — user must confirm with a code via PATCH)
    await prisma.adminUser.update({
      where: { id },
      data: { totpSecret: secret, totpEnabled: false },
    })

    await logAdminEvent({
      request,
      action: 'admin.totp.setup',
      success: true,
      actor: adminCheck.session.username,
      details: `Started 2FA setup for ${user.username}`,
      metadata: { userId: id, isSelf },
    })

    return NextResponse.json({ secret, uri })
  } catch (error) {
    console.error('TOTP setup error:', error)
    await logAdminEvent({
      request,
      action: 'admin.totp.setup',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to set up 2FA',
    })
    return NextResponse.json({ error: 'Failed to set up 2FA.' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/users/[id]/totp
 * Confirm TOTP setup by verifying the first code from the authenticator app.
 * Body: { code: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const actionLimit = checkAdminRateLimit(request, 'admin-action')
  if (!actionLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.totp.verify',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: actionLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(actionLimit)
  }

  const adminCheck = requireAdmin(request)
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.totp.verify',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  const { id } = await params

  try {
    const body = await request.json()
    const code = typeof body?.code === 'string' ? body.code.trim() : ''

    if (!code || code.length !== 6) {
      return NextResponse.json(
        { error: 'A 6-digit verification code is required.' },
        { status: 400 }
      )
    }

    const user = await prisma.adminUser.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'Admin user not found.' }, { status: 404 })
    }

    const isSelf = user.username === adminCheck.session.username
    if (!isSelf && adminCheck.session.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super_admin can manage 2FA for other users.' },
        { status: 403 }
      )
    }

    if (!user.totpSecret) {
      return NextResponse.json(
        { error: '2FA setup not started. Generate a secret first.' },
        { status: 400 }
      )
    }

    if (user.totpEnabled) {
      return NextResponse.json(
        { error: '2FA is already enabled.' },
        { status: 400 }
      )
    }

    const valid = verifyTotpCode(user.totpSecret, code)
    if (!valid) {
      await logAdminEvent({
        request,
        action: 'admin.totp.verify',
        success: false,
        actor: adminCheck.session.username,
        details: `Invalid 2FA confirmation code for ${user.username}`,
        metadata: { userId: id },
      })
      return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 401 })
    }

    await prisma.adminUser.update({
      where: { id },
      data: { totpEnabled: true },
    })

    await logAdminEvent({
      request,
      action: 'admin.totp.verify',
      success: true,
      actor: adminCheck.session.username,
      details: `2FA enabled for ${user.username}`,
      metadata: { userId: id, isSelf },
    })

    return NextResponse.json({ success: true, message: '2FA has been enabled.' })
  } catch (error) {
    console.error('TOTP verify error:', error)
    await logAdminEvent({
      request,
      action: 'admin.totp.verify',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to verify 2FA',
    })
    return NextResponse.json({ error: 'Failed to verify 2FA code.' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/users/[id]/totp
 * Reset/disable 2FA for a user.
 * super_admin only (even for self — prevents accidental disable without admin oversight).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const actionLimit = checkAdminRateLimit(request, 'admin-action')
  if (!actionLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.totp.reset',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: actionLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(actionLimit)
  }

  const adminCheck = requireAdmin(request, 'manage_admin_users')
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.totp.reset',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  const { id } = await params

  try {
    const user = await prisma.adminUser.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'Admin user not found.' }, { status: 404 })
    }

    if (!user.totpEnabled && !user.totpSecret) {
      return NextResponse.json({ error: '2FA is not configured for this user.' }, { status: 400 })
    }

    await prisma.adminUser.update({
      where: { id },
      data: { totpSecret: null, totpEnabled: false },
    })

    await logAdminEvent({
      request,
      action: 'admin.totp.reset',
      success: true,
      actor: adminCheck.session.username,
      details: `2FA disabled for ${user.username}`,
      metadata: { userId: id },
    })

    return NextResponse.json({ success: true, message: '2FA has been disabled.' })
  } catch (error) {
    console.error('TOTP reset error:', error)
    await logAdminEvent({
      request,
      action: 'admin.totp.reset',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to reset 2FA',
    })
    return NextResponse.json({ error: 'Failed to reset 2FA.' }, { status: 500 })
  }
}
