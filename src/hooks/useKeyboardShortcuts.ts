'use client'

import { useEffect } from 'react'
import type { BlackjackAction } from '@/types'

interface UseKeyboardShortcutsOptions {
  availableActions: BlackjackAction[]
  gamePhase: string | undefined
  isLoading: boolean
  isAutoBetting: boolean
  showInsuranceOffer: boolean
  hasGameState: boolean
  onAction: (action: BlackjackAction) => void
  onInsurance: (take: boolean) => void
  onPlaceBet: () => void
  onNewRound: () => void
}

const ACTION_KEYS: Record<string, BlackjackAction> = {
  h: 'hit',
  s: 'stand',
  d: 'double',
  p: 'split',
  r: 'surrender',
}

export function useKeyboardShortcuts({
  availableActions,
  gamePhase,
  isLoading,
  isAutoBetting,
  showInsuranceOffer,
  hasGameState,
  onAction,
  onInsurance,
  onPlaceBet,
  onNewRound,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if loading or auto-betting
      if (isLoading || isAutoBetting) return

      // Skip if modifier keys are held
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // Skip if user is typing in an input
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const key = e.key.toLowerCase()

      // Insurance offer: Y/N
      if (showInsuranceOffer) {
        if (key === 'y') {
          e.preventDefault()
          onInsurance(true)
          return
        }
        if (key === 'n') {
          e.preventDefault()
          onInsurance(false)
          return
        }
      }

      // Player turn: H/S/D/P
      if (gamePhase === 'playerTurn' && !showInsuranceOffer) {
        const action = ACTION_KEYS[key]
        if (action && availableActions.includes(action)) {
          e.preventDefault()
          onAction(action)
          return
        }
      }

      // Betting phase (no game state): Enter/Space to deal
      if (!hasGameState && (key === 'enter' || key === ' ')) {
        e.preventDefault()
        onPlaceBet()
        return
      }

      // Complete phase: Enter/Space to play again
      if (gamePhase === 'complete' && (key === 'enter' || key === ' ')) {
        e.preventDefault()
        onNewRound()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    availableActions,
    gamePhase,
    isLoading,
    isAutoBetting,
    showInsuranceOffer,
    hasGameState,
    onAction,
    onInsurance,
    onPlaceBet,
    onNewRound,
  ])
}
