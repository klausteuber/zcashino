import { NextRequest } from 'next/server'
import { z } from 'zod'
import { poker, realMoneyEnabled } from '@/lib/poker/service'
import { POKER_VARIANTS } from '@/lib/poker/types'
import { checkPokerGeo, pokerAuth, pokerBody, pokerFailure, pokerName, pokerResponse, requestId, zats } from '@/lib/poker/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const createSchema = z.object({ name: pokerName, playerName: pokerName, mode: z.enum(['real', 'practice']),
  variant: z.enum(POKER_VARIANTS).optional(), bigBlind: z.number().int(), buyIn: zats, requestId }).strict()
export async function GET(request: NextRequest) {
  try {
    const auth = await pokerAuth(request)
    if (!auth.ok) return auth.response
    return pokerResponse({ tables: await poker.lobby(auth.session.sessionId), realMoneyEnabled: realMoneyEnabled() })
  } catch (error) { return pokerFailure(error) }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await pokerAuth(request, true)
    if (!auth.ok) return auth.response
    const { requestId, ...input } = createSchema.parse(await pokerBody(request))
    if (input.mode === 'real') checkPokerGeo(request)
    const tableId = await poker.create(auth.session.sessionId, input, requestId)
    return pokerResponse({ tableId })
  } catch (error) { return pokerFailure(error) }
}
