import type { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { getClientIpAddress, getUserAgent } from '@/lib/admin/request'

interface LogAdminEventInput {
  request: NextRequest
  action: string
  success: boolean
  actor?: string
  details?: string
  metadata?: Record<string, unknown>
}

export async function logAdminEvent({
  request,
  action,
  success,
  actor,
  details,
  metadata,
}: LogAdminEventInput): Promise<void> {
  try {
    const route = request.nextUrl.pathname
    const method = request.method
    const ipAddress = getClientIpAddress(request)
    const userAgent = getUserAgent(request)

    await prisma.adminAuditLog.create({
      data: {
        action,
        actor,
        success,
        route,
        method,
        ipAddress,
        userAgent,
        details,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    })
  } catch (error) {
    console.error('[AdminAudit] Failed to write audit log:', error)
  }
}

