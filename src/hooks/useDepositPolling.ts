'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface DepositStatus {
  status: 'idle' | 'waiting' | 'detected' | 'confirming' | 'confirmed' | 'error'
  confirmations: number
  requiredConfirmations: number
  amount: number | null
  txHash: string | null
  error: string | null
}

interface UseDepositPollingOptions {
  interval?: number
  pauseWhenHidden?: boolean
  onDeposit?: (amount: number, txHash: string) => void
  onConfirmed?: (amount: number) => void
  onError?: (error: string) => void
}

const REQUIRED_CONFIRMATIONS = 3

export function useDepositPolling(
  sessionId: string | null,
  isWaitingForDeposit: boolean,
  options: UseDepositPollingOptions = {}
) {
  const {
    interval = 15000,
    pauseWhenHidden = true,
    onDeposit,
    onConfirmed,
    onError
  } = options

  const [status, setStatus] = useState<DepositStatus>({
    status: 'idle',
    confirmations: 0,
    requiredConfirmations: REQUIRED_CONFIRMATIONS,
    amount: null,
    txHash: null,
    error: null
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)
  const lastCheckRef = useRef<number>(0)
  const backoffRef = useRef<number>(0)

  const checkForDeposits = useCallback(async () => {
    if (!sessionId || isPollingRef.current) return

    // Exponential backoff on rate limit
    if (backoffRef.current > 0) {
      backoffRef.current--
      return
    }

    isPollingRef.current = true
    lastCheckRef.current = Date.now()

    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check-deposits',
          sessionId
        })
      })

      if (res.status === 429) {
        // Rate limited — back off for several cycles
        backoffRef.current = 3
        isPollingRef.current = false
        return
      }

      if (!res.ok) {
        throw new Error('Failed to check deposits')
      }

      // Successful request — reset backoff
      backoffRef.current = 0

      const data = await res.json()

      // Check if we have any pending deposits
      if (data.pendingDeposits && data.pendingDeposits.length > 0) {
        const deposit = data.pendingDeposits[0]
        const confirmations = deposit.confirmations || 0

        if (status.status !== 'detected' && status.status !== 'confirming') {
          // First detection
          setStatus(prev => ({
            ...prev,
            status: 'detected',
            amount: deposit.amount,
            txHash: deposit.txHash,
            confirmations
          }))
          onDeposit?.(deposit.amount, deposit.txHash)
        } else {
          // Update confirmations
          setStatus(prev => ({
            ...prev,
            status: 'confirming',
            confirmations
          }))
        }
      }

      // Check if deposit is now confirmed (balance increased)
      if (data.newDeposit || data.authenticated) {
        setStatus(prev => ({
          ...prev,
          status: 'confirmed',
          confirmations: REQUIRED_CONFIRMATIONS
        }))
        onConfirmed?.(data.depositAmount || status.amount || 0)
      }

      // Also check session authentication status
      if (data.session?.isAuthenticated && status.status === 'waiting') {
        setStatus(prev => ({
          ...prev,
          status: 'confirmed',
          confirmations: REQUIRED_CONFIRMATIONS
        }))
        onConfirmed?.(data.session.balance || 0)
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setStatus(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage
      }))
      onError?.(errorMessage)
    } finally {
      isPollingRef.current = false
    }
  }, [sessionId, status.status, status.amount, onDeposit, onConfirmed, onError])

  // Start/stop polling based on isWaitingForDeposit
  useEffect(() => {
    if (!isWaitingForDeposit || !sessionId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Set status to waiting
    setStatus(prev => ({
      ...prev,
      status: 'waiting',
      error: null
    }))

    // Initial check
    checkForDeposits()

    // Set up polling interval
    intervalRef.current = setInterval(checkForDeposits, interval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isWaitingForDeposit, sessionId, interval, checkForDeposits])

  // Pause polling when tab is hidden
  useEffect(() => {
    if (!pauseWhenHidden) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, pause polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else if (isWaitingForDeposit && sessionId) {
        // Tab is visible again, resume polling
        // Check immediately if it's been more than interval since last check
        const timeSinceLastCheck = Date.now() - lastCheckRef.current
        if (timeSinceLastCheck >= interval) {
          checkForDeposits()
        }
        intervalRef.current = setInterval(checkForDeposits, interval)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pauseWhenHidden, isWaitingForDeposit, sessionId, interval, checkForDeposits])

  // Manual refresh function
  const refresh = useCallback(() => {
    checkForDeposits()
  }, [checkForDeposits])

  // Reset status
  const reset = useCallback(() => {
    setStatus({
      status: 'idle',
      confirmations: 0,
      requiredConfirmations: REQUIRED_CONFIRMATIONS,
      amount: null,
      txHash: null,
      error: null
    })
  }, [])

  return {
    ...status,
    refresh,
    reset,
    isPolling: isWaitingForDeposit && !!sessionId
  }
}
