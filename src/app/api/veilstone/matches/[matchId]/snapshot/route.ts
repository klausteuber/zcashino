import { NextRequest, NextResponse } from 'next/server'
import { requirePlayerSession } from '@/lib/auth/player-session'
import { getVeilstoneSnapshot, VeilstoneValidationError } from '@/lib/veilstone/service'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await context.params
    const sessionId = request.nextUrl.searchParams.get('sessionId')
    let viewerSessionId: string | undefined

    if (sessionId) {
      const playerSession = await requirePlayerSession(request, sessionId)
      if (!playerSession.ok) return playerSession.response
      viewerSessionId = playerSession.session.sessionId
    }

    const snapshot = await getVeilstoneSnapshot(matchId, viewerSessionId)
    return NextResponse.json(snapshot)
  } catch (error) {
    if (error instanceof VeilstoneValidationError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('[Veilstone] Snapshot failed:', error)
    return NextResponse.json({ error: 'Failed to load Veilstone snapshot' }, { status: 500 })
  }
}
