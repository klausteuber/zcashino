import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlackjackGameState } from '@/types'

const mocks = vi.hoisted(() => ({
  createInitialState: vi.fn(),
  startRound: vi.fn(),
  takeInsurance: vi.fn(),
  executeAction: vi.fn(),
  normalizeFairnessVersion: vi.fn(),
}))

vi.mock('./blackjack', () => ({
  createInitialState: mocks.createInitialState,
  startRound: mocks.startRound,
  takeInsurance: mocks.takeInsurance,
  executeAction: mocks.executeAction,
}))

vi.mock('./shuffle', () => ({
  normalizeFairnessVersion: mocks.normalizeFairnessVersion,
}))

import {
  parseBlackjackActionHistory,
  reconstructBlackjackGameState,
  type PersistedBlackjackReplayData,
} from './blackjack-replay'

function state(label: string): BlackjackGameState {
  return { label } as unknown as BlackjackGameState
}

const game: PersistedBlackjackReplayData = {
  mainBet: 0.5,
  perfectPairsBet: 0.1,
  insuranceBet: 0.25,
  initialState: JSON.stringify({
    gameRules: {
      deckCount: 8,
      dealerStandsOn: 17,
      blackjackPayout: 1.5,
      allowSurrender: true,
      allowPerfectPairs: true,
    },
  }),
  actionHistory: '["hit","stand"]',
  serverSeedHash: 'server-hash',
  clientSeed: 'client-seed',
  nonce: 7,
  fairnessVersion: 'stored-fairness-version',
}

describe('Blackjack persisted-state reconstruction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.normalizeFairnessVersion.mockReturnValue('normalized-fairness-version')
  })

  it('restores insurance before replaying prior actions in order', () => {
    const initial = state('initial')
    const started = state('started')
    const insured = state('insured')
    const afterHit = state('after-hit')
    const afterStand = state('after-stand')

    mocks.createInitialState.mockReturnValue(initial)
    mocks.startRound.mockReturnValue(started)
    mocks.takeInsurance.mockReturnValue(insured)
    mocks.executeAction
      .mockReturnValueOnce(afterHit)
      .mockReturnValueOnce(afterStand)

    const result = reconstructBlackjackGameState({
      game,
      sessionBalance: 10,
      resolvedServerSeed: 'resolved-server-seed',
      replayPersistedProgress: true,
      actionHistory: ['hit', 'stand'],
    })

    expect(result).toBe(afterStand)
    expect(mocks.createInitialState).toHaveBeenCalledWith(10.85)
    expect(mocks.startRound).toHaveBeenCalledWith(
      initial,
      0.5,
      0.1,
      'resolved-server-seed',
      'server-hash',
      'client-seed',
      7,
      'normalized-fairness-version',
      { minBet: 0, maxBet: 1 },
      expect.objectContaining({ deckCount: 8, allowSurrender: true })
    )
    expect(mocks.takeInsurance).toHaveBeenCalledWith(started, 0.25)
    expect(mocks.executeAction).toHaveBeenNthCalledWith(1, insured, 'hit')
    expect(mocks.executeAction).toHaveBeenNthCalledWith(2, afterHit, 'stand')
  })

  it('rebuilds only the initial deal for a pending insurance decision', () => {
    const initial = state('initial')
    const started = state('started')
    mocks.createInitialState.mockReturnValue(initial)
    mocks.startRound.mockReturnValue(started)

    const result = reconstructBlackjackGameState({
      game,
      sessionBalance: 10,
      resolvedServerSeed: 'resolved-server-seed',
      actionHistory: ['hit'],
    })

    expect(result).toBe(started)
    expect(mocks.createInitialState).toHaveBeenCalledWith(10.6)
    expect(mocks.takeInsurance).not.toHaveBeenCalled()
    expect(mocks.executeAction).not.toHaveBeenCalled()
  })

  it('keeps legacy empty-history fallback and rejects malformed persisted JSON', () => {
    expect(parseBlackjackActionHistory(null)).toEqual([])
    expect(parseBlackjackActionHistory('')).toEqual([])
    expect(parseBlackjackActionHistory('["split","stand"]')).toEqual(['split', 'stand'])
    expect(() => parseBlackjackActionHistory('{not-json')).toThrow()
  })

  it('uses default rules when historical initial state has no rules', () => {
    const initial = state('initial')
    const started = state('started')
    mocks.createInitialState.mockReturnValue(initial)
    mocks.startRound.mockReturnValue(started)

    reconstructBlackjackGameState({
      game: { ...game, initialState: null, mainBet: 2 },
      sessionBalance: 4,
      resolvedServerSeed: 'resolved-server-seed',
    })

    expect(mocks.startRound).toHaveBeenCalledWith(
      initial,
      2,
      0.1,
      'resolved-server-seed',
      'server-hash',
      'client-seed',
      7,
      'normalized-fairness-version',
      { minBet: 0, maxBet: 2 },
      undefined
    )
  })
})
