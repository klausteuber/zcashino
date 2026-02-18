import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { hashPassword, isValidRole, ROLE_LABELS } from '@/lib/admin/rbac'

/**
 * GET /api/admin/users
 * List all admin users. super_admin only.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.users.list',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const adminCheck = requireAdmin(request, 'manage_admin_users')
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.users.list',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const users = await prisma.adminUser.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        totpEnabled: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
        createdBy: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    await logAdminEvent({
      request,
      action: 'admin.users.list',
      success: true,
      actor: adminCheck.session.username,
      details: `Listed ${users.length} admin user(s)`,
    })

    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        roleLabel: ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role,
      })),
    })
  } catch (error) {
    console.error('Admin users list error:', error)
    await logAdminEvent({
      request,
      action: 'admin.users.list',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to list users',
    })
    return NextResponse.json(
      { error: 'Failed to list admin users.' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/users
 * Create a new admin user. super_admin only.
 * Body: { username: string, password: string, role: AdminRole }
 */
export async function POST(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const actionLimit = checkAdminRateLimit(request, 'admin-action')
  if (!actionLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.users.create',
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
      action: 'admin.users.create',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const body = await request.json()
    const { username, password, role } = body as {
      username?: string
      password?: string
      role?: string
    }

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters.' },
        { status: 400 }
      )
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      )
    }

    if (!role || !isValidRole(role)) {
      return NextResponse.json(
        { error: 'Role must be one of: analyst, operator, super_admin.' },
        { status: 400 }
      )
    }

    const existing = await prisma.adminUser.findUnique({
      where: { username: username.trim().toLowerCase() },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Username already exists.' },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.adminUser.create({
      data: {
        username: username.trim().toLowerCase(),
        passwordHash,
        role,
        isActive: true,
        createdBy: adminCheck.session.username,
      },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        createdBy: true,
      },
    })

    await logAdminEvent({
      request,
      action: 'admin.users.create',
      success: true,
      actor: adminCheck.session.username,
      details: `Created admin user: ${user.username} (role: ${user.role})`,
      metadata: { userId: user.id, role: user.role },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    console.error('Admin users create error:', error)
    await logAdminEvent({
      request,
      action: 'admin.users.create',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to create user',
    })
    return NextResponse.json(
      { error: 'Failed to create admin user.' },
      { status: 500 }
    )
  }
}
