'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface Snapshot {
  matchId: string
  stateVersion: string
  epoch: number
  phase: string
  serverTime: string
  phaseEndsAt: string
  playerView: {
    tableId: string
    players: Record<string, {
      sessionId: string
      displayName: string
      seatIndex: number
      publicZats: string
      shieldedZats?: string | null
      lockedZats: string
      payoutZats?: string
      trust: number
      prestige: number
      resources: Record<string, number>
      builtStructures: string[]
    }>
    contracts: Array<{ id: string; type: string; publicStakeZats: string; shieldedStakeZats: string | null; status: string }>
    orders: Array<{ id: string; resource: string; side: string; quantity: number; priceZats: string }>
    commitments: Array<{ id: string; commitmentHash: string; playerSessionId: string }>
    crises: Array<{ epoch: number; type: string; description: string }>
    map: Array<{ id: string; resource: string; ownerSessionId?: string }>
    finalLedgerHash?: string
  }
}

interface SessionPayload {
  id: string
}

const feedbackQuestions = [
  ['understoodGoal', 'I understood what I was trying to accomplish.'],
  ['decisionsMattered', 'My decisions felt meaningful.'],
  ['understoodOutcome', 'I understood why I won or lost.'],
  ['shieldedFeltFair', 'Shielded actions felt exciting rather than unfair.'],
  ['trustPrestigeMattered', 'Trust and Prestige mattered.'],
  ['feltSkillful', 'The game felt skillful.'],
  ['wouldPlayAgain', 'I would play again.'],
] as const

const defaultFeedback = {
  understoodGoal: 5,
  decisionsMattered: 5,
  understoodOutcome: 5,
  shieldedFeltFair: 5,
  trustPrestigeMattered: 5,
  feltSkillful: 5,
  wouldPlayAgain: 5,
  mostExcitingMoment: '',
  mostConfusingMoment: '',
  oneThingToChange: '',
}

const GAMEPLAY_TOUR_STORAGE_KEY = 'veilstone_gameplay_tour_seen_v1'

function phaseLabel(phase: string) {
  return phase.replaceAll('_', ' ')
}

function phaseGuide(phase: string) {
  if (phase.includes('_FORECAST')) {
    return {
      title: 'Read the table',
      body: 'Look at public treasuries, open contracts, resources, and crises. This is the planning beat before actions begin.',
      recommended: 'Decide whether this epoch is about public credibility, hidden bids, or building resources.',
    }
  }
  if (phase.includes('_PRODUCTION')) {
    return {
      title: 'Produce resources',
      body: 'Produce adds Energy, Compute, Data, Materials, and Talent for your house once per epoch.',
      recommended: 'Start here in most epochs. Resources become final value and unlock better structure choices.',
    }
  }
  if (phase.includes('_MARKET')) {
    return {
      title: 'Make a public market move',
      body: 'Public orders show the table what you need or what you are willing to sell.',
      recommended: 'Use public orders when you want visible activity, Prestige, or a resource you are missing.',
    }
  }
  if (phase.includes('_CONTRACTS')) {
    return {
      title: 'Bid for contracts',
      body: 'Public bids are trusted and visible. Shielded bids spend Data to hide the amount until reveal.',
      recommended: 'Try one public contract and one shielded bid across your first match to feel the difference.',
    }
  }
  if (phase.includes('_BUILD')) {
    return {
      title: 'Build infrastructure',
      body: 'Structures convert Materials and Talent into long-term Trust, Prestige, and strategic identity.',
      recommended: 'Data Trust is a friendly first build because it reinforces the privacy and reputation loop.',
    }
  }
  if (phase.includes('_RESOLUTION')) {
    return {
      title: 'Resolve the epoch',
      body: 'The engine settles delayed effects, crises, and table state before the next epoch.',
      recommended: 'Check who gained Trust or Prestige, then advance when the table understands what changed.',
    }
  }
  if (phase === 'FINAL_RECKONING') {
    return {
      title: 'Finalize payouts',
      body: 'Final reckoning converts resources and reputation into the final Play-ZEC payout ledger.',
      recommended: 'Finalize the match, then inspect payouts and replay what swung the economy.',
    }
  }
  if (phase === 'MATCH_COMPLETE') {
    return {
      title: 'Review the result',
      body: 'The match is complete. Payouts, replay, and playtest feedback tell us whether the game made sense.',
      recommended: 'Open the replay and write down the most exciting and most confusing moments.',
    }
  }
  return {
    title: 'Get ready',
    body: 'The table is preparing the match state.',
    recommended: 'Advance when the table is ready.',
  }
}

function gameplayTourSteps(guide: ReturnType<typeof phaseGuide>) {
  return [
    {
      eyebrow: 'Goal',
      title: 'Win the strongest final economy',
      body: 'Your objective is the largest final payout after four epochs. Payout comes from zatoshis, resources, contracts, structures, Trust, and Prestige.',
      focus: 'Start by reading the How to win panel at the top of the match.',
    },
    {
      eyebrow: 'Turn rhythm',
      title: 'Each epoch has a job',
      body: 'A match moves through Forecast, Production, Market, Contracts, Build, and Resolution. The Current phase guide tells you what matters right now.',
      focus: `${guide.title}: ${guide.recommended}`,
    },
    {
      eyebrow: 'Private vs public',
      title: 'Choose what the table can see',
      body: 'Public Treasury actions build credibility and are easier to understand. Shielded Vault actions hide intent, create suspense, and usually spend Data.',
      focus: 'Watch your Treasury panel before deciding whether to play visibly or privately.',
    },
    {
      eyebrow: 'First actions',
      title: 'Use the matching action for the phase',
      body: 'Produce during Production, place public orders during Market, bid during Contracts, and build structures during Build. If an action fails, the phase probably does not allow it yet.',
      focus: 'The action buttons include a short line explaining when and why to use them.',
    },
    {
      eyebrow: 'Read opponents',
      title: 'Trust and Prestige are public pressure',
      body: 'The player cards show who is building reputation. High Trust should feel like access to better public opportunities; shielded play should feel like hidden leverage.',
      focus: 'Compare your Trust and Prestige against the AI Houses after each epoch.',
    },
    {
      eyebrow: 'Endgame',
      title: 'Final reckoning explains the story',
      body: 'When the match completes, review payouts, open the replay, and use the feedback form in playtest mode. The best test is whether losing players want another match.',
      focus: 'After Final Reckoning, use View Replay to inspect what changed the outcome.',
    },
  ]
}

export default function VeilstoneMatchClient({
  matchId,
  playtestMode = false,
}: {
  matchId: string
  playtestMode?: boolean
}) {
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState(defaultFeedback)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourStepIndex, setTourStepIndex] = useState(0)
  const lastEventIdRef = useRef<string | null>(null)
  const openedPlaytestRef = useRef(false)
  const openedFeedbackRef = useRef(false)
  const firstMeaningfulActionRef = useRef(false)
  const autoOpenedTourRef = useRef(false)
  const lastPhaseRef = useRef<string | null>(null)
  const phaseStartedAtRef = useRef<number>(Date.now())

  const ownPlayer = useMemo(() => {
    if (!session || !snapshot) return null
    return snapshot.playerView.players[session.id] ?? null
  }, [session, snapshot])

  const loadSnapshot = useCallback(async (sessionId?: string) => {
    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
    const response = await fetch(`/api/veilstone/matches/${matchId}/snapshot${query}`, { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Unable to load match')
    setSnapshot(payload)
  }, [matchId])

  const playtestQuery = playtestMode ? '?playtest=1' : ''

  const logPlaytestEvent = useCallback(async (
    eventName: string,
    metadata: Record<string, unknown> = {}
  ) => {
    if (!playtestMode || !session || !snapshot) return
    await fetch('/api/veilstone/playtest/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId,
        sessionId: session.id,
        seatIndex: ownPlayer?.seatIndex,
        eventName,
        phase: snapshot.phase,
        stateVersion: snapshot.stateVersion,
        metadata,
      }),
    }).catch(() => undefined)
  }, [matchId, ownPlayer?.seatIndex, playtestMode, session, snapshot])

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const sessionResponse = await fetch('/api/session', { cache: 'no-store' })
        const sessionPayload = await sessionResponse.json()
        if (!sessionResponse.ok) throw new Error(sessionPayload.error || 'Unable to start session')
        if (!mounted) return
        setSession(sessionPayload)
        await loadSnapshot(sessionPayload.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load match')
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [loadSnapshot])

  useEffect(() => {
    if (!session) return
    let closed = false
    let events: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const openStream = () => {
      if (closed) return
      const query = lastEventIdRef.current
        ? `?afterEventId=${encodeURIComponent(lastEventIdRef.current)}`
        : ''
      events = new EventSource(`/api/veilstone/matches/${matchId}/events${query}`)

      events.addEventListener('veilstone-event', (event) => {
        const message = event as MessageEvent<string>
        try {
          const payload = JSON.parse(message.data) as { eventId?: string }
          lastEventIdRef.current = payload.eventId ?? message.lastEventId ?? lastEventIdRef.current
        } catch {
          lastEventIdRef.current = message.lastEventId || lastEventIdRef.current
        }
        loadSnapshot(session.id).catch(() => undefined)
      })

      events.onerror = () => {
        events?.close()
        if (closed || reconnectTimer) return
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          openStream()
        }, 1500)
      }
    }

    openStream()
    const snapshotFallback = setInterval(() => {
      loadSnapshot(session.id).catch(() => undefined)
    }, 5000)

    return () => {
      closed = true
      events?.close()
      clearInterval(snapshotFallback)
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [loadSnapshot, matchId, session])

  useEffect(() => {
    if (!playtestMode || !session || !snapshot || openedPlaytestRef.current) return
    openedPlaytestRef.current = true
    lastPhaseRef.current = snapshot.phase
    phaseStartedAtRef.current = Date.now()
    logPlaytestEvent('playtest_mode_opened', {
      tableId: snapshot.playerView.tableId,
      matchId,
    }).catch(() => undefined)
  }, [logPlaytestEvent, matchId, playtestMode, session, snapshot])

  useEffect(() => {
    if (!playtestMode || !session || !snapshot) return
    const previousPhase = lastPhaseRef.current
    if (!previousPhase) {
      lastPhaseRef.current = snapshot.phase
      phaseStartedAtRef.current = Date.now()
      return
    }
    if (previousPhase === snapshot.phase) return
    const now = Date.now()
    logPlaytestEvent('phase_changed', {
      fromPhase: previousPhase,
      toPhase: snapshot.phase,
      dwellMs: now - phaseStartedAtRef.current,
    }).catch(() => undefined)
    lastPhaseRef.current = snapshot.phase
    phaseStartedAtRef.current = now
  }, [logPlaytestEvent, playtestMode, session, snapshot])

  useEffect(() => {
    if (!playtestMode || !session || snapshot?.phase !== 'MATCH_COMPLETE' || openedFeedbackRef.current) return
    openedFeedbackRef.current = true
    logPlaytestEvent('feedback_opened').catch(() => undefined)
  }, [logPlaytestEvent, playtestMode, session, snapshot?.phase])

  useEffect(() => {
    if (!snapshot || autoOpenedTourRef.current) return
    autoOpenedTourRef.current = true
    if (localStorage.getItem(GAMEPLAY_TOUR_STORAGE_KEY) === 'true') return
    setTourStepIndex(0)
    setTourOpen(true)
  }, [snapshot])

  useEffect(() => {
    if (!tourOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      localStorage.setItem(GAMEPLAY_TOUR_STORAGE_KEY, 'true')
      setTourOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tourOpen])

  async function submit(action: Record<string, unknown>) {
    if (!session || !snapshot) return
    setError(null)
    const actionType = typeof action.type === 'string' ? action.type : 'UNKNOWN'
    await logPlaytestEvent('action_submitted', { actionType })
    const response = await fetch(`/api/veilstone/matches/${matchId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientActionId: crypto.randomUUID(),
        matchId,
        sessionId: session.id,
        expectedStateVersion: snapshot.stateVersion,
        action,
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setError(payload.error || 'Action failed')
      await logPlaytestEvent('action_failed', { actionType, error: payload.error || 'Action failed' })
      await logPlaytestEvent('invalid_action_attempted', { actionType, error: payload.error || 'Action failed' })
      await loadSnapshot(session.id).catch(() => undefined)
      return
    }
    await logPlaytestEvent('action_succeeded', { actionType })
    if (!firstMeaningfulActionRef.current && actionType !== 'ADVANCE_PHASE' && actionType !== 'FINALIZE_MATCH') {
      firstMeaningfulActionRef.current = true
      await logPlaytestEvent('first_meaningful_action', { actionType })
    }
    setSnapshot(payload.snapshot)
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !snapshot || !ownPlayer) return
    setFeedbackError(null)
    const response = await fetch('/api/veilstone/playtest/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId,
        sessionId: session.id,
        seatIndex: ownPlayer.seatIndex,
        ...feedback,
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setFeedbackError(payload.error || 'Feedback failed')
      return
    }
    setFeedbackSubmitted(true)
    await logPlaytestEvent('feedback_submitted')
  }

  function openTour() {
    setTourStepIndex(0)
    setTourOpen(true)
  }

  function closeTour() {
    localStorage.setItem(GAMEPLAY_TOUR_STORAGE_KEY, 'true')
    setTourOpen(false)
  }

  if (!snapshot) {
    return <div className="p-8 text-text-secondary">{error || 'Loading match...'}</div>
  }

  const contract = snapshot.playerView.contracts[0]
  const isComplete = snapshot.phase === 'MATCH_COMPLETE'
  const guide = phaseGuide(snapshot.phase)
  const tourSteps = gameplayTourSteps(guide)
  const tourStep = tourSteps[tourStepIndex] ?? tourSteps[0]
  const isLastTourStep = tourStepIndex === tourSteps.length - 1

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-sm uppercase text-accent-primary">Epoch {snapshot.epoch}</p>
          <h1 className="font-display text-4xl font-bold text-accent-secondary">
            {phaseLabel(snapshot.phase)}
          </h1>
          <p className="mt-2 text-text-secondary">State version {snapshot.stateVersion}</p>
          {playtestMode && (
            <div className="mt-4 grid gap-2 rounded-lg border border-accent-primary/25 bg-bg-elevated/65 p-3 font-mono text-xs uppercase text-accent-primary sm:grid-cols-4">
              <div>Table {snapshot.playerView.tableId.slice(0, 8)}</div>
              <div>Match {matchId.slice(0, 8)}</div>
              <div>Seat {ownPlayer ? ownPlayer.seatIndex + 1 : 'spectator'}</div>
              <div>v{snapshot.stateVersion}</div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openTour}
            className="rounded-lg border border-accent-primary/40 px-4 py-2 font-bold text-accent-secondary"
          >
            Gameplay Tour
          </button>
          {!isComplete && (
            <button
              type="button"
              onClick={() => submit({ type: snapshot.phase === 'FINAL_RECKONING' ? 'FINALIZE_MATCH' : 'ADVANCE_PHASE', payload: {} })}
              className="rounded-lg bg-accent-primary px-4 py-2 font-bold text-bg-base"
            >
              {snapshot.phase === 'FINAL_RECKONING' ? 'Finalize Payouts' : 'Advance Phase'}
            </button>
          )}
          {isComplete && (
            <Link
              href={`/veilstone/replay/${matchId}${playtestQuery}`}
              onClick={() => logPlaytestEvent('replay_opened').catch(() => undefined)}
              className="rounded-lg bg-accent-primary px-4 py-2 font-bold text-bg-base"
            >
              View Replay
            </Link>
          )}
          {isComplete && playtestMode && (
            <Link
              href="/veilstone/lobby?playtest=1"
              onClick={() => logPlaytestEvent('rematch_clicked').catch(() => undefined)}
              className="rounded-lg border border-accent-primary/40 px-4 py-2 font-bold text-accent-secondary"
            >
              Rematch
            </Link>
          )}
        </div>
      </div>

      {tourOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="veilstone-tour-title"
            className="w-full max-w-xl overflow-hidden rounded-lg border border-accent-primary/35 bg-bg-base shadow-2xl"
          >
            <div className="border-b border-accent-primary/20 bg-bg-surface/80 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-xs uppercase text-accent-primary">
                    Gameplay tour {tourStepIndex + 1}/{tourSteps.length}
                  </div>
                  <h2 id="veilstone-tour-title" className="mt-2 font-display text-3xl text-accent-secondary">
                    {tourStep.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeTour}
                  aria-label="Close gameplay tour"
                  className="rounded-lg border border-accent-primary/30 px-3 py-2 font-mono text-sm text-text-secondary"
                >
                  X
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="font-mono text-xs uppercase text-accent-primary">{tourStep.eyebrow}</div>
              <p className="mt-3 text-base leading-7 text-text-secondary">{tourStep.body}</p>
              <div className="mt-5 rounded-lg border border-accent-primary/25 bg-bg-elevated/65 p-4 text-sm leading-6 text-accent-secondary">
                Look at: {tourStep.focus}
              </div>
              <div className="mt-5 flex gap-2" aria-hidden="true">
                {tourSteps.map((step, index) => (
                  <div
                    key={step.title}
                    className={`h-1.5 flex-1 rounded-full ${index <= tourStepIndex ? 'bg-accent-primary' : 'bg-accent-primary/20'}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-accent-primary/20 bg-bg-surface/70 px-5 py-4">
              <button
                type="button"
                onClick={closeTour}
                className="rounded-lg border border-accent-primary/30 px-4 py-2 font-semibold text-text-secondary"
              >
                Skip
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTourStepIndex((current) => Math.max(0, current - 1))}
                  disabled={tourStepIndex === 0}
                  className="rounded-lg border border-accent-primary/30 px-4 py-2 font-semibold text-accent-secondary disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isLastTourStep) {
                      closeTour()
                      return
                    }
                    setTourStepIndex((current) => Math.min(tourSteps.length - 1, current + 1))
                  }}
                  className="rounded-lg bg-accent-primary px-5 py-2 font-bold text-bg-base"
                >
                  {isLastTourStep ? 'Finish Tour' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg border border-color-error/40 bg-color-error/10 p-4 text-color-error">{error}</div>}

      <section className="mb-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-2xl text-accent-secondary">How to win</div>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            End the match with the largest final payout. Your payout comes from remaining zatoshis, resource value,
            contracts, structures, and the Civic Dividend paid through Trust and Prestige.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-bg-elevated/60 p-3 text-sm text-text-secondary">
              Public moves build credibility and are easier for opponents to read.
            </div>
            <div className="rounded-lg bg-bg-elevated/60 p-3 text-sm text-text-secondary">
              Shielded moves hide intent, but spend Data and can feel risky.
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-mono text-xs uppercase text-accent-primary">Current phase guide</div>
          <div className="mt-2 font-display text-2xl text-accent-secondary">{guide.title}</div>
          <p className="mt-3 text-sm leading-6 text-text-secondary">{guide.body}</p>
          <div className="mt-4 rounded-lg border border-accent-primary/20 bg-bg-elevated/55 p-3 text-sm text-accent-primary">
            Suggested first-match read: {guide.recommended}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="mb-4 font-display text-2xl text-accent-secondary">Frontier Map</div>
          <div className="grid grid-cols-4 gap-3">
            {snapshot.playerView.map.map((node) => (
              <div key={node.id} className="min-h-24 rounded-lg border border-accent-primary/20 bg-bg-elevated/70 p-3">
                <div className="font-mono text-xs uppercase text-accent-primary">{node.resource}</div>
                <div className="mt-5 text-xs text-text-secondary">
                  {node.ownerSessionId ? snapshot.playerView.players[node.ownerSessionId]?.displayName ?? 'House' : 'Open'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5">
          <div className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
            <div className="font-display text-2xl text-accent-secondary">Treasury</div>
            {ownPlayer ? (
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-bg-elevated/70 p-3">
                  <div className="text-text-muted">Public</div>
                  <div className="font-mono text-accent-secondary">{ownPlayer.publicZats}</div>
                </div>
                <div className="rounded-lg bg-bg-elevated/70 p-3">
                  <div className="text-text-muted">Shielded</div>
                  <div className="font-mono text-accent-secondary">{ownPlayer.shieldedZats ?? 'hidden'}</div>
                </div>
                <div className="rounded-lg bg-bg-elevated/70 p-3">
                  <div className="text-text-muted">Locked</div>
                  <div className="font-mono text-accent-secondary">{ownPlayer.lockedZats}</div>
                </div>
              </div>
            ) : <div className="mt-3 text-text-secondary">Spectator snapshot</div>}
          </div>

          <div className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
            <div className="font-display text-2xl text-accent-secondary">Actions</div>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Try the action that matches the current phase. Failed actions are useful during playtests because they
              show where the interface needs clearer guardrails.
            </p>
            <div className="mt-4 grid gap-3">
              <button type="button" onClick={() => submit({ type: 'PRODUCE', payload: {} })} className="rounded-lg border border-accent-primary/35 p-3 text-left text-accent-secondary">
                <span className="block font-semibold">Produce Resources</span>
                <span className="mt-1 block text-sm text-text-secondary">Use in Production. Adds the raw inputs your economy needs.</span>
              </button>
              <button type="button" onClick={() => submit({ type: 'PLACE_PUBLIC_ORDER', payload: { resource: 'compute', side: 'buy', quantity: 1, priceZats: '1000000' } })} className="rounded-lg border border-accent-primary/35 p-3 text-left text-accent-secondary">
                <span className="block font-semibold">Public Order: Buy Compute</span>
                <span className="mt-1 block text-sm text-text-secondary">Use in Market. Signals demand and starts the visible market story.</span>
              </button>
              {contract && (
                <>
                  <button type="button" onClick={() => submit({ type: 'BID_CONTRACT', payload: { contractId: contract.id, amountZats: '2000000' } })} className="rounded-lg border border-accent-primary/35 p-3 text-left text-accent-secondary">
                    <span className="block font-semibold">Public Contract Bid</span>
                    <span className="mt-1 block text-sm text-text-secondary">Use in Contracts. Visible commitment that builds Trust.</span>
                  </button>
                  <button type="button" onClick={() => submit({ type: 'SEALED_BID_COMMIT', payload: { contractId: contract.id, amountZats: '1500000', dataSpent: 1 } })} className="rounded-lg border border-accent-primary/35 p-3 text-left text-accent-secondary">
                    <span className="block font-semibold">Shielded Bid</span>
                    <span className="mt-1 block text-sm text-text-secondary">Use in Contracts. Spends Data to hide liquidity and create suspense.</span>
                  </button>
                </>
              )}
              <button type="button" onClick={() => submit({ type: 'BUILD_STRUCTURE', payload: { structureType: 'DATA_TRUST' } })} className="rounded-lg border border-accent-primary/35 p-3 text-left text-accent-secondary">
                <span className="block font-semibold">Build Data Trust</span>
                <span className="mt-1 block text-sm text-text-secondary">Use in Build. Converts Materials and Talent into Trust and privacy infrastructure.</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {Object.values(snapshot.playerView.players).sort((a, b) => a.seatIndex - b.seatIndex).map((player) => (
          <div key={player.sessionId} className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
            <div className="font-display text-xl text-accent-secondary">{player.displayName}</div>
            <div className="mt-2 text-sm text-text-secondary">Trust {player.trust} · Prestige {player.prestige}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
              {Object.entries(player.resources).map(([resource, value]) => (
                <div key={resource} className="rounded bg-bg-elevated/60 p-2">{resource}: {value}</div>
              ))}
            </div>
            {player.payoutZats && <div className="mt-3 font-mono text-accent-primary">Payout {player.payoutZats}</div>}
          </div>
        ))}
      </div>

      {isComplete && playtestMode && (
        <section className="mt-5 rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-2xl text-accent-secondary">Playtest Feedback</div>
          {feedbackSubmitted ? (
            <div className="mt-4 rounded-lg bg-bg-elevated/70 p-4 text-accent-primary">
              Feedback recorded.
            </div>
          ) : (
            <form onSubmit={submitFeedback} className="mt-4 grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                {feedbackQuestions.map(([key, label]) => (
                  <label key={key} className="rounded-lg bg-bg-elevated/65 p-3 text-sm text-text-secondary">
                    <span className="block">{label}</span>
                    <select
                      value={feedback[key]}
                      onChange={(event) => setFeedback((current) => ({ ...current, [key]: Number(event.target.value) }))}
                      className="mt-2 w-full rounded border border-accent-primary/30 bg-bg-base p-2 text-accent-secondary"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label className="text-sm text-text-secondary">
                <span className="block">Most exciting moment</span>
                <textarea
                  value={feedback.mostExcitingMoment}
                  onChange={(event) => setFeedback((current) => ({ ...current, mostExcitingMoment: event.target.value }))}
                  className="mt-2 min-h-24 w-full rounded border border-accent-primary/30 bg-bg-base p-3 text-accent-secondary"
                />
              </label>
              <label className="text-sm text-text-secondary">
                <span className="block">Most confusing moment</span>
                <textarea
                  value={feedback.mostConfusingMoment}
                  onChange={(event) => setFeedback((current) => ({ ...current, mostConfusingMoment: event.target.value }))}
                  className="mt-2 min-h-24 w-full rounded border border-accent-primary/30 bg-bg-base p-3 text-accent-secondary"
                />
              </label>
              <label className="text-sm text-text-secondary">
                <span className="block">One thing you would change</span>
                <textarea
                  value={feedback.oneThingToChange}
                  onChange={(event) => setFeedback((current) => ({ ...current, oneThingToChange: event.target.value }))}
                  className="mt-2 min-h-24 w-full rounded border border-accent-primary/30 bg-bg-base p-3 text-accent-secondary"
                />
              </label>
              {feedbackError && <div className="text-color-error">{feedbackError}</div>}
              <button type="submit" className="w-fit rounded-lg bg-accent-primary px-5 py-3 font-bold text-bg-base">
                Submit Feedback
              </button>
            </form>
          )}
        </section>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-xl text-accent-secondary">Market Tape</div>
          <div className="mt-3 space-y-2 text-sm text-text-secondary">
            {snapshot.playerView.orders.length === 0 ? 'No public orders yet.' : snapshot.playerView.orders.map((order) => (
              <div key={order.id}>{order.side} {order.quantity} {order.resource} @ {order.priceZats}</div>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-xl text-accent-secondary">Contracts</div>
          <div className="mt-3 space-y-2 text-sm text-text-secondary">
            {snapshot.playerView.contracts.map((entry) => (
              <div key={entry.id}>{entry.type}: public {entry.publicStakeZats}, shielded {entry.shieldedStakeZats ?? 'committed privately'}</div>
            ))}
            {snapshot.playerView.commitments.map((entry) => (
              <div key={entry.id} className="break-all font-mono text-accent-primary">
                commitment {entry.commitmentHash.slice(0, 16)}
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-accent-primary/20 bg-bg-surface/70 p-5">
          <div className="font-display text-xl text-accent-secondary">Impartial Ledger</div>
          <div className="mt-3 space-y-2 text-sm text-text-secondary">
            {snapshot.playerView.crises.length === 0 ? 'No crises resolved yet.' : snapshot.playerView.crises.map((crisis) => (
              <div key={`${crisis.epoch}-${crisis.type}`}>{crisis.type}: {crisis.description}</div>
            ))}
            {snapshot.playerView.finalLedgerHash && <div className="break-all font-mono text-accent-primary">{snapshot.playerView.finalLedgerHash}</div>}
          </div>
        </section>
      </div>
    </div>
  )
}
