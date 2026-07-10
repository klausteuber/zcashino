import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlayerSession } from '@/lib/auth/player-session'
import { upsertVeilstonePlaytestFeedback } from '@/lib/veilstone/playtest'

const rating = z.number().int().min(1).max(7)
const bodySchema = z.object({
  matchId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  seatIndex: z.number().int().min(0).max(3).optional(),
  understoodGoal: rating,
  decisionsMattered: rating,
  understoodOutcome: rating,
  shieldedFeltFair: rating,
  trustPrestigeMattered: rating,
  feltSkillful: rating,
  wouldPlayAgain: rating,
  mostExcitingMoment: z.string().trim().max(2000).optional(),
  mostConfusingMoment: z.string().trim().max(2000).optional(),
  oneThingToChange: z.string().trim().max(2000).optional(),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid playtest feedback payload', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const playerSession = await requirePlayerSession(request, parsed.data.sessionId)
    if (!playerSession.ok) return playerSession.response

    const feedback = await upsertVeilstonePlaytestFeedback({
      ...parsed.data,
      sessionId: playerSession.session.sessionId,
    })

    return NextResponse.json({ ok: true, feedback })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Playtest feedback failed' }, { status: 400 })
  }
}
