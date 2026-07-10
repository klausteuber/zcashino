import { NextRequest, NextResponse } from 'next/server'
import { resolveBrandFromHeaders } from '@/lib/brand/resolve-host'

export function isCypherAdminRequest(request: NextRequest): boolean {
  const brand = resolveBrandFromHeaders(request.headers)
  return brand.id === 'cypher' && brand.source !== 'fallback'
}

export function guardCypherAdminRequest(request: NextRequest): NextResponse | null {
  if (isCypherAdminRequest(request)) return null
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
