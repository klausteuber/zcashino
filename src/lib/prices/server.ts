import { type ZecQuote, usableQuote, quoteAge, PRICE_FRESH_MS } from './zec-usd'

// One upstream request per minute per app process, including during outages.
// This is a display quote only; it must never determine ledger amounts.
let cached: ZecQuote | null = null
let nextAttempt = 0
let inFlight: Promise<ZecQuote | null> | null = null
function current(): ZecQuote | null {
  return cached && usableQuote(cached) ? { ...cached, stale: cached.stale || quoteAge(cached) >= PRICE_FRESH_MS } : null
}
export async function getZecQuote(): Promise<ZecQuote | null> {
  if (inFlight) return inFlight
  if (Date.now() < nextAttempt) return current()
  nextAttempt = Date.now() + 60_000
  inFlight = (async () => {
    try {
      const response = await fetch('https://api.coinbase.com/v2/prices/ZEC-USD/spot', {
        headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(5_000),
      })
      if (!response.ok) throw new Error('Price provider unavailable')
      const { data } = await response.json()
      const price = typeof data?.amount === 'string' ? Number(data.amount) : NaN
      if (data?.base !== 'ZEC' || data?.currency !== 'USD' || !Number.isFinite(price) || price <= 0) throw new Error('Invalid price')
      cached = { zecUsd: price, source: 'Coinbase', updatedAt: new Date().toISOString(), stale: false }
    } catch {
      if (cached) cached = { ...cached, stale: true }
    }
    return current()
  })()
  try { return await inFlight } finally { inFlight = null }
}
