import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { toCsvResponse, isCsvRequest } from '@/lib/admin/csv-export'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/admin/audit-logs
 * Paginated, filterable audit log endpoint with CSV export.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.audit-logs.read',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const adminCheck = requireAdmin(request, 'view_audit_logs')
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.audit-logs.read',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const params = request.nextUrl.searchParams

    const page = Math.max(1, Number(params.get('page') || 1))
    const limit = Math.min(200, Math.max(1, Number(params.get('limit') || 50)))
    const action = params.get('action') || undefined
    const actor = params.get('actor') || undefined
    const successParam = params.get('success')
    const startDate = params.get('startDate') || undefined
    const endDate = params.get('endDate') || undefined
    const search = params.get('search') || undefined
    const ipAddress = params.get('ipAddress') || undefined

    // Build where clause
    const where: Prisma.AdminAuditLogWhereInput = {}

    if (action) where.action = { contains: action }
    if (actor) where.actor = { contains: actor }
    if (ipAddress) where.ipAddress = { contains: ipAddress }
    if (successParam === 'true') where.success = true
    if (successParam === 'false') where.success = false

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) {
        // End of the specified day
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    if (search) {
      where.details = { contains: search }
    }

    // CSV export: fetch all matching records (no pagination)
    if (isCsvRequest(request)) {
      const allLogs = await prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10000, // safety cap
      })

      const rows = allLogs.map((log) => ({
        id: log.id,
        timestamp: log.createdAt.toISOString(),
        action: log.action,
        actor: log.actor ?? '',
        success: log.success ? 'yes' : 'no',
        route: log.route ?? '',
        method: log.method ?? '',
        ipAddress: log.ipAddress ?? '',
        details: log.details ?? '',
        metadata: log.metadata ?? '',
      }))

      await logAdminEvent({
        request,
        action: 'admin.audit-logs.export',
        success: true,
        actor: adminCheck.session.username,
        details: `Exported ${rows.length} audit log entries as CSV`,
      })

      return toCsvResponse(rows, `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`)
    }

    // JSON: paginated response
    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.adminAuditLog.count({ where }),
    ])

    await logAdminEvent({
      request,
      action: 'admin.audit-logs.read',
      success: true,
      actor: adminCheck.session.username,
      details: `Fetched page ${page} of audit logs`,
    })

    return NextResponse.json({
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Audit logs error:', error)
    await logAdminEvent({
      request,
      action: 'admin.audit-logs.read',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch audit logs',
    })
    return NextResponse.json(
      { error: 'Failed to fetch audit logs.' },
      { status: 500 }
    )
  }
}
