import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { generateAlerts } from '@/lib/admin/alerts'
import { getAlertServiceStatus } from '@/lib/services/alert-generator'

/**
 * GET /api/admin/alerts
 * List alerts with optional filters for dismissed, type, severity, and pagination.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.alerts.read',
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
      action: 'admin.alerts.read',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const url = new URL(request.url)
    const dismissed = url.searchParams.get('dismissed')
    const type = url.searchParams.get('type')
    const severity = url.searchParams.get('severity')
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1),
      200
    )
    const offset = Math.max(
      parseInt(url.searchParams.get('offset') || '0', 10),
      0
    )

    const where: Record<string, unknown> = {}
    if (dismissed !== null) where.dismissed = dismissed === 'true'
    if (type) where.type = type
    if (severity) where.severity = severity

    const [alerts, total, activeCount] = await Promise.all([
      prisma.adminAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.adminAlert.count({ where }),
      prisma.adminAlert.count({ where: { dismissed: false } }),
    ])

    await logAdminEvent({
      request,
      action: 'admin.alerts.read',
      success: true,
      actor: adminCheck.session.username,
      details: `Fetched ${alerts.length} alerts (total: ${total}, active: ${activeCount})`,
    })

    return NextResponse.json({ alerts, total, activeCount, limit, offset, serviceStatus: getAlertServiceStatus() })
  } catch (error) {
    console.error('Admin alerts GET error:', error)
    await logAdminEvent({
      request,
      action: 'admin.alerts.read',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch alerts',
    })
    return NextResponse.json(
      { error: 'Failed to fetch alerts.' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/alerts
 * Manually run alert checks now (useful for debugging and ops).
 */
export async function POST(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const actionLimit = checkAdminRateLimit(request, 'admin-action')
  if (!actionLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.alerts.generate',
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
      action: 'admin.alerts.generate',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const result = await generateAlerts()

    await logAdminEvent({
      request,
      action: 'admin.alerts.generate',
      success: true,
      actor: adminCheck.session.username,
      details: `Manual alert run created ${result.total} alert(s)`,
      metadata: result,
    })

    return NextResponse.json({ success: true, result, serviceStatus: getAlertServiceStatus() })
  } catch (error) {
    console.error('Admin alerts POST error:', error)
    await logAdminEvent({
      request,
      action: 'admin.alerts.generate',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to run alerts',
    })
    return NextResponse.json(
      { error: 'Failed to run alert checks.' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/alerts
 * Dismiss an alert by ID.
 * Body: { id: string }
 */
export async function PATCH(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const actionLimit = checkAdminRateLimit(request, 'admin-action')
  if (!actionLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.alerts.dismiss',
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
      action: 'admin.alerts.dismiss',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const body = await request.json()
    const { id } = body as { id?: string }

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid alert id.' },
        { status: 400 }
      )
    }

    const alert = await prisma.adminAlert.findUnique({ where: { id } })
    if (!alert) {
      return NextResponse.json(
        { error: 'Alert not found.' },
        { status: 404 }
      )
    }

    if (alert.dismissed) {
      return NextResponse.json(
        { error: 'Alert already dismissed.' },
        { status: 400 }
      )
    }

    const updated = await prisma.adminAlert.update({
      where: { id },
      data: {
        dismissed: true,
        dismissedBy: adminCheck.session.username,
        dismissedAt: new Date(),
      },
    })

    await logAdminEvent({
      request,
      action: 'admin.alerts.dismiss',
      success: true,
      actor: adminCheck.session.username,
      details: `Dismissed alert ${id} (type: ${alert.type}, severity: ${alert.severity})`,
      metadata: { alertId: id, alertType: alert.type, alertSeverity: alert.severity },
    })

    return NextResponse.json({ alert: updated })
  } catch (error) {
    console.error('Admin alerts PATCH error:', error)
    await logAdminEvent({
      request,
      action: 'admin.alerts.dismiss',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to dismiss alert',
    })
    return NextResponse.json(
      { error: 'Failed to dismiss alert.' },
      { status: 500 }
    )
  }
}
