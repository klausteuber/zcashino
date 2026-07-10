import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlayerSession } from '@/lib/auth/player-session'
import {
  logVeilstonePlaytestEvent,
  VEILSTONE_PLAYTEST_EVENT_NAMES,
} from '@/lib/veilstone/playtest'

const bodySchema = z.object({
  matchId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  seatIndex: z.number().int().min(0).max(3).optional(),
  eventName: z.enum(VEILSTONE_PLAYTEST_EVENT_NAMES),
  phase: z.string().trim().min(1).optional(),
  stateVersion: z.string().regex(/^\d+$/).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid playtest event payload', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const playerSession = await requirePlayerSession(request, parsed.data.sessionId)
    if (!playerSession.ok) return playerSession.response

    const event = await logVeilstonePlaytestEvent({
      ...parsed.data,
      sessionId: playerSession.session.sessionId,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
    })

    return NextResponse.json({ ok: true, event })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Playtest event failed' }, { status: 400 })
  }
}
