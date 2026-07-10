import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { requirePlayerSession } from '@/lib/auth/player-session'
import { createVeilstoneTable, VeilstoneValidationError } from '@/lib/veilstone/service'

const createTableSchema = z.object({
  sessionId: z.string().trim().min(1),
}).strict()

export async function POST(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'game-action')
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit)

  try {
    const parsed = createTableSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const playerSession = await requirePlayerSession(request, parsed.data.sessionId)
    if (!playerSession.ok) return playerSession.response

    const table = await createVeilstoneTable(playerSession.session.sessionId)
    return NextResponse.json({ table })
  } catch (error) {
    if (error instanceof VeilstoneValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[Veilstone] Create table failed:', error)
    return NextResponse.json({ error: 'Failed to create Veilstone table' }, { status: 500 })
  }
}
