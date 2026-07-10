import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { requirePlayerSession } from '@/lib/auth/player-session'
import {
  applyVeilstoneMatchAction,
  VeilstoneConflictError,
  VeilstoneValidationError,
} from '@/lib/veilstone/service'

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ADVANCE_PHASE'), payload: z.object({}).optional() }).strict(),
  z.object({ type: z.literal('PRODUCE'), payload: z.object({}).optional() }).strict(),
  z.object({
    type: z.literal('PLACE_PUBLIC_ORDER'),
    payload: z.object({
      resource: z.enum(['energy', 'compute', 'data', 'materials', 'talent']),
      side: z.enum(['buy', 'sell']),
      quantity: z.number().int().positive(),
      priceZats: z.string().regex(/^\d+$/),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal('SEALED_BID_COMMIT'),
    payload: z.object({
      contractId: z.string().trim().min(1),
      amountZats: z.string().regex(/^\d+$/),
      dataSpent: z.number().int().min(0).optional(),
      nonce: z.string().trim().min(1).optional(),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal('BID_CONTRACT'),
    payload: z.object({
      contractId: z.string().trim().min(1),
      amountZats: z.string().regex(/^\d+$/),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal('BUILD_STRUCTURE'),
    payload: z.object({
      structureType: z.enum(['ENERGY_GRID', 'DATA_TRUST', 'MARKET_EXCHANGE']),
    }).strict(),
  }).strict(),
  z.object({ type: z.literal('FINALIZE_MATCH'), payload: z.object({}).optional() }).strict(),
])

const bodySchema = z.object({
  clientActionId: z.string().trim().min(1).max(128),
  matchId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  expectedStateVersion: z.string().regex(/^\d+$/),
  action: actionSchema,
}).strict()

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  const rateLimit = checkPublicRateLimit(request, 'game-action')
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit)

  try {
    const { matchId } = await context.params
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }
    if (parsed.data.matchId !== matchId) {
      return NextResponse.json({ error: 'Match ID mismatch' }, { status: 400 })
    }

    const playerSession = await requirePlayerSession(request, parsed.data.sessionId)
    if (!playerSession.ok) return playerSession.response

    Sentry.addBreadcrumb({
      category: 'veilstone.action',
      message: parsed.data.action.type,
      level: 'info',
      data: {
        matchId,
        userId: playerSession.session.sessionId,
        stateVersion: parsed.data.expectedStateVersion,
        actionType: parsed.data.action.type,
      },
    })

    const result = await applyVeilstoneMatchAction({
      matchId,
      actorSessionId: playerSession.session.sessionId,
      clientActionId: parsed.data.clientActionId,
      expectedStateVersion: parsed.data.expectedStateVersion,
      action: parsed.data.action,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof VeilstoneConflictError) {
      return NextResponse.json({ error: error.message, code: 'STATE_VERSION_CONFLICT' }, { status: 409 })
    }
    if (error instanceof VeilstoneValidationError || error instanceof Error) {
      Sentry.withScope((scope) => {
        scope.setTag('feature', 'veilstone')
        scope.setContext('veilstone_action_failure', {
          route: 'POST /api/veilstone/matches/[matchId]/actions',
        })
        Sentry.captureException(error)
      })
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[Veilstone] Action failed:', error)
    return NextResponse.json({ error: 'Failed to apply Veilstone action' }, { status: 500 })
  }
}
