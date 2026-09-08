'use client'
import { useCallback, useEffect, useState } from 'react'
type Total = { rakeZats: string; rakedHands: number }
function zec(zats: string) {
  const value = BigInt(zats)
  return `${value / 100_000_000n}.${(value % 100_000_000n).toString().padStart(8, '0')}`
}
export default function PokerRevenue() {
  const [data, setData] = useState<{ allTime: Total; last24h: Total } | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/poker/revenue', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to load revenue.')
      setData(body)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load revenue.') }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  return <section className="border border-masque-gold/30 rounded p-4 space-y-3">
    <h2 className="text-xl">Poker rake revenue</h2>
    <p className="text-sm">Real ZEC collected from completed hands. Practice tables are excluded. Revenue is before operating expenses.</p>
    {data && <dl className="flex flex-wrap gap-8">{([['All time', data.allTime], ['Last 24 hours', data.last24h]] as const).map(([label, total]) => <div key={label}><dt>{label}</dt><dd className="text-masque-gold">{zec(total.rakeZats)} ZEC</dd><dd className="text-sm">{total.rakedHands} raked hands</dd></div>)}</dl>}
    {error && <p role="alert">{error}</p>}
    <button className="text-masque-gold underline" disabled={busy} onClick={() => void load()}>{busy ? 'Loading revenue…' : 'Refresh revenue'}</button>
  </section>
}
