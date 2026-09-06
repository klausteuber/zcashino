import { NextRequest, NextResponse } from 'next/server'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { getZecQuote } from '@/lib/prices/server'

export async function GET(request: NextRequest) {
  const limit = checkPublicRateLimit(request, 'price-read')
  if (!limit.allowed) return createRateLimitResponse(limit)
  const quote = await getZecQuote()
  return NextResponse.json(quote ?? { error: 'USD estimate unavailable' }, {
    status: quote ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
