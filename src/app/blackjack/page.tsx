'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { BlackjackGameState, BlackjackAction, BlockchainCommitment } from '@/types'
import { Hand } from '@/components/game/Card'
import { ChipStack } from '@/components/game/Chip'
import { calculateHandValue } from '@/lib/game/deck'
import { MIN_BET, MAX_BET, getAvailableActions } from '@/lib/game/blackjack'
import PepeLogo from '@/components/ui/PepeLogo'
import { useGameSounds } from '@/hooks/useGameSounds'

const CHIP_VALUES = [0.01, 0.05, 0.1, 0.25, 0.5, 1]

// Perfect Pairs payouts for tooltip
const PERFECT_PAIRS_INFO = {
  perfect: { name: 'Perfect Pair', multiplier: '25:1', description: 'Same rank & suit' },
  colored: { name: 'Colored Pair', multiplier: '12:1', description: 'Same rank & color' },
  mixed: { name: 'Mixed Pair', multiplier: '6:1', description: 'Same rank, different color' }
}

interface SessionData {
  id: string
  walletAddress: string
  balance: number
  totalWagered: number
  totalWon: number
}

export default function BlackjackPage() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [gameState, setGameState] = useState<Partial<BlackjackGameState> | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [commitment, setCommitment] = useState<BlockchainCommitment | null>(null)
  const [selectedBet, setSelectedBet] = useState<number>(0.1)
  const [perfectPairsBet, setPerfectPairsBet] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Animation state
  const [balanceAnimation, setBalanceAnimation] = useState<'increase' | 'decrease' | null>(null)
  const [showFloatingPayout, setShowFloatingPayout] = useState(false)
  const [floatingPayoutAmount, setFloatingPayoutAmount] = useState<number>(0)
  const [resultAnimation, setResultAnimation] = useState<string | null>(null)
  const [previousCardCounts, setPreviousCardCounts] = useState<{ player: number[]; dealer: number }>({ player: [0], dealer: 0 })
  const [showPerfectPairsTooltip, setShowPerfectPairsTooltip] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Track previous balance and game state for animations
  const prevBalanceRef = useRef<number | null>(null)
  const prevGamePhaseRef = useRef<string | null>(null)

  // Sound effects
  const { playSound, isMuted, toggleMute } = useGameSounds(true)

  // Initialize session on mount
  useEffect(() => {
    initSession()
  }, [])

  // Balance animation effect
  useEffect(() => {
    if (session && prevBalanceRef.current !== null) {
      const diff = session.balance - prevBalanceRef.current
      if (diff > 0.0001) {
        setBalanceAnimation('increase')
        setFloatingPayoutAmount(diff)
        setShowFloatingPayout(true)
        setTimeout(() => {
          setBalanceAnimation(null)
          setShowFloatingPayout(false)
        }, 1500)
      } else if (diff < -0.0001) {
        setBalanceAnimation('decrease')
        setTimeout(() => setBalanceAnimation(null), 500)
      }
    }
    prevBalanceRef.current = session?.balance ?? null
  }, [session?.balance])

  // Game phase change effects
  useEffect(() => {
    const currentPhase = gameState?.phase
    const prevPhase = prevGamePhaseRef.current

    // Track card counts for deal animations and sounds
    if (gameState?.playerHands) {
      const newCounts = gameState.playerHands.map(h => h.cards.length)
      const dealerCount = gameState.dealerHand?.cards?.length ?? 0

      // Play card deal sounds for new cards
      const totalNewCards = newCounts.reduce((sum, count, i) => {
        return sum + Math.max(0, count - (previousCardCounts.player[i] ?? 0))
      }, 0) + Math.max(0, dealerCount - previousCardCounts.dealer)

      if (totalNewCards > 0) {
        // Stagger card deal sounds
        for (let i = 0; i < totalNewCards; i++) {
          setTimeout(() => playSound('cardDeal'), i * 150)
        }
      }

      // Only update previous counts after animation has had time to play
      setTimeout(() => {
        setPreviousCardCounts({
          player: newCounts,
          dealer: dealerCount
        })
      }, 500)
    }

    // Result animation and sounds when game completes
    if (currentPhase === 'complete' && prevPhase !== 'complete') {
      const payout = gameState?.lastPayout ?? 0
      const message = gameState?.message?.toLowerCase() ?? ''

      if (message.includes('blackjack')) {
        setResultAnimation('blackjack')
        setTimeout(() => playSound('blackjack'), 300)
      } else if (payout > 0) {
        setResultAnimation('win')
        setTimeout(() => playSound('win'), 300)
      } else if (message.includes('push')) {
        setResultAnimation('push')
        setTimeout(() => playSound('push'), 300)
      } else {
        setResultAnimation('loss')
        setTimeout(() => playSound('lose'), 300)
      }

      // Clear result animation after display
      setTimeout(() => setResultAnimation(null), 3000)
    }

    prevGamePhaseRef.current = currentPhase ?? null
  }, [gameState, playSound, previousCardCounts])

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      console.error('Failed to copy')
    }
  }

  const initSession = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/session')
      if (!res.ok) throw new Error('Failed to get session')
      const data = await res.json()
      setSession(data)
    } catch (err) {
      setError('Failed to initialize session')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePlaceBet = useCallback(async () => {
    if (!session || isLoading) return
    if (selectedBet < MIN_BET || selectedBet > MAX_BET) return
    if (selectedBet + perfectPairsBet > session.balance) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          sessionId: session.id,
          bet: selectedBet,
          perfectPairsBet
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start game')
      }

      const data = await res.json()
      setGameId(data.gameId)
      setGameState(data.gameState)
      setCommitment(data.commitment || null)
      setSession(prev => prev ? { ...prev, balance: data.balance } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game')
    } finally {
      setIsLoading(false)
    }
  }, [session, selectedBet, perfectPairsBet, isLoading])

  const handleAction = useCallback(async (action: BlackjackAction) => {
    if (!session || !gameId || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          sessionId: session.id,
          gameId
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to execute action')
      }

      const data = await res.json()
      setGameState(data.gameState)
      setSession(prev => prev ? { ...prev, balance: data.balance } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Game error')
    } finally {
      setIsLoading(false)
    }
  }, [session, gameId, isLoading])

  const handleNewRound = useCallback(() => {
    setGameId(null)
    setGameState(null)
    setCommitment(null)
    setError(null)
    setResultAnimation(null)
    setPreviousCardCounts({ player: [0], dealer: 0 })
  }, [])

  // Calculate available actions
  const availableActions = gameState ? getAvailableActions(gameState as BlackjackGameState) : []

  // Calculate hand values
  const playerValue = gameState?.playerHands?.[0]
    ? calculateHandValue(gameState.playerHands[0].cards)
    : 0
  const dealerValue = gameState?.dealerHand?.cards?.length
    ? calculateHandValue(gameState.dealerHand.cards.filter(c => c.faceUp))
    : 0

  if (isLoading && !session) {
    return (
      <main className="min-h-screen felt-texture flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen felt-texture">
      {/* Header */}
      <header className="border-b border-monaco-gold/20 bg-rich-black/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <a href="/" className="flex items-center gap-3">
            <PepeLogo size="md" className="text-pepe-green-light" />
            <span className="text-xl font-display font-bold tracking-tight">
              <span className="text-monaco-gold">Z</span>
              <span className="text-ivory-white">cashino</span>
            </span>
          </a>

          <div className="flex items-center gap-4">
            {/* Sound toggle */}
            <button
              onClick={() => {
                toggleMute()
                if (!isMuted) playSound('buttonClick')
              }}
              className="text-champagne-gold/60 hover:text-monaco-gold transition-colors p-2"
              title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            >
              {isMuted ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
            <div className="text-sm text-champagne-gold/60">
              {session?.walletAddress?.startsWith('demo_') ? 'Demo Mode' : 'Connected'}
            </div>
            <div className="bg-rich-black/40 px-4 py-2 rounded-lg border border-monaco-gold/20 relative">
              <span className="text-champagne-gold/60 text-sm">Balance: </span>
              <span className={`text-monaco-gold font-bold transition-all duration-300 ${
                balanceAnimation === 'increase' ? 'balance-increase' :
                balanceAnimation === 'decrease' ? 'balance-decrease' : ''
              }`}>
                {session?.balance?.toFixed(4) || '0.0000'} ZEC
              </span>
              {/* Floating payout indicator */}
              {showFloatingPayout && floatingPayoutAmount > 0 && (
                <span className="absolute -top-2 -right-2 text-green-400 font-bold text-sm float-up">
                  +{floatingPayoutAmount.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Error Display */}
      {error && (
        <div className="container mx-auto px-4 py-2">
          <div className="bg-burgundy/30 border border-burgundy text-ivory-white px-4 py-2 rounded-lg">
            {error}
          </div>
        </div>
      )}

      {/* Game Area */}
      <div className="container mx-auto px-4 py-8">
        {/* Dealer Area */}
        <div className="flex flex-col items-center mb-8">
          <div className="text-sm text-gray-400 mb-2">DEALER</div>
          {gameState?.dealerHand?.cards?.length ? (
            <Hand
              cards={gameState.dealerHand.cards}
              value={dealerValue}
              showValue={gameState.phase !== 'playerTurn'}
              size="lg"
              animateDealing={true}
              previousCardCount={previousCardCounts.dealer}
            />
          ) : (
            <div className="h-28 flex items-center justify-center text-gray-500">
              Waiting for bet...
            </div>
          )}
        </div>

        {/* Game Message */}
        <div className="text-center mb-8">
          <div className={`bg-rich-black/40 inline-block px-6 py-3 rounded-lg border transition-all duration-300 ${
            resultAnimation === 'blackjack' ? 'border-monaco-gold blackjack-glow result-pop' :
            resultAnimation === 'win' ? 'border-green-500 win-glow result-pop' :
            resultAnimation === 'loss' ? 'border-burgundy loss-shake' :
            resultAnimation === 'push' ? 'border-champagne-gold/50 result-pop' :
            'border-monaco-gold/20'
          }`}>
            <span className={`text-lg font-semibold ${
              resultAnimation === 'blackjack' ? 'text-monaco-gold' :
              resultAnimation === 'win' ? 'text-green-400' :
              resultAnimation === 'loss' ? 'text-burgundy' :
              resultAnimation === 'push' ? 'text-champagne-gold' :
              'text-ivory-white'
            }`}>
              {resultAnimation === 'blackjack' && '🎰 '}
              {gameState?.message || 'Place your bet to begin'}
              {resultAnimation === 'blackjack' && ' 🎰'}
            </span>
          </div>
        </div>

        {/* Player Area */}
        <div className="flex flex-col items-center mb-8">
          {gameState?.playerHands?.length ? (
            <div className="flex gap-8">
              {gameState.playerHands.map((hand, index) => {
                const handValue = calculateHandValue(hand.cards)
                const isBust = handValue > 21
                const isBlackjack = handValue === 21 && hand.cards.length === 2

                return (
                  <div
                    key={index}
                    className={`transition-all duration-300 ${
                      index === gameState.currentHandIndex && gameState.phase === 'playerTurn'
                        ? 'ring-2 ring-monaco-gold rounded-lg p-2'
                        : ''
                    }`}
                  >
                    <Hand
                      cards={hand.cards}
                      value={handValue}
                      label={gameState.playerHands!.length > 1 ? `Hand ${index + 1}` : 'YOUR HAND'}
                      size="lg"
                      animateDealing={true}
                      previousCardCount={previousCardCounts.player[index] ?? 0}
                      isBust={isBust}
                      isBlackjack={isBlackjack}
                    />
                    {hand.bet > 0 && (
                      <div className="text-center mt-2 text-sm text-champagne-gold/60">
                        Bet: {hand.bet.toFixed(2)} ZEC
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-400 mb-2">YOUR HAND</div>
          )}
        </div>

        {/* Actions / Betting */}
        <div className="flex flex-col items-center gap-4">
          {!gameState && (
            <>
              {/* Bet Selection */}
              <div className="text-center mb-4">
                <div className="text-sm text-champagne-gold/60 mb-2 uppercase tracking-wide">Select Bet Amount</div>
                <ChipStack
                  values={CHIP_VALUES}
                  selectedValue={selectedBet}
                  onSelect={(value) => {
                    setSelectedBet(value)
                    playSound('chipPlace')
                  }}
                  disabled={isLoading}
                />
              </div>

              {/* Current Bet Display */}
              <div className="text-center">
                <span className="text-champagne-gold/60">Main Bet: </span>
                <span className="text-monaco-gold font-bold">{selectedBet} ZEC</span>
              </div>

              {/* Perfect Pairs Toggle with Tooltip */}
              <div className="flex items-center gap-4 relative">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={perfectPairsBet > 0}
                    onChange={(e) => setPerfectPairsBet(e.target.checked ? selectedBet * 0.1 : 0)}
                    className="w-4 h-4 accent-monaco-gold"
                    disabled={isLoading}
                  />
                  <span className="text-sm text-champagne-gold/70">
                    Perfect Pairs (+{(selectedBet * 0.1).toFixed(3)} ZEC)
                  </span>
                </label>
                {/* Info icon with tooltip */}
                <button
                  type="button"
                  onMouseEnter={() => setShowPerfectPairsTooltip(true)}
                  onMouseLeave={() => setShowPerfectPairsTooltip(false)}
                  onClick={() => setShowPerfectPairsTooltip(!showPerfectPairsTooltip)}
                  className="text-champagne-gold/50 hover:text-monaco-gold transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {/* Tooltip */}
                {showPerfectPairsTooltip && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-rich-black border border-monaco-gold rounded-lg p-3 shadow-xl z-50 w-64">
                    <div className="text-xs text-ivory-white font-bold mb-2">Perfect Pairs Side Bet</div>
                    <div className="space-y-1.5 text-xs">
                      {Object.entries(PERFECT_PAIRS_INFO).map(([key, info]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-champagne-gold/70">{info.name}</span>
                          <span className="text-monaco-gold font-mono">{info.multiplier}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-champagne-gold/50 mt-2 pt-2 border-t border-monaco-gold/20">
                      Win if your first two cards are a pair!
                    </div>
                    {/* Tooltip arrow */}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
                      <div className="border-8 border-transparent border-t-monaco-gold"></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Deal Button */}
              <button
                onClick={handlePlaceBet}
                disabled={isLoading || !session || selectedBet > session.balance}
                className="btn-gold-shimmer text-rich-black px-8 py-3 rounded-lg font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Dealing...' : 'DEAL'}
              </button>
            </>
          )}

          {gameState?.phase === 'playerTurn' && (
            <div className="flex gap-3 flex-wrap justify-center">
              {availableActions.includes('hit') && (
                <button
                  onClick={() => {
                    playSound('buttonClick')
                    handleAction('hit')
                  }}
                  disabled={isLoading}
                  className="bg-pepe-green text-ivory-white px-6 py-3 rounded-lg font-bold hover:bg-pepe-green-light hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100 shadow-lg hover:shadow-pepe-green/30"
                >
                  HIT
                </button>
              )}
              {availableActions.includes('stand') && (
                <button
                  onClick={() => {
                    playSound('buttonClick')
                    handleAction('stand')
                  }}
                  disabled={isLoading}
                  className="bg-burgundy text-ivory-white px-6 py-3 rounded-lg font-bold hover:bg-burgundy/80 hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100 shadow-lg hover:shadow-burgundy/30"
                >
                  STAND
                </button>
              )}
              {availableActions.includes('double') && (
                <button
                  onClick={() => {
                    playSound('buttonClick')
                    handleAction('double')
                  }}
                  disabled={isLoading}
                  className="bg-monaco-gold text-rich-black px-6 py-3 rounded-lg font-bold hover:bg-champagne-gold hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100 shadow-lg hover:shadow-monaco-gold/30"
                >
                  DOUBLE
                </button>
              )}
              {availableActions.includes('split') && (
                <button
                  onClick={() => {
                    playSound('buttonClick')
                    handleAction('split')
                  }}
                  disabled={isLoading}
                  className="bg-velvet-purple text-ivory-white px-6 py-3 rounded-lg font-bold hover:bg-velvet-purple/80 hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100 shadow-lg hover:shadow-velvet-purple/30"
                >
                  SPLIT
                </button>
              )}
            </div>
          )}

          {gameState?.phase === 'complete' && (
            <div className="flex flex-col items-center gap-4">
              {/* Payout display */}
              {(() => {
                const payout = gameState.lastPayout ?? 0
                const totalBet = (gameState.playerHands?.[0]?.bet ?? 0) + (perfectPairsBet > 0 ? perfectPairsBet : 0)
                const netResult = payout - totalBet
                const isPush = gameState.message?.toLowerCase().includes('push')

                if (payout > 0) {
                  return (
                    <div className={`text-2xl font-bold px-6 py-3 rounded-lg result-pop ${
                      resultAnimation === 'blackjack' ? 'blackjack-glow bg-monaco-gold/20 text-monaco-gold' : 'win-glow bg-green-500/20 text-green-400'
                    }`}>
                      +{payout.toFixed(4)} ZEC
                      {netResult > 0 && (
                        <span className="text-sm ml-2 opacity-70">(+{netResult.toFixed(4)} profit)</span>
                      )}
                    </div>
                  )
                } else if (isPush) {
                  return (
                    <div className="text-xl font-bold text-champagne-gold px-6 py-3 rounded-lg bg-champagne-gold/10 border border-champagne-gold/30 result-pop">
                      Push - Bet Returned
                    </div>
                  )
                } else {
                  return (
                    <div className="text-xl font-bold text-burgundy px-6 py-3 rounded-lg bg-burgundy/10 border border-burgundy/30 loss-shake">
                      -{totalBet.toFixed(4)} ZEC
                    </div>
                  )
                }
              })()}

              {/* Play Again Button - More prominent */}
              <button
                onClick={handleNewRound}
                className="btn-gold-shimmer text-rich-black px-10 py-4 rounded-lg font-bold text-xl hover:scale-105 active:scale-95 transition-all duration-150 shadow-lg hover:shadow-monaco-gold/40 mt-2"
              >
                PLAY AGAIN
              </button>

              {/* Quick bet adjustment */}
              <div className="text-xs text-champagne-gold/50 mt-1">
                Same bet: {selectedBet} ZEC {perfectPairsBet > 0 && `+ ${perfectPairsBet.toFixed(3)} ZEC Perfect Pairs`}
              </div>
            </div>
          )}
        </div>

        {/* Provably Fair Info */}
        <div className="mt-12 text-center">
          <details className="bg-rich-black/40 rounded-lg p-4 max-w-lg mx-auto border border-monaco-gold/20">
            <summary className="cursor-pointer text-champagne-gold/60 hover:text-monaco-gold transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Blockchain Provably Fair
            </summary>
            <div className="mt-4 text-left text-sm text-champagne-gold/60 space-y-3 font-mono">
              {/* Blockchain Commitment */}
              {commitment && (
                <div className="bg-pepe-green/10 border border-pepe-green/30 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-pepe-green" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-pepe-green text-xs font-bold uppercase tracking-wide">
                      On-Chain Committed
                    </span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-champagne-gold/40">Tx Hash: </span>
                      <code className="text-ivory-white/70 break-all">
                        {commitment.txHash.substring(0, 20)}...
                      </code>
                    </div>
                    <div>
                      <span className="text-champagne-gold/40">Block: </span>
                      <code className="text-ivory-white/70">{commitment.blockHeight}</code>
                    </div>
                    {commitment.explorerUrl && (
                      <a
                        href={commitment.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-monaco-gold hover:text-champagne-gold transition-colors inline-flex items-center gap-1"
                      >
                        View on Explorer
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <span className="text-champagne-gold/40">Server Seed Hash: </span>
                  <code className="text-xs break-all text-ivory-white/70">
                    {gameState?.serverSeedHash || 'Will be shown when game starts'}
                  </code>
                </div>
                {gameState?.serverSeedHash && (
                  <button
                    onClick={() => copyToClipboard(gameState.serverSeedHash!, 'serverSeedHash')}
                    className="text-champagne-gold/40 hover:text-monaco-gold transition-colors p-1"
                    title="Copy to clipboard"
                  >
                    {copiedField === 'serverSeedHash' ? (
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <span className="text-champagne-gold/40">Client Seed: </span>
                  <code className="text-xs break-all text-ivory-white/70">
                    {gameState?.clientSeed || 'Generated automatically'}
                  </code>
                </div>
                {gameState?.clientSeed && (
                  <button
                    onClick={() => copyToClipboard(gameState.clientSeed!, 'clientSeed')}
                    className="text-champagne-gold/40 hover:text-monaco-gold transition-colors p-1"
                    title="Copy to clipboard"
                  >
                    {copiedField === 'clientSeed' ? (
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              <div>
                <span className="text-champagne-gold/40">Nonce: </span>
                <code className="text-ivory-white/70">{gameState?.nonce ?? 0}</code>
              </div>
              {gameId && (
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <span className="text-champagne-gold/40">Game ID: </span>
                    <code className="text-xs text-ivory-white/70">{gameId}</code>
                  </div>
                  <button
                    onClick={() => copyToClipboard(gameId, 'gameId')}
                    className="text-champagne-gold/40 hover:text-monaco-gold transition-colors p-1"
                    title="Copy to clipboard"
                  >
                    {copiedField === 'gameId' ? (
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              )}

              <div className="pt-3 border-t border-monaco-gold/10 font-body">
                <p className="text-xs text-champagne-gold/50 mb-3">
                  The server seed hash is committed to the Zcash blockchain BEFORE you bet.
                  After the game, you can verify the outcome was fair.
                </p>
                {gameId && gameState?.phase === 'complete' && (
                  <a
                    href={`/verify?gameId=${gameId}`}
                    className="inline-flex items-center gap-2 bg-monaco-gold/20 hover:bg-monaco-gold/30 text-monaco-gold px-4 py-2 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Verify This Game
                  </a>
                )}
              </div>
            </div>
          </details>
        </div>

        {/* Session Stats */}
        {session && (
          <div className="mt-8 text-center">
            <div className="bg-rich-black/30 inline-block rounded-lg px-6 py-3 border border-monaco-gold/10">
              <div className="text-xs text-champagne-gold/40 mb-1 uppercase tracking-wide">Session Stats</div>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-champagne-gold/60">Wagered: </span>
                  <span className="text-ivory-white">{session.totalWagered.toFixed(4)} ZEC</span>
                </div>
                <div>
                  <span className="text-champagne-gold/60">Won: </span>
                  <span className="text-monaco-gold">{session.totalWon.toFixed(4)} ZEC</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
