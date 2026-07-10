import type { BlackjackAction, BlackjackGameRules, BlackjackGameState } from '@/types'
import {
  createInitialState,
  executeAction,
  startRound,
  takeInsurance,
} from './blackjack'
import { normalizeFairnessVersion } from './shuffle'

export interface PersistedBlackjackReplayData {
  mainBet: number
  perfectPairsBet: number
  insuranceBet: number
  initialState?: string | null
  actionHistory?: string | null
  serverSeedHash: string
  clientSeed: string
  nonce: number
  fairnessVersion: string
}

interface ReconstructBlackjackGameStateInput {
  game: PersistedBlackjackReplayData
  sessionBalance: number
  resolvedServerSeed: string
  /**
   * Normal game actions need the exact in-progress state, including insurance
   * and every prior action. Insurance decisions intentionally reconstruct only
   * the initial deal because no insurance choice has been persisted yet.
   */
  replayPersistedProgress?: boolean
  actionHistory?: BlackjackAction[]
}

export function parseBlackjackActionHistory(
  actionHistory: string | null | undefined
): BlackjackAction[] {
  return JSON.parse(actionHistory || '[]') as BlackjackAction[]
}

/**
 * Deterministically rebuilds a Blackjack hand from its persisted fairness data.
 * This is the single replay path used before applying a new player decision.
 */
export function reconstructBlackjackGameState({
  game,
  sessionBalance,
  resolvedServerSeed,
  replayPersistedProgress = false,
  actionHistory = [],
}: ReconstructBlackjackGameStateInput): BlackjackGameState {
  const initialBalance = sessionBalance
    + game.mainBet
    + game.perfectPairsBet
    + (replayPersistedProgress ? game.insuranceBet : 0)
  const initialState = createInitialState(initialBalance)
  const storedInitial = JSON.parse(game.initialState || '{}') as {
    gameRules?: BlackjackGameRules
  }

  let gameState = startRound(
    initialState,
    game.mainBet,
    game.perfectPairsBet,
    resolvedServerSeed,
    game.serverSeedHash,
    game.clientSeed,
    game.nonce,
    normalizeFairnessVersion(game.fairnessVersion),
    // Admin bet-limit changes must not invalidate an already-started hand.
    { minBet: 0, maxBet: Math.max(game.mainBet, 1) },
    storedInitial.gameRules
  )

  if (!replayPersistedProgress) {
    return gameState
  }

  // Insurance is persisted separately from actionHistory and happened first.
  if (game.insuranceBet > 0) {
    gameState = takeInsurance(gameState, game.insuranceBet)
  }

  for (const previousAction of actionHistory) {
    gameState = executeAction(gameState, previousAction)
  }

  return gameState
}
