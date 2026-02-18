import { NextRequest, NextResponse } from 'next/server'

import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { handleTelegramWebhook } from '@/lib/telegram/admin-bot'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  // Intentionally minimal response (no config leakage).
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  return handleTelegramWebhook(request)
}

