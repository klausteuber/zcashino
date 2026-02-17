import { NextRequest, NextResponse } from 'next/server'
import { resolveBrandFromHeaders } from '@/lib/brand/resolve-host'

export function isCypherAdminRequest(request: NextRequest): boolean {
  return resolveBrandFromHeaders(request.headers).id === 'cypher'
}

export function guardCypherAdminRequest(request: NextRequest): NextResponse | null {
  if (isCypherAdminRequest(request)) return null
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
