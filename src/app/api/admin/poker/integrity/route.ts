import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import { guardPokerEvidenceHost } from '@/lib/poker/integrity-admin-host'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { checkAdminRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { pokerResponse } from '@/lib/poker/http'
import { unseal } from '@/lib/poker/integrity-crypto'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const query = z.object({ signalId: z.string().max(128).optional(), handId: z.string().max(160).optional(), identityId: z.string().max(128).optional(), cursor: z.string().max(128).optional() }).strict()
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request) || guardPokerEvidenceHost(request)
  if (hostGuard) return hostGuard
  const limit = checkAdminRateLimit(request, 'admin-read')
  if (!limit.allowed) return createRateLimitResponse(limit)
  const auth = await requireAdmin(request, 'view_games')
  if (!auth.ok) return auth.response
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return pokerResponse({ error: 'Invalid filters.' }, 400)
  const { handId, signalId, identityId, cursor } = parsed.data
  try {
    await logAdminEvent({ request, action: 'admin.poker.integrity.read', success: true, actor: auth.session.username,
      details: 'Read private poker integrity evidence.', metadata: { handId, signalId, identityId } })
    const live = { expiresAt: { gt: new Date() } }
    if (handId) {
      const hand = await prisma.pokerHand.findFirst({ where: { id: handId, completedAt: { not: null }, ...live }, include: { players: true, decisions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } })
      if (!hand) return pokerResponse({ error: 'Completed hand not found or expired.' }, 404)
      return pokerResponse({ hand: { id: hand.id, variant: hand.variant, mode: hand.mode, handNumber: hand.handNumber, bigBlind: hand.bigBlind,
        startedAt: hand.startedAt, completedAt: hand.completedAt, players: hand.players, record: unseal(hand.payload, hand.id),
        decisions: hand.decisions.map(d => ({ id: d.id, identityId: d.identityId, phase: d.phase, action: d.action, source: d.source, elapsedMs: d.elapsedMs, createdAt: d.createdAt, context: unseal(d.payload, d.id) })) } })
    }
    if (signalId) {
      const record = await prisma.pokerIntegritySignal.findFirst({ where: { id: signalId, ...live } })
      if (!record) return pokerResponse({ error: 'Signal not found or expired.' }, 404)
      return pokerResponse({ signal: { id: record.id, kind: record.kind, identityId: record.identityId, otherId: record.otherId, createdAt: record.createdAt, evidence: unseal(record.payload, record.id) } })
    }
    const records = await prisma.pokerIntegritySignal.findMany({ where: { ...live, ...(identityId ? { OR: [{ identityId }, { otherId: identityId }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 26, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
    const hands = identityId ? await prisma.pokerHand.findMany({ where: { ...live, completedAt: { not: null }, players: { some: { identityId } } }, orderBy: { completedAt: 'desc' }, take: 25,
      select: { id: true, variant: true, mode: true, handNumber: true, completedAt: true } }) : []
    return pokerResponse({ signals: records.slice(0, 25).map(r => ({ id: r.id, kind: r.kind, identityId: r.identityId, otherId: r.otherId, createdAt: r.createdAt })), hands, nextCursor: records.length > 25 ? records[24].id : null })
  } catch { return pokerResponse({ error: 'Integrity evidence is temporarily unavailable.' }, 503) }
}
