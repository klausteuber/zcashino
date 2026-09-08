import { describe, expect, it } from 'vitest'
import { act, activeHand, createTableState, legalActions, seatPlayer, startHand, tableChips } from './engine'
import { calculateRake, REAL_RAKE_POLICY, rakeDisclosure } from './rake'
import type { PokerState } from './types'
const deck = () => Array.from({ length: 52 }, (_, i) => i)
function table(count = 2, variant: PokerState['variant'] = 'holdem') {
  const s = createTableState(10_000, variant, REAL_RAKE_POLICY)
  for (let i = 0; i < count; i++) { s.seats[i] = seatPlayer(`p${i}`, `P${i}`, 1_000_000); s.seats[i]!.ready = true }
  startHand(s, deck(), 0)
  return s
}
function showdown(contributions: number[], folded: number[] = []) {
  const s = table(contributions.length)
  s.phase = 'river'; s.board = [32, 36, 40, 44, 48]; s.actor = 0; s.pending = [0]; s.currentBet = 0
  contributions.forEach((amount, i) => Object.assign(s.seats[i]!, { cards: [i * 4 + 1, i * 4 + 2], contribution: amount, streetBet: 0, folded: folded.includes(i) }))
  const total = tableChips(s)
  act(s, 0, { type: 'check' }, 1)
  expect(s.phase).toBe('complete')
  expect(tableChips(s) + s.rakeZats).toBe(total)
  expect(s.settlement.reduce((n, p) => n + p.wagered - p.returned, 0)).toBe(s.rakeZats)
  return s
}
describe('2.9% poker rake', () => {
  it('rounds down exactly and applies the two-player or multi-player cap based on players dealt', () => {
    const s = table(6); s.board = [0, 1, 2]
    expect(calculateRake(s, 1_001)).toBe(29)
    expect(calculateRake(s, 34)).toBe(0)
    expect(calculateRake(s, 35)).toBe(1)
    expect(calculateRake(s, 2_000_000)).toBe(30_000)
    s.seats.slice(2).forEach(p => { p!.folded = true })
    expect(calculateRake(s, 2_000_000)).toBe(30_000)
    s.seats.slice(2).forEach(p => { p!.inHand = false })
    expect(calculateRake(s, 2_000_000)).toBe(10_000)
  })
  it.each(['holdem', 'omaha', 'stud'] as const)('charges no rake when %s ends before its qualifying street', variant => {
    const s = table(2, variant), total = tableChips(s)
    if (legalActions(s, s.actor!)!.bringIn !== null) act(s, s.actor!, { type: 'bring-in' }, 1)
    act(s, s.actor!, { type: 'fold' }, 2)
    expect(s.phase).toBe('complete'); expect(s.rakeZats).toBe(0); expect(tableChips(s)).toBe(total)
  })
  it('uses fourth street and the small-bet unit for stud', () => {
    const s = table(2, 'stud')
    expect(calculateRake(s, 2_000_000)).toBe(0)
    s.phase = 'fourth'
    expect(calculateRake(s, 2_000_000)).toBe(10_000)
  })
  it('never rakes refunded uncalled bets and splits the net pot with deterministic odd chips', () => {
    const s = showdown([1000, 501])
    expect(s.rakeZats).toBe(29)
    expect(s.awards.filter(a => a.refund)).toEqual([{ seat: 0, amount: 499, label: 'Uncalled bet returned', refund: true }])
    expect(s.awards.filter(a => !a.refund).map(a => a.amount)).toEqual([487, 486])
  })
  it('caps once across side pots and allocates the fee proportionally', () => {
    const s = showdown([100_000, 1_000_000, 1_000_000])
    expect(s.rakeZats).toBe(30_000)
    const mainNet = s.awards.slice(0, 3).reduce((n, a) => n + a.amount, 0)
    expect(mainNet).toBe(300_000 - 4285)
    expect(s.awards.slice(3).reduce((n, a) => n + a.amount, 0)).toBe(1_800_000 - 25715)
  })
  it('keeps the multi-player cap even when all but one player fold', () => {
    const s = showdown([1_000_000, 1_000_000, 1_000_000], [1, 2])
    expect(s.rakeZats).toBe(30_000)
    expect(s.awards).toHaveLength(1)
    expect(s.awards[0].amount).toBe(2_970_000)
  })
  it('resets the fee at the next deal and leaves no-rake table policies unchanged', () => {
    const s = showdown([1000, 1000])
    expect(s.rakeZats).toBe(58)
    startHand(s, deck(), 100)
    expect(s.rakeZats).toBe(0)
    s.rakePolicy = 'none'; s.board = [0, 1, 2]
    expect(calculateRake(s, 100_000)).toBe(0)
    expect(rakeDisclosure('none', 'holdem', 10000)).toBe('No rake on this table.')
  })
  it.each(['holdem', 'omaha', 'stud'] as const)('conserves players plus revenue across 300 randomized %s hands', variant => {
    let seed = 719
    const rand = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max }
    for (let hand = 0; hand < 300; hand++) {
      const s = createTableState(100, variant, REAL_RAKE_POLICY), cards = deck()
      for (let i = 51; i > 0; i--) { const j = rand(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]] }
      const count = 2 + rand(5)
      for (let i = 0; i < count; i++) { s.seats[i] = seatPlayer(`p${i}`, `P${i}`, 100 + rand(10000)); s.seats[i]!.ready = true }
      const total = tableChips(s)
      startHand(s, cards, 0)
      let moves = 0
      while (activeHand(s) && moves++ < 300) {
        const legal = legalActions(s, s.actor!)!, choice = rand(5)
        if (legal.bringIn !== null) act(s, s.actor!, { type: 'bring-in' }, moves)
        else if (choice <= 1 && legal.canRaise) act(s, s.actor!, { type: 'raise', to: choice === 0 ? legal.minRaiseTo : legal.maxRaiseTo }, moves)
        else act(s, s.actor!, { type: choice === 2 ? 'fold' : legal.canCheck ? 'check' : 'call' }, moves)
        expect(tableChips(s) + s.rakeZats).toBe(total)
        expect(s.seats.filter(Boolean).every(p => Number.isSafeInteger(p!.stack) && p!.stack >= 0)).toBe(true)
      }
      expect(s.phase).toBe('complete')
      expect(s.rakeZats).toBeLessThanOrEqual(count === 2 ? 100 : 300)
      expect(s.settlement.reduce((sum, p) => sum + p.wagered - p.returned, 0)).toBe(s.rakeZats)
    }
  })
})
