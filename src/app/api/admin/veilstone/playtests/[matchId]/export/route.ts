import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import {
  formatVeilstonePlaytestMarkdown,
  getVeilstonePlaytestExport,
} from '@/lib/veilstone/playtest'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const limit = checkAdminRateLimit(request, 'admin-read')
  if (!limit.allowed) return createRateLimitResponse(limit)

  const admin = requireAdmin(request, 'view_games')
  if (!admin.ok) return admin.response

  const { matchId } = await context.params
  try {
    const report = await getVeilstonePlaytestExport(matchId)
    await logAdminEvent({
      request,
      action: 'admin.veilstone.playtest_export',
      success: true,
      actor: admin.session.username,
      details: `Exported Veilstone playtest ${matchId}`,
    })

    const format = request.nextUrl.searchParams.get('format') ?? 'json'
    if (format === 'markdown' || format === 'md') {
      return new NextResponse(formatVeilstonePlaytestMarkdown(report), {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="veilstone-playtest-${matchId}.md"`,
        },
      })
    }

    return NextResponse.json(report)
  } catch (error) {
    await logAdminEvent({
      request,
      action: 'admin.veilstone.playtest_export',
      success: false,
      actor: admin.session.username,
      details: error instanceof Error ? error.message : 'Veilstone playtest export failed',
    })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Export failed' }, { status: 400 })
  }
}
