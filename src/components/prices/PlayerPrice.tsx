'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { formatUsd, PRICE_FRESH_MS, quoteAge, usableQuote, type ZecQuote } from '@/lib/prices/zec-usd'

const PriceContext = createContext<{ quote: ZecQuote | null; loading: boolean }>({ quote: null, loading: true })
export function PlayerPriceProvider({ children }: { children: ReactNode }) {
  const [quote, setQuote] = useState<ZecQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(0)
  useEffect(() => {
    let disposed = false
    let pending = false
    const controller = new AbortController()
    async function refresh() {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      try {
        const response = await fetch('/api/price', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) })
        if (!response.ok) throw new Error('Unavailable')
        const next = await response.json()
        if (!next || next.source !== 'Coinbase' || typeof next.updatedAt !== 'string' || typeof next.stale !== 'boolean' || !usableQuote(next)) throw new Error('Invalid quote')
        if (!disposed) setQuote(next)
      } catch {
        if (!disposed) setQuote(previous => previous ? { ...previous, stale: true } : null)
      } finally {
        pending = false
        if (!disposed) { setLoading(false); setNow(Date.now()) }
      }
    }
    void refresh()
    const poll = setInterval(() => { void refresh() }, 60_000)
    const clock = setInterval(() => setNow(Date.now()), 15_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { disposed = true; controller.abort(); clearInterval(poll); clearInterval(clock); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const valid = quote && usableQuote(quote, now || Date.now()) ? { ...quote, stale: quote.stale || quoteAge(quote, now || Date.now()) >= PRICE_FRESH_MS } : null
  return <PriceContext.Provider value={{ quote: valid, loading }}>{children}</PriceContext.Provider>
}

export function UsdEstimate({ zats, endZats, className }: { zats: number | null; endZats?: number; className?: string }) {
  const { quote } = useContext(PriceContext)
  if (!quote || zats === null || !Number.isSafeInteger(zats) || zats < 0) return null
  return <span className={className}>≈ {formatUsd(zats, quote.zecUsd)}{endZats !== undefined ? `–${formatUsd(endZats, quote.zecUsd)}` : ''} USD{quote.stale ? ' (last known price)' : ''}</span>
}

export function PriceReference({ className }: { className?: string }) {
  const { quote, loading } = useContext(PriceContext)
  return <p className={className}>{quote ? <>
    1 ZEC ≈ {formatUsd(100_000_000, quote.zecUsd)} USD · {quote.stale ? 'Last known price' : 'Price checked'} {new Date(quote.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · Coinbase.
    {' '}Dollar values are estimates. Buy-ins and payouts use ZEC.
  </> : loading ? 'Loading ZEC/USD price…' : 'USD estimate unavailable. Buy-ins and payouts use ZEC.'}</p>
}
