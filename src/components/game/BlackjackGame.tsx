'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type {
  BlackjackGameState,
  BlackjackAction,
  BlockchainCommitment,
  HandHistoryEntry,
  SessionFairnessSummary
} from '@/types'
import { Hand } from '@/components/game/Card'
import { ChipStack } from '@/components/game/Chip'
import { HandHistory } from '@/components/game/HandHistory'
import { calculateHandValue } from '@/lib/game/deck'
import { MIN_BET, MAX_BET, getAvailableActions } from '@/lib/game/blackjack'
import JesterLogo from '@/components/ui/JesterLogo'
import { useGameSounds } from '@/hooks/useGameSounds'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'
import { DepositWidget, DepositWidgetCompact } from '@/components/wallet/DepositWidget'
import { WithdrawalModal } from '@/components/wallet/WithdrawalModal'

const CHIP_VALUES = [0.01, 0.05, 0.1, 0.25, 0.5, 1]

// Perfect Pairs payouts for tooltip
const PERFECT_PAIRS_INFO = {
  perfect: { name: 'Perfect Pair', multiplier: '25:1', description: 'Same rank & suit' },
  colored: { name: 'Colored Pair', multiplier: '12:1', description: 'Same rank & color' },
  mixed: { name: 'Mixed Pair', multiplier: '6:1', description: 'Same rank, different color' }
}

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

export default function BlackjackGame() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [gameState, setGameState] = useState<Partial<BlackjackGameState> | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [commitment, setCommitment] = useState<BlockchainCommitment | null>(null)
  const [fairness, setFairness] = useState<SessionFairnessSummary | null>(null)
  const [revealBundle, setRevealBundle] = useState<FairnessRevealBundle | null>(null)
  const [selectedBet, setSelectedBet] = useState<number>(0.1)
  const [perfectPairsBet, setPerfectPairsBet] = useState<number>(0)
  const [clientSeedInput, setClientSeedInput] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false)
  const [depositAddress, setDepositAddress] = useState<string | null>(null)

  // Withdrawal state
  const [showWithdrawal, setShowWithdrawal] = useState(false)

  // Animation state
  const [balanceAnimation, setBalanceAnimation] = useState<'increase' | 'decrease' | null>(null)
  const [showFloatingPayout, setShowFloatingPayout] = useState(false)
  const [floatingPayoutAmount, setFloatingPayoutAmount] = useState<number>(0)
  const [resultAnimation, setResultAnimation] = useState<string | null>(null)
  const [previousCardCounts, setPreviousCardCounts] = useState<{ player: number[]; dealer: number }>({ player: [0], dealer: 0 })
  const [showPerfectPairsTooltip, setShowPerfectPairsTooltip] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [insuranceDeclined, setInsuranceDeclined] = useState(false)
  const [handHistory, setHandHistory] = useState<HandHistoryEntry[]>([])

  // Track previous balance and game state for animations
  const prevBalanceRef = useRef<number | null>(null)
  const prevGamePhaseRef = useRef<string | null>(null)

  // Auto-bet state
  const [isAutoBetEnabled, setIsAutoBetEnabled] = useState<boolean>(true)
  const [isAutoBetting, setIsAutoBetting] = useState<boolean>(false)
  const [autoBetCountdown, setAutoBetCountdown] = useState<number | null>(null)
  const autoBetTimerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
  // Use ref to track auto-betting state without triggering effect re-runs
  const isAutoBettingRef = useRef<boolean>(false)
  // Refs to capture values for auto-bet timer closure
  const sessionRef = useRef<SessionData | null>(null)
  const selectedBetRef = useRef<number>(0.1)
  const perfectPairsBetRef = useRef<number>(0)
  const clientSeedRef = useRef<string>('')
  const gameIdRef = useRef<string | null>(null)

  // Sound effects
  const { playSound, isMuted, toggleMute } = useGameSounds(true)

  // Check localStorage for onboarding status
  useEffect(() => {
    const seen = localStorage.getItem('zcashino_onboarding_seen')
    if (seen) {
      setHasSeenOnboarding(true)
    }
  }, [])

  // Load auto-bet preference from localStorage
  useEffect(() => {
    const savedAutoBet = localStorage.getItem('zcashino_auto_bet')
    if (savedAutoBet !== null) {
      setIsAutoBetEnabled(savedAutoBet === 'true')
    }
  }, [])

  // Load client seed from localStorage or generate one
  useEffect(() => {
    const savedClientSeed = localStorage.getItem('zcashino_client_seed')
    if (savedClientSeed && savedClientSeed.trim().length > 0) {
      setClientSeedInput(savedClientSeed)
      return
    }

    const generatedSeed = generateClientSeedHex()
    setClientSeedInput(generatedSeed)
    localStorage.setItem('zcashino_client_seed', generatedSeed)
  }, [])

  useEffect(() => {
    if (fairness?.mode === 'session_nonce_v1' && fairness.clientSeed) {
      setClientSeedInput(fairness.clientSeed)
      localStorage.setItem('zcashino_client_seed', fairness.clientSeed)
    }
  }, [fairness?.mode, fairness?.clientSeed])

  // Keep auto-bet refs in sync with state
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    selectedBetRef.current = selectedBet
  }, [selectedBet])

  useEffect(() => {
    perfectPairsBetRef.current = perfectPairsBet
  }, [perfectPairsBet])

  useEffect(() => {
    clientSeedRef.current = clientSeedInput
  }, [clientSeedInput])

  useEffect(() => {
    gameIdRef.current = gameId
  }, [gameId])

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

      // Store session ID for persistence
      if (data.id) {
        localStorage.setItem('zcashino_session_id', data.id)

        // Fetch game history for this session
        fetch(`/api/game?sessionId=${data.id}`)
          .then(res => res.json())
          .then(historyData => {
            if (historyData.games) {
              setHandHistory(
                historyData.games
                  .filter((g: { status: string }) => g.status === 'completed')
                  .slice(0, 10)
                  .map((g: { id: string; outcome?: string; mainBet: number; payout?: number; createdAt: string }) => ({
                    id: g.id,
                    outcome: (g.outcome || 'lose') as HandHistoryEntry['outcome'],
                    mainBet: g.mainBet,
                    payout: g.payout || 0,
                    createdAt: g.createdAt,
                  }))
              )
            }
          })
          .catch(() => {}) // History is non-critical
      }
    } catch (err) {
      console.error('Session init failed:', err)
      // Clear invalid session and retry with fresh session
      localStorage.removeItem('zcashino_session_id')
      if (existingSessionId) {
        // Retry without stale session ID
        return initSession()
      }
      setError('Failed to initialize session')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initialize session on mount
  useEffect(() => {
    // Check if returning user with existing session
    const existingSessionId = localStorage.getItem('zcashino_session_id')
    if (existingSessionId) {
      initSession(existingSessionId)
    } else if (!hasSeenOnboarding) {
      // First time visitor - show onboarding
      setShowOnboarding(true)
      setIsLoading(false)
    } else {
      initSession()
    }
  }, [hasSeenOnboarding, initSession])

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
  }, [session])

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
        // Longer timeout for blackjack celebration (0.6s in + 2s hold + 0.6s out)
        setTimeout(() => setResultAnimation(null), 3500)
      } else if (payout > 0) {
        setResultAnimation('win')
        setTimeout(() => playSound('win'), 300)
        setTimeout(() => setResultAnimation(null), 3000)
      } else if (message.includes('push')) {
        setResultAnimation('push')
        setTimeout(() => playSound('push'), 300)
        setTimeout(() => setResultAnimation(null), 3000)
      } else {
        setResultAnimation('loss')
        setTimeout(() => playSound('lose'), 300)
        setTimeout(() => setResultAnimation(null), 3000)
      }

      // Add to hand history
      const currentGameId = gameIdRef.current
      if (currentGameId) {
        let outcome: HandHistoryEntry['outcome'] = 'lose'
        if (message.includes('blackjack')) outcome = 'blackjack'
        else if (payout > 0) outcome = 'win'
        else if (message.includes('push')) outcome = 'push'

        setHandHistory(prev => [{
          id: currentGameId,
          outcome,
          mainBet: gameState?.currentBet ?? 0,
          payout,
          createdAt: new Date().toISOString(),
        }, ...prev].slice(0, 10))
      }
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

  // Handle demo mode selection from onboarding
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

  // Create real session (non-demo)
  const handleCreateRealSession = useCallback(async () => {
    try {
      // Generate a unique wallet identifier
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

  // Set withdrawal address
  const handleSetWithdrawalAddress = useCallback(async (address: string) => {
    if (!session) return false
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-withdrawal-address',
          sessionId: session.id,
          withdrawalAddress: address
        })
      })
      if (!res.ok) return false
      const data = await res.json()
      if (data.depositAddress) {
        setDepositAddress(data.depositAddress)
      }
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

  // Handle deposit completion
  const handleDepositComplete = useCallback((balance: number) => {
    setSession(prev => prev ? { ...prev, balance, isAuthenticated: true } : null)
    setShowOnboarding(false)
    localStorage.setItem('zcashino_onboarding_seen', 'true')
    setHasSeenOnboarding(true)
  }, [])

  // Switch from demo to real ZEC
  const handleSwitchToReal = useCallback(() => {
    setShowOnboarding(true)
  }, [])

  const isSessionFairnessMode = fairness?.mode === 'session_nonce_v1'
  const canEditSessionClientSeed = !isSessionFairnessMode || fairness?.canEditClientSeed

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
      // Non-blocking; gameplay should continue even if fairness refresh fails.
    }
  }, [session?.id])

  const persistClientSeedIfEditable = useCallback(async () => {
    if (!session?.id || !isSessionFairnessMode || !canEditSessionClientSeed) return
    const trimmed = clientSeedInput.trim()
    if (!trimmed) return

    try {
      const res = await fetch('/api/fairness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-client-seed',
          sessionId: session.id,
          clientSeed: trimmed,
        }),
      })
      const data = await res.json()
      if (res.ok && data?.fairness) {
        setFairness(data.fairness)
      }
    } catch {
      // Ignore; seed can still be applied on next game start.
    }
  }, [canEditSessionClientSeed, clientSeedInput, isSessionFairnessMode, session?.id])

  const handleRotateSeed = useCallback(async () => {
    if (!session?.id || !isSessionFairnessMode || isLoading) return

    setIsLoading(true)
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
      await refreshFairnessState(session.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate seed')
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, isSessionFairnessMode, refreshFairnessState, session?.id])

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
            perfectPairsBet,
            clientSeed: canEditSessionClientSeed ? (clientSeedInput.trim() || undefined) : undefined,
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
      if (data.fairness) {
        setFairness(data.fairness)
      }
      setSession(prev => prev ? {
        ...prev,
        balance: data.balance,
        totalWagered: data.totalWagered ?? prev.totalWagered,
        totalWon: data.totalWon ?? prev.totalWon
      } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game')
    } finally {
      setIsLoading(false)
    }
  }, [session, selectedBet, perfectPairsBet, clientSeedInput, isLoading, canEditSessionClientSeed])

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
      setSession(prev => prev ? {
        ...prev,
        balance: data.balance,
        totalWagered: data.totalWagered ?? prev.totalWagered,
        totalWon: data.totalWon ?? prev.totalWon
      } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Game error')
    } finally {
      setIsLoading(false)
    }
  }, [session, gameId, isLoading])

  const handleNewRound = useCallback(() => {
    // Cancel any pending auto-bet
    if (autoBetTimerRef.current) {
      clearTimeout(autoBetTimerRef.current)
      autoBetTimerRef.current = null
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
    isAutoBettingRef.current = false
    setIsAutoBetting(false)
    setAutoBetCountdown(null)

    setGameId(null)
    setGameState(null)
    setCommitment(null)
    setError(null)
    setResultAnimation(null)
    setPreviousCardCounts({ player: [0], dealer: 0 })
    setInsuranceDeclined(false)
  }, [])

  // Toggle auto-bet and persist to localStorage
  const toggleAutoBet = useCallback(() => {
    setIsAutoBetEnabled(prev => {
      const newValue = !prev
      localStorage.setItem('zcashino_auto_bet', String(newValue))
      if (!isMuted) playSound('buttonClick')
      // If disabling while countdown is active, cancel it
      if (!newValue && isAutoBettingRef.current) {
        if (autoBetTimerRef.current) {
          clearTimeout(autoBetTimerRef.current)
          autoBetTimerRef.current = null
        }
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
          countdownIntervalRef.current = null
        }
        isAutoBettingRef.current = false
        setIsAutoBetting(false)
        setAutoBetCountdown(null)
      }
      return newValue
    })
  }, [isMuted, playSound])

  // Cancel auto-bet countdown
  const cancelAutoBet = useCallback(() => {
    if (autoBetTimerRef.current) {
      clearTimeout(autoBetTimerRef.current)
      autoBetTimerRef.current = null
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
    isAutoBettingRef.current = false
    setIsAutoBetting(false)
    setAutoBetCountdown(null)
    if (!isMuted) playSound('buttonClick')
  }, [isMuted, playSound])

  const handleInsurance = useCallback(async (takeInsurance: boolean) => {
    if (!session || !gameId || isLoading) return

    if (!takeInsurance) {
      setInsuranceDeclined(true)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'insurance',
          sessionId: session.id,
          gameId
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to take insurance')
      }

      const data = await res.json()
      setGameState(data.gameState)
      setInsuranceDeclined(true) // Hide insurance prompt after taking
      setSession(prev => prev ? {
        ...prev,
        balance: data.balance,
        totalWagered: data.totalWagered ?? prev.totalWagered,
        totalWon: data.totalWon ?? prev.totalWon
      } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Insurance error')
    } finally {
      setIsLoading(false)
    }
  }, [session, gameId, isLoading])

  // Auto-bet effect: automatically place bet and deal when game completes
  useEffect(() => {
    // Only trigger when:
    // 1. Auto-bet is enabled
    // 2. Game phase is 'complete'
    // 3. Not currently loading
    // 4. Not already in auto-betting state (use ref to avoid re-triggering)
    // 5. Session exists with sufficient balance
    const currentSession = sessionRef.current
    const currentBet = selectedBetRef.current
    const currentPerfectPairs = perfectPairsBetRef.current
    const currentClientSeed = clientSeedRef.current
    const totalBetNeeded = currentBet + currentPerfectPairs
    const canAutoBet =
      isAutoBetEnabled &&
      gameState?.phase === 'complete' &&
      !isLoading &&
      !isAutoBettingRef.current &&
      currentSession &&
      totalBetNeeded <= currentSession.balance

    if (canAutoBet) {
      // Mark as auto-betting immediately using ref (won't trigger re-render)
      isAutoBettingRef.current = true
      setIsAutoBetting(true)

      // Clear any existing timers first to prevent pileup
      if (autoBetTimerRef.current) {
        clearTimeout(autoBetTimerRef.current)
        autoBetTimerRef.current = null
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }

      // 2-second delay to view results
      const autoBetDelay = 2000
      setAutoBetCountdown(2)

      // Countdown interval - use functional state update to avoid stale closure
      const intervalId = setInterval(() => {
        setAutoBetCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(intervalId)
            return null
          }
          return prev - 1
        })
      }, 1000)
      countdownIntervalRef.current = intervalId

      // Auto-deal timer - capture values at creation time
      const capturedSession = currentSession
      const capturedBet = currentBet
      const capturedPerfectPairs = currentPerfectPairs
      const capturedClientSeed = currentClientSeed

      const timerId = setTimeout(async () => {
        // Clear the countdown interval
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
          countdownIntervalRef.current = null
        }
        setAutoBetCountdown(null)

        // Reset game state first
        setGameId(null)
        setGameState(null)
        setCommitment(null)
        setError(null)
        setResultAnimation(null)
        setPreviousCardCounts({ player: [0], dealer: 0 })
        setInsuranceDeclined(false)

        // Small delay before placing bet
        await new Promise(resolve => setTimeout(resolve, 300))

        // Place bet automatically using captured values
        try {
          const res = await fetch('/api/game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'start',
                sessionId: capturedSession.id,
                bet: capturedBet,
                perfectPairsBet: capturedPerfectPairs,
                clientSeed: canEditSessionClientSeed ? (capturedClientSeed || undefined) : undefined,
              })
            })
          const data = await res.json()
          if (res.ok) {
            setGameId(data.gameId)
            setGameState(data.gameState)
            setCommitment(data.commitment || null)
            if (data.fairness) {
              setFairness(data.fairness)
            }
            setSession(prev => prev ? {
              ...prev,
              balance: data.balance,
              totalWagered: data.totalWagered ?? prev.totalWagered,
              totalWon: data.totalWon ?? prev.totalWon
            } : null)
          } else {
            setError(data.error || 'Auto-bet failed')
          }
        } catch {
          setError('Auto-bet failed. Please try manually.')
        }

        // Reset auto-betting state
        isAutoBettingRef.current = false
        setIsAutoBetting(false)
      }, autoBetDelay)
      autoBetTimerRef.current = timerId

      // Proper cleanup function to prevent timer pileup on re-renders
      return () => {
        if (autoBetTimerRef.current) {
          clearTimeout(autoBetTimerRef.current)
          autoBetTimerRef.current = null
        }
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
          countdownIntervalRef.current = null
        }
        // Reset state on cleanup
        isAutoBettingRef.current = false
        setIsAutoBetting(false)
        setAutoBetCountdown(null)
      }
    }
  }, [
    isAutoBetEnabled,
    gameState?.phase,
    isLoading,
    canEditSessionClientSeed
  ])

  // Calculate available actions
  const availableActions = gameState ? getAvailableActions(gameState as BlackjackGameState) : []

  // Calculate hand values
  const playerValue = gameState?.playerHands?.[0]
    ? calculateHandValue(gameState.playerHands[0].cards)
    : 0
  const dealerValue = gameState?.dealerHand?.cards?.length
    ? calculateHandValue(gameState.dealerHand.cards.filter(c => c.faceUp))
    : 0
  const fullDealerValue = gameState?.dealerHand?.cards?.length
    ? calculateHandValue(gameState.dealerHand.cards)
    : 0

  // Determine hand results for animations
  const getHandResult = (handIndex: number): 'win' | 'lose' | 'push' | 'blackjack' | null => {
    if (gameState?.phase !== 'complete') return null
    const hand = gameState?.playerHands?.[handIndex]
    if (!hand) return null

    const handValue = calculateHandValue(hand.cards)
    const isBlackjack = handValue === 21 && hand.cards.length === 2
    const isBust = handValue > 21
    const dealerBust = fullDealerValue > 21

    if (isBust) return 'lose'
    if (isBlackjack && !(fullDealerValue === 21 && gameState.dealerHand?.cards?.length === 2)) return 'blackjack'
    if (dealerBust) return 'win'
    if (handValue > fullDealerValue) return 'win'
    if (handValue === fullDealerValue) return 'push'
    return 'lose'
  }

  // Determine dealer result for animation
  const getDealerResult = (): 'win' | 'lose' | 'push' | null => {
    if (gameState?.phase !== 'complete') return null
    const playerResults = gameState?.playerHands?.map((_, i) => getHandResult(i)) ?? []

    // If all player hands lost, dealer wins
    if (playerResults.every(r => r === 'lose')) return 'win'
    // If all player hands won/blackjack, dealer loses
    if (playerResults.every(r => r === 'win' || r === 'blackjack')) return 'lose'
    // If all pushes, it's a push
    if (playerResults.every(r => r === 'push')) return 'push'
    // Mixed results
    return null
  }

  // Should we show insurance offer?
  const showInsuranceOffer = gameState?.phase === 'playerTurn' &&
    !insuranceDeclined &&
    !gameState?.dealerPeeked &&
    (gameState?.insuranceBet ?? 0) === 0 &&
    gameState?.dealerHand?.cards?.[0]?.rank === 'A' &&
    gameState?.playerHands?.[0]?.cards?.length === 2  // Only on initial deal

  // Calculate insurance amount (half of main bet)
  const insuranceAmount = (gameState?.currentBet ?? 0) / 2

  // Keyboard shortcuts (desktop)
  useKeyboardShortcuts({
    availableActions,
    gamePhase: gameState?.phase,
    isLoading,
    isAutoBetting,
    showInsuranceOffer: !!showInsuranceOffer,
    hasGameState: !!gameState,
    onAction: (action) => { playSound('buttonClick'); handleAction(action) },
    onInsurance: (take) => { playSound('buttonClick'); handleInsurance(take) },
    onPlaceBet: handlePlaceBet,
    onNewRound: handleNewRound,
  })

  if (isLoading && !session) {
    return (
      <main className="min-h-screen felt-texture flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <JesterLogo size="lg" className="text-jester-purple-light animate-pulse" />
          <div className="text-venetian-gold/50 font-display">Shuffling the deck...</div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen felt-texture">
      {/* Header */}
      <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm">
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <JesterLogo size="md" className="text-jester-purple-light" />
            <span className="text-base sm:text-xl font-display font-bold tracking-tight">
              <span className="text-masque-gold">Cypher</span>
              <span className="text-bone-white">Jester</span>
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-4">
            {/* Sound toggle */}
            <button
              onClick={() => {
                toggleMute()
                if (!isMuted) playSound('buttonClick')
              }}
              className="text-venetian-gold/60 hover:text-masque-gold transition-colors p-1.5 sm:p-2"
              title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            >
              {isMuted ? (
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>

            {/* Auto-bet toggle */}
            <button
              onClick={toggleAutoBet}
              className={`transition-colors p-1.5 sm:p-2 ${
                isAutoBetEnabled
                  ? 'text-masque-gold'
                  : 'text-venetian-gold/60 hover:text-masque-gold'
              }`}
              title={isAutoBetEnabled ? 'Auto-bet enabled (click to disable)' : 'Auto-bet disabled (click to enable)'}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Balance & Deposit Widget - compact on mobile, full on desktop */}
            <div className="relative">
              <div className="hidden sm:block">
                <DepositWidget
                  balance={session?.balance ?? 0}
                  isDemo={session?.isDemo ?? session?.walletAddress?.startsWith('demo_') ?? true}
                  isAuthenticated={session?.isAuthenticated ?? false}
                  onDepositClick={() => setShowOnboarding(true)}
                  onWithdrawClick={() => setShowWithdrawal(true)}
                  onSwitchToReal={session?.isDemo || session?.walletAddress?.startsWith('demo_') ? handleSwitchToReal : undefined}
                />
              </div>
              <div className="block sm:hidden">
                <DepositWidgetCompact
                  balance={session?.balance ?? 0}
                  isDemo={session?.isDemo ?? session?.walletAddress?.startsWith('demo_') ?? true}
                  onDepositClick={() => setShowOnboarding(true)}
                  onWithdrawClick={() => setShowWithdrawal(true)}
                />
              </div>
              {/* Floating payout indicator */}
              {showFloatingPayout && floatingPayoutAmount > 0 && (
                <span className="absolute -top-2 -right-2 text-green-400 font-bold text-sm float-up z-10">
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
          <div className="bg-blood-ruby/30 border border-blood-ruby text-bone-white px-4 py-2 rounded-lg">
            {error}
          </div>
        </div>
      )}

      {/* Game Area */}
      <div className="container mx-auto px-4 py-8 relative">
        {/* Hand Outcome Overlay — Blackjack celebration */}
        {resultAnimation === 'blackjack' && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="outcome-overlay-blackjack text-center">
              <div className="relative">
                <span className="star-burst star-burst-delay-1 absolute -top-8 -left-12 text-3xl text-masque-gold opacity-0">{'\u2605'}</span>
                <span className="star-burst star-burst-delay-2 absolute -top-6 -right-10 text-2xl text-venetian-gold opacity-0">{'\u2605'}</span>
                <span className="star-burst star-burst-delay-3 absolute -top-10 left-1/2 text-4xl text-masque-gold opacity-0">{'\u2605'}</span>
              </div>
              <div className="text-7xl sm:text-9xl font-display font-bold blackjack-shimmer-text drop-shadow-lg">
                BLACKJACK!
              </div>
              <div className="text-4xl sm:text-5xl mt-3 text-masque-gold star-burst star-burst-delay-2">
                {'\u2605'} 21 {'\u2605'}
              </div>
            </div>
          </div>
        )}
        {/* Hand Outcome Overlay — Win/Loss/Push */}
        {resultAnimation && resultAnimation !== 'blackjack' && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className={`outcome-overlay text-center ${
              resultAnimation === 'win' ? 'text-green-400' :
              resultAnimation === 'loss' ? 'text-blood-ruby' :
              'text-venetian-gold'
            }`}>
              <div className="text-6xl sm:text-8xl font-display font-bold drop-shadow-lg">
                {resultAnimation === 'win' && 'WIN'}
                {resultAnimation === 'loss' && 'LOSS'}
                {resultAnimation === 'push' && 'PUSH'}
              </div>
              <div className="text-4xl sm:text-5xl mt-2">
                {resultAnimation === 'win' && '\u2713'}
                {resultAnimation === 'loss' && '\u2717'}
                {resultAnimation === 'push' && '\u2550'}
              </div>
            </div>
          </div>
        )}

        {/* Dealer Area */}
        <div className="flex flex-col items-center mb-8">
          <div className="text-sm text-gray-400 mb-2">DEALER</div>
          {gameState?.dealerHand?.cards?.length ? (
            <Hand
              cards={gameState.dealerHand.cards}
              value={gameState.phase === 'complete' ? fullDealerValue : dealerValue}
              showValue={gameState.phase !== 'playerTurn'}
              size="lg"
              animateDealing={true}
              previousCardCount={previousCardCounts.dealer}
              result={getDealerResult()}
              isBust={fullDealerValue > 21 && gameState.phase === 'complete'}
            />
          ) : (
            <div className="h-28 flex flex-col items-center justify-center gap-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-masque-gold/30 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-masque-gold/30 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-masque-gold/30 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-venetian-gold/50 text-sm">Place your bet to deal</span>
            </div>
          )}
        </div>

        {/* Game Message */}
        <div className="text-center mb-4">
          <div className={`bg-midnight-black/40 inline-block px-6 py-3 rounded-lg border transition-all duration-300 ${
            resultAnimation === 'blackjack' ? 'border-masque-gold blackjack-glow result-pop' :
            resultAnimation === 'win' ? 'border-green-500 win-glow result-pop' :
            resultAnimation === 'loss' ? 'border-blood-ruby loss-shake' :
            resultAnimation === 'push' ? 'border-venetian-gold/50 result-pop' :
            'border-masque-gold/20'
          }`}>
            <span className={`text-lg font-semibold ${
              resultAnimation === 'blackjack' ? 'text-masque-gold' :
              resultAnimation === 'win' ? 'text-green-400' :
              resultAnimation === 'loss' ? 'text-blood-ruby' :
              resultAnimation === 'push' ? 'text-venetian-gold' :
              'text-bone-white'
            }`}>
              {resultAnimation === 'blackjack' && '🎰 '}
              {gameState?.message || 'Place your bet to begin'}
              {resultAnimation === 'blackjack' && ' 🎰'}
            </span>
          </div>
        </div>

        {/* Perfect Pairs Result */}
        {gameState && (gameState.perfectPairsBet ?? 0) > 0 && gameState.perfectPairsResult && (
          <div className="text-center mb-4">
            <div className={`inline-block px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              gameState.perfectPairsResult.outcome === 'perfect'
                ? 'bg-masque-gold/20 border border-masque-gold text-masque-gold animate-pulse'
                : gameState.perfectPairsResult.outcome === 'colored'
                ? 'bg-crimson-mask/20 border border-crimson-mask text-crimson-mask'
                : gameState.perfectPairsResult.outcome === 'mixed'
                ? 'bg-jester-purple/20 border border-jester-purple text-jester-purple'
                : 'bg-blood-ruby/10 border border-blood-ruby/30 text-venetian-gold/60'
            }`}>
              {gameState.perfectPairsResult.outcome === 'perfect' && (
                <span>✨ Perfect Pair! +{gameState.perfectPairsResult.payout.toFixed(2)} ZEC (25:1) ✨</span>
              )}
              {gameState.perfectPairsResult.outcome === 'colored' && (
                <span>🎨 Colored Pair! +{gameState.perfectPairsResult.payout.toFixed(2)} ZEC (12:1)</span>
              )}
              {gameState.perfectPairsResult.outcome === 'mixed' && (
                <span>🃏 Mixed Pair! +{gameState.perfectPairsResult.payout.toFixed(2)} ZEC (6:1)</span>
              )}
              {gameState.perfectPairsResult.outcome === 'none' && (
                <span>No Pair - Side bet lost</span>
              )}
            </div>
          </div>
        )}

        {/* Player Area */}
        <div className="flex flex-col items-center mb-8">
          {gameState?.playerHands?.length ? (
            <div className="flex gap-8">
              {gameState.playerHands.map((hand, index) => {
                const handValue = calculateHandValue(hand.cards)
                const isBust = handValue > 21
                const isBlackjack = handValue === 21 && hand.cards.length === 2
                const isCurrentHand = index === gameState.currentHandIndex && gameState.phase === 'playerTurn'

                return (
                  <div
                    key={index}
                    className="transition-all duration-300"
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
                      isActive={isCurrentHand}
                      result={getHandResult(index)}
                    />
                    {hand.bet > 0 && (
                      <div className="text-center mt-2 text-sm text-venetian-gold/60">
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
                <div className="text-sm text-venetian-gold/60 mb-2 uppercase tracking-wide">Select Bet Amount</div>
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
              <div className="text-center space-y-1">
                <div>
                  <span className="text-venetian-gold/60">Main Bet: </span>
                  <span className="text-masque-gold font-bold">{selectedBet} ZEC</span>
                </div>
                {perfectPairsBet > 0 && (
                  <div className="text-sm">
                    <span className="text-venetian-gold/60">Total Bet: </span>
                    <span className="text-masque-gold font-bold">{(selectedBet + perfectPairsBet).toFixed(3)} ZEC</span>
                    <span className="text-venetian-gold/40 text-xs ml-1">({selectedBet} + {perfectPairsBet.toFixed(3)} PP)</span>
                  </div>
                )}
              </div>

              {/* Perfect Pairs Toggle with Tooltip */}
              <div className="flex items-center gap-4 relative">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={perfectPairsBet > 0}
                    onChange={(e) => setPerfectPairsBet(e.target.checked ? selectedBet * 0.1 : 0)}
                    className="w-4 h-4 accent-masque-gold"
                    disabled={isLoading}
                  />
                  <span className="text-sm text-venetian-gold/70">
                    Perfect Pairs (+{(selectedBet * 0.1).toFixed(3)} ZEC)
                  </span>
                </label>
                {/* Info icon with tooltip */}
                <button
                  type="button"
                  onMouseEnter={() => setShowPerfectPairsTooltip(true)}
                  onMouseLeave={() => setShowPerfectPairsTooltip(false)}
                  onClick={() => setShowPerfectPairsTooltip(!showPerfectPairsTooltip)}
                  className="text-venetian-gold/50 hover:text-masque-gold transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {/* Tooltip */}
                {showPerfectPairsTooltip && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-midnight-black border border-masque-gold rounded-lg p-3 shadow-xl z-50 w-64">
                    <div className="text-xs text-bone-white font-bold mb-2">Perfect Pairs Side Bet</div>
                    <div className="space-y-1.5 text-xs">
                      {Object.entries(PERFECT_PAIRS_INFO).map(([key, info]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-venetian-gold/70">{info.name}</span>
                          <span className="text-masque-gold font-mono">{info.multiplier}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-venetian-gold/50 mt-2 pt-2 border-t border-masque-gold/20">
                      Win if your first two cards are a pair!
                    </div>
                    {/* Tooltip arrow */}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
                      <div className="border-8 border-transparent border-t-masque-gold"></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Client seed controls */}
              <div className="w-full max-w-md bg-midnight-black/40 rounded-lg border border-masque-gold/10 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-venetian-gold/40 uppercase tracking-wide">Client Seed</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSeed = generateClientSeedHex()
                      setClientSeedInput(nextSeed)
                      localStorage.setItem('zcashino_client_seed', nextSeed)
                      playSound('buttonClick')
                    }}
                    className="text-xs text-masque-gold hover:text-venetian-gold transition-colors"
                    disabled={isLoading || !canEditSessionClientSeed}
                  >
                    Randomize
                  </button>
                </div>
                <input
                  type="text"
                  value={clientSeedInput}
                  onChange={(e) => {
                    const nextValue = e.target.value.slice(0, 128)
                    setClientSeedInput(nextValue)
                    localStorage.setItem('zcashino_client_seed', nextValue)
                  }}
                  onBlur={persistClientSeedIfEditable}
                  placeholder="Enter client seed"
                  className="w-full bg-midnight-black/60 border border-masque-gold/20 rounded-lg px-3 py-2 text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:border-masque-gold font-mono text-xs"
                  maxLength={128}
                  disabled={isLoading || !canEditSessionClientSeed}
                />
                {isSessionFairnessMode && (
                  <p className="mt-2 text-[11px] text-venetian-gold/50">
                    {canEditSessionClientSeed
                      ? 'Client seed is editable until your first hand in this seed session.'
                      : 'Client seed is locked for this active seed session. Rotate seed to change it.'}
                  </p>
                )}
              </div>

              {/* Maintenance Banner */}
              {session?.maintenanceMode && (
                <div className="bg-crimson-mask/20 border border-crimson-mask/40 text-crimson-mask px-4 py-2 rounded-lg text-sm text-center mb-2">
                  Platform is under maintenance. New games are temporarily paused.
                </div>
              )}

              {/* Deal Button */}
              <button
                onClick={handlePlaceBet}
                disabled={isLoading || !session || selectedBet > session.balance || session?.maintenanceMode}
                className="btn-gold-shimmer text-midnight-black px-8 py-3 rounded-lg font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Dealing...' : session?.maintenanceMode ? 'MAINTENANCE' : 'DEAL'}
              </button>
            </>
          )}

          {/* Insurance Offer */}
          {showInsuranceOffer && (
            <div className="flex flex-col items-center gap-4 mb-4">
              <div className="bg-midnight-black/60 px-4 py-2 rounded-lg border border-masque-gold/20">
                <span className="text-venetian-gold/50 text-sm">
                  Insurance? ({insuranceAmount.toFixed(4)} ZEC - pays 2:1 if dealer has Blackjack)
                </span>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    playSound('buttonClick')
                    handleInsurance(true)
                  }}
                  disabled={isLoading || insuranceAmount > (session?.balance ?? 0)}
                  className="bg-transparent border border-venetian-gold/50 text-venetian-gold px-6 py-2 rounded-lg font-medium hover:bg-venetian-gold/10 hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100"
                >
                  Yes ({insuranceAmount.toFixed(2)} ZEC)
                </button>
                <button
                  onClick={() => {
                    playSound('buttonClick')
                    handleInsurance(false)
                  }}
                  disabled={isLoading}
                  className="bg-jester-purple text-bone-white px-6 py-2 rounded-lg font-bold hover:bg-jester-purple-light hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
                >
                  No Thanks
                </button>
              </div>
            </div>
          )}

          {gameState?.phase === 'playerTurn' && (
            <div className="flex gap-4 flex-wrap justify-center">
              {availableActions.includes('hit') && (
                <button
                  onClick={() => {
                    playSound('buttonClick')
                    handleAction('hit')
                  }}
                  disabled={isLoading}
                  className="btn-gold-shimmer text-midnight-black px-8 py-3 rounded-lg font-bold hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
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
                  className="bg-jester-purple text-bone-white px-8 py-3 rounded-lg font-bold hover:bg-jester-purple-light hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100 shadow-lg hover:shadow-jester-purple/30"
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
                  className="bg-transparent border-2 border-masque-gold text-masque-gold px-8 py-3 rounded-lg font-bold hover:bg-masque-gold/10 hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100"
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
                  className="bg-crimson-mask/50 text-bone-white px-8 py-3 rounded-lg font-bold hover:bg-crimson-mask/70 hover:scale-105 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
                >
                  SPLIT
                </button>
              )}
            </div>
          )}

          {/* Compact next-bet adjuster during active play */}
          {gameState && gameState.phase !== 'complete' && (
            <div className="mt-4 bg-midnight-black/40 rounded-lg border border-masque-gold/10 px-4 py-2.5 w-full max-w-md">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-venetian-gold/40 uppercase tracking-wide whitespace-nowrap">Next hand</span>
                <div className="flex items-center gap-1.5">
                  {CHIP_VALUES.map(value => (
                    <button
                      key={value}
                      onClick={() => {
                        setSelectedBet(value)
                        if (perfectPairsBet > 0) setPerfectPairsBet(value * 0.1)
                        playSound('chipPlace')
                      }}
                      className={`w-7 h-7 rounded-full text-[10px] font-bold transition-all border ${
                        selectedBet === value
                          ? 'border-masque-gold bg-masque-gold/30 text-masque-gold'
                          : 'border-venetian-gold/20 text-venetian-gold/50 hover:border-masque-gold/40'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={perfectPairsBet > 0}
                    onChange={(e) => setPerfectPairsBet(e.target.checked ? selectedBet * 0.1 : 0)}
                    className="w-3 h-3 accent-masque-gold"
                  />
                  <span className="text-[10px] text-venetian-gold/60">PP</span>
                </label>
              </div>
            </div>
          )}

          {gameState?.phase === 'complete' && (
            <div className="flex flex-col items-center gap-4">
              {/* Payout display */}
              {(() => {
                const payout = gameState.lastPayout ?? 0
                const totalStake = gameState.settlement?.totalStake
                  ?? (gameState.playerHands?.reduce((sum, hand) => sum + hand.bet, 0) ?? 0)
                  + (gameState.insuranceBet ?? 0)
                  + (gameState.perfectPairsBet ?? 0)
                const netResult = gameState.settlement?.net ?? (payout - totalStake)
                const isPush = gameState.message?.toLowerCase().includes('push')

                if (payout > 0) {
                  return (
                    <div className={`text-2xl font-bold px-6 py-3 rounded-lg result-pop ${
                      resultAnimation === 'blackjack' ? 'blackjack-glow bg-masque-gold/20 text-masque-gold' : 'win-glow bg-green-500/20 text-green-400'
                    }`}>
                      +{payout.toFixed(4)} ZEC
                      {netResult > 0 && (
                        <span className="text-sm ml-2 opacity-70">(+{netResult.toFixed(4)} profit)</span>
                      )}
                    </div>
                  )
                } else if (isPush) {
                  return (
                    <div className="text-xl font-bold text-venetian-gold px-6 py-3 rounded-lg bg-venetian-gold/10 border border-venetian-gold/30 result-pop">
                      Push - Bet Returned
                    </div>
                  )
                } else {
                  return (
                    <div className="text-xl font-bold text-blood-ruby px-6 py-3 rounded-lg bg-blood-ruby/10 border border-blood-ruby/30 loss-shake">
                      -{totalStake.toFixed(4)} ZEC
                    </div>
                  )
                }
              })()}

              {/* Auto-bet countdown indicator */}
              {isAutoBetEnabled && isAutoBetting && autoBetCountdown !== null && (
                <div className="flex flex-col items-center gap-2 animate-pulse">
                  <div className="text-sm text-masque-gold flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Auto-dealing in {autoBetCountdown}...
                  </div>
                  <button
                    onClick={cancelAutoBet}
                    className="text-xs text-venetian-gold/60 hover:text-blood-ruby transition-colors underline"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Insufficient balance warning */}
              {isAutoBetEnabled && session && selectedBet + perfectPairsBet > session.balance && (
                <div className="text-sm text-blood-ruby bg-blood-ruby/10 px-4 py-2 rounded-lg border border-blood-ruby/30">
                  Auto-bet paused: Insufficient balance for {selectedBet} ZEC bet
                </div>
              )}

              {/* Play Again Button - hide when auto-betting */}
              {!isAutoBetting && (
                <button
                  onClick={handleNewRound}
                  className="btn-gold-shimmer text-midnight-black px-10 py-4 rounded-lg font-bold text-xl hover:scale-105 active:scale-95 transition-all duration-150 shadow-lg hover:shadow-masque-gold/40 mt-2"
                >
                  PLAY AGAIN
                </button>
              )}

              {/* Adjust next bet panel */}
              <div className="bg-midnight-black/50 rounded-lg border border-masque-gold/20 p-4 w-full max-w-md">
                <div className="text-xs text-venetian-gold/50 uppercase tracking-wide mb-3 text-center">
                  {isAutoBetEnabled ? 'Next Auto-Bet' : 'Next Bet'}
                  {isAutoBetEnabled && <span className="text-jester-purple-light ml-1">(auto)</span>}
                </div>
                {/* Chip selector row */}
                <div className="flex justify-center gap-1.5 mb-3">
                  {CHIP_VALUES.map(value => (
                    <button
                      key={value}
                      onClick={() => {
                        setSelectedBet(value)
                        // Update perfect pairs proportionally if enabled
                        if (perfectPairsBet > 0) setPerfectPairsBet(value * 0.1)
                        playSound('chipPlace')
                      }}
                      className={`w-10 h-10 rounded-full text-xs font-bold transition-all duration-150 border-2 ${
                        selectedBet === value
                          ? 'border-masque-gold bg-masque-gold/30 text-masque-gold scale-110 shadow-lg shadow-masque-gold/20'
                          : 'border-venetian-gold/30 bg-midnight-black/60 text-venetian-gold/70 hover:border-masque-gold/50 hover:scale-105'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {/* Side bet toggle + summary */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={perfectPairsBet > 0}
                      onChange={(e) => setPerfectPairsBet(e.target.checked ? selectedBet * 0.1 : 0)}
                      className="w-3.5 h-3.5 accent-masque-gold"
                    />
                    <span className="text-xs text-venetian-gold/70">
                      Perfect Pairs
                    </span>
                  </label>
                  <div className="text-xs text-right">
                    <span className="text-masque-gold font-bold">{selectedBet}</span>
                    {perfectPairsBet > 0 && (
                      <span className="text-venetian-gold/50"> + {perfectPairsBet.toFixed(3)} PP</span>
                    )}
                    <span className="text-venetian-gold/40"> ZEC</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Provably Fair Info */}
        <div className="mt-12 text-center">
          <details className="bg-midnight-black/40 rounded-lg p-4 max-w-lg mx-auto border border-masque-gold/20">
            <summary className="cursor-pointer text-venetian-gold/60 hover:text-masque-gold transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Blockchain Provably Fair
            </summary>
            <div className="mt-4 text-left text-sm text-venetian-gold/60 space-y-3 font-mono">
              {isSessionFairnessMode && fairness && (
                <div className="bg-jester-purple/10 border border-jester-purple/30 rounded-lg p-3 mb-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-jester-purple text-xs font-bold uppercase tracking-wide">
                      Active Seed Session
                    </span>
                    <button
                      onClick={handleRotateSeed}
                      disabled={isLoading}
                      className="text-xs px-2 py-1 rounded border border-masque-gold/40 text-masque-gold hover:bg-masque-gold/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Rotate Seed & Reveal
                    </button>
                  </div>
                  <div className="text-xs">
                    <span className="text-venetian-gold/40">Session Commitment: </span>
                    {fairness.commitmentTxHash ? (
                      commitment?.explorerUrl ? (
                        <a
                          href={commitment.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-masque-gold hover:text-venetian-gold underline break-all"
                        >
                          {fairness.commitmentTxHash}
                        </a>
                      ) : (
                        <code className="text-bone-white/70 break-all">{fairness.commitmentTxHash}</code>
                      )
                    ) : (
                      <span className="text-bone-white/60">Pending</span>
                    )}
                  </div>
                  <div className="text-xs">
                    <span className="text-venetian-gold/40">Next Nonce: </span>
                    <code className="text-bone-white/70">{fairness.nextNonce ?? 0}</code>
                  </div>
                  <div className="text-xs">
                    <span className="text-venetian-gold/40">Client Seed Edit: </span>
                    <span className="text-bone-white/70">
                      {fairness.canEditClientSeed ? 'Allowed' : 'Locked'}
                    </span>
                  </div>
                </div>
              )}

              {revealBundle && (
                <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-lg p-3 mb-4 text-xs space-y-1">
                  <div className="text-masque-gold font-semibold">Previous Seed Revealed</div>
                  <div>
                    <span className="text-venetian-gold/40">Tx Hash: </span>
                    <code className="text-bone-white/70 break-all">{revealBundle.txHash}</code>
                  </div>
                  <div>
                    <span className="text-venetian-gold/40">Last Nonce Used: </span>
                    <code className="text-bone-white/70">{revealBundle.lastNonceUsed ?? 'none'}</code>
                  </div>
                  <div>
                    <span className="text-venetian-gold/40">Server Seed: </span>
                    <code className="text-bone-white/70 break-all">{revealBundle.serverSeed}</code>
                  </div>
                </div>
              )}

              {/* Blockchain Commitment */}
              {!isSessionFairnessMode && commitment && (
                <div className="bg-jester-purple/10 border border-jester-purple/30 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-jester-purple" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-jester-purple text-xs font-bold uppercase tracking-wide">
                      On-Chain Committed
                    </span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-venetian-gold/40">Tx Hash: </span>
                      <code className="text-bone-white/70 break-all">
                        {commitment.txHash.substring(0, 20)}...
                      </code>
                    </div>
                    <div>
                      <span className="text-venetian-gold/40">Block: </span>
                      <code className="text-bone-white/70">{commitment.blockHeight}</code>
                    </div>
                    {commitment.explorerUrl && (
                      <a
                        href={commitment.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-masque-gold hover:text-venetian-gold transition-colors inline-flex items-center gap-1"
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
                  <span className="text-venetian-gold/40">Server Seed Hash: </span>
                  <code className="text-xs break-all text-bone-white/70">
                    {gameState?.serverSeedHash || 'Will be shown when game starts'}
                  </code>
                </div>
                {gameState?.serverSeedHash && (
                  <button
                    onClick={() => copyToClipboard(gameState.serverSeedHash!, 'serverSeedHash')}
                    className="text-venetian-gold/40 hover:text-masque-gold transition-colors p-1"
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
                  <span className="text-venetian-gold/40">Client Seed: </span>
                  <code className="text-xs break-all text-bone-white/70">
                    {gameState?.clientSeed || 'Generated automatically'}
                  </code>
                </div>
                {gameState?.clientSeed && (
                  <button
                    onClick={() => copyToClipboard(gameState.clientSeed!, 'clientSeed')}
                    className="text-venetian-gold/40 hover:text-masque-gold transition-colors p-1"
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
                <span className="text-venetian-gold/40">Nonce: </span>
                <code className="text-bone-white/70">{gameState?.nonce ?? 0}</code>
              </div>
              {gameId && (
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <span className="text-venetian-gold/40">Game ID: </span>
                    <code className="text-xs text-bone-white/70">{gameId}</code>
                  </div>
                  <button
                    onClick={() => copyToClipboard(gameId, 'gameId')}
                    className="text-venetian-gold/40 hover:text-masque-gold transition-colors p-1"
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

              <div className="pt-3 border-t border-masque-gold/10 font-body">
                <p className="text-xs text-venetian-gold/50 mb-3">
                  {isSessionFairnessMode
                    ? 'The server seed hash is committed before each seed session. Rotate seed to reveal the prior session and verify all hands.'
                    : 'The server seed hash is committed to the Zcash blockchain BEFORE you bet. After the game, you can verify the outcome was fair.'}
                </p>
                {gameId && gameState?.phase === 'complete' && (
                  <a
                    href={`/verify?gameId=${gameId}`}
                    className="inline-flex items-center gap-2 bg-masque-gold/20 hover:bg-masque-gold/30 text-masque-gold px-4 py-2 rounded-lg transition-colors"
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
            <div className="bg-midnight-black/30 inline-block rounded-lg px-6 py-3 border border-masque-gold/10">
              <div className="text-xs text-venetian-gold/40 mb-1 uppercase tracking-wide">Session Stats</div>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-venetian-gold/60">Wagered: </span>
                  <span className="text-bone-white">{session.totalWagered.toFixed(4)} ZEC</span>
                </div>
                <div>
                  <span className="text-venetian-gold/60">Won: </span>
                  <span className="text-masque-gold">{session.totalWon.toFixed(4)} ZEC</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hand History */}
        {handHistory.length > 0 && (
          <div className="mt-8 text-center">
            <HandHistory entries={handHistory} />
          </div>
        )}
      </div>

      {/* Onboarding Modal */}
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

      {/* Withdrawal Modal */}
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
    </main>
  )
}
