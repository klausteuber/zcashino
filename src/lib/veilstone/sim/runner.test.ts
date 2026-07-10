import { describe, expect, it } from 'vitest'
import { runVeilstoneMonteCarlo } from './runner'

describe('Veilstone Monte Carlo runner', () => {
  it('completes 100 deterministic mixed-bot matches quickly with pool invariants', () => {
    const result = runVeilstoneMonteCarlo({
      matches: 100,
      seed: 12345,
      lineup: 'mixed',
    })

    expect(result.matchMetrics).toHaveLength(100)
    expect(result.aggregate.invariantFailureCount).toBe(0)
    for (const match of result.matchMetrics) {
      expect(match.ledgerConserved).toBe(true)
      expect(match.negativeBalanceCount).toBe(0)
      expect(match.finalPayoutSumZats).toBe('400000000')
      expect(match.actions.stuckPhaseCount).toBe(0)
    }
  }, 30_000)
})
