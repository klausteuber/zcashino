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
 * GET /api/admin/players
 * Authenticated admin endpoint — paginated player list with search, sort, and high-roller filter.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.players.list',
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
      action: 'admin.players.list',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const url = request.nextUrl
    const search = url.searchParams.get('search') || ''
    const sort = url.searchParams.get('sort') || 'totalWagered'
    const order = (url.searchParams.get('order') || 'desc') as 'asc' | 'desc'
    const highRollers = url.searchParams.get('highRollers') === 'true'
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '25', 10), 1), 100)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)

    const where = search
      ? {
          OR: [
            { id: { contains: search } },
            { walletAddress: { contains: search } },
            { withdrawalAddress: { contains: search } },
          ],
        }
      : {}

    // For high rollers, override limit/offset to top 10
    const take = highRollers ? 10 : limit
    const skip = highRollers ? 0 : offset

    // Build orderBy based on sort field
    let orderBy: Record<string, string> | Record<string, string>[]
    if (sort === 'pnl') {
      // P&L = totalWagered - totalWon, approximate sort by wagered with inverse won
      orderBy = [
        { totalWagered: order },
        { totalWon: order === 'asc' ? 'desc' : 'asc' },
      ]
    } else if (sort === 'balance') {
      orderBy = { balance: order }
    } else {
      // Default: sort by totalWagered
      orderBy = { totalWagered: order }
    }

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        orderBy,
        take,
        skip,
        select: {
          id: true,
          walletAddress: true,
          balance: true,
          totalDeposited: true,
          totalWithdrawn: true,
          totalWagered: true,
          totalWon: true,
          isAuthenticated: true,
          lastActiveAt: true,
          createdAt: true,
          depositLimit: true,
          lossLimit: true,
          sessionLimit: true,
          excludedUntil: true,
        },
      }),
      prisma.session.count({ where }),
    ])

    const mapped = sessions.map((s) => ({
      ...s,
      housePnl: s.totalWagered - s.totalWon,
    }))

    await logAdminEvent({
      request,
      action: 'admin.players.list',
      success: true,
      actor: adminCheck.session.username,
      details: `Listed players (search=${search || 'none'}, sort=${sort}, total=${total})`,
    })

    return NextResponse.json({
      sessions: mapped,
      total,
      limit: take,
      offset: skip,
    })
  } catch (error) {
    console.error('Admin players list error:', error)
    await logAdminEvent({
      request,
      action: 'admin.players.list',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch players',
    })
    return NextResponse.json(
      { error: 'Failed to fetch player list.' },
      { status: 500 }
    )
  }
}
