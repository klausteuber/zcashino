import { describe, expect, it } from 'vitest'
import { TOTAL_POOL_ZATS, parseZats } from '@/lib/veilstone/engine'
import { simulateVeilstoneMatch, type VeilstoneBotStrategy } from './simulateMatch'

const strategySets: VeilstoneBotStrategy[][] = [
  ['random-legal', 'public-market', 'shielded-bid', 'contract-only'],
  ['hoarder', 'passive', 'public-market', 'shielded-bid'],
  ['contract-only', 'contract-only', 'shielded-bid', 'random-legal'],
]

describe('Veilstone bot simulations', () => {
  it('completes varied deterministic bot matches without breaking pool invariants', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const result = simulateVeilstoneMatch({
        seed,
        strategies: strategySets[seed % strategySets.length],
      })

      expect(result.state.phase).toBe('MATCH_COMPLETE')
      expect(result.actionsAccepted).toBeGreaterThan(0)
      const payoutTotal = Object.values(result.state.players).reduce(
        (sum, player) => sum + parseZats(player.payoutZats ?? '0'),
        0n
      )
      expect(payoutTotal).toBe(TOTAL_POOL_ZATS)
    }
  })
})
