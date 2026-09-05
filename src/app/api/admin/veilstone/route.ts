import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  type AdminRateLimitBucket,
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { getVeilstoneOperationalSummary } from '@/lib/veilstone/admin'
import {
  VeilstoneConflictError,
  VeilstoneValidationError,
  applyVeilstoneMatchAction,
  getVeilstoneEvents,
  getVeilstoneReplay,
} from '@/lib/veilstone/service'
import type { VeilstoneState } from '@/lib/veilstone/engine'

function errorResponse(error: unknown) {
  if (error instanceof VeilstoneConflictError) {
    return NextResponse.json({ error: error.message, recoverable: true }, { status: 409 })
  }
  if (error instanceof VeilstoneValidationError || error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ error: 'Veilstone admin action failed.' }, { status: 500 })
}

async function authorizeAdmin(
  request: NextRequest,
  permission: 'view_games' | 'manage_settings',
  bucket: AdminRateLimitBucket = 'admin-read'
) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return { ok: false as const, response: hostGuard }

  const limit = checkAdminRateLimit(request, bucket)
  if (!limit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.veilstone',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: limit.retryAfterSeconds },
    })
    return { ok: false as const, response: createRateLimitResponse(limit) }
  }

  const adminCheck = await requireAdmin(request, permission)
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.veilstone',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return { ok: false as const, response: adminCheck.response }
  }

  return { ok: true as const, session: adminCheck.session }
}

export async function GET(request: NextRequest) {
  const admin = await authorizeAdmin(request, 'view_games')
  if (!admin.ok) return admin.response

  const summary = await getVeilstoneOperationalSummary()
  const eventMatchId = request.nextUrl.searchParams.get('matchId')
  const [tables, matches, recentEvents] = await Promise.all([
    prisma.veilstoneTable.findMany({
      where: { status: { in: ['waiting', 'active'] } },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      include: {
        seats: { orderBy: { seatIndex: 'asc' } },
        match: { select: { id: true, status: true, phase: true, stateVersion: true } },
      },
    }),
    prisma.veilstoneMatch.findMany({
      where: { status: { in: ['active', 'complete'] } },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      select: {
        id: true,
        tableId: true,
        status: true,
        epoch: true,
        phase: true,
        stateVersion: true,
        finalHash: true,
        updatedAt: true,
        completedAt: true,
      },
    }),
    eventMatchId
      ? getVeilstoneEvents(eventMatchId, null).catch(() => [])
      : prisma.veilstoneEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          matchId: true,
          sequence: true,
          stateVersion: true,
          type: true,
          visibility: true,
          actorSessionId: true,
          payloadJson: true,
          eventHash: true,
          prevEventHash: true,
          createdAt: true,
        },
      }).then((events) => events.map((event) => ({
        eventId: event.id,
        matchId: event.matchId,
        sequence: event.sequence.toString(),
        stateVersion: event.stateVersion.toString(),
        type: event.type,
        visibility: event.visibility,
        actorSessionId: event.actorSessionId,
        payload: JSON.parse(event.payloadJson),
        eventHash: event.eventHash,
        prevEventHash: event.prevEventHash,
        createdAt: event.createdAt.toISOString(),
      }))),
  ])

  await logAdminEvent({
    request,
    action: 'admin.veilstone.read',
    success: true,
    actor: admin.session.username,
    details: 'Veilstone admin overview fetched',
  })

  return NextResponse.json({
    summary,
    tables: tables.map((table) => ({
      ...table,
      buyInZats: table.buyInZats.toString(),
      seats: table.seats.map((seat) => ({
        ...seat,
        publicStartZats: seat.publicStartZats?.toString() ?? null,
        shieldedStartZats: seat.shieldedStartZats?.toString() ?? null,
      })),
      match: table.match ? {
        ...table.match,
        stateVersion: table.match.stateVersion.toString(),
      } : null,
    })),
    matches: matches.map((match) => ({
      ...match,
      stateVersion: match.stateVersion.toString(),
      replayPath: `/veilstone/replay/${match.id}`,
    })),
    recentEvents,
  })
}

export async function POST(request: NextRequest) {
  const admin = await authorizeAdmin(request, 'manage_settings', 'admin-action')
  if (!admin.ok) return admin.response

  try {
    const body = await request.json()

    if (body.action === 'force-cancel-table') {
      const tableId = String(body.tableId || '')
      const updated = await prisma.veilstoneTable.updateMany({
        where: { id: tableId, status: 'waiting' },
        data: { status: 'cancelled' },
      })
      if (updated.count !== 1) {
        throw new VeilstoneValidationError('Only waiting Veilstone tables can be force-cancelled.')
      }
      await logAdminEvent({
        request,
        action: 'admin.veilstone.force_cancel_table',
        success: true,
        actor: admin.session.username,
        details: `Force-cancelled Veilstone table ${tableId}`,
      })
      return NextResponse.json({ ok: true, tableId })
    }

    if (body.action === 'force-advance-match') {
      const matchId = String(body.matchId || '')
      const match = await prisma.veilstoneMatch.findUnique({
        where: { id: matchId },
        select: { id: true, stateVersion: true, stateJson: true },
      })
      if (!match) throw new VeilstoneValidationError('Match not found')

      const state = JSON.parse(match.stateJson) as VeilstoneState
      const actorSessionId = Object.keys(state.players)[0]
      if (!actorSessionId) throw new VeilstoneValidationError('Match has no seated players')

      const result = await applyVeilstoneMatchAction({
        matchId,
        actorSessionId,
        clientActionId: `admin-force-advance-${randomUUID()}`,
        expectedStateVersion: match.stateVersion.toString(),
        action: { type: 'ADVANCE_PHASE', payload: {} },
      })
      await logAdminEvent({
        request,
        action: 'admin.veilstone.force_advance_match',
        success: true,
        actor: admin.session.username,
        details: `Force-advanced Veilstone match ${matchId}`,
      })
      return NextResponse.json(result)
    }

    if (body.action === 'replay-match') {
      const matchId = String(body.matchId || '')
      const replay = await getVeilstoneReplay(matchId)
      await logAdminEvent({
        request,
        action: 'admin.veilstone.replay_match',
        success: true,
        actor: admin.session.username,
        details: `Fetched Veilstone replay ${matchId}`,
      })
      return NextResponse.json(replay)
    }

    throw new VeilstoneValidationError('Unsupported Veilstone admin action.')
  } catch (error) {
    await logAdminEvent({
      request,
      action: 'admin.veilstone.write',
      success: false,
      actor: admin.session.username,
      details: error instanceof Error ? error.message : 'Veilstone admin action failed',
    })
    return errorResponse(error)
  }
}
