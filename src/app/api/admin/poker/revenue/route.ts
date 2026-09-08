import { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import { guardPokerEvidenceHost } from '@/lib/poker/integrity-admin-host'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { checkAdminRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { pokerResponse } from '@/lib/poker/http'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const guard = guardCypherAdminRequest(request) || guardPokerEvidenceHost(request)
  if (guard) return guard
  const limit = checkAdminRateLimit(request, 'admin-read')
  if (!limit.allowed) return createRateLimitResponse(limit)
  const auth = await requireAdmin(request, 'view_games')
  if (!auth.ok) return auth.response
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const where = { kind: 'rake', table: { mode: 'real' } }
    const totals = await prisma.$transaction([
      prisma.pokerEvent.aggregate({ where, _sum: { amountZats: true }, _count: true }),
      prisma.pokerEvent.aggregate({ where: { ...where, createdAt: { gte: since } }, _sum: { amountZats: true }, _count: true }),
    ])
    await logAdminEvent({ request, action: 'admin.poker.revenue.read', success: true, actor: auth.session.username, details: 'Read poker rake totals.' })
    const summary = (v: typeof totals[number]) => ({ rakeZats: (v._sum.amountZats ?? 0n).toString(), rakedHands: v._count })
    return pokerResponse({ allTime: summary(totals[0]), last24h: summary(totals[1]) })
  } catch { return pokerResponse({ error: 'Poker revenue is temporarily unavailable.' }, 503) }
}
