'use client'

import { useEffect, useState } from 'react'

interface ReplayPayload {
  matchId: string
  stateVersion: string
  finalHash: string | null
  replay: {
    players: Record<string, { displayName: string; payoutZats?: string; shieldedZats?: string | null; trust: number; prestige: number }>
    commitments: Array<{ id: string; commitmentHash: string; reveal?: { amountZats: string; dataSpent: number } }>
    crises: Array<{ epoch: number; type: string; description: string }>
  }
  events: Array<{ eventId: string; type: string; stateVersion: string; payload: Record<string, unknown> }>
}

export default function VeilstoneReplayClient({
  matchId,
  playtestMode = false,
}: {
  matchId: string
  playtestMode?: boolean
}) {
  const [replay, setReplay] = useState<ReplayPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/veilstone/replay/${matchId}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Unable to load replay')
        setReplay(payload)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load replay')
      }
    }
    load()
  }, [matchId])

  useEffect(() => {
    if (!playtestMode || !replay) return
    const currentReplay = replay
    async function logReplayOpen() {
      const sessionResponse = await fetch('/api/session', { cache: 'no-store' })
      const session = await sessionResponse.json()
      if (!sessionResponse.ok || !session.id) return
      await fetch('/api/veilstone/playtest/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          sessionId: session.id,
          eventName: 'replay_opened',
          phase: 'MATCH_COMPLETE',
          stateVersion: currentReplay.stateVersion,
        }),
      }).catch(() => undefined)
    }
    logReplayOpen().catch(() => undefined)
  }, [matchId, playtestMode, replay])

  if (!replay) return <div className="p-8 text-text-secondary">{error || 'Loading replay...'}</div>

  return (
    <div className="container mx-auto px-4 py-10">
      <p className="font-mono text-sm uppercase text-accent-primary">Delayed Reveal Replay</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-accent-secondary">Match {matchId.slice(0, 8)}</h1>
      <p className="mt-3 break-all text-sm text-text-secondary">Final hash: {replay.finalHash ?? 'pending'}</p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-2xl text-accent-secondary">Final Payouts</div>
          <div className="mt-4 space-y-3">
            {Object.entries(replay.replay.players).map(([sessionId, player]) => (
              <div key={sessionId} className="rounded-lg bg-bg-elevated/65 p-3">
                <div className="font-semibold text-accent-secondary">{player.displayName}</div>
                <div className="text-sm text-text-secondary">
                  Trust {player.trust} · Prestige {player.prestige} · Payout {player.payoutZats ?? '0'}
                </div>
                <div className="text-xs text-text-muted">Shielded final: {player.shieldedZats ?? 'hidden'}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-2xl text-accent-secondary">Shielded Reveals</div>
          <div className="mt-4 space-y-3">
            {replay.replay.commitments.length === 0 ? (
              <div className="text-text-secondary">No shielded commitments were made.</div>
            ) : replay.replay.commitments.map((commitment) => (
              <div key={commitment.id} className="rounded-lg bg-bg-elevated/65 p-3">
                <div className="break-all font-mono text-xs text-accent-primary">{commitment.commitmentHash}</div>
                <div className="mt-2 text-sm text-text-secondary">
                  Revealed amount {commitment.reveal?.amountZats ?? 'unrevealed'} · Data {commitment.reveal?.dataSpent ?? 0}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
        <div className="font-display text-2xl text-accent-secondary">Event Hash Chain</div>
        <div className="mt-4 max-h-[520px] space-y-2 overflow-auto text-sm text-text-secondary">
          {replay.events.map((event) => (
            <div key={event.eventId} className="rounded bg-bg-elevated/60 p-3">
              <span className="font-mono text-accent-primary">v{event.stateVersion}</span> {event.type}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
