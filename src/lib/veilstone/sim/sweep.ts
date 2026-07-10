import {
  DEFAULT_VEILSTONE_BALANCE_CONFIG,
  type VeilstoneBalanceConfigOverride,
} from '../engine'
import { runVeilstoneMonteCarlo, type MonteCarloResult } from './runner'

export interface BalanceSweepCandidate {
  name: string
  override: VeilstoneBalanceConfigOverride
  score: number
  result: MonteCarloResult
  notes: string[]
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function scoreSimulationCandidate(result: MonteCarloResult): { score: number; notes: string[] } {
  const maxSeatWinRate = Math.max(0, ...Object.values(result.aggregate.winRateBySeat))
  const maxBotWinRate = Math.max(0, ...Object.values(result.aggregate.winRateByBot))
  const crisisMatches = result.matchMetrics.filter((match) => Object.keys(match.crisisFrequency).length > 0).length
  const crisisRate = crisisMatches / Math.max(1, result.matches)
  const shieldedPerPlayer = result.aggregate.averageShieldedActionsPerMatch / 4
  const publicActionScore = clamp01(result.aggregate.averagePublicActionsPerMatch / 8)
  const comebackScore = clamp01(result.aggregate.comebackRateFromThirdOrFourthAfterEpoch2 / 0.18)
  const notes: string[] = []

  if (maxSeatWinRate > 0.3) notes.push(`Seat imbalance flag: top seat win rate ${(maxSeatWinRate * 100).toFixed(1)}%`)
  if (maxBotWinRate > 0.5) notes.push(`Dominant strategy flag: top bot win rate ${(maxBotWinRate * 100).toFixed(1)}%`)
  if (result.aggregate.invariantFailureCount > 0) notes.push(`${result.aggregate.invariantFailureCount} invariant failure matches`)
  if (shieldedPerPlayer < 2 || shieldedPerPlayer > 5) notes.push(`Shielded actions/player outside early target: ${shieldedPerPlayer.toFixed(2)}`)
  if (crisisRate < 0.5) notes.push('Crises appear underrepresented in completed matches')

  const seatFairnessScore = clamp01(1 - ((maxSeatWinRate - 0.25) / 0.25))
  const strategyDiversityScore = clamp01(1 - ((maxBotWinRate - 0.25) / 0.35))
  const crisisFrequencyScore = clamp01(crisisRate)
  const shieldedUsageScore = clamp01(shieldedPerPlayer / 3)
  const trustUsageScore = clamp01((result.aggregate.averageTrustPrestigeCorrelation + 1) / 2)
  const invariantScore = result.aggregate.invariantFailureCount === 0 ? 1 : 0
  const runawayPenalty = maxBotWinRate > 0.5 ? (maxBotWinRate - 0.5) * 2 : 0

  const score = (
    seatFairnessScore
    + strategyDiversityScore
    + comebackScore
    + crisisFrequencyScore
    + shieldedUsageScore
    + trustUsageScore
    + publicActionScore
    + invariantScore
    - runawayPenalty
  )

  return { score, notes }
}

export function makeSweepCandidates(): Array<{ name: string; override: VeilstoneBalanceConfigOverride }> {
  return [
    { name: 'baseline', override: {} },
    { name: 'cheaper-shielding', override: { sealedBidDataCost: 0 } },
    { name: 'costlier-shielding', override: { sealedBidDataCost: 2 } },
    { name: 'higher-trust-bonus', override: { reputationBonusZats: 175_000n } },
    { name: 'lower-trust-bonus', override: { reputationBonusZats: 50_000n } },
    { name: 'softer-crises', override: { crisisIntensity: 0 } },
    { name: 'sharper-crises', override: { crisisIntensity: 2 } },
    {
      name: 'data-premium-terminal',
      override: {
        terminalPricesZats: {
          ...DEFAULT_VEILSTONE_BALANCE_CONFIG.terminalPricesZats,
          data: 260_000n,
          compute: 170_000n,
        },
      },
    },
    {
      name: 'compute-premium-terminal',
      override: {
        terminalPricesZats: {
          ...DEFAULT_VEILSTONE_BALANCE_CONFIG.terminalPricesZats,
          compute: 260_000n,
          energy: 160_000n,
        },
      },
    },
  ]
}

export function runVeilstoneBalanceSweep(input: {
  matches: number
  seed: number
  lineup?: string
  maxSteps?: number
}): BalanceSweepCandidate[] {
  return makeSweepCandidates()
    .map((candidate, index) => {
      const result = runVeilstoneMonteCarlo({
        matches: input.matches,
        seed: input.seed + (index * 10_000),
        lineup: input.lineup ?? 'mixed',
        balanceConfigOverride: candidate.override,
        maxSteps: input.maxSteps,
      })
      const scored = scoreSimulationCandidate(result)
      return {
        name: candidate.name,
        override: candidate.override,
        score: scored.score,
        result,
        notes: scored.notes,
      }
    })
    .sort((a, b) => b.score - a.score)
}
