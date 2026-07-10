'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface Seat {
  id: string
  sessionId: string
  seatIndex: number
  status: string
  houseId: string | null
  displayName: string | null
  isBot: boolean
  publicStartZats: string | null
}

interface TablePayload {
  id: string
  status: string
  seats: Seat[]
  match?: { id: string; status: string } | null
}

interface SessionPayload {
  id: string
}

const houses = [
  'glass-ledger-republic',
  'open-freeport',
  'shielded-sanctuary',
  'data-compact',
]

const setupSteps = [
  'Join one open seat as Your House.',
  'Fill the remaining seats with AI Houses for solo testing.',
  'Pick how much working capital starts public.',
  'Press Ready to launch the match.',
]

export default function VeilstoneTableClient({
  tableId,
  playtestMode = false,
}: {
  tableId: string
  playtestMode?: boolean
}) {
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [table, setTable] = useState<TablePayload | null>(null)
  const [publicStartZats, setPublicStartZats] = useState('35000000')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const ownSeat = useMemo(
    () => table?.seats.find((seat) => seat.sessionId === session?.id),
    [table, session]
  )
  const openSeatIndexes = useMemo(
    () => [0, 1, 2, 3].filter((index) => !table?.seats.some((seat) => seat.seatIndex === index)),
    [table]
  )
  const openSeatCount = openSeatIndexes.length
  const readySeatCount = table?.seats.filter((seat) => seat.status === 'ready').length ?? 0
  const botSeatCount = table?.seats.filter((seat) => seat.isBot).length ?? 0

  const loadTable = useCallback(async () => {
    const response = await fetch(`/api/veilstone/tables/${tableId}`, { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Unable to load table')
    setTable(payload.table)
  }, [tableId])

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const sessionResponse = await fetch('/api/session', { cache: 'no-store' })
        const sessionPayload = await sessionResponse.json()
        if (!sessionResponse.ok) throw new Error(sessionPayload.error || 'Unable to start session')
        if (!mounted) return
        setSession(sessionPayload)
        await loadTable()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load table')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [loadTable])

  async function mutate(path: string, body: Record<string, unknown>) {
    setError(null)
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json()
    if (!response.ok) {
      setError(payload.error || 'Veilstone action failed')
      return payload
    }
    if (payload.table) setTable(payload.table)
    if (payload.table?.match) window.location.href = `/veilstone/match/${payload.table.match.id}${playtestMode ? '?playtest=1' : ''}`
    if (payload.match) window.location.href = `/veilstone/match/${payload.match.id}${playtestMode ? '?playtest=1' : ''}`
    return payload
  }

  async function joinTable() {
    if (!session || !table) return
    const openSeat = openSeatIndexes[0]
    await mutate(`/api/veilstone/tables/${tableId}/seat`, {
      sessionId: session.id,
      seatIndex: openSeat,
      houseId: houses[openSeat ?? 0],
      displayName: 'Your House',
    })
    await loadTable()
  }

  async function fillBotSeat() {
    if (!table) return
    const openSeat = openSeatIndexes[0]
    if (openSeat === undefined) return
    await mutate(`/api/veilstone/tables/${tableId}/seat`, {
      asBot: true,
      seatIndex: openSeat,
      houseId: houses[openSeat],
      displayName: `AI House ${openSeat + 1}`,
    })
    await loadTable()
  }

  async function ready() {
    if (!session) return
    await mutate(`/api/veilstone/tables/${tableId}/ready`, {
      sessionId: session.id,
      publicStartZats,
      houseId: ownSeat?.houseId ?? houses[0],
    })
  }

  if (loading) return <div className="p-8 text-text-secondary">Loading table...</div>
  if (!table) return <div className="p-8 text-color-error">{error || 'Table not found'}</div>

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-sm uppercase text-accent-primary">Table {table.id.slice(0, 8)}</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-accent-secondary">
            Seat Houses and Split Capital
          </h1>
          <p className="mt-3 max-w-2xl text-text-secondary">
            Public Treasury must start between 28,000,000 and 49,000,000 zatoshis.
            The remainder enters your Shielded Vault.
          </p>
        </div>
        {playtestMode && (
          <div className="rounded-lg border border-accent-primary/30 bg-bg-elevated/70 px-4 py-3 font-mono text-xs uppercase text-accent-primary">
            Playtest table {table.id.slice(0, 8)}
          </div>
        )}
        {table.match && (
          <Link
            href={`/veilstone/match/${table.match.id}${playtestMode ? '?playtest=1' : ''}`}
            className="rounded-lg bg-accent-primary px-5 py-3 text-center font-bold text-bg-base"
          >
            Open Match
          </Link>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg border border-color-error/40 bg-color-error/10 p-4 text-color-error">{error}</div>}

      <section className="mb-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-2xl text-accent-secondary">Setup checklist</div>
          <div className="mt-4 space-y-3">
            {setupSteps.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-lg bg-bg-elevated/60 p-3 text-sm text-text-secondary">
                <span className="font-mono text-accent-primary">{index + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-accent-primary/20 bg-bg-elevated/50 p-3 text-sm text-text-secondary">
            {table.status === 'waiting'
              ? `${table.seats.length}/4 seats filled, ${readySeatCount}/4 ready, ${botSeatCount} AI Houses seated.`
              : `Table status: ${table.status}.`}
          </div>
        </div>

        <div className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-2xl text-accent-secondary">Your first strategic choice</div>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Every player starts with 70,000,000 working zatoshis. Choose how much is public now; the rest goes into
            your Shielded Vault.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-bg-elevated/60 p-4">
              <div className="font-semibold text-accent-secondary">Public Treasury</div>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Visible capital. Better for Trust, public contracts, and market credibility.
              </p>
            </div>
            <div className="rounded-lg bg-bg-elevated/60 p-4">
              <div className="font-semibold text-accent-secondary">Shielded Vault</div>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Hidden capital. Better for sealed bids, surprise liquidity, and bluffing.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((seatIndex) => {
          const seat = table.seats.find((entry) => entry.seatIndex === seatIndex)
          return (
            <div key={seatIndex} className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
              <div className="font-display text-xl text-accent-secondary">Seat {seatIndex + 1}</div>
              {seat ? (
                <div className="mt-3 space-y-2 text-sm text-text-secondary">
                  <div>{seat.displayName ?? seat.sessionId}</div>
                  <div>{seat.isBot ? 'Bot House' : 'Player House'}</div>
                  <div className="text-accent-primary">{seat.status}</div>
                  <div>Public: {seat.publicStartZats ?? '35000000'}</div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-text-muted">Open frontier seat</div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-8 grid gap-4 rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5 md:grid-cols-[1fr_auto] md:items-end">
        <label className="block">
          <span className="font-display text-xl text-accent-secondary">Your Public Treasury</span>
          <input
            type="range"
            min="28000000"
            max="49000000"
            step="1000000"
            value={publicStartZats}
            onChange={(event) => setPublicStartZats(event.target.value)}
            className="mt-4 w-full accent-[var(--accent-primary)]"
          />
          <span className="mt-2 block text-sm text-text-secondary">
            Public {publicStartZats} · Shielded {(70000000 - Number(publicStartZats)).toString()}
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          {!ownSeat && (
            <button type="button" onClick={joinTable} className="rounded-lg bg-accent-primary px-5 py-3 font-bold text-bg-base">
              Join Table
            </button>
          )}
          <button
            type="button"
            onClick={fillBotSeat}
            disabled={openSeatCount === 0}
            className="rounded-lg border border-accent-primary/40 px-5 py-3 font-bold text-accent-secondary disabled:cursor-not-allowed disabled:opacity-45"
          >
            {openSeatCount === 0 ? 'All Seats Filled' : 'Fill AI Seat'}
          </button>
          {ownSeat && ownSeat.status !== 'ready' && (
            <button type="button" onClick={ready} className="rounded-lg bg-accent-primary px-5 py-3 font-bold text-bg-base">
              Ready
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
