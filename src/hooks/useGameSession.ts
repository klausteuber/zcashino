'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SessionFairnessSummary } from '@/types'

export interface SessionData {
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

export interface UseGameSessionReturn {
  session: SessionData | null
  setSession: React.Dispatch<React.SetStateAction<SessionData | null>>
  isLoading: boolean
  error: string | null
  setError: (error: string | null) => void

  // Onboarding / modal
  showOnboarding: boolean
  setShowOnboarding: (show: boolean) => void
  onboardingMode: 'deposit' | 'deposit-more' | null

  // Deposit
  depositAddress: string | null

  // Fairness
  fairness: SessionFairnessSummary | null
  setFairness: (f: SessionFairnessSummary | null) => void

  // Session actions
  handleDemoSelect: () => Promise<void>
  handleCreateRealSession: () => Promise<{ sessionId: string; depositAddress: string | null; walletError?: string; walletErrorMessage?: string } | null>
  handleDepositComplete: (balance: number) => void
  handleSwitchToReal: () => void
  handleSetWithdrawalAddress: (address: string) => Promise<boolean>
  handleResetDemoBalance: () => Promise<void>

  // Demo nudge tracking
  demoWinNudgeShown: React.MutableRefObject<boolean>
  demoHandCount: React.MutableRefObject<number>
}

/**
 * Shared session management hook for all game components.
 *
 * Flow:
 * 1. Check localStorage for existing session → restore from server
 * 2. If no session → auto-create demo (no modal gate)
 * 3. OnboardingModal only opens when user clicks "Deposit" / "Switch to Real"
 */
export function useGameSession(): UseGameSessionReturn {
  const [session, setSession] = useState<SessionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingMode, setOnboardingMode] = useState<'deposit' | 'deposit-more' | null>(null)
  const [depositAddress, setDepositAddress] = useState<string | null>(null)
  const [fairness, setFairness] = useState<SessionFairnessSummary | null>(null)

  // Demo nudge tracking (refs — reset each page load, no localStorage)
  const demoWinNudgeShown = useRef(false)
  const demoHandCount = useRef(0)

  // Prevent double init in strict mode
  const initStarted = useRef(false)

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
        // Mark onboarding as seen for backward compat
        localStorage.setItem('zcashino_onboarding_seen', 'true')
      }
    } catch (err) {
      console.error('Session init failed:', err)
      localStorage.removeItem('zcashino_session_id')
      if (existingSessionId) {
        // Retry without stale session ID — creates a fresh demo session
        return initSession()
      }
      setError('Failed to initialize session')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initialize session on mount
  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true

    const existingSessionId = localStorage.getItem('zcashino_session_id')
    if (existingSessionId) {
      // Returning user — restore session from server
      initSession(existingSessionId)
    } else {
      // First-time visitor — auto-create demo (no modal)
      initSession()
    }
  }, [initSession])

  // Handle demo mode selection (from welcome screen if it's ever shown)
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
      const walletId = `real_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const res = await fetch(`/api/session?wallet=${walletId}`)
      if (res.status === 429) {
        const data = await res.json()
        const retryAfter = data.retryAfterSeconds || 60
        return {
          sessionId: '',
          depositAddress: null,
          walletError: 'rate_limited',
          walletErrorMessage: `Too many attempts. Please wait ${retryAfter} seconds and try again.`,
        } as { sessionId: string; depositAddress: string | null; walletError?: string; walletErrorMessage?: string }
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create session')
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSession(data)
      setFairness(data.fairness || null)
      if (data.id) {
        localStorage.setItem('zcashino_session_id', data.id)
      }
      // Pass through wallet error fields if present (session created but wallet failed)
      return {
        sessionId: data.id,
        depositAddress: data.depositAddress || null,
        walletError: data.walletError,
        walletErrorMessage: data.walletErrorMessage,
      }
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
          withdrawalAddress: address,
        }),
      })
      if (!res.ok) return false
      const data = await res.json()
      if (data.depositAddress) {
        setDepositAddress(data.depositAddress)
      }
      setSession(prev =>
        prev
          ? {
              ...prev,
              withdrawalAddress: data.withdrawalAddress ?? address,
              depositAddress: data.depositAddress ?? prev.depositAddress,
            }
          : prev
      )
      return true
    } catch (err) {
      console.error('Failed to set withdrawal address:', err)
      return false
    }
  }, [session])

  // Handle deposit completion
  const handleDepositComplete = useCallback((balance: number) => {
    setSession(prev => {
      if (!prev) return null
      // Don't overwrite existing balance with 0 (defensive: 0 means no new deposit detected)
      const newBalance = balance > 0 ? balance : prev.balance
      return { ...prev, balance: newBalance, isAuthenticated: true }
    })
    setShowOnboarding(false)
    setOnboardingMode(null)
    localStorage.setItem('zcashino_onboarding_seen', 'true')
  }, [])

  // Switch from demo to real ZEC — opens modal at deposit step
  const handleSwitchToReal = useCallback(() => {
    setOnboardingMode('deposit')
    setShowOnboarding(true)
  }, [])

  // Reset demo balance to 10 ZEC
  const handleResetDemoBalance = useCallback(async () => {
    if (!session) return
    try {
      setIsLoading(true)
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset-demo-balance',
          sessionId: session.id,
        }),
      })
      if (!res.ok) throw new Error('Failed to reset demo balance')
      const data = await res.json()
      setSession(prev =>
        prev ? { ...prev, balance: data.balance ?? 10 } : prev
      )
    } catch (err) {
      console.error('Failed to reset demo balance:', err)
      setError('Failed to reset demo balance')
    } finally {
      setIsLoading(false)
    }
  }, [session])

  return {
    session,
    setSession,
    isLoading,
    error,
    setError,

    showOnboarding,
    setShowOnboarding,
    onboardingMode,

    depositAddress,

    fairness,
    setFairness,

    handleDemoSelect,
    handleCreateRealSession,
    handleDepositComplete,
    handleSwitchToReal,
    handleSetWithdrawalAddress,
    handleResetDemoBalance,

    demoWinNudgeShown,
    demoHandCount,
  }
}
