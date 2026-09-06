import { NextRequest } from 'next/server'
import { z } from 'zod'
import { poker } from '@/lib/poker/service'
import { checkPokerGeo, pokerAuth, pokerBody, pokerFailure, pokerName, pokerResponse, requestId, zats } from '@/lib/poker/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const action = z.discriminatedUnion('type', [z.object({ type: z.literal('fold') }).strict(), z.object({ type: z.literal('check') }).strict(),
  z.object({ type: z.literal('call') }).strict(), z.object({ type: z.literal('bring-in') }).strict(), z.object({ type: z.literal('raise'), to: zats }).strict()])
const command = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('join'), seat: z.number().int().min(0).max(5), buyIn: zats, name: pokerName }).strict(),
  z.object({ kind: z.literal('ready'), ready: z.boolean() }).strict(), z.object({ kind: z.literal('leave') }).strict(),
  z.object({ kind: z.literal('time-bank') }).strict(),
  z.object({ kind: z.literal('act'), action }).strict(),
])
const schema = z.object({ command, version: z.number().int().nonnegative(), requestId }).strict()
type Context = { params: Promise<{ tableId: string }> }
export async function GET(request: NextRequest, context: Context) {
  try {
    const auth = await pokerAuth(request)
    if (!auth.ok) return auth.response
    const { tableId } = await context.params
    await poker.tick(tableId)
    return pokerResponse(await poker.snapshot(tableId, auth.session.sessionId))
  } catch (error) { return pokerFailure(error) }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const auth = await pokerAuth(request, true)
    if (!auth.ok) return auth.response
    const { tableId } = await context.params
    const body = schema.parse(await pokerBody(request))
    if (body.command.kind === 'join' || (body.command.kind === 'ready' && body.command.ready)) {
      const table = await poker.snapshot(tableId, auth.session.sessionId)
      if (table.mode === 'real') checkPokerGeo(request)
    }
    await poker.command(tableId, auth.session.sessionId, body.command, body.version, body.requestId)
    return pokerResponse(await poker.snapshot(tableId, auth.session.sessionId))
  } catch (error) { return pokerFailure(error) }
}
