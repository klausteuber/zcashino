'use client'

import { useState, useEffect } from 'react'
import SelfExclusionPanel from './SelfExclusionPanel'
import LimitsPanel from './LimitsPanel'

interface SessionData {
  id: string
  depositLimit: number | null
  lossLimit: number | null
  sessionLimit: number | null
}

/**
 * Client wrapper that loads the player's session and renders
 * the interactive LimitsPanel and SelfExclusionPanel.
 */
export default function ResponsibleGamblingTools() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [excludedUntil, setExcludedUntil] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [noSession, setNoSession] = useState(false)

  useEffect(() => {
    async function loadSession() {
      const storedId = localStorage.getItem('zcashino_session_id')
      if (!storedId) {
        setNoSession(true)
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/session?sessionId=${storedId}`)
        if (res.status === 403) {
          // Player is excluded — extract excludedUntil from response
          const data = await res.json()
          setExcludedUntil(data.excludedUntil)
          // We still need the session ID for display
          setSession({ id: storedId, depositLimit: null, lossLimit: null, sessionLimit: null })
          setLoading(false)
          return
        }
        if (!res.ok) {
          setNoSession(true)
          setLoading(false)
          return
        }
        const data = await res.json()
        setSession({
          id: data.id,
          depositLimit: data.depositLimit,
          lossLimit: data.lossLimit,
          sessionLimit: data.sessionLimit,
        })
      } catch {
        setNoSession(true)
      } finally {
        setLoading(false)
      }
    }
    loadSession()
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20">
          <p className="text-venetian-gold/50 text-sm">Loading session...</p>
        </div>
      </div>
    )
  }

  if (noSession) {
    return (
      <div className="space-y-8">
        <div className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20">
          <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Set Your Limits</h2>
          <p className="text-venetian-gold/70">
            To use these tools, you need an active session. Visit the{' '}
            <a href="/blackjack" className="text-masque-gold hover:underline">game page</a>{' '}
            to start a session, then return here to configure your limits.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Limits Panel */}
      <section className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20">
        <h2 className="text-2xl font-display font-semibold text-bone-white mb-4">Set Your Limits</h2>
        <LimitsPanel
          sessionId={session!.id}
          currentDepositLimit={session!.depositLimit}
          currentLossLimit={session!.lossLimit}
          currentSessionLimit={session!.sessionLimit}
        />
      </section>

      {/* Self-Exclusion Panel */}
      <section className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-blood-ruby/30">
        <h2 className="text-2xl font-display font-semibold text-bone-white mb-4">Self-Exclusion</h2>
        <SelfExclusionPanel
          sessionId={session!.id}
          excludedUntil={excludedUntil}
        />
      </section>
    </div>
  )
}
