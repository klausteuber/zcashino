'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type {
  VideoPokerVariant,
  VideoPokerGameState,
  VideoPokerHandRank,
  BlockchainCommitment,
  VideoPokerHandHistoryEntry,
  SessionFairnessSummary
} from '@/types'
import VideoPokerHand from '@/components/game/VideoPokerHand'
import PaytableDisplay from '@/components/game/PaytableDisplay'
import { ChipStack } from '@/components/game/Chip'
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'
import { DepositWidget, DepositWidgetCompact } from '@/components/wallet/DepositWidget'
import { WithdrawalModal } from '@/components/wallet/WithdrawalModal'
import JesterLogo from '@/components/ui/JesterLogo'
import { useGameSounds } from '@/hooks/useGameSounds'

const CHIP_VALUES = [0.01, 0.05, 0.1, 0.25, 0.5, 1]

function generateClientSeedHex(bytes: number = 16): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
  }
  const random = new Uint8Array(bytes)
  cryptoApi.getRandomValues(random)
  return Array.from(random).map((value) => value.toString(16).padStart(2, '0')).join('')
}

interface SessionData {
  id: string
  walletAddress: string
  balance: number
  totalWagered: number
  totalWon: number
  fairness?: SessionFairnessSummary | null
  isDemo?: boolean
  isAuthenticated?: boolean
  depositAddress?: string
  withdrawalAddress?: string | null
  maintenanceMode?: boolean
}

interface FairnessRevealBundle {
  mode: 'session_nonce_v1'
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  lastNonceUsed: number | null
  txHash: string
  blockHeight: number | null
  blockTimestamp: string | Date | null
}

export default function VideoPokerGame() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [gameState, setGameState] = useState<Omit<VideoPokerGameState, 'deck'> | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [commitment, setCommitment] = useState<BlockchainCommitment | null>(null)
  const [fairness, setFairness] = useState<SessionFairnessSummary | null>(null)
  const [clientSeedInput, setClientSeedInput] = useState<string>('')
  const [revealBundle, setRevealBundle] = useState<FairnessRevealBundle | null>(null)
  const [variant, setVariant] = useState<VideoPokerVariant>('jacks_or_better')
  const [selectedBet, setSelectedBet] = useState<number>(0.01)
  const [betMultiplier, setBetMultiplier] = useState<number>(5)
  const [isLoading, setIsLoading] = useState(true)
  const [isActing, setIsActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false)
  const [depositAddress, setDepositAddress] = useState<string | null>(null)

  // Withdrawal
  const [showWithdrawal, setShowWithdrawal] = useState(false)

  // Animations
  const [balanceAnimation, setBalanceAnimation] = useState<'increase' | 'decrease' | null>(null)
  const [resultAnimation, setResultAnimation] = useState<string | null>(null)
  const [handHistory, setHandHistory] = useState<VideoPokerHandHistoryEntry[]>([])
  const [previousCardCount, setPreviousCardCount] = useState(0)
  const [shouldAnimateDealing, setShouldAnimateDealing] = useState(false)

  const prevBalanceRef = useRef<number | null>(null)
  const { playSound, isMuted, toggleMute } = useGameSounds(true)

  // Local held cards state (user toggles before submitting draw)
  const [localHeldCards, setLocalHeldCards] = useState<boolean[]>([false, false, false, false, false])

  // Check localStorage for onboarding
  useEffect(() => {
    // TODO(brand-migration): keep zcashino_* keys until a coordinated live-session migration to 21z_* is planned.
    const seen = localStorage.getItem('zcashino_onboarding_seen')
    if (seen) setHasSeenOnboarding(true)
  }, [])

  useEffect(() => {
    const savedClientSeed = localStorage.getItem('zcashino_client_seed')
    if (savedClientSeed && savedClientSeed.trim().length > 0) {
      setClientSeedInput(savedClientSeed)
      return
    }

    const generated = generateClientSeedHex()
    setClientSeedInput(generated)
    localStorage.setItem('zcashino_client_seed', generated)
  }, [])

  useEffect(() => {
    if (fairness?.mode === 'session_nonce_v1' && fairness.clientSeed) {
      setClientSeedInput(fairness.clientSeed)
      localStorage.setItem('zcashino_client_seed', fairness.clientSeed)
    }
  }, [fairness?.mode, fairness?.clientSeed])

  const initSession = useCallback(async (existingSessionId?: string) => {
    try {
      setIsLoading(true)
      const url = existingSessionId
        ? `/api/session?sessionId=${existingSessionId}`
        : '/api/session'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to get session')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSession(data)
      setFairness(data.fairness || null)
      setDepositAddress(data.depositAddress || null)

      if (data.id) {
        localStorage.setItem('zcashino_session_id', data.id)

        // Fetch video poker history
        fetch(`/api/video-poker?sessionId=${data.id}`)
          .then(res => res.json())
          .then(historyData => {
            if (historyData.games) {
              setHandHistory(
                historyData.games
                  .filter((g: { status: string }) => g.status === 'completed')
                  .slice(0, 10)
                  .map((g: { id: string; variant?: string; handRank?: string; totalBet: number; payout?: number; createdAt: string }) => ({
                    id: g.id,
                    variant: (g.variant || 'jacks_or_better') as VideoPokerVariant,
                    handRank: (g.handRank || null) as VideoPokerHandRank | null,
                    totalBet: g.totalBet,
                    payout: g.payout || 0,
                    createdAt: g.createdAt,
                  }))
              )
            }
          })
          .catch(() => {})
      }
    } catch (err) {
      console.error('Session init failed:', err)
      localStorage.removeItem('zcashino_session_id')
      if (existingSessionId) return initSession()
      setError('Failed to initialize session')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const existingSessionId = localStorage.getItem('zcashino_session_id')
    if (existingSessionId) {
      initSession(existingSessionId)
    } else if (!hasSeenOnboarding) {
      setShowOnboarding(true)
      setIsLoading(false)
    } else {
      initSession()
    }
  }, [hasSeenOnboarding, initSession])

  // Balance animation
  useEffect(() => {
    if (session && prevBalanceRef.current !== null) {
      const diff = session.balance - prevBalanceRef.current
      if (diff > 0.0001) {
        setBalanceAnimation('increase')
        setTimeout(() => setBalanceAnimation(null), 1500)
      } else if (diff < -0.0001) {
        setBalanceAnimation('decrease')
        setTimeout(() => setBalanceAnimation(null), 500)
      }
    }
    prevBalanceRef.current = session?.balance ?? null
  }, [session])

  const toggleHold = useCallback((index: number) => {
    if (gameState?.phase !== 'hold') return
    playSound('chipPlace')
    setLocalHeldCards(prev => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }, [gameState?.phase, playSound])

  const isSessionFairnessMode = fairness?.mode === 'session_nonce_v1'
  const canEditSessionClientSeed = !isSessionFairnessMode || fairness?.canEditClientSeed

  const handleDeal = useCallback(async () => {
    if (!session || isActing) return
    const totalBet = selectedBet * betMultiplier
    if (totalBet > session.balance) {
      setError('Insufficient balance')
      return
    }

    setIsActing(true)
    setError(null)
    setResultAnimation(null)
    setLocalHeldCards([false, false, false, false, false])
    setPreviousCardCount(0)
    setShouldAnimateDealing(true)

    try {
      const res = await fetch('/api/video-poker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          sessionId: session.id,
          variant,
          baseBet: selectedBet,
          betMultiplier,
          clientSeed: canEditSessionClientSeed ? (clientSeedInput.trim() || undefined) : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start game')

      setGameId(data.gameId)
      setGameState(data.gameState)
      setCommitment(data.commitment || null)
      if (data.fairness) {
        setFairness(data.fairness)
      }
      setSession(prev => prev ? { ...prev, balance: data.balance, totalWagered: data.totalWagered, totalWon: data.totalWon } : null)

      playSound('cardDeal')
      // Clear animation flag after cards have dealt in
      setTimeout(() => setShouldAnimateDealing(false), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deal')
      setShouldAnimateDealing(false)
    } finally {
      setIsActing(false)
    }
  }, [session, isActing, selectedBet, betMultiplier, variant, playSound, canEditSessionClientSeed, clientSeedInput])

  const handleDraw = useCallback(async () => {
    if (!session || !gameId || isActing || gameState?.phase !== 'hold') return

    setIsActing(true)
    setError(null)
    setPreviousCardCount(5) // All 5 cards exist, but some will be replaced

    const heldIndices = localHeldCards
      .map((held, i) => held ? i : -1)
      .filter(i => i >= 0)

    try {
      const res = await fetch('/api/video-poker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'draw',
          sessionId: session.id,
          gameId,
          heldIndices,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to draw')

      setGameState(data.gameState)
      setSession(prev => prev ? { ...prev, balance: data.balance, totalWagered: data.totalWagered, totalWon: data.totalWon } : null)

      playSound('cardDeal')

      // Show result animation
      if (data.gameState.handRank && data.gameState.handRank !== 'nothing') {
        setResultAnimation(data.gameState.handRank)
        playSound('win')

        // Add to history
        setHandHistory(prev => [{
          id: gameId,
          variant,
          handRank: data.gameState.handRank,
          totalBet: selectedBet * betMultiplier,
          payout: data.gameState.lastPayout,
          createdAt: new Date().toISOString(),
        }, ...prev].slice(0, 10))
      } else {
        setResultAnimation('nothing')
        playSound('lose')

        setHandHistory(prev => [{
          id: gameId,
          variant,
          handRank: null,
          totalBet: selectedBet * betMultiplier,
          payout: 0,
          createdAt: new Date().toISOString(),
        }, ...prev].slice(0, 10))
      }

      // Clear result animation after delay
      setTimeout(() => setResultAnimation(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to draw')
    } finally {
      setIsActing(false)
    }
  }, [session, gameId, isActing, gameState?.phase, localHeldCards, playSound, variant, selectedBet, betMultiplier])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isActing || isLoading) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const phase = gameState?.phase

      // 1-5: toggle hold during hold phase
      if (phase === 'hold') {
        const num = parseInt(e.key)
        if (num >= 1 && num <= 5) {
          e.preventDefault()
          toggleHold(num - 1)
          return
        }
      }

      // Enter/D: Deal or Draw
      if (e.key === 'Enter' || e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        if (!phase || phase === 'betting' || phase === 'complete') {
          handleDeal()
        } else if (phase === 'hold') {
          handleDraw()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [gameState?.phase, isActing, isLoading, handleDeal, handleDraw, toggleHold])

  const handleDemoSelect = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/session')
      if (!res.ok) throw new Error('Failed to create demo session')
      const data = await res.json()
      setSession(data)
      setFairness(data.fairness || null)
      localStorage.setItem('zcashino_session_id', data.id)
      localStorage.setItem('zcashino_onboarding_seen', 'true')
      setHasSeenOnboarding(true)
    } catch (err) {
      setError('Failed to create demo session')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleCreateRealSession = useCallback(async () => {
    try {
      const walletId = `real_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const res = await fetch(`/api/session?wallet=${walletId}`)
      if (!res.ok) throw new Error('Failed to create session')
      const data = await res.json()
      setSession(data)
      setFairness(data.fairness || null)
      localStorage.setItem('zcashino_session_id', data.id)
      return { sessionId: data.id, depositAddress: data.depositAddress || '' }
    } catch (err) {
      console.error('Failed to create real session:', err)
      return null
    }
  }, [])

  const handleSetWithdrawalAddress = useCallback(async (address: string) => {
    if (!session) return false
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-withdrawal-address',
          sessionId: session.id,
          withdrawalAddress: address,
        }),
      })
      if (!res.ok) return false
      const data = await res.json()
      if (data.depositAddress) setDepositAddress(data.depositAddress)
      setSession(prev => prev ? {
        ...prev,
        withdrawalAddress: data.withdrawalAddress ?? address,
        depositAddress: data.depositAddress ?? prev.depositAddress,
      } : prev)
      return true
    } catch (err) {
      console.error('Failed to set withdrawal address:', err)
      return false
    }
  }, [session])

  const handleDepositComplete = useCallback((balance: number) => {
    setSession(prev => prev ? { ...prev, balance, isAuthenticated: true } : null)
    setShowOnboarding(false)
    localStorage.setItem('zcashino_onboarding_seen', 'true')
    setHasSeenOnboarding(true)
  }, [])

  const refreshFairnessState = useCallback(async (sessionIdOverride?: string) => {
    const targetSessionId = sessionIdOverride || session?.id
    if (!targetSessionId) return
    try {
      const response = await fetch(`/api/fairness?sessionId=${encodeURIComponent(targetSessionId)}`)
      if (!response.ok) return
      const data = await response.json()
      if (data?.mode === 'session_nonce_v1' || data?.mode === 'legacy_per_game_v1') {
        setFairness(data)
      }
    } catch {
      // Non-blocking
    }
  }, [session?.id])

  const persistClientSeedIfEditable = useCallback(async () => {
    if (!session?.id || !isSessionFairnessMode || !canEditSessionClientSeed) return
    const trimmed = clientSeedInput.trim()
    if (!trimmed) return

    try {
      const response = await fetch('/api/fairness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-client-seed',
          sessionId: session.id,
          clientSeed: trimmed,
        }),
      })
      const data = await response.json()
      if (response.ok && data?.fairness) {
        setFairness(data.fairness)
      }
    } catch {
      // Ignore - seed can still be set on deal request.
    }
  }, [canEditSessionClientSeed, clientSeedInput, isSessionFairnessMode, session?.id])

  const handleRotateSeed = useCallback(async () => {
    if (!session?.id || !isSessionFairnessMode || isActing) return

    setIsActing(true)
    setError(null)
    try {
      const response = await fetch('/api/fairness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rotate-seed',
          sessionId: session.id,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to rotate seed')
      }

      if (data?.fairness) {
        setFairness(data.fairness)
      }
      if (data?.reveal) {
        setRevealBundle(data.reveal as FairnessRevealBundle)
      }

      setGameId(null)
      setGameState(null)
      setCommitment(null)
      setLocalHeldCards([false, false, false, false, false])
      await refreshFairnessState(session.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate seed')
    } finally {
      setIsActing(false)
    }
  }, [isActing, isSessionFairnessMode, refreshFairnessState, session?.id])

  const isDeucesWild = variant === 'deuces_wild'
  const phase = gameState?.phase
  const isGameActive = phase === 'hold'
  const isComplete = phase === 'complete'
  const canDeal = !isActing && (!phase || phase === 'betting' || phase === 'complete')
  const canDraw = !isActing && phase === 'hold'

  const getResultDisplay = (): { text: string; icon: string; className: string; animClass: string } | null => {
    if (!resultAnimation || !gameState) return null
    if (resultAnimation === 'nothing') {
      return { text: 'NO WIN', icon: '', className: 'text-bone-white/80', animClass: 'outcome-overlay' }
    }
    const display = gameState.message || resultAnimation.replace(/_/g, ' ').toUpperCase()
    if (resultAnimation === 'royal_flush' || resultAnimation === 'natural_royal_flush') {
      return { text: display, icon: '', className: 'text-masque-gold blackjack-shimmer-text', animClass: 'outcome-overlay-blackjack' }
    }
    if (resultAnimation === 'four_of_a_kind' || resultAnimation === 'straight_flush' || resultAnimation === 'four_deuces') {
      return { text: display, icon: '', className: 'text-masque-gold blackjack-shimmer-text', animClass: 'outcome-overlay' }
    }
    return { text: display, icon: '', className: 'text-masque-gold', animClass: 'outcome-overlay' }
  }

  const resultDisplay = getResultDisplay()

  // Loading state — themed card shuffle
  if (isLoading && !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="w-14 h-[4.9rem] sm:w-16 sm:h-[5.6rem] playing-card-back bg-gradient-to-br from-jester-purple-dark via-jester-purple to-jester-purple-dark rounded-lg border-2 border-masque-gold/25 flex items-center justify-center shadow-lg"
              style={{
                animation: `shuffle-bob 1.2s ease-in-out ${i * 0.15}s infinite`,
              }}
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 border border-masque-gold/20 rounded-full flex items-center justify-center">
                <span className="text-masque-gold/40 text-xs font-display">21z</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-venetian-gold/50 font-display text-sm tracking-wider">Shuffling the deck...</p>
      </div>
    )
  }

  // Onboarding
  if (showOnboarding) {
    return (
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onDemoSelect={handleDemoSelect}
        onDepositComplete={handleDepositComplete}
        sessionId={session?.id || null}
        depositAddress={depositAddress}
        onCreateRealSession={handleCreateRealSession}
        onSetWithdrawalAddress={handleSetWithdrawalAddress}
      />
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <JesterLogo size="sm" />
          </Link>
          <div>
            <h1 className="text-lg font-display font-bold text-masque-gold">Video Poker</h1>
            <p className="text-xs text-venetian-gold/50">Provably Fair</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Sound toggle */}
          <button onClick={toggleMute} className="text-venetian-gold/50 hover:text-masque-gold transition-colors" aria-label={isMuted ? 'Unmute' : 'Mute'}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isMuted ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </>
              )}
            </svg>
          </button>

          {/* Navigation */}
          <Link href="/blackjack" className="text-xs text-venetian-gold/50 hover:text-masque-gold transition-colors px-2 py-1 rounded-full border border-masque-gold/15 hover:border-masque-gold/30">
            Blackjack
          </Link>

          {/* Balance */}
          <div className={`text-right transition-all duration-300 ${
            balanceAnimation === 'increase' ? 'text-green-400 scale-105' :
            balanceAnimation === 'decrease' ? 'text-blood-ruby scale-95' :
            'text-masque-gold'
          }`}>
            <div className="text-xs text-venetian-gold/50">Balance</div>
            <div className="font-mono font-bold text-sm sm:text-base">{session?.balance.toFixed(4)} ZEC</div>
          </div>
        </div>
      </div>

      {/* === GAME ZONE === */}
      <div className="bg-midnight-black/15 rounded-2xl cyber-panel p-3 sm:p-5 space-y-4">
        {/* Variant selector */}
        <div className="flex justify-center gap-2">
          <button
            onClick={() => !isGameActive && setVariant('jacks_or_better')}
            disabled={isGameActive}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              variant === 'jacks_or_better'
                ? 'bg-masque-gold text-midnight-black'
                : 'bg-midnight-black/30 text-venetian-gold/60 hover:text-masque-gold border border-masque-gold/20'
            } ${isGameActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            Jacks or Better
          </button>
          <button
            onClick={() => !isGameActive && setVariant('deuces_wild')}
            disabled={isGameActive}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              variant === 'deuces_wild'
                ? 'bg-masque-gold text-midnight-black'
                : 'bg-midnight-black/30 text-venetian-gold/60 hover:text-masque-gold border border-masque-gold/20'
            } ${isGameActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            Deuces Wild
          </button>
        </div>

        {/* Paytable */}
        <PaytableDisplay
          variant={variant}
          betMultiplier={betMultiplier}
          winningRank={isComplete ? gameState?.handRank : null}
        />

        {/* Cards area — the visual hero */}
        <div className="relative min-h-[140px] sm:min-h-[180px] lg:min-h-[240px] flex flex-col items-center justify-center py-2 sm:py-4">
          {/* Result overlay */}
          {resultDisplay && (
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
              <div className={`text-3xl sm:text-4xl lg:text-5xl font-display font-bold ${resultDisplay.className} ${resultDisplay.animClass}`}>
                {resultDisplay.text}
                {gameState && gameState.lastPayout > 0 && (
                  <div className="text-lg mt-1 font-mono text-center">
                    +{gameState.lastPayout.toFixed(4)} ZEC
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cards */}
          {gameState && gameState.hand && gameState.hand.length > 0 ? (
            <VideoPokerHand
              cards={gameState.hand}
              heldCards={phase === 'hold' ? localHeldCards : (gameState.heldCards || [false, false, false, false, false])}
              onToggleHold={phase === 'hold' ? toggleHold : undefined}
              disabled={phase !== 'hold' || isActing}
              isWild={isDeucesWild ? (card) => card.rank === '2' : undefined}
              animateDealing={shouldAnimateDealing}
              previousCardCount={previousCardCount}
            />
          ) : (
            <div className="flex justify-center gap-2 sm:gap-3 lg:gap-4">
              {/* Placeholder card backs — responsive sizes matching dealt cards */}
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="w-16 h-[5.6rem] sm:w-20 sm:h-[7rem] lg:w-28 lg:h-[9.8rem] bg-gradient-to-br from-jester-purple-dark via-jester-purple to-jester-purple-dark rounded-lg border-2 border-masque-gold/20 flex items-center justify-center opacity-50 animate-gentle-pulse"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-masque-gold/30" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* === ACTION ZONE === */}
      <div className="space-y-3">
        {/* Coin multiplier */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs text-venetian-gold/50">Coins:</span>
          {[1, 2, 3, 4, 5].map(m => (
            <button
              key={m}
              onClick={() => !isGameActive && setBetMultiplier(m)}
              disabled={isGameActive}
              className={`w-8 h-8 rounded-full text-sm font-bold transition-all duration-150 ${
                m === betMultiplier
                  ? 'bg-masque-gold text-midnight-black scale-110'
                  : 'bg-midnight-black/50 text-venetian-gold/60 border border-masque-gold/20 hover:text-masque-gold'
              } ${isGameActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {m}
            </button>
          ))}
          <span className="text-sm text-venetian-gold/50 ml-2 font-mono">
            = {(selectedBet * betMultiplier).toFixed(2)} ZEC
          </span>
        </div>

        {/* Chip selector — smaller on mobile */}
        <div className="sm:hidden">
          <ChipStack
            values={CHIP_VALUES}
            selectedValue={selectedBet}
            onSelect={(v) => { if (!isGameActive) setSelectedBet(v) }}
            disabled={isGameActive}
            size="sm"
          />
        </div>
        <div className="hidden sm:block">
          <ChipStack
            values={CHIP_VALUES}
            selectedValue={selectedBet}
            onSelect={(v) => { if (!isGameActive) setSelectedBet(v) }}
            disabled={isGameActive}
          />
        </div>

        {isSessionFairnessMode && fairness && (
          <div className="bg-midnight-black/40 border border-masque-gold/20 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-masque-gold font-semibold uppercase tracking-wide">
                Seed Session
              </span>
              <button
                onClick={handleRotateSeed}
                disabled={isActing}
                className="px-2 py-1 rounded border border-masque-gold/40 text-masque-gold hover:bg-masque-gold/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rotate & Reveal
              </button>
            </div>
            <div className="text-venetian-gold/60 break-all">
              Commitment: <span className="text-bone-white/70">{fairness.commitmentTxHash || 'Pending'}</span>
            </div>
            <div className="text-venetian-gold/60">
              Next Nonce: <span className="text-bone-white/70">{fairness.nextNonce ?? 0}</span>
            </div>
            <div className="space-y-1">
              <div className="text-venetian-gold/60">Client Seed</div>
              <input
                type="text"
                value={clientSeedInput}
                onChange={(event) => {
                  const next = event.target.value.slice(0, 128)
                  setClientSeedInput(next)
                  localStorage.setItem('zcashino_client_seed', next)
                }}
                onBlur={persistClientSeedIfEditable}
                disabled={!canEditSessionClientSeed || isActing}
                maxLength={128}
                className="w-full bg-midnight-black/60 border border-masque-gold/20 rounded px-2 py-1 text-bone-white font-mono text-xs disabled:opacity-60"
              />
              <div className="text-venetian-gold/40">
                {canEditSessionClientSeed
                  ? 'Editable until your first hand in this seed session.'
                  : 'Locked until you rotate seed.'}
              </div>
            </div>
            {revealBundle && (
              <div className="pt-2 border-t border-masque-gold/20 text-venetian-gold/60 space-y-1">
                <div className="text-masque-gold">Previous Seed Revealed</div>
                <div className="break-all">Tx: <span className="text-bone-white/70">{revealBundle.txHash}</span></div>
                <div>Last Nonce: <span className="text-bone-white/70">{revealBundle.lastNonceUsed ?? 'none'}</span></div>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex justify-center gap-3">
            {canDeal && (
              <button
                onClick={handleDeal}
                disabled={isActing || !session || (selectedBet * betMultiplier > (session?.balance ?? 0))}
                className="px-8 py-3 bg-gradient-to-r from-masque-gold to-venetian-gold text-midnight-black font-bold rounded-lg hover:shadow-[0_0_20px_rgba(201,162,39,0.4)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed text-lg font-cinzel"
              >
                {isComplete ? 'DEAL AGAIN' : 'DEAL'}
                <span className="text-xs ml-2 opacity-60 hidden sm:inline">[D]</span>
              </button>
            )}

            {canDraw && (
              <button
                onClick={handleDraw}
                disabled={isActing}
                className="px-8 py-3 bg-gradient-to-r from-masque-gold to-venetian-gold text-midnight-black font-bold rounded-lg hover:shadow-[0_0_20px_rgba(201,162,39,0.4)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed text-lg font-cinzel"
              >
                DRAW
                <span className="text-xs ml-2 opacity-60 hidden sm:inline">[D]</span>
              </button>
            )}
          </div>

          {/* Insufficient funds message */}
          {canDeal && session && selectedBet * betMultiplier > session.balance && (
            <p className="text-blood-ruby text-xs">
              Bet exceeds balance — lower your bet or deposit
            </p>
          )}
        </div>

        {/* Hold instruction */}
        {phase === 'hold' && (
          <p className="text-center text-sm text-venetian-gold/50">
            Click cards to hold, then press DRAW
            <span className="hidden sm:inline"> — or use keys 1-5</span>
          </p>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="text-center text-blood-ruby text-sm bg-blood-ruby/10 border border-blood-ruby/30 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Provably fair info */}
      {commitment && gameState && (
        <div className="text-center space-y-1">
          {isSessionFairnessMode && (
            <p className="text-xs text-venetian-gold/30">
              Session mode: rotate seed to reveal and verify completed hands.
            </p>
          )}
          <p className="text-xs text-venetian-gold/30">
            Seed Hash: <span className="font-mono">{gameState.serverSeedHash?.slice(0, 16)}...</span>
          </p>
          {commitment.txHash && (
            <p className="text-xs text-venetian-gold/30">
              Commitment:{' '}
              <a
                href={commitment.explorerUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-masque-gold/50 hover:text-masque-gold underline"
              >
                {commitment.txHash.slice(0, 12)}...
              </a>
            </p>
          )}
        </div>
      )}

      {/* Session stats */}
      {session && (
        <div className="flex justify-center gap-6 text-sm text-venetian-gold/60 border-t border-masque-gold/10 pt-3">
          <span>Wagered: {session.totalWagered.toFixed(4)} ZEC</span>
          <span>Won: {session.totalWon.toFixed(4)} ZEC</span>
          <span className={session.totalWon - session.totalWagered >= 0 ? 'text-green-400' : 'text-blood-ruby'}>
            Net: {(session.totalWon - session.totalWagered) >= 0 ? '+' : ''}{(session.totalWon - session.totalWagered).toFixed(4)} ZEC
          </span>
        </div>
      )}

      {/* Hand history */}
      {handHistory.length > 0 && (
        <details className="text-sm bg-midnight-black/20 rounded-lg">
          <summary className="text-venetian-gold/50 cursor-pointer hover:text-masque-gold transition-colors px-3 py-2 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            Hand History ({handHistory.length})
          </summary>
          <div className="px-3 pb-3 space-y-1">
            {handHistory.map(entry => {
              const isWin = entry.payout > 0
              const net = entry.payout - entry.totalBet
              return (
                <div key={entry.id} className="flex justify-between text-xs px-2 py-1.5 rounded bg-midnight-black/30">
                  <span className={isWin ? 'text-green-400' : 'text-blood-ruby/70'}>
                    {isWin ? '✓' : '✗'} {entry.handRank ? entry.handRank.replace(/_/g, ' ') : 'no win'}
                  </span>
                  <span className="text-venetian-gold/40">{entry.totalBet.toFixed(4)}</span>
                  <span className={net >= 0 ? 'text-green-400' : 'text-blood-ruby/70'}>
                    {net >= 0 ? '+' : ''}{net.toFixed(4)}
                  </span>
                </div>
              )
            })}
          </div>
        </details>
      )}

      {/* Desktop deposit widget */}
      {session && (
        <div className="hidden sm:block">
          <DepositWidget
            balance={session.balance}
            isDemo={session.isDemo ?? session.walletAddress?.startsWith('demo_') ?? true}
            isAuthenticated={session.isAuthenticated ?? false}
            onDepositClick={() => setShowOnboarding(true)}
            onWithdrawClick={() => setShowWithdrawal(true)}
          />
        </div>
      )}

      {/* Mobile deposit widget */}
      {session && (
        <div className="sm:hidden">
          <DepositWidgetCompact
            balance={session.balance}
            isDemo={session.isDemo ?? session.walletAddress?.startsWith('demo_') ?? true}
            onDepositClick={() => setShowOnboarding(true)}
            onWithdrawClick={() => setShowWithdrawal(true)}
          />
        </div>
      )}

      {/* Withdrawal modal */}
      <WithdrawalModal
        isOpen={showWithdrawal}
        onClose={() => setShowWithdrawal(false)}
        sessionId={session?.id || null}
        balance={session?.balance ?? 0}
        withdrawalAddress={session?.withdrawalAddress ?? null}
        isDemo={session?.isDemo ?? session?.walletAddress?.startsWith('demo_') ?? true}
        onBalanceUpdate={(newBalance) => {
          setSession(prev => prev ? { ...prev, balance: newBalance } : null)
        }}
      />

      {/* Footer links */}
      <div className="flex justify-center gap-4 text-xs text-venetian-gold/30 pb-4">
        <Link href="/provably-fair" className="hover:text-masque-gold transition-colors">
          Provably Fair
        </Link>
        <Link href="/verify" className="hover:text-masque-gold transition-colors">
          Verify
        </Link>
        <Link href="/responsible-gambling" className="hover:text-masque-gold transition-colors">
          Responsible Play
        </Link>
      </div>
    </div>
  )
}
