import { NextResponse } from 'next/server'
import { getVeilstoneReplay, VeilstoneValidationError } from '@/lib/veilstone/service'

export async function GET(
  _request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await context.params
    const replay = await getVeilstoneReplay(matchId)
    return NextResponse.json(replay)
  } catch (error) {
    if (error instanceof VeilstoneValidationError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('[Veilstone] Replay failed:', error)
    return NextResponse.json({ error: 'Failed to load Veilstone replay' }, { status: 500 })
  }
}
