'use client'
import { useCallback, useEffect, useState } from 'react'
interface Signal { id: string; kind: string; identityId: string; otherId: string | null; createdAt: string }
interface Hand { id: string; variant: string; mode: string; handNumber: number; completedAt: string }
export default function PokerIntegrityPage() {
  const [signals, setSignals] = useState<Signal[]>([]), [hands, setHands] = useState<Hand[]>([])
  const [filter, setFilter] = useState(''), [identity, setIdentity] = useState(''), [cursor, setCursor] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<unknown>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async (next?: string) => {
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams({ ...(identity ? { identityId: identity } : {}), ...(next ? { cursor: next } : {}) })
      const res = await fetch(`/api/admin/poker/integrity?${params}`, { cache: 'no-store' }), body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Unable to load integrity records.')
      setSignals(s => next ? [...s, ...body.signals] : body.signals); setHands(body.hands); setCursor(body.nextCursor)
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection lost.') }
    finally { setBusy(false) }
  }, [identity])
  useEffect(() => { setEvidence(null); void load() }, [load])
  async function inspect(kind: 'signalId' | 'handId', id: string) {
    setBusy(true); setError(''); setEvidence(null)
    try {
      const res = await fetch(`/api/admin/poker/integrity?${new URLSearchParams({ [kind]: id })}`, { cache: 'no-store' }), body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Evidence unavailable.')
      setEvidence(body)
    } catch (e) { setError(e instanceof Error ? e.message : 'Evidence unavailable.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-6 text-bone-white">
    <h1 className="text-2xl font-display">Poker integrity</h1>
    <p className="text-sm text-venetian-gold/80">Indicators for human review. They do not establish cheating and never automatically ban a player or change a balance. Monitoring uses real-money hands; private histories expire after 30 days. Only completed hands are accessible here.</p>
    <form className="flex gap-3 flex-wrap" onSubmit={e => { e.preventDefault(); setIdentity(filter.trim()) }}><label>Filter by poker ID<input className="block bg-midnight-black border border-masque-gold/30 rounded p-2 mt-1" value={filter} onChange={e => setFilter(e.target.value)} /></label><button className="border border-masque-gold/40 rounded px-4" disabled={busy}>Filter</button><button type="button" disabled={busy} className="border border-masque-gold/40 rounded px-4" onClick={() => void load()}>Refresh</button></form>
    {error && <p role="alert" className="text-blood-ruby">{error}</p>}
    {!busy && signals.length === 0 && <p>No integrity indicators in this view. This does not certify that play is bot-free.</p>}
    <div className="space-y-3">{signals.map(s => <article key={s.id} className="border border-masque-gold/20 rounded p-4 space-y-2"><strong>{s.kind.replaceAll('-', ' ')}</strong><p className="text-xs break-all">{s.identityId}{s.otherId ? ` / ${s.otherId}` : ''} · {new Date(s.createdAt).toLocaleString()}</p><button disabled={busy} className="text-masque-gold underline" onClick={() => void inspect('signalId', s.id)}>Inspect evidence</button><button disabled={busy} className="text-masque-gold underline ml-4" onClick={() => { setFilter(s.identityId); setIdentity(s.identityId) }}>Player hands</button></article>)}</div>
    {cursor && <button disabled={busy} onClick={() => void load(cursor)}>Load more indicators</button>}
    {hands.length > 0 && <section><h2 className="text-xl mb-3">Recent completed hands</h2>{hands.map(h => <button key={h.id} disabled={busy} onClick={() => void inspect('handId', h.id)} className="block text-left text-masque-gold underline my-2">{h.variant} #{h.handNumber} · {h.mode} · {new Date(h.completedAt).toLocaleString()}</button>)}</section>}
    {busy && <p role="status">Loading…</p>}
    {evidence !== null && <section><h2 className="text-xl mb-3">Private evidence</h2><p className="text-sm mb-3">Check sample size, cards, position, connection effects and legitimate shared-device explanations. Time-bank use alone is never evidence of cheating. Monetary amounts below are integer zatoshis (100,000,000 = 1 ZEC).</p><pre className="p-4 bg-midnight-black border border-masque-gold/20 rounded text-xs whitespace-pre-wrap break-all max-h-[65vh] overflow-auto">{JSON.stringify(evidence, null, 2)}</pre></section>}
  </div>
}
