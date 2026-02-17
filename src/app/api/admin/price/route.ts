import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'

/**
 * Server-side cached ZEC price endpoint.
 * Fetches from CoinGecko API, caches in-memory for 60 seconds.
 * Admin-authenticated to prevent abuse.
 */

interface PriceCache {
  zecUsd: number
  updatedAt: string
  fetchedAt: number // Date.now() for TTL checking
}

let priceCache: PriceCache | null = null
const CACHE_TTL_MS = 60_000 // 60 seconds

async function fetchZecPrice(): Promise<number> {
  // Try CoinGecko first
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd',
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (res.ok) {
      const data = await res.json()
      if (data?.zcash?.usd && typeof data.zcash.usd === 'number') {
        return data.zcash.usd
      }
    }
  } catch {
    // CoinGecko failed, try fallback
  }

  // Fallback: CoinCap
  try {
    const res = await fetch(
      'https://api.coincap.io/v2/assets/zcash',
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (res.ok) {
      const data = await res.json()
      if (data?.data?.priceUsd) {
        return parseFloat(data.data.priceUsd)
      }
    }
  } catch {
    // Fallback also failed
  }

  throw new Error('Failed to fetch ZEC price from all sources')
}

export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    return createRateLimitResponse(readLimit)
  }

  const adminCheck = requireAdmin(request)
  if (!adminCheck.ok) {
    return adminCheck.response
  }

  try {
    // Return cached if still fresh
    if (priceCache && Date.now() - priceCache.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json({
        zecUsd: priceCache.zecUsd,
        updatedAt: priceCache.updatedAt,
        cached: true,
      })
    }

    const zecUsd = await fetchZecPrice()
    const now = new Date()

    priceCache = {
      zecUsd,
      updatedAt: now.toISOString(),
      fetchedAt: Date.now(),
    }

    return NextResponse.json({
      zecUsd,
      updatedAt: now.toISOString(),
      cached: false,
    })
  } catch (error) {
    // If we have stale cache, return it with a warning
    if (priceCache) {
      return NextResponse.json({
        zecUsd: priceCache.zecUsd,
        updatedAt: priceCache.updatedAt,
        cached: true,
        stale: true,
      })
    }

    console.error('ZEC price fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ZEC price.' },
      { status: 502 }
    )
  }
}
