'use client'

import { useEffect, useState, useCallback } from 'react'

interface FeedHand {
  id: string
  gameType: 'blackjack' | 'video_poker'
  outcome: string
  betRange: string
  payoutRange: string
  timestamp: string
  commitmentTxHash: string | null
  fairnessMode: string | null
  variant?: string
}

interface FeedResponse {
  hands: FeedHand[]
  total: number
  volumeFloor: boolean
  message?: string
  lastUpdated: string
}

const POLL_INTERVAL_MS = 30_000

function formatOutcome(hand: FeedHand): { label: string; color: string } {
  if (hand.gameType === 'blackjack') {
    switch (hand.outcome) {
      case 'blackjack': return { label: 'Blackjack!', color: 'text-masque-gold' }
      case 'win': return { label: 'Win', color: 'text-green-400' }
      case 'lose': return { label: 'Loss', color: 'text-blood-ruby' }
      case 'push': return { label: 'Push', color: 'text-venetian-gold' }
      default: return { label: hand.outcome, color: 'text-venetian-gold/60' }
    }
  }
  // Video poker — hand rank names
  const rankLabels: Record<string, string> = {
    royal_flush: 'Royal Flush',
    straight_flush: 'Straight Flush',
    four_of_a_kind: 'Four of a Kind',
    full_house: 'Full House',
    flush: 'Flush',
    straight: 'Straight',
    three_of_a_kind: 'Three of a Kind',
    two_pair: 'Two Pair',
    jacks_or_better: 'Jacks or Better',
    nothing: 'No Hand',
  }
  const label = rankLabels[hand.outcome] ?? hand.outcome
  const isWin = hand.outcome !== 'nothing'
  return { label, color: isWin ? 'text-green-400' : 'text-blood-ruby' }
}

function formatGameType(hand: FeedHand): string {
  if (hand.gameType === 'blackjack') return 'Blackjack'
  if (hand.variant === 'deuces_wild') return 'Deuces Wild'
  return 'Jacks or Better'
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface VerifiedHandsFeedProps {
  /** Number of entries to show. */
  limit?: number
  /** Compact mode for homepage preview widget. */
  compact?: boolean
  /** Filter by game type. */
  gameType?: 'blackjack' | 'video_poker'
}

export default function VerifiedHandsFeed({
  limit = 20,
  compact = false,
  gameType,
}: VerifiedHandsFeedProps) {
  const [feed, setFeed] = useState<FeedResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchFeed = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) })
      if (gameType) params.set('type', gameType)
      const res = await fetch(`/api/feed?${params}`)
      if (res.status === 404) {
        setError('Feed not available')
        return
      }
      if (res.status === 429) {
        // Rate limited — keep existing data, don't clear
        return
      }
      if (!res.ok) throw new Error('Failed to load feed')
      const data: FeedResponse = await res.json()
      setFeed(data)
      setError(null)
    } catch {
      setError('Unable to load verified hands')
    } finally {
      setLoading(false)
    }
  }, [limit, gameType])

  useEffect(() => {
    fetchFeed()
    const interval = setInterval(fetchFeed, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchFeed])

  if (loading) {
    return (
      <div className={`${compact ? '' : 'py-8'} text-center`}>
        <div className="inline-block w-5 h-5 border-2 border-masque-gold/30 border-t-masque-gold rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${compact ? '' : 'py-8'} text-center text-venetian-gold/50 text-sm`}>
        {error}
      </div>
    )
  }

  if (!feed || feed.volumeFloor) {
    return (
      <div className={`${compact ? '' : 'py-8'} text-center text-venetian-gold/50 text-sm`}>
        {feed?.message ?? 'No recent verified hands to display.'}
      </div>
    )
  }

  if (feed.hands.length === 0) {
    return (
      <div className={`${compact ? '' : 'py-8'} text-center text-venetian-gold/50 text-sm`}>
        No recent verified hands to display.
      </div>
    )
  }

  return (
    <div className={compact ? '' : 'space-y-2'}>
      {feed.hands.map((hand) => {
        const { label, color } = formatOutcome(hand)
        return (
          <div
            key={hand.id}
            className={`flex items-center justify-between gap-3 ${
              compact
                ? 'py-2 border-b border-masque-gold/10 last:border-0'
                : 'bg-midnight-black/30 rounded-lg px-4 py-3 border border-masque-gold/10 hover:border-masque-gold/20 transition-colors'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Game type badge */}
              <span className={`shrink-0 text-xs font-mono px-2 py-0.5 rounded ${
                hand.gameType === 'blackjack'
                  ? 'bg-jester-purple/20 text-jester-purple-light'
                  : 'bg-masque-gold/20 text-masque-gold'
              }`}>
                {formatGameType(hand)}
              </span>

              {/* Outcome */}
              <span className={`font-semibold text-sm ${color}`}>
                {label}
              </span>

              {/* Bet range */}
              {!compact && (
                <span className="text-venetian-gold/40 text-xs">
                  {hand.betRange} ZEC
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Time */}
              <span className="text-venetian-gold/40 text-xs">
                {timeAgo(hand.timestamp)}
              </span>

              {/* Verify link */}
              {!compact && (
                <a
                  href={`/verify?gameId=${hand.id}&gameType=${hand.gameType}`}
                  className="text-masque-gold/60 hover:text-masque-gold text-xs font-mono transition-colors"
                >
                  verify
                </a>
              )}
            </div>
          </div>
        )
      })}

      {compact && feed.hands.length > 0 && (
        <a
          href="/feed"
          className="block text-center text-masque-gold/60 hover:text-masque-gold text-xs mt-2 transition-colors"
        >
          View all verified hands &rarr;
        </a>
      )}
    </div>
  )
}
