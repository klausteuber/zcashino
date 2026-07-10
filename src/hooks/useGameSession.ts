'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SessionFairnessSummary } from '@/types'
import { generateClientSeedHex } from '@/lib/game/client-fairness'

export interface SessionRecoveryState {
  enabled: boolean
  lastUsedAt: string | null
}

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
  transparentAddress?: string | null
  withdrawalAddress?: string | null
  maintenanceMode?: boolean
  recovery?: SessionRecoveryState | null
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
  onboardingMode: 'deposit' | 'deposit-more' | 'restore' | null
  restoreNotice: string | null

  // Deposit
  depositAddress: string | null

  // Fairness
  fairness: SessionFairnessSummary | null
  setFairness: (f: SessionFairnessSummary | null) => void

  // Session actions
  handleDemoSelect: () => Promise<void>
  handleCreateRealSession: () => Promise<{ sessionId: string; depositAddress: string | null; transparentAddress?: string | null; walletError?: string; walletErrorMessage?: string } | null>
  handleDepositComplete: (balance: number) => void
  handleSwitchToReal: () => void
  handleSetWithdrawalAddress: (address: string) => Promise<boolean>
  handleResetDemoBalance: () => Promise<void>
  handleCreateRecoveryKey: () => Promise<{ recoveryKey: string; recovery: SessionRecoveryState } | null>
  handleRegenerateRecoveryKey: () => Promise<{ recoveryKey: string; recovery: SessionRecoveryState } | null>
  handleRestoreSession: (recoveryKey: string) => Promise<{ success: boolean; error?: string }>

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
  const [onboardingMode, setOnboardingMode] = useState<'deposit' | 'deposit-more' | 'restore' | null>(null)
  const [depositAddress, setDepositAddress] = useState<string | null>(null)
  const [fairness, setFairness] = useState<SessionFairnessSummary | null>(null)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)

  // Demo nudge tracking (refs — reset each page load, no localStorage)
  const demoWinNudgeShown = useRef(false)
  const demoHandCount = useRef(0)

  // Prevent double init in strict mode
  const initStarted = useRef(false)

  const applySessionData = useCallback((data: SessionData) => {
    setSession(data)
    setFairness(data.fairness || null)
    setDepositAddress(data.depositAddress || null)

    if (data.id) {
      localStorage.setItem('zcashino_session_id', data.id)
      localStorage.setItem('zcashino_onboarding_seen', 'true')
    }
  }, [])

  const initializeFreshSession = useCallback(async () => {
    const res = await fetch('/api/session')
    if (!res.ok) throw new Error('Failed to get session')
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    applySessionData(data)
    return data
  }, [applySessionData])

  const initSession = useCallback(async (existingSessionId?: string) => {
    try {
      setIsLoading(true)
      const url = existingSessionId
        ? `/api/session?sessionId=${existingSessionId}`
        : '/api/session'
      const res = await fetch(url)
      const data = await res.json().catch(() => null)

      if (!res.ok || data?.error) {
        if (existingSessionId && res.status === 401) {
          localStorage.removeItem('zcashino_session_id')
          await initializeFreshSession()
          setRestoreNotice('Your browser session expired. Use your recovery key to restore your real-money session.')
          setOnboardingMode('restore')
          setShowOnboarding(true)
          setError(null)
          return
        }

        throw new Error(data?.error || 'Failed to get session')
      }

      applySessionData(data)
      setRestoreNotice(null)
      setError(null)
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
  }, [applySessionData, initializeFreshSession])

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
      applySessionData(data)
      setRestoreNotice(null)
    } catch (err) {
      setError('Failed to create demo session')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [applySessionData])

  // Create real session (non-demo)
  const handleCreateRealSession = useCallback(async () => {
    try {
      const walletId = `real_${Date.now()}_${generateClientSeedHex(12)}`
      const res = await fetch(`/api/session?wallet=${walletId}`)
      if (res.status === 429) {
        const data = await res.json()
        const retryAfter = data.retryAfterSeconds || 60
        return {
          sessionId: '',
          depositAddress: null,
          transparentAddress: null,
          walletError: 'rate_limited',
          walletErrorMessage: `Too many attempts. Please wait ${retryAfter} seconds and try again.`,
        } as { sessionId: string; depositAddress: string | null; transparentAddress?: string | null; walletError?: string; walletErrorMessage?: string }
      }
      if (res.status === 451) {
        // Geo-blocked (restricted jurisdiction) — surface the reason to the user.
        const data = await res.json().catch(() => ({}))
        return {
          sessionId: '',
          depositAddress: null,
          transparentAddress: null,
          walletError: 'geo_blocked',
          walletErrorMessage: data.error || 'Real-money play is not available in your region.',
        } as { sessionId: string; depositAddress: string | null; transparentAddress?: string | null; walletError?: string; walletErrorMessage?: string }
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create session')
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      applySessionData(data)
      setRestoreNotice(null)
      // Pass through wallet error fields if present (session created but wallet failed)
      return {
        sessionId: data.id,
        depositAddress: data.depositAddress || null,
        transparentAddress: data.transparentAddress || null,
        walletError: data.walletError,
        walletErrorMessage: data.walletErrorMessage,
      }
    } catch (err) {
      console.error('Failed to create real session:', err)
      return null
    }
  }, [applySessionData])

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
              recovery: data.recovery ?? prev.recovery,
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
    setRestoreNotice(null)
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

  const handleCreateRecoveryKey = useCallback(async () => {
    if (!session || session.isDemo) return null

    try {
      const res = await fetch('/api/session/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create recovery key')
      }

      setSession(prev =>
        prev
          ? {
              ...prev,
              recovery: data.recovery,
            }
          : prev
      )

      return {
        recoveryKey: data.recoveryKey,
        recovery: data.recovery as SessionRecoveryState,
      }
    } catch (err) {
      console.error('Failed to create recovery key:', err)
      return null
    }
  }, [session])

  const handleRegenerateRecoveryKey = useCallback(async () => {
    if (!session || session.isDemo) return null

    try {
      const res = await fetch('/api/session/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate recovery key')
      }

      setSession(prev =>
        prev
          ? {
              ...prev,
              recovery: data.recovery,
            }
          : prev
      )

      return {
        recoveryKey: data.recoveryKey,
        recovery: data.recovery as SessionRecoveryState,
      }
    } catch (err) {
      console.error('Failed to regenerate recovery key:', err)
      return null
    }
  }, [session])

  const handleRestoreSession = useCallback(async (recoveryKey: string) => {
    try {
      const res = await fetch('/api/session/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          recoveryKey,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        return {
          success: false,
          error: data.error || 'Failed to restore session',
        }
      }

      applySessionData(data)
      setRestoreNotice(null)
      setError(null)
      setOnboardingMode(null)
      setShowOnboarding(false)

      return { success: true }
    } catch (err) {
      console.error('Failed to restore session:', err)
      return {
        success: false,
        error: 'Failed to restore session',
      }
    }
  }, [applySessionData])

  return {
    session,
    setSession,
    isLoading,
    error,
    setError,

    showOnboarding,
    setShowOnboarding,
    onboardingMode,
    restoreNotice,

    depositAddress,

    fairness,
    setFairness,

    handleDemoSelect,
    handleCreateRealSession,
    handleDepositComplete,
    handleSwitchToReal,
    handleSetWithdrawalAddress,
    handleResetDemoBalance,
    handleCreateRecoveryKey,
    handleRegenerateRecoveryKey,
    handleRestoreSession,

    demoWinNudgeShown,
    demoHandCount,
  }
}
