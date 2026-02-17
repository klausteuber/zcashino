import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'

/**
 * GET /api/admin/settings
 * Read all AdminConfig records and return as key-value object.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.settings.read',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const adminCheck = requireAdmin(request)
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.settings.read',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const configs = await prisma.adminConfig.findMany()
    const settings: Record<string, unknown> = {}
    for (const config of configs) {
      try {
        settings[config.key] = JSON.parse(config.value)
      } catch {
        settings[config.key] = config.value
      }
    }

    await logAdminEvent({
      request,
      action: 'admin.settings.read',
      success: true,
      actor: adminCheck.session.username,
      details: 'Settings fetched',
    })

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Admin settings read error:', error)
    await logAdminEvent({
      request,
      action: 'admin.settings.read',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch settings',
    })
    return NextResponse.json(
      { error: 'Failed to fetch admin settings.' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/settings
 * Upsert a single AdminConfig key-value pair.
 * Body: { key: string, value: any }
 */
export async function PATCH(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const actionLimit = checkAdminRateLimit(request, 'admin-action')
  if (!actionLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.settings.update',
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
      action: 'admin.settings.update',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const body = await request.json()
    const { key, value } = body

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: key (string)' },
        { status: 400 }
      )
    }

    const serialized = typeof value === 'string' ? value : JSON.stringify(value)

    await prisma.adminConfig.upsert({
      where: { key },
      update: {
        value: serialized,
        updatedBy: adminCheck.session.username,
      },
      create: {
        key,
        value: serialized,
        updatedBy: adminCheck.session.username,
      },
    })

    await logAdminEvent({
      request,
      action: 'admin.settings.update',
      success: true,
      actor: adminCheck.session.username,
      details: `Setting updated: ${key}`,
      metadata: { key, value },
    })

    return NextResponse.json({ success: true, key, value })
  } catch (error) {
    console.error('Admin settings update error:', error)
    await logAdminEvent({
      request,
      action: 'admin.settings.update',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to update setting',
    })
    return NextResponse.json(
      { error: 'Failed to update admin setting.' },
      { status: 500 }
    )
  }
}
