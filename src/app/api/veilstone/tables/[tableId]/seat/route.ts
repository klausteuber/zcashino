import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { requirePlayerSession } from '@/lib/auth/player-session'
import { seatVeilstoneTable, VeilstoneValidationError } from '@/lib/veilstone/service'

const seatSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  seatIndex: z.number().int().min(0).max(3).optional(),
  asBot: z.boolean().optional(),
  houseId: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
}).strict()

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tableId: string }> }
) {
  const rateLimit = checkPublicRateLimit(request, 'game-action')
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit)

  try {
    const { tableId } = await context.params
    const parsed = seatSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    let sessionId = parsed.data.sessionId
    if (!parsed.data.asBot) {
      if (!sessionId) return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
      const playerSession = await requirePlayerSession(request, sessionId)
      if (!playerSession.ok) return playerSession.response
      sessionId = playerSession.session.sessionId
    }

    const table = await seatVeilstoneTable({
      tableId,
      sessionId: sessionId ?? 'bot',
      seatIndex: parsed.data.seatIndex,
      asBot: parsed.data.asBot,
      houseId: parsed.data.houseId,
      displayName: parsed.data.displayName,
    })

    return NextResponse.json({ table })
  } catch (error) {
    if (error instanceof VeilstoneValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[Veilstone] Seat table failed:', error)
    return NextResponse.json({ error: 'Failed to seat Veilstone table' }, { status: 500 })
  }
}
