import { NextRequest, NextResponse } from 'next/server'
import { readHostFromHeaders, resolveBrandIdFromHost } from '@/lib/brand/resolve-host'

/** Private poker evidence needs a positive host mapping, even in single/forced-brand deployments. */
export function guardPokerEvidenceHost(request: NextRequest) {
  const host = readHostFromHeaders(request.headers)
  const scope = resolveBrandIdFromHost(host, { ...process.env, MULTI_BRAND_ENABLED: 'true', FORCE_BRAND: '' })
  return scope.id === 'cypher' && scope.source === 'mapped' ? null : NextResponse.json({ error: 'Not found' }, { status: 404 })
}
