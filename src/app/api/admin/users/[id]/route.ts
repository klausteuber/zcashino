import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { hashPassword, isValidRole } from '@/lib/admin/rbac'

/**
 * PATCH /api/admin/users/[id]
 * Update an admin user: role, isActive, password reset.
 * super_admin only.
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
      action: 'admin.users.update',
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
      action: 'admin.users.update',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  const { id } = await params

  try {
    const body = await request.json()
    const user = await prisma.adminUser.findUnique({ where: { id } })

    if (!user) {
      return NextResponse.json({ error: 'Admin user not found.' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const changes: string[] = []

    // Role change
    if ('role' in body) {
      const { role } = body
      if (!isValidRole(role)) {
        return NextResponse.json(
          { error: 'Role must be one of: analyst, operator, super_admin.' },
          { status: 400 }
        )
      }
      // Prevent demoting the last super_admin
      if (user.role === 'super_admin' && role !== 'super_admin') {
        const superCount = await prisma.adminUser.count({
          where: { role: 'super_admin', isActive: true },
        })
        if (superCount <= 1) {
          return NextResponse.json(
            { error: 'Cannot demote the last active super_admin.' },
            { status: 400 }
          )
        }
      }
      updateData.role = role
      changes.push(`role: ${user.role} → ${role}`)
    }

    // Active toggle
    if ('isActive' in body) {
      const { isActive } = body
      if (typeof isActive !== 'boolean') {
        return NextResponse.json(
          { error: 'isActive must be a boolean.' },
          { status: 400 }
        )
      }
      // Prevent deactivating the last super_admin
      if (!isActive && user.role === 'super_admin' && user.isActive) {
        const superCount = await prisma.adminUser.count({
          where: { role: 'super_admin', isActive: true },
        })
        if (superCount <= 1) {
          return NextResponse.json(
            { error: 'Cannot deactivate the last active super_admin.' },
            { status: 400 }
          )
        }
      }
      // Prevent self-deactivation
      if (!isActive && user.username === adminCheck.session.username) {
        return NextResponse.json(
          { error: 'Cannot deactivate your own account.' },
          { status: 400 }
        )
      }
      updateData.isActive = isActive
      changes.push(`isActive: ${user.isActive} → ${isActive}`)
    }

    // Password reset
    if ('password' in body) {
      const { password } = body
      if (typeof password !== 'string' || password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters.' },
          { status: 400 }
        )
      }
      updateData.passwordHash = await hashPassword(password)
      changes.push('password reset')
    }

    if (changes.length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update. Accepted: role, isActive, password.' },
        { status: 400 }
      )
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        totpEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    await logAdminEvent({
      request,
      action: 'admin.users.update',
      success: true,
      actor: adminCheck.session.username,
      details: `Updated admin user ${user.username}: ${changes.join(', ')}`,
      metadata: { userId: id, changes },
    })

    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error('Admin users update error:', error)
    await logAdminEvent({
      request,
      action: 'admin.users.update',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to update user',
    })
    return NextResponse.json(
      { error: 'Failed to update admin user.' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Soft-delete (deactivate) an admin user.
 * super_admin only.
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
      action: 'admin.users.delete',
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
      action: 'admin.users.delete',
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

    // Prevent self-deletion
    if (user.username === adminCheck.session.username) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account.' },
        { status: 400 }
      )
    }

    // Prevent deleting the last super_admin
    if (user.role === 'super_admin' && user.isActive) {
      const superCount = await prisma.adminUser.count({
        where: { role: 'super_admin', isActive: true },
      })
      if (superCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot deactivate the last active super_admin.' },
          { status: 400 }
        )
      }
    }

    await prisma.adminUser.update({
      where: { id },
      data: { isActive: false },
    })

    await logAdminEvent({
      request,
      action: 'admin.users.delete',
      success: true,
      actor: adminCheck.session.username,
      details: `Deactivated admin user: ${user.username}`,
      metadata: { userId: id },
    })

    return NextResponse.json({ success: true, deactivated: user.username })
  } catch (error) {
    console.error('Admin users delete error:', error)
    await logAdminEvent({
      request,
      action: 'admin.users.delete',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to delete user',
    })
    return NextResponse.json(
      { error: 'Failed to deactivate admin user.' },
      { status: 500 }
    )
  }
}
