import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { pokerAuth, pokerFailure, pokerName, pokerResponse } from '@/lib/poker/http'
import { accessStatus, setupIdentity } from '@/lib/poker/access'
import { browserMarker, setBrowserMarker, verifyHuman } from '@/lib/poker/human-check'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('setup'), nickname: pokerName, recoverySaved: z.boolean() }).strict(),
  z.object({ kind: z.literal('verify'), token: z.string().min(1).max(2048), nonce: z.string().uuid() }).strict(),
])
export async function GET(request: NextRequest) {
  try {
    const auth = await pokerAuth(request)
    if (!auth.ok) return auth.response
    const response = pokerResponse(await accessStatus(prisma, auth.session.sessionId))
    setBrowserMarker(response, browserMarker(request), request)
    return response
  } catch (error) { return pokerFailure(error) }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await pokerAuth(request, true)
    if (!auth.ok) return auth.response
    const limit = checkPublicRateLimit(request, 'poker-human')
    if (!limit.allowed) return createRateLimitResponse(limit)
    const text = await request.text()
    if (text.length > 4096) return pokerResponse({ error: 'Request too large.' }, 413)
    let value: unknown
    try { value = JSON.parse(text) } catch { return pokerResponse({ error: 'Invalid JSON.' }, 400) }
    const body = schema.parse(value)
    if (body.kind === 'setup') {
      await prisma.$transaction(tx => setupIdentity(tx, auth.session.sessionId, body.nickname, body.recoverySaved))
      return pokerResponse(await accessStatus(prisma, auth.session.sessionId))
    }
    return pokerResponse(await verifyHuman(prisma, auth.session.sessionId, body.token, body.nonce, request))
  } catch (error) { return pokerFailure(error) }
}
