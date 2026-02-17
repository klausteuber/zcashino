'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import HandReplay, { formatZec, shortId } from '@/components/admin/HandReplay'

interface Card {
  rank: string
  suit: string
}

interface GameState {
  playerHand?: Card[]
  dealerHand?: Card[]
  hands?: Array<{ cards: Card[] }>
  deck?: Card[]
  initialHand?: Card[]
  finalHand?: Card[]
  heldIndices?: number[]
  [key: string]: unknown
}

interface BlackjackGameDetail {
  id: string
  sessionId: string
  mainBet: number
  perfectPairsBet: number
  insuranceBet: number
  initialState: GameState | null
  finalState: GameState | null
  actionHistory: string[]
  serverSeed: string | null
  serverSeedHash: string
  clientSeed: string
  nonce: number
  fairnessVersion: string
  fairnessSeedId: string | null
  fairnessMode: string | null
  commitmentTxHash: string | null
  commitmentBlock: number | null
  commitmentTimestamp: string | null
  verifiedOnChain: boolean
  status: string
  outcome: string | null
  payout: number | null
  createdAt: string
  completedAt: string | null
}

interface VideoPokerGameDetail {
  id: string
  sessionId: string
  variant: string
  baseBet: number
  betMultiplier: number
  totalBet: number
  initialState: GameState | null
  finalState: GameState | null
  actionHistory: string[]
  serverSeed: string | null
  serverSeedHash: string
  clientSeed: string
  nonce: number
  fairnessVersion: string
  fairnessSeedId: string | null
  fairnessMode: string | null
  commitmentTxHash: string | null
  commitmentBlock: number | null
  commitmentTimestamp: string | null
  handRank: string | null
  multiplier: number | null
  status: string
  payout: number | null
  createdAt: string
  completedAt: string | null
}

type GameDetail = BlackjackGameDetail | VideoPokerGameDetail

interface GameResponse {
  type: 'blackjack' | 'videoPoker'
  game: GameDetail
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function outcomeLabel(outcome: string | null, type: string): string {
  if (!outcome) return '-'
  if (type === 'blackjack') {
    const labels: Record<string, string> = {
      win: 'Win',
      lose: 'Loss',
      push: 'Push',
      blackjack: 'Blackjack!',
      surrender: 'Surrender',
    }
    return labels[outcome] || outcome
  }
  // Video poker hand ranks
  const vpLabels: Record<string, string> = {
    royal_flush: 'Royal Flush',
    straight_flush: 'Straight Flush',
    four_of_a_kind: 'Four of a Kind',
    full_house: 'Full House',
    flush: 'Flush',
    straight: 'Straight',
    three_of_a_kind: 'Three of a Kind',
    two_pair: 'Two Pair',
    jacks_or_better: 'Jacks or Better',
    nothing: 'Nothing',
  }
  return vpLabels[outcome] || outcome
}

function statusBadge(status: string): { label: string; classes: string } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', classes: 'bg-masque-gold/20 text-masque-gold border-masque-gold/30' }
    case 'active':
      return { label: 'Active', classes: 'bg-jester-purple/20 text-jester-purple border-jester-purple/30' }
    case 'abandoned':
      return { label: 'Abandoned', classes: 'bg-blood-ruby/20 text-blood-ruby border-blood-ruby/30' }
    default:
      return { label: status, classes: 'bg-bone-white/10 text-bone-white/60 border-bone-white/20' }
  }
}

function extractCards(state: GameState | null, key: string): Card[] {
  if (!state) return []
  const val = state[key]
  if (Array.isArray(val)) {
    return val.filter(
      (c): c is Card =>
        c !== null && typeof c === 'object' && 'rank' in c && 'suit' in c
    )
  }
  return []
}

function isSeedPendingReveal(game: GameDetail): boolean {
  if (game.status === 'active') return true
  if (game.fairnessVersion?.includes('pending_reveal')) return true
  return false
}

export default function AdminGameDetailPage() {
  const params = useParams()
  const gameId = params.id as string

  const [data, setData] = useState<GameResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSeeds, setShowSeeds] = useState(false)

  useEffect(() => {
    async function fetchGame() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/games/${gameId}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const json: GameResponse = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch game')
      } finally {
        setLoading(false)
      }
    }
    if (gameId) fetchGame()
  }, [gameId])

  if (loading) {
    return (
      <div className="min-h-screen bg-midnight-black text-bone-white flex items-center justify-center">
        <p className="text-bone-white/40">Loading game detail...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-midnight-black text-bone-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-blood-ruby/20 border border-blood-ruby/40 rounded-lg p-4">
            <p className="text-blood-ruby">{error || 'Game not found'}</p>
          </div>
          <Link
            href="/admin/games"
            className="mt-4 inline-block text-sm text-venetian-gold hover:text-masque-gold"
          >
            Back to Game History
          </Link>
        </div>
      </div>
    )
  }

  const { type, game } = data
  const badge = statusBadge(game.status)
  const pending = isSeedPendingReveal(game)
  const isBlackjack = type === 'blackjack'
  const bjGame = isBlackjack ? (game as BlackjackGameDetail) : null
  const vpGame = !isBlackjack ? (game as VideoPokerGameDetail) : null

  // Extract card data from states
  const initialPlayerCards = extractCards(game.initialState, 'playerHand')
  const initialDealerCards = extractCards(game.initialState, 'dealerHand')
  const finalPlayerCards = extractCards(game.finalState, 'playerHand')
  const finalDealerCards = extractCards(game.finalState, 'dealerHand')

  // For split hands
  const finalHands = game.finalState?.hands as Array<{ cards: Card[] }> | undefined

  // Video poker cards
  const vpInitialHand = extractCards(game.initialState, 'initialHand')
  const vpFinalHand = extractCards(game.finalState, 'finalHand')

  // Blockchain explorer URL for commitment tx
  const explorerBaseUrl = 'https://zcashblockexplorer.com/transactions'

  return (
    <div className="min-h-screen bg-midnight-black text-bone-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          <Link href="/admin" className="text-venetian-gold/70 hover:text-venetian-gold">
            Dashboard
          </Link>
          <span className="text-bone-white/30">/</span>
          <Link href="/admin/games" className="text-venetian-gold/70 hover:text-venetian-gold">
            Game History
          </Link>
          <span className="text-bone-white/30">/</span>
          <span className="text-bone-white/40 font-mono text-xs">{shortId(gameId)}</span>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-center gap-4 mb-8">
          <h1 className="text-2xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)]">
            {isBlackjack ? 'Blackjack' : 'Video Poker'} Hand
          </h1>
          <span className={`inline-block px-3 py-1 rounded border text-xs font-medium ${badge.classes}`}>
            {badge.label}
          </span>
          {isBlackjack && bjGame?.outcome && (
            <span className="text-lg font-bold text-masque-gold">
              {outcomeLabel(bjGame.outcome, 'blackjack')}
            </span>
          )}
          {!isBlackjack && vpGame?.handRank && (
            <span className="text-lg font-bold text-masque-gold">
              {outcomeLabel(vpGame.handRank, 'videoPoker')}
            </span>
          )}
        </div>

        {/* Game ID and Session */}
        <div className="bg-midnight-black/80 border border-masque-gold/20 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-bone-white/40">Game ID</span>
              <p className="font-mono text-xs text-bone-white mt-1 break-all">{game.id}</p>
            </div>
            <div>
              <span className="text-bone-white/40">Session</span>
              <p className="mt-1">
                <Link
                  href={`/admin/players/${game.sessionId}`}
                  className="font-mono text-xs text-venetian-gold hover:text-masque-gold transition-colors break-all"
                >
                  {game.sessionId}
                </Link>
              </p>
            </div>
            <div>
              <span className="text-bone-white/40">Created</span>
              <p className="text-bone-white/80 mt-1">{formatDate(game.createdAt)}</p>
            </div>
            <div>
              <span className="text-bone-white/40">Completed</span>
              <p className="text-bone-white/80 mt-1">{formatDate(game.completedAt)}</p>
            </div>
          </div>
        </div>

        {/* Bet Summary */}
        <div className="bg-midnight-black/80 border border-masque-gold/20 rounded-lg p-4 mb-6">
          <h2 className="text-sm text-masque-gold/80 font-medium mb-3 uppercase tracking-wider">
            Bet Summary
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {isBlackjack && bjGame ? (
              <>
                <div>
                  <span className="text-bone-white/40">Main Bet</span>
                  <p className="font-mono text-bone-white mt-1">{formatZec(bjGame.mainBet)}</p>
                </div>
                <div>
                  <span className="text-bone-white/40">Perfect Pairs</span>
                  <p className="font-mono text-bone-white mt-1">{formatZec(bjGame.perfectPairsBet)}</p>
                </div>
                <div>
                  <span className="text-bone-white/40">Insurance</span>
                  <p className="font-mono text-bone-white mt-1">{formatZec(bjGame.insuranceBet)}</p>
                </div>
                <div>
                  <span className="text-bone-white/40">Total Payout</span>
                  <p className={`font-mono font-bold mt-1 ${
                    (bjGame.payout ?? 0) > 1 ? 'text-masque-gold' : 'text-bone-white'
                  }`}>
                    {formatZec(bjGame.payout ?? 0)}
                  </p>
                </div>
              </>
            ) : vpGame ? (
              <>
                <div>
                  <span className="text-bone-white/40">Base Bet</span>
                  <p className="font-mono text-bone-white mt-1">{formatZec(vpGame.baseBet)}</p>
                </div>
                <div>
                  <span className="text-bone-white/40">Multiplier</span>
                  <p className="font-mono text-bone-white mt-1">{vpGame.betMultiplier}x coins</p>
                </div>
                <div>
                  <span className="text-bone-white/40">Total Bet</span>
                  <p className="font-mono text-bone-white mt-1">{formatZec(vpGame.totalBet)}</p>
                </div>
                <div>
                  <span className="text-bone-white/40">Total Payout</span>
                  <p className={`font-mono font-bold mt-1 ${
                    (vpGame.payout ?? 0) > 1 ? 'text-masque-gold' : 'text-bone-white'
                  }`}>
                    {formatZec(vpGame.payout ?? 0)}
                  </p>
                </div>
              </>
            ) : null}
          </div>
          {vpGame && vpGame.multiplier !== null && vpGame.multiplier !== undefined && (
            <p className="text-xs text-bone-white/40 mt-3">
              Paytable multiplier: {vpGame.multiplier}x
            </p>
          )}
        </div>

        {/* Card Display */}
        <div className="bg-midnight-black/80 border border-masque-gold/20 rounded-lg p-4 mb-6">
          <h2 className="text-sm text-masque-gold/80 font-medium mb-4 uppercase tracking-wider">
            Cards
          </h2>

          {isBlackjack ? (
            <div className="space-y-6">
              {/* Initial deal */}
              {(initialPlayerCards.length > 0 || initialDealerCards.length > 0) && (
                <div>
                  <p className="text-xs text-bone-white/40 mb-3 uppercase">Initial Deal</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <HandReplay cards={initialPlayerCards} label="Player" />
                    <HandReplay cards={initialDealerCards} label="Dealer" />
                  </div>
                </div>
              )}

              {/* Final state */}
              {(finalPlayerCards.length > 0 || finalDealerCards.length > 0) && (
                <div>
                  <p className="text-xs text-bone-white/40 mb-3 uppercase">Final Hands</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {finalHands && finalHands.length > 1 ? (
                      <div className="space-y-3">
                        {finalHands.map((hand, idx) => (
                          <HandReplay
                            key={idx}
                            cards={hand.cards || []}
                            label={`Player Hand ${idx + 1}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <HandReplay cards={finalPlayerCards} label="Player" />
                    )}
                    <HandReplay cards={finalDealerCards} label="Dealer" />
                  </div>
                </div>
              )}

              {/* Fallback if no structured card data */}
              {initialPlayerCards.length === 0 && finalPlayerCards.length === 0 && (
                <p className="text-bone-white/30 text-sm italic">
                  Card data not available in expected format. Check raw state below.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {vpInitialHand.length > 0 && (
                <HandReplay cards={vpInitialHand} label="Initial Hand (5 cards dealt)" />
              )}
              {vpFinalHand.length > 0 && (
                <HandReplay cards={vpFinalHand} label="Final Hand (after draw)" />
              )}
              {vpInitialHand.length === 0 && vpFinalHand.length === 0 && (
                <p className="text-bone-white/30 text-sm italic">
                  Card data not available in expected format. Check raw state below.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action Timeline */}
        <div className="bg-midnight-black/80 border border-masque-gold/20 rounded-lg p-4 mb-6">
          <h2 className="text-sm text-masque-gold/80 font-medium mb-3 uppercase tracking-wider">
            Action History
          </h2>
          {game.actionHistory && game.actionHistory.length > 0 ? (
            <ol className="space-y-2">
              {game.actionHistory.map((action, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-masque-gold/10 border border-masque-gold/30 text-masque-gold text-xs flex items-center justify-center font-mono">
                    {idx + 1}
                  </span>
                  <span className="text-sm text-bone-white/80 font-mono">
                    {typeof action === 'string' ? action : JSON.stringify(action)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-bone-white/30 text-sm italic">No actions recorded</p>
          )}
        </div>

        {/* Provably Fair Section */}
        <div className="bg-midnight-black/80 border border-masque-gold/20 rounded-lg p-4 mb-6">
          <h2 className="text-sm text-masque-gold/80 font-medium mb-4 uppercase tracking-wider">
            Provably Fair
          </h2>

          <div className="space-y-3 text-sm">
            <div>
              <span className="text-bone-white/40">Fairness Version</span>
              <p className="font-mono text-xs text-bone-white mt-1">{game.fairnessVersion}</p>
            </div>

            {game.fairnessSeedId && (
              <div>
                <span className="text-bone-white/40">Seed ID</span>
                <p className="font-mono text-xs text-bone-white mt-1 break-all">{game.fairnessSeedId}</p>
              </div>
            )}

            {game.fairnessMode && (
              <div>
                <span className="text-bone-white/40">Fairness Mode</span>
                <p className="font-mono text-xs text-bone-white mt-1">{game.fairnessMode}</p>
              </div>
            )}

            <div>
              <span className="text-bone-white/40">Server Seed Hash</span>
              <p className="font-mono text-xs text-bone-white mt-1 break-all">{game.serverSeedHash}</p>
            </div>

            <div>
              <span className="text-bone-white/40">Client Seed</span>
              <p className="font-mono text-xs text-bone-white mt-1 break-all">{game.clientSeed}</p>
            </div>

            <div>
              <span className="text-bone-white/40">Nonce</span>
              <p className="font-mono text-xs text-bone-white mt-1">{game.nonce}</p>
            </div>

            {/* Server seed - only show for completed games */}
            {pending ? (
              <div className="bg-jester-purple/10 border border-jester-purple/30 rounded p-3 mt-3">
                <p className="text-jester-purple text-sm">
                  Seed not yet revealed. The server seed will be available after the game completes
                  and the seed is rotated.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => setShowSeeds(!showSeeds)}
                    className="px-3 py-1.5 text-xs border border-masque-gold/30 rounded text-masque-gold hover:bg-masque-gold/10 transition-colors"
                  >
                    {showSeeds ? 'Hide Server Seed' : 'Verify Fairness'}
                  </button>
                </div>
                {showSeeds && game.serverSeed && (
                  <div className="mt-3 p-3 bg-midnight-black border border-masque-gold/10 rounded">
                    <span className="text-bone-white/40 text-xs">Server Seed (revealed)</span>
                    <p className="font-mono text-xs text-masque-gold mt-1 break-all">{game.serverSeed}</p>
                  </div>
                )}
                {showSeeds && !game.serverSeed && (
                  <div className="mt-3 p-3 bg-midnight-black border border-bone-white/10 rounded">
                    <p className="text-bone-white/40 text-xs italic">
                      Server seed not stored (legacy game or not yet revealed).
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Blockchain commitment */}
            {(game.commitmentTxHash || game.commitmentBlock) && (
              <div className="mt-4 pt-4 border-t border-masque-gold/10">
                <p className="text-xs text-masque-gold/70 mb-2 uppercase tracking-wider">
                  On-chain Commitment
                </p>
                {game.commitmentTxHash && (
                  <div className="mb-2">
                    <span className="text-bone-white/40 text-xs">Commitment Tx</span>
                    <p className="font-mono text-xs text-venetian-gold mt-1 break-all">
                      <a
                        href={`${explorerBaseUrl}/${game.commitmentTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-masque-gold transition-colors underline underline-offset-2"
                      >
                        {game.commitmentTxHash}
                      </a>
                    </p>
                  </div>
                )}
                {game.commitmentBlock && (
                  <div className="mb-2">
                    <span className="text-bone-white/40 text-xs">Block Height</span>
                    <p className="font-mono text-xs text-bone-white mt-1">{game.commitmentBlock}</p>
                  </div>
                )}
                {game.commitmentTimestamp && (
                  <div>
                    <span className="text-bone-white/40 text-xs">Block Timestamp</span>
                    <p className="text-xs text-bone-white/80 mt-1">{formatDate(game.commitmentTimestamp)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Raw State (collapsible debug section) */}
        <details className="bg-midnight-black/80 border border-masque-gold/20 rounded-lg mb-6">
          <summary className="p-4 cursor-pointer text-sm text-bone-white/40 hover:text-bone-white/60 transition-colors">
            Raw Game State (debug)
          </summary>
          <div className="px-4 pb-4 space-y-4">
            {game.initialState && (
              <div>
                <p className="text-xs text-masque-gold/70 mb-1">Initial State</p>
                <pre className="text-xs text-bone-white/60 bg-midnight-black p-3 rounded overflow-x-auto font-mono border border-masque-gold/10">
                  {JSON.stringify(game.initialState, null, 2)}
                </pre>
              </div>
            )}
            {game.finalState && (
              <div>
                <p className="text-xs text-masque-gold/70 mb-1">Final State</p>
                <pre className="text-xs text-bone-white/60 bg-midnight-black p-3 rounded overflow-x-auto font-mono border border-masque-gold/10">
                  {JSON.stringify(game.finalState, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </details>

        {/* Back link */}
        <div className="flex gap-4">
          <Link
            href="/admin/games"
            className="text-sm text-venetian-gold hover:text-masque-gold transition-colors"
          >
            Back to Game History
          </Link>
          <Link
            href={`/admin/players/${game.sessionId}`}
            className="text-sm text-venetian-gold hover:text-masque-gold transition-colors"
          >
            View Player
          </Link>
        </div>
      </div>
    </div>
  )
}
