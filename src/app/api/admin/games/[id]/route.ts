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
 * GET /api/admin/games/[id]
 * Full game detail including state JSON, action history, and provably fair data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.games.detail',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const adminCheck = requireAdmin(request, 'view_games')
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.games.detail',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const { id } = await params

    // Try blackjack first
    const bjGame = await prisma.blackjackGame.findUnique({ where: { id } })
    if (bjGame) {
      await logAdminEvent({
        request,
        action: 'admin.games.detail',
        success: true,
        actor: adminCheck.session.username,
        details: `Viewed blackjack game ${id}`,
        metadata: { gameId: id, type: 'blackjack' },
      })

      return NextResponse.json({
        type: 'blackjack',
        game: {
          ...bjGame,
          initialState: bjGame.initialState ? JSON.parse(bjGame.initialState) : null,
          finalState: bjGame.finalState ? JSON.parse(bjGame.finalState) : null,
          actionHistory: bjGame.actionHistory ? JSON.parse(bjGame.actionHistory) : [],
        },
      })
    }

    // Try video poker
    const vpGame = await prisma.videoPokerGame.findUnique({ where: { id } })
    if (vpGame) {
      await logAdminEvent({
        request,
        action: 'admin.games.detail',
        success: true,
        actor: adminCheck.session.username,
        details: `Viewed video poker game ${id}`,
        metadata: { gameId: id, type: 'videoPoker' },
      })

      return NextResponse.json({
        type: 'videoPoker',
        game: {
          ...vpGame,
          initialState: vpGame.initialState ? JSON.parse(vpGame.initialState) : null,
          finalState: vpGame.finalState ? JSON.parse(vpGame.finalState) : null,
          actionHistory: vpGame.actionHistory ? JSON.parse(vpGame.actionHistory) : [],
        },
      })
    }

    await logAdminEvent({
      request,
      action: 'admin.games.detail',
      success: false,
      actor: adminCheck.session.username,
      details: `Game not found: ${id}`,
      metadata: { gameId: id },
    })

    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  } catch (error) {
    console.error('Admin game detail error:', error)
    await logAdminEvent({
      request,
      action: 'admin.games.detail',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch game detail',
    })
    return NextResponse.json(
      { error: 'Failed to fetch game detail.' },
      { status: 500 }
    )
  }
}
