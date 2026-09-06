// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { concessionEvidence, passivityEvidence, timingEvidence, type DecisionSample, type PairHand } from './integrity-rules'
function sample(i: number, overrides: Partial<DecisionSample> = {}): DecisionSample {
  return { id: `d${i}`, handId: `h${Math.floor(i / 2)}`, identityId: 'A', variant: 'holdem', phase: i % 2 ? 'flop' : 'preflop', action: ['call', 'fold', 'raise'][i % 3], source: 'player', elapsedMs: 1234,
    context: { seat: 0, action: { type: 'call' }, pot: 1000, call: 25, committed: 25, contributionBefore: 500, stackBefore: 1000, currentBet: 25, bankActivated: false, bankSpentMs: 0, board: [], boardAfter: [], cards: [], exposedCards: [],
      legal: { canCheck: false, call: 25, minRaiseTo: 50, maxRaiseTo: 1000, canRaise: true, bringIn: null, raiseOptions: null }, opponents: [{ identityId: 'B', seat: 1, contribution: 500, streetBet: 25, stack: 1000 }] }, ...overrides }
}
describe('Conservative review indicators', () => {
  it('requires a varied, multi-hand decision sample before flagging uniform timing', () => {
    const samples = Array.from({ length: 100 }, (_, i) => sample(i))
    expect(timingEvidence(samples)?.handCount).toBe(50)
    expect(timingEvidence(samples.slice(0, 79))).toBeNull()
    expect(timingEvidence(samples.map(s => ({ ...s, handId: 'one-hand' })))).toBeNull()
    expect(timingEvidence(samples.map(s => ({ ...s, action: 'check' })))).toBeNull()
    expect(timingEvidence(samples.map((s, i) => ({ ...s, elapsedMs: 500 + i * 97 })))).toBeNull()
  })
  it('never treats time-bank use, forced bring-ins or automatic timeouts as bot timing evidence', () => {
    const samples = Array.from({ length: 100 }, (_, i) => sample(i))
    expect(timingEvidence(samples.map(s => ({ ...s, context: { ...s.context, bankActivated: true, bankSpentMs: 1000 } })))).toBeNull()
    expect(timingEvidence(samples.map(s => ({ ...s, source: 'timeout' })))).toBeNull()
    expect(timingEvidence(samples.map(s => ({ ...s, source: 'leave' })))).toBeNull()
    expect(timingEvidence(samples.map(s => ({ ...s, action: 'bring-in' })))).toBeNull()
    // Activating but not spending the bank cannot erase otherwise eligible decision timing.
    expect(timingEvidence(samples.map(s => ({ ...s, context: { ...s.context, bankActivated: true } })))).not.toBeNull()
  })
  it('requires both one-sided large pots and repeated low-cost concessions for a chip-dumping review', () => {
    const hands: PairHand[] = Array.from({ length: 30 }, (_, i) => ({ id: `h${i}`, bigBlind: 10, players: [{ identityId: 'A', wagered: 500, returned: 0 }, { identityId: 'B', wagered: 500, returned: 1000 }], decisions: [sample(i, { action: 'fold' })] }))
    expect(concessionEvidence(hands, 'A', 'B')?.lowCostConcessions).toBe(30)
    expect(concessionEvidence(hands.slice(0, 20), 'A', 'B')).toBeNull()
    expect(concessionEvidence(hands.map(h => ({ ...h, decisions: [] })), 'A', 'B')).toBeNull()
    expect(concessionEvidence(hands.map(h => ({ ...h, decisions: h.decisions.map(s => ({ ...s, source: 'timeout' })) })), 'A', 'B')).toBeNull()
    expect(concessionEvidence(hands, 'B', 'A')).toBeNull()
  })
  it('requires enough comparison opponents and actual raising opportunities for passivity review', () => {
    const paired = Array.from({ length: 50 }, (_, i) => sample(i, { action: 'check' }))
    const others = Array.from({ length: 50 }, (_, i) => { const s = sample(i + 100, { action: 'raise' }); s.context.opponents[0].identityId = `other${i % 3}`; return s })
    expect(passivityEvidence([...paired, ...others], 'A', 'B')?.pairedDecisions).toBe(50)
    expect(passivityEvidence(paired, 'A', 'B')).toBeNull()
    expect(passivityEvidence([...paired, ...others].map(s => ({ ...s, context: { ...s.context, legal: null } })), 'A', 'B')).toBeNull()
  })
})
