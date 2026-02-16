import { NextRequest, NextResponse } from 'next/server'
import { requirePlayerSession } from '@/lib/auth/player-session'
import {
  ClientSeedLockedError,
  getPublicFairnessState,
  rotateSeed,
  setClientSeed,
  SessionFairnessUnavailableError,
} from '@/lib/provably-fair/session-fairness'
import { getProvablyFairMode, LEGACY_PER_GAME_MODE } from '@/lib/provably-fair/mode'
import {
  fairnessPostSchema,
  fairnessQuerySchema,
  parseWithSchema,
} from '@/lib/validation/api-schemas'

const LEGACY_MODE_PAYLOAD = {
  mode: LEGACY_PER_GAME_MODE,
  serverSeedHash: null,
  commitmentTxHash: null,
  commitmentBlock: null,
  commitmentTimestamp: null,
  clientSeed: null,
  nextNonce: null,
  canEditClientSeed: false,
}

export async function GET(request: NextRequest) {
  const parsed = parseWithSchema(fairnessQuerySchema, {
    sessionId: request.nextUrl.searchParams.get('sessionId') ?? undefined,
  }, 'Invalid query parameters')

  if (!parsed.success) {
    return NextResponse.json(parsed.payload, { status: 400 })
  }

  const playerSession = requirePlayerSession(request, parsed.data.sessionId)
  if (!playerSession.ok) {
    return playerSession.response
  }

  const mode = getProvablyFairMode()
  if (mode === LEGACY_PER_GAME_MODE) {
    return NextResponse.json(LEGACY_MODE_PAYLOAD)
  }

  const sessionId = playerSession.session.sessionId

  try {
    const fairnessState = await getPublicFairnessState(sessionId)
    return NextResponse.json(fairnessState)
  } catch (error) {
    if (error instanceof SessionFairnessUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }

    console.error('[FairnessAPI] Failed to fetch fairness state:', error)
    return NextResponse.json({ error: 'Failed to fetch fairness state' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = parseWithSchema(fairnessPostSchema, body)

  if (!parsed.success) {
    return NextResponse.json(parsed.payload, { status: 400 })
  }

  const payload = parsed.data
  const playerSession = requirePlayerSession(request, payload.sessionId)
  if (!playerSession.ok) {
    return playerSession.response
  }

  const mode = getProvablyFairMode()
  if (mode === LEGACY_PER_GAME_MODE) {
    return NextResponse.json({
      error: 'Session fairness API is unavailable in legacy mode.',
      mode,
    }, { status: 409 })
  }

  const sessionId = playerSession.session.sessionId

  try {
    if (payload.action === 'set-client-seed') {
      const fairnessState = await setClientSeed(sessionId, payload.clientSeed)
      return NextResponse.json({
        success: true,
        action: payload.action,
        fairness: fairnessState,
      })
    }

    const result = await rotateSeed(sessionId, payload.nextClientSeed)
    return NextResponse.json({
      success: true,
      action: payload.action,
      reveal: result.reveal,
      fairness: result.active,
    })
  } catch (error) {
    if (error instanceof ClientSeedLockedError) {
      return NextResponse.json({ error: error.message, code: 'CLIENT_SEED_LOCKED' }, { status: 409 })
    }

    if (error instanceof SessionFairnessUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }

    console.error('[FairnessAPI] Failed action:', error)
    return NextResponse.json({ error: 'Failed to process fairness action' }, { status: 500 })
  }
}
