import { describe, expect, it } from 'vitest'
import {
  calculateGini,
  median,
  pearsonCorrelation,
  scoreSimulationCandidate,
  standardDeviation,
} from './index'
import type { MonteCarloResult } from './runner'

function makeResult(overrides: Partial<MonteCarloResult['aggregate']> = {}): MonteCarloResult {
  return {
    command: 'test',
    seed: 1,
    matches: 4,
    lineup: ['trustBanker', 'shieldedShark', 'dataForecaster', 'greedyRoi'],
    config: {},
    matchMetrics: [
      {
        matchId: 'm1',
        seed: 1,
        lineup: ['trustBanker', 'shieldedShark', 'dataForecaster', 'greedyRoi'],
        steps: 1,
        actionsAccepted: 1,
        finalPayouts: [],
        winnerSeat: 0,
        winnerBotType: 'trustBanker',
        finalPayoutSumZats: '400000000',
        negativeBalanceCount: 0,
        ledgerConserved: true,
        invariantFailures: [],
        actions: {
          publicActions: 8,
          shieldedActions: 10,
          sealedCommitments: 10,
          contractsCompleted: 1,
          contractsFailed: 0,
          dataSpentForecasting: 0,
          dataSpentShielding: 10,
          dataSpentAudits: 0,
          invalidActionCount: 0,
          stuckPhaseCount: 0,
        },
        crisisFrequency: { ENERGY_SHOCK: 1 },
        leaderByEpoch: {},
        rankingsByEpoch: {},
        comebackFromThirdOrFourthAfterEpoch2: false,
        winnerMarginZats: '10000000',
        giniFinalPayouts: 0.1,
        terminalTrustPrestigeCorrelation: 0.5,
      },
    ],
    aggregate: {
      matches: 4,
      invariantFailureCount: 0,
      winRateByBot: { trustBanker: 0.25, shieldedShark: 0.25, dataForecaster: 0.25, greedyRoi: 0.25 },
      winRateBySeat: { 0: 0.25, 1: 0.25, 2: 0.25, 3: 0.25 },
      averageRoiByBot: {},
      payoutStandardDeviationZats: 0,
      medianWinnerMarginZats: 10_000_000,
      averageGiniFinalPayouts: 0.1,
      comebackRateFromThirdOrFourthAfterEpoch2: 0.12,
      epochLeaderConversionRates: { 1: 0.35, 2: 0.45 },
      crisisFrequency: { ENERGY_SHOCK: 4 },
      averageShieldedActionsPerMatch: 10,
      averagePublicActionsPerMatch: 8,
      averageTrustPrestigeCorrelation: 0.5,
      suspiciousDominantStrategies: [],
      ...overrides,
    },
  }
}

describe('Veilstone simulation metrics', () => {
  it('calculates Gini, median, deviation, and correlation', () => {
    expect(calculateGini([100, 100, 100, 100])).toBe(0)
    expect(calculateGini([0, 0, 0, 100])).toBeCloseTo(0.75)
    expect(median([3, 1, 2])).toBe(2)
    expect(standardDeviation([10, 10, 10])).toBe(0)
    expect(pearsonCorrelation([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })

  it('scores candidate configs and flags dominant strategies', () => {
    const healthy = scoreSimulationCandidate(makeResult())
    const dominant = scoreSimulationCandidate(makeResult({
      winRateByBot: { shieldedShark: 0.75 },
      winRateBySeat: { 0: 0.55 },
      invariantFailureCount: 1,
    }))

    expect(healthy.score).toBeGreaterThan(dominant.score)
    expect(dominant.notes.some((note) => note.includes('Dominant strategy'))).toBe(true)
    expect(dominant.notes.some((note) => note.includes('Seat imbalance'))).toBe(true)
  })
})
