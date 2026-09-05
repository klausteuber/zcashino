'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface VeilstoneSeat {
  id: string
  sessionId: string
  seatIndex: number
  status: string
  displayName: string | null
  isBot: boolean
}

interface VeilstoneTable {
  id: string
  status: string
  buyInZats: string
  seats: VeilstoneSeat[]
  match?: { id: string; status: string } | null
  createdAt: string
}

interface SessionPayload {
  id: string
  isDemo: boolean
}

const quickStartSteps = [
  {
    title: 'Create or join a table',
    body: 'A Veilstone match has four houses. For solo testing, create a table and fill the other seats with AI Houses.',
  },
  {
    title: 'Choose your capital split',
    body: 'Public Treasury earns Trust and makes your moves legible. Shielded Vault hides liquidity for surprise bids.',
  },
  {
    title: 'Play four epochs',
    body: 'Produce resources, trade publicly, bid for contracts, build infrastructure, and survive crises.',
  },
  {
    title: 'Win final payout',
    body: 'Final payout combines your zatoshis, resource value, and Civic Dividend rewards from Trust and Prestige.',
  },
]

const firstMatchTips = [
  'Use public actions when you want Trust, Prestige, and visible credibility.',
  'Use shielded bids when you want suspense, bluffing, or hidden liquidity.',
  'Data is your privacy and forecasting fuel, so it is usually worth protecting.',
]

export default function VeilstoneLobbyClient({ playtestMode = false }: { playtestMode?: boolean }) {
  const router = useRouter()
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [tables, setTables] = useState<VeilstoneTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadLobby() {
    const response = await fetch('/api/veilstone/lobby', { cache: 'no-store' })
    const payload = await response.json()
    setTables(payload.tables ?? [])
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const sessionResponse = await fetch('/api/session', { cache: 'no-store' })
        const sessionPayload = await sessionResponse.json()
        if (!sessionResponse.ok) throw new Error(sessionPayload.error || 'Unable to start session')
        if (!mounted) return
        setSession(sessionPayload)
        await loadLobby()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load lobby')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  async function createTable() {
    if (!session) return
    setError(null)
    const response = await fetch('/api/veilstone/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setError(payload.error || 'Unable to create table')
      return
    }
    router.push(`/veilstone/table/${payload.table.id}${playtestMode ? '?playtest=1' : ''}`)
  }

  if (loading) {
    return <div className="p-8 text-text-secondary">Loading frontier tables...</div>
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-sm uppercase text-accent-primary">Veilstone Lobby</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-accent-secondary md:text-5xl">
            Choose a Frontier Table
          </h1>
          <p className="mt-3 max-w-2xl text-text-secondary">
            Play-ZEC tables use fake zatoshi balances, deterministic engine events, and delayed shielded reveals.
          </p>
        </div>
        {playtestMode && (
          <div className="rounded-lg border border-accent-primary/30 bg-bg-elevated/70 px-4 py-3 font-mono text-xs uppercase text-accent-primary">
            Playtest mode
          </div>
        )}
        <button
          type="button"
          onClick={createTable}
          className="rounded-lg bg-accent-primary px-5 py-3 font-bold text-bg-base transition hover:bg-accent-secondary"
        >
          Create Table
        </button>
      </div>

      <section className="mb-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-2xl text-accent-secondary">How to start your first table</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {quickStartSteps.map((step, index) => (
              <div key={step.title} className="rounded-lg bg-bg-elevated/65 p-4">
                <div className="font-mono text-xs uppercase text-accent-primary">Step {index + 1}</div>
                <div className="mt-2 font-semibold text-accent-secondary">{step.title}</div>
                <p className="mt-1 text-sm leading-6 text-text-secondary">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-2xl text-accent-secondary">First-match objective</div>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Finish with the strongest city-state economy. You are balancing visible market trust against private
            shielded moves. Losing is fine for playtests; the real question is whether you want another match.
          </p>
          <div className="mt-4 space-y-3">
            {firstMatchTips.map((tip) => (
              <div key={tip} className="rounded-lg border border-accent-primary/15 bg-bg-elevated/45 p-3 text-sm text-text-secondary">
                {tip}
              </div>
            ))}
          </div>
          {playtestMode && (
            <div className="mt-4 rounded-lg border border-accent-primary/25 bg-bg-elevated/70 p-3 text-sm text-accent-primary">
              Prototype note: AI Houses fill seats for browser testing. The stronger autonomous bot brains run in
              the Monte Carlo simulation reports.
            </div>
          )}
        </aside>
      </section>

      {error && (
        <div className="mb-5 rounded-lg border border-color-error/40 bg-color-error/10 p-4 text-color-error">
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {tables.length === 0 ? (
          <div className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-8 text-text-secondary">
            No open tables yet. Create the first one.
          </div>
        ) : tables.map((table) => (
          <div key={table.id} className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="font-display text-2xl text-accent-secondary">
                  Table {table.id.slice(0, 8)}
                </div>
                <div className="mt-1 text-sm text-text-secondary">
                  {table.seats.length}/4 seats · {table.status} · buy-in {table.buyInZats} zats
                </div>
              </div>
              <Link
                href={`${table.match ? `/veilstone/match/${table.match.id}` : `/veilstone/table/${table.id}`}${playtestMode ? '?playtest=1' : ''}`}
                className="rounded-lg border border-accent-primary/45 px-4 py-2 text-center font-semibold text-accent-secondary transition hover:bg-accent-primary/10"
              >
                {table.match ? 'Open Match' : 'Join Table'}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
