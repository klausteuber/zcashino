import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { requirePlayerSession } from '@/lib/auth/player-session'
import { readyVeilstoneSeat, VeilstoneValidationError } from '@/lib/veilstone/service'

const readySchema = z.object({
  sessionId: z.string().trim().min(1),
  publicStartZats: z.string().regex(/^\d+$/).optional(),
  houseId: z.string().trim().min(1).optional(),
}).strict()

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tableId: string }> }
) {
  const rateLimit = checkPublicRateLimit(request, 'game-action')
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit)

  try {
    const { tableId } = await context.params
    const parsed = readySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const playerSession = await requirePlayerSession(request, parsed.data.sessionId)
    if (!playerSession.ok) return playerSession.response

    const result = await readyVeilstoneSeat({
      tableId,
      sessionId: playerSession.session.sessionId,
      publicStartZats: parsed.data.publicStartZats,
      houseId: parsed.data.houseId,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof VeilstoneValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[Veilstone] Ready table failed:', error)
    return NextResponse.json({ error: 'Failed to ready Veilstone seat' }, { status: 500 })
  }
}
