import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { pokerAuth, pokerFailure, pokerResponse } from '@/lib/poker/http'
import { issueSecurityChallenge, verifyHuman } from '@/lib/poker/human-check'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const paramsSchema = z.object({ nonce: z.string().uuid(), action: z.enum(['challenge', 'redeem']) })
export async function POST(request: NextRequest, context: { params: Promise<{ nonce: string; action: string }> }) {
  try {
    const auth = await pokerAuth(request, true)
    if (!auth.ok) return auth.response
    const limit = checkPublicRateLimit(request, 'poker-human')
    if (!limit.allowed) return createRateLimitResponse(limit)
    const { nonce, action } = paramsSchema.parse(await context.params)
    const body = await request.text()
    if (body.length > 16_384) return pokerResponse({ error: 'Request too large.' }, 413)
    if (action === 'challenge') {
      if (body !== '{}') return pokerResponse({ error: 'Empty challenge request required.' }, 400)
      return pokerResponse(await issueSecurityChallenge(prisma, auth.session.sessionId, nonce, request))
    }
    const access = await verifyHuman(prisma, auth.session.sessionId, body, nonce, request)
    // The grant is already stored. This is a UI receipt, never an authorization token.
    return pokerResponse({ success: true, token: 'security-check-complete', expires: Date.now() + 300_000, access })
  } catch (error) { return pokerFailure(error) }
}
