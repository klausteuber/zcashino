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

type ValidStatus = 'pending' | 'pending_approval' | 'confirmed' | 'failed'
const VALID_STATUSES: ValidStatus[] = ['pending', 'pending_approval', 'confirmed', 'failed']

type SortField = 'createdAt' | 'amount'

/**
 * GET /api/admin/withdrawals
 * Paginated, filterable withdrawal history with CSV export.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.withdrawals.read',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const adminCheck = requireAdmin(request, 'view_withdrawals')
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.withdrawals.read',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const params = request.nextUrl.searchParams

    const page = Math.max(1, Number(params.get('page') || 1))
    const limit = Math.min(200, Math.max(1, Number(params.get('limit') || 50)))
    const statusParam = params.get('status') || undefined
    const startDate = params.get('startDate') || undefined
    const endDate = params.get('endDate') || undefined
    const sessionId = params.get('sessionId') || undefined
    const minAmount = params.get('minAmount') ? Number(params.get('minAmount')) : undefined
    const maxAmount = params.get('maxAmount') ? Number(params.get('maxAmount')) : undefined
    const sortBy: SortField = params.get('sortBy') === 'amount' ? 'amount' : 'createdAt'
    const sortOrder: 'asc' | 'desc' = params.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    // Build where clause
    const where: Prisma.TransactionWhereInput = { type: 'withdrawal' }

    if (statusParam && VALID_STATUSES.includes(statusParam as ValidStatus)) {
      where.status = statusParam
    }

    if (sessionId) {
      where.sessionId = { contains: sessionId }
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {}
      if (minAmount !== undefined) where.amount.gte = minAmount
      if (maxAmount !== undefined) where.amount.lte = maxAmount
    }

    const select = {
      id: true,
      sessionId: true,
      amount: true,
      fee: true,
      address: true,
      operationId: true,
      status: true,
      failReason: true,
      createdAt: true,
      confirmedAt: true,
      session: {
        select: {
          walletAddress: true,
          balance: true,
          withdrawalAddress: true,
        },
      },
    } as const

    // CSV export: fetch all matching records (no pagination)
    if (isCsvRequest(request)) {
      const allWithdrawals = await prisma.transaction.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        select,
        take: 10000, // safety cap
      })

      const rows = allWithdrawals.map((tx) => ({
        id: tx.id,
        sessionId: tx.sessionId,
        amount: tx.amount,
        fee: tx.fee,
        netAmount: tx.amount - tx.fee,
        address: tx.address ?? '',
        operationId: tx.operationId ?? '',
        status: tx.status,
        failReason: tx.failReason ?? '',
        createdAt: tx.createdAt.toISOString(),
        confirmedAt: tx.confirmedAt?.toISOString() ?? '',
        sessionWallet: tx.session.walletAddress,
        sessionBalance: tx.session.balance,
        withdrawalAddress: tx.session.withdrawalAddress ?? '',
      }))

      await logAdminEvent({
        request,
        action: 'admin.withdrawals.export',
        success: true,
        actor: adminCheck.session.username,
        details: `Exported ${rows.length} withdrawals as CSV`,
      })

      return toCsvResponse(rows, `withdrawals-${new Date().toISOString().slice(0, 10)}.csv`)
    }

    // JSON: paginated response
    const [withdrawals, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        select,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])

    // Map to the shape the frontend expects
    const mapped = withdrawals.map((tx) => ({
      id: tx.id,
      sessionId: tx.sessionId,
      amount: tx.amount,
      fee: tx.fee,
      address: tx.address,
      operationId: tx.operationId,
      status: tx.status,
      failReason: tx.failReason,
      createdAt: tx.createdAt,
      confirmedAt: tx.confirmedAt,
      sessionWallet: tx.session.walletAddress,
      sessionBalance: tx.session.balance,
      withdrawalAddress: tx.session.withdrawalAddress,
    }))

    await logAdminEvent({
      request,
      action: 'admin.withdrawals.read',
      success: true,
      actor: adminCheck.session.username,
      details: `Fetched page ${page} of withdrawals (${total} total)`,
    })

    return NextResponse.json({
      withdrawals: mapped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Withdrawals endpoint error:', error)
    await logAdminEvent({
      request,
      action: 'admin.withdrawals.read',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch withdrawals',
    })
    return NextResponse.json(
      { error: 'Failed to fetch withdrawals.' },
      { status: 500 }
    )
  }
}
