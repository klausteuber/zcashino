import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { roundZec } from '@/lib/wallet'

/**
 * GET /api/admin/players/[id]
 * Authenticated admin endpoint — full player detail with transactions and game history.
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
      action: 'admin.players.detail',
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
      action: 'admin.players.detail',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  const { id } = await params

  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        wallet: {
          select: {
            unifiedAddr: true,
            transparentAddr: true,
            cachedBalance: true,
            totalSwept: true,
          },
        },
      },
    })

    if (!session) {
      await logAdminEvent({
        request,
        action: 'admin.players.detail',
        success: false,
        actor: adminCheck.session.username,
        details: `Player not found: ${id}`,
      })
      return NextResponse.json(
        { error: 'Player not found.' },
        { status: 404 }
      )
    }

    const [transactions, bjGames, vpGames, bjCount, vpCount, txCount] =
      await Promise.all([
        prisma.transaction.findMany({
          where: { sessionId: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            type: true,
            amount: true,
            fee: true,
            status: true,
            txHash: true,
            failReason: true,
            createdAt: true,
            confirmedAt: true,
          },
        }),
        prisma.blackjackGame.findMany({
          where: { sessionId: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            mainBet: true,
            perfectPairsBet: true,
            outcome: true,
            payout: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        }),
        prisma.videoPokerGame.findMany({
          where: { sessionId: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            totalBet: true,
            handRank: true,
            payout: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        }),
        prisma.blackjackGame.count({ where: { sessionId: id } }),
        prisma.videoPokerGame.count({ where: { sessionId: id } }),
        prisma.transaction.count({ where: { sessionId: id } }),
      ])

    const housePnl = session.totalWagered - session.totalWon

    await logAdminEvent({
      request,
      action: 'admin.players.detail',
      success: true,
      actor: adminCheck.session.username,
      details: `Viewed player detail: ${id}`,
    })

    return NextResponse.json({
      session: {
        id: session.id,
        walletAddress: session.walletAddress,
        withdrawalAddress: session.withdrawalAddress,
        balance: session.balance,
        totalDeposited: session.totalDeposited,
        totalWithdrawn: session.totalWithdrawn,
        totalWagered: session.totalWagered,
        totalWon: session.totalWon,
        housePnl,
        isAuthenticated: session.isAuthenticated,
        authTxHash: session.authTxHash,
        authConfirmedAt: session.authConfirmedAt,
        depositLimit: session.depositLimit,
        lossLimit: session.lossLimit,
        sessionLimit: session.sessionLimit,
        excludedUntil: session.excludedUntil,
        lastActiveAt: session.lastActiveAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        depositWallet: session.wallet,
      },
      transactions,
      blackjackGames: bjGames,
      videoPokerGames: vpGames,
      counts: {
        blackjack: bjCount,
        videoPoker: vpCount,
        transactions: txCount,
      },
    })
  } catch (error) {
    console.error('Admin player detail error:', error)
    await logAdminEvent({
      request,
      action: 'admin.players.detail',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch player detail',
    })
    return NextResponse.json(
      { error: 'Failed to fetch player detail.' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/players/[id]
 * Update responsible gambling limits for a player.
 * Accepts: depositLimit, lossLimit, sessionLimit, excludedUntil
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const writeLimit = checkAdminRateLimit(request, 'admin-write')
  if (!writeLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.players.update',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: writeLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(writeLimit)
  }

  const adminCheck = requireAdmin(request)
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.players.update',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  const { id } = await params

  try {
    const body = await request.json()

    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        depositLimit: true,
        lossLimit: true,
        sessionLimit: true,
        excludedUntil: true,
      },
    })

    if (!session) {
      await logAdminEvent({
        request,
        action: 'admin.players.update',
        success: false,
        actor: adminCheck.session.username,
        details: `Player not found: ${id}`,
      })
      return NextResponse.json(
        { error: 'Player not found.' },
        { status: 404 }
      )
    }

    // Build update data — only include fields that were explicitly sent
    const updateData: Record<string, unknown> = {}
    const changes: string[] = []

    if ('depositLimit' in body) {
      const val = body.depositLimit
      if (val !== null && (typeof val !== 'number' || val < 0)) {
        return NextResponse.json(
          { error: 'depositLimit must be a positive number or null.' },
          { status: 400 }
        )
      }
      updateData.depositLimit = val !== null ? roundZec(val) : null
      changes.push(`depositLimit: ${session.depositLimit} → ${updateData.depositLimit}`)
    }

    if ('lossLimit' in body) {
      const val = body.lossLimit
      if (val !== null && (typeof val !== 'number' || val < 0)) {
        return NextResponse.json(
          { error: 'lossLimit must be a positive number or null.' },
          { status: 400 }
        )
      }
      updateData.lossLimit = val !== null ? roundZec(val) : null
      changes.push(`lossLimit: ${session.lossLimit} → ${updateData.lossLimit}`)
    }

    if ('sessionLimit' in body) {
      const val = body.sessionLimit
      if (val !== null && (typeof val !== 'number' || !Number.isInteger(val) || val < 0)) {
        return NextResponse.json(
          { error: 'sessionLimit must be a positive integer (minutes) or null.' },
          { status: 400 }
        )
      }
      updateData.sessionLimit = val
      changes.push(`sessionLimit: ${session.sessionLimit} → ${val}`)
    }

    if ('excludedUntil' in body) {
      const val = body.excludedUntil
      if (val !== null) {
        const parsed = new Date(val)
        if (isNaN(parsed.getTime())) {
          return NextResponse.json(
            { error: 'excludedUntil must be a valid ISO date string or null.' },
            { status: 400 }
          )
        }
        updateData.excludedUntil = parsed
        changes.push(`excludedUntil: ${session.excludedUntil?.toISOString() ?? 'null'} → ${parsed.toISOString()}`)
      } else {
        updateData.excludedUntil = null
        changes.push(`excludedUntil: ${session.excludedUntil?.toISOString() ?? 'null'} → null`)
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update. Accepted: depositLimit, lossLimit, sessionLimit, excludedUntil.' },
        { status: 400 }
      )
    }

    const updated = await prisma.session.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        depositLimit: true,
        lossLimit: true,
        sessionLimit: true,
        excludedUntil: true,
      },
    })

    await logAdminEvent({
      request,
      action: 'admin.players.update',
      success: true,
      actor: adminCheck.session.username,
      details: `Updated player ${id}: ${changes.join(', ')}`,
      metadata: { sessionId: id, changes },
    })

    return NextResponse.json({
      ok: true,
      updated: {
        depositLimit: updated.depositLimit,
        lossLimit: updated.lossLimit,
        sessionLimit: updated.sessionLimit,
        excludedUntil: updated.excludedUntil,
      },
    })
  } catch (error) {
    console.error('Admin player update error:', error)
    await logAdminEvent({
      request,
      action: 'admin.players.update',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to update player',
    })
    return NextResponse.json(
      { error: 'Failed to update player.' },
      { status: 500 }
    )
  }
}
