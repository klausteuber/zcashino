/**
 * ZEC/USD price history service.
 * Captures daily snapshots and provides historical lookups for USD-adjusted analytics.
 */

import prisma from '@/lib/db'

/** Fetch today's ZEC price from CoinGecko (primary) or CoinCap (fallback). */
async function fetchCurrentZecPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const data = await res.json()
      if (data?.zcash?.usd) return data.zcash.usd
    }
  } catch { /* fallback */ }

  const res = await fetch(
    'https://api.coincap.io/v2/assets/zcash',
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
  )
  if (res.ok) {
    const data = await res.json()
    if (data?.data?.priceUsd) return parseFloat(data.data.priceUsd)
  }

  throw new Error('Failed to fetch ZEC price from all sources')
}

/** Capture today's price snapshot. Upserts so it's safe to call multiple times. */
export async function captureDaily(): Promise<{ date: string; priceUsd: number }> {
  const today = new Date().toISOString().slice(0, 10)

  // Check if we already have today's snapshot
  const existing = await prisma.zecPriceSnapshot.findUnique({ where: { date: today } })
  if (existing) return { date: existing.date, priceUsd: existing.priceUsd }

  const priceUsd = await fetchCurrentZecPrice()

  await prisma.zecPriceSnapshot.upsert({
    where: { date: today },
    create: { date: today, priceUsd, source: 'coingecko' },
    update: { priceUsd, source: 'coingecko' },
  })

  return { date: today, priceUsd }
}

/** Get price snapshots for a date range, keyed by YYYY-MM-DD. */
export async function getHistoricalPrices(
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const snapshots = await prisma.zecPriceSnapshot.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
  })

  const map = new Map<string, number>()
  for (const s of snapshots) {
    map.set(s.date, s.priceUsd)
  }
  return map
}

/**
 * Backfill historical prices from CoinGecko's market chart API.
 * Fetches daily data for the specified number of days.
 */
export async function backfillPrices(days: number = 90): Promise<number> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/zcash/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) }
  )

  if (!res.ok) throw new Error(`CoinGecko market_chart returned ${res.status}`)
  const data = await res.json()

  if (!data?.prices || !Array.isArray(data.prices)) {
    throw new Error('Unexpected CoinGecko response format')
  }

  let inserted = 0
  for (const [timestamp, price] of data.prices as [number, number][]) {
    const date = new Date(timestamp).toISOString().slice(0, 10)
    try {
      await prisma.zecPriceSnapshot.upsert({
        where: { date },
        create: { date, priceUsd: price, source: 'coingecko_backfill' },
        update: {}, // Don't overwrite existing snapshots
      })
      inserted++
    } catch {
      // Ignore conflicts
    }
  }

  return inserted
}

/** Get price for a specific date, with fallback to nearest available. */
export async function getPriceForDate(date: string): Promise<number | null> {
  const exact = await prisma.zecPriceSnapshot.findUnique({ where: { date } })
  if (exact) return exact.priceUsd

  // Try to find the nearest date within 3 days
  const nearby = await prisma.zecPriceSnapshot.findFirst({
    where: { date: { gte: date } },
    orderBy: { date: 'asc' },
  })
  if (nearby) return nearby.priceUsd

  const before = await prisma.zecPriceSnapshot.findFirst({
    where: { date: { lte: date } },
    orderBy: { date: 'desc' },
  })
  return before?.priceUsd ?? null
}
