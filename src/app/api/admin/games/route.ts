import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'

interface GameListItem {
  id: string
  type: 'blackjack' | 'videoPoker'
  sessionId: string
  bet: number
  outcome: string | null
  payout: number | null
  status: string
  createdAt: Date
  completedAt: Date | null
}

/**
 * GET /api/admin/games
 * Paginated, filterable list of completed games for admin audit.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.games.list',
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
      action: 'admin.games.list',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const outcome = searchParams.get('outcome')
    const minPayout = searchParams.get('minPayout')
    const sessionId = searchParams.get('sessionId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const sort = searchParams.get('sort') || 'date'
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc'
    const limit = Math.min(Number(searchParams.get('limit')) || 25, 100)
    const offset = Number(searchParams.get('offset')) || 0

    const results: GameListItem[] = []
    let bjCount = 0
    let vpCount = 0

    // --- Blackjack games ---
    if (!type || type === 'blackjack') {
      const bjWhere: Record<string, unknown> = { status: 'completed' }
      if (outcome) bjWhere.outcome = outcome
      if (minPayout) bjWhere.payout = { gte: Number(minPayout) }
      if (sessionId) bjWhere.sessionId = sessionId
      if (from || to) {
        const dateFilter: { gte?: Date; lte?: Date } = {}
        if (from) dateFilter.gte = new Date(from)
        if (to) dateFilter.lte = new Date(to)
        bjWhere.completedAt = dateFilter
      }

      const [bjGames, count] = await Promise.all([
        prisma.blackjackGame.findMany({
          where: bjWhere,
          orderBy: sort === 'payout' ? { payout: order } : { completedAt: order },
          take: limit,
          skip: offset,
          select: {
            id: true,
            sessionId: true,
            mainBet: true,
            perfectPairsBet: true,
            insuranceBet: true,
            outcome: true,
            payout: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        }),
        prisma.blackjackGame.count({ where: bjWhere }),
      ])

      bjCount = count

      bjGames.forEach((g) =>
        results.push({
          id: g.id,
          type: 'blackjack',
          sessionId: g.sessionId,
          bet: g.mainBet + (g.perfectPairsBet || 0) + (g.insuranceBet || 0),
          outcome: g.outcome,
          payout: g.payout,
          status: g.status,
          createdAt: g.createdAt,
          completedAt: g.completedAt,
        })
      )
    }

    // --- Video Poker games ---
    if (!type || type === 'videoPoker') {
      const vpWhere: Record<string, unknown> = { status: 'completed' }
      // Video poker uses handRank instead of outcome
      if (outcome && type === 'videoPoker') vpWhere.handRank = outcome
      if (minPayout) vpWhere.payout = { gte: Number(minPayout) }
      if (sessionId) vpWhere.sessionId = sessionId
      if (from || to) {
        const dateFilter: { gte?: Date; lte?: Date } = {}
        if (from) dateFilter.gte = new Date(from)
        if (to) dateFilter.lte = new Date(to)
        vpWhere.completedAt = dateFilter
      }

      const [vpGames, count] = await Promise.all([
        prisma.videoPokerGame.findMany({
          where: vpWhere,
          orderBy: sort === 'payout' ? { payout: order } : { completedAt: order },
          take: limit,
          skip: offset,
          select: {
            id: true,
            sessionId: true,
            totalBet: true,
            handRank: true,
            payout: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        }),
        prisma.videoPokerGame.count({ where: vpWhere }),
      ])

      vpCount = count

      vpGames.forEach((g) =>
        results.push({
          id: g.id,
          type: 'videoPoker',
          sessionId: g.sessionId,
          bet: g.totalBet,
          outcome: g.handRank,
          payout: g.payout,
          status: g.status,
          createdAt: g.createdAt,
          completedAt: g.completedAt,
        })
      )
    }

    // Sort combined results when both types are included
    if (!type) {
      results.sort((a, b) => {
        if (sort === 'payout') {
          const aVal = a.payout ?? 0
          const bVal = b.payout ?? 0
          return order === 'desc' ? bVal - aVal : aVal - bVal
        }
        const aDate = a.completedAt?.getTime() ?? a.createdAt.getTime()
        const bDate = b.completedAt?.getTime() ?? b.createdAt.getTime()
        return order === 'desc' ? bDate - aDate : aDate - bDate
      })
    }

    const total = bjCount + vpCount

    await logAdminEvent({
      request,
      action: 'admin.games.list',
      success: true,
      actor: adminCheck.session.username,
      details: `Listed games: ${results.length} of ${total}`,
      metadata: { type, outcome, minPayout, sessionId, from, to, sort, order, limit, offset },
    })

    return NextResponse.json({
      games: results,
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Admin games list error:', error)
    await logAdminEvent({
      request,
      action: 'admin.games.list',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch games',
    })
    return NextResponse.json(
      { error: 'Failed to fetch game list.' },
      { status: 500 }
    )
  }
}
