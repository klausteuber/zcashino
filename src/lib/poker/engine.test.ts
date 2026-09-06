import { describe, expect, it } from 'vitest'
import { act, activeHand, createTableState, legalActions, publicState, seatPlayer, startHand, tableChips } from './engine'
import { evaluateHand } from './evaluator'
import { parseZec, type PokerState } from './types'
const deck = () => Array.from({ length: 52 }, (_, i) => i)
function table(stacks = [1000, 1000, 1000, 1000, 1000, 1000]) {
  const s = createTableState(10)
  stacks.forEach((stack, i) => { s.seats[i] = seatPlayer(`player${i}`, `Player ${i}`, stack); s.seats[i]!.ready = true })
  startHand(s, deck(), 0)
  return s
}
const card = (rank: number, suit = 0) => (rank - 2) * 4 + suit
function playPassive(s: PokerState) {
  let n = 0
  while (activeHand(s) && n++ < 100) {
    const legal = legalActions(s, s.actor!)!
    act(s, s.actor!, { type: legal.canCheck ? 'check' : 'call' }, n)
  }
  expect(s.phase).toBe('complete')
}
describe('Hold’em rules and money conservation', () => {
  it('posts six-max blinds and deals only two cards per player', () => {
    const s = table()
    expect(s.dealer).toBe(0); expect(s.seats[1]!.streetBet).toBe(5); expect(s.seats[2]!.streetBet).toBe(10); expect(s.actor).toBe(3)
    expect(s.seats.every(p => p!.cards.length === 2)).toBe(true)
    expect(tableChips(s)).toBe(6000)
    playPassive(s)
    expect(s.board).toHaveLength(5); expect(tableChips(s)).toBe(6000)
    expect(s.settlement.reduce((n, p) => n + p.wagered - p.returned, 0)).toBe(0)
  })
  it('uses the button for the heads-up small blind, acting first preflop and last postflop', () => {
    const s = table([1000, 1000])
    expect(s.actor).toBe(s.dealer); expect(s.seats[s.dealer]!.streetBet).toBe(5)
    act(s, 0, { type: 'call' }, 1); act(s, 1, { type: 'check' }, 2)
    expect(s.phase).toBe('flop'); expect(s.actor).toBe(1)
  })
  it('rejects out-of-turn, over-stack, fractional and under-minimum raises', () => {
    const s = table()
    expect(() => act(s, 0, { type: 'fold' }, 1)).toThrow('turn')
    for (const to of [11, 19, 20.5, 1001, NaN]) expect(() => act(s, 3, { type: 'raise', to }, 1)).toThrow('raise')
    expect(() => act(s, 3, { type: 'check' }, 1)).toThrow('call or fold')
    expect(tableChips(s)).toBe(6000)
  })
  it('posts an entry big blind when a player joins after the opening hand', () => {
    const s = table([1000, 1000])
    playPassive(s)
    s.seats[3] = seatPlayer('newcomer', 'New player', 1000)
    s.seats[3]!.ready = true
    startHand(s, deck(), 100)
    expect(s.seats[3]!.streetBet).toBe(10)
    expect(s.seats[3]!.needsEntryBlind).toBe(false)
    expect(tableChips(s)).toBe(3000)
  })
  it('keeps the big blind option after limpers', () => {
    const s = table([1000, 1000, 1000])
    act(s, 0, { type: 'call' }, 1); act(s, 1, { type: 'call' }, 2)
    expect(s.phase).toBe('preflop'); expect(s.actor).toBe(2)
    expect(legalActions(s, 2)?.canRaise).toBe(true)
  })
  it('does not reopen a prior raiser after a short all-in', () => {
    const s = table([1000, 25, 1000])
    act(s, 0, { type: 'raise', to: 20 }, 1)
    act(s, 1, { type: 'raise', to: 25 }, 2)
    act(s, 2, { type: 'call' }, 3)
    expect(s.actor).toBe(0); expect(legalActions(s, 0)?.canRaise).toBe(false)
    expect(legalActions(s, 0)?.call).toBe(5)
  })
  it('reopens betting after cumulative short all-ins reach a full raise', () => {
    const s = table([1000, 25, 30, 1000])
    act(s, 3, { type: 'raise', to: 20 }, 1)
    act(s, 0, { type: 'call' }, 2)
    act(s, 1, { type: 'raise', to: 25 }, 3)
    act(s, 2, { type: 'raise', to: 30 }, 4)
    expect(s.actor).toBe(3); expect(legalActions(s, 3)?.canRaise).toBe(true)
    expect(legalActions(s, 3)?.minRaiseTo).toBe(40)
  })
  it('runs out an all-in and returns uncalled excess with no chip loss', () => {
    const s = table([100, 30])
    act(s, 0, { type: 'raise', to: 100 }, 1)
    act(s, 1, { type: 'call' }, 2)
    expect(s.phase).toBe('complete'); expect(s.board).toHaveLength(5)
    expect(s.awards.find(a => a.refund)?.amount).toBe(70)
    expect(tableChips(s)).toBe(130)
    expect(s.settlement.map(p => p.wagered)).toEqual([30, 30])
  })
  it('awards side pots independently to eligible players', () => {
    const s = table([100, 200, 300])
    // Distinct hole cards and a board that makes AA > KK > QQ.
    s.seats[0]!.cards = [card(14, 0), card(14, 1)]
    s.seats[1]!.cards = [card(13, 0), card(13, 1)]
    s.seats[2]!.cards = [card(12, 0), card(12, 1)]
    s.deck = [card(3, 3), card(2, 0), card(4, 1), card(7, 2), card(5, 3), card(9, 3), card(6, 3), card(11, 1)]
    act(s, 0, { type: 'raise', to: 100 }, 1)
    act(s, 1, { type: 'raise', to: 200 }, 2)
    act(s, 2, { type: 'call' }, 3)
    expect(s.phase).toBe('complete')
    expect(s.seats.map(p => p?.stack).slice(0, 3)).toEqual([300, 200, 100])
    expect(tableChips(s)).toBe(600)
  })
  it('does not allow betting against only all-in opponents', () => {
    const s = table([1000, 20])
    act(s, 0, { type: 'call' }, 1)
    act(s, 1, { type: 'raise', to: 20 }, 2)
    expect(legalActions(s, 0)?.canRaise).toBe(false)
    act(s, 0, { type: 'call' }, 3)
    expect(s.phase).toBe('complete'); expect(tableChips(s)).toBe(1020)
  })
  it('awards a split-pot odd chip clockwise after the button', () => {
    const s = table([100, 100, 100])
    // Small blind folds, leaving 25 in the pot. Remaining players play the board.
    act(s, 0, { type: 'call' }, 1); act(s, 1, { type: 'fold' }, 2)
    s.deck = [card(2, 0), card(10, 3), card(11, 3), card(12, 3), card(3, 0), card(13, 3), card(4, 0), card(14, 3)]
    playPassive(s)
    expect(s.seats[0]!.stack).toBe(102); expect(s.seats[1]!.stack).toBe(95); expect(s.seats[2]!.stack).toBe(103)
  })
  it('keeps the deck, account IDs, and opponents’ folded cards out of all snapshots', () => {
    const s = table()
    act(s, 3, { type: 'fold' }, 1)
    const during = publicState(s, 'player0')
    expect(during.seats[0]!.cards.every(c => c !== null)).toBe(true)
    expect(during.seats[3]!.cards).toEqual([null, null])
    const json = JSON.stringify(during)
    for (const key of ['deck', 'playerId', 'player0', 'settlement', 'pending']) expect(json).not.toContain(key)
    playPassive(s)
    expect(publicState(s, 'spectator').seats[3]!.cards).toEqual([null, null])
    expect(publicState(s, 'spectator').seats[0]!.cards.every(c => c !== null)).toBe(true)
  })
  it('does not reveal the winner’s hand when everybody folds', () => {
    const s = table([100, 100]); act(s, 0, { type: 'fold' }, 1)
    expect(s.phase).toBe('complete'); expect(s.board).toEqual([])
    expect(publicState(s, 'spectator').seats[1]!.cards).toEqual([null, null])
  })
  it('conserves every chip over 500 randomized six-player hands', () => {
    let seed = 123
    function random(max: number) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max }
    for (let hand = 0; hand < 500; hand++) {
      const s = createTableState(10)
      for (let i = 0; i < 6; i++) { s.seats[i] = seatPlayer(`p${i}`, `P${i}`, 10 + random(2000)); s.seats[i]!.ready = true }
      const total = tableChips(s)
      const d = deck(); for (let i = 51; i > 0; i--) { const j = random(i + 1); [d[i], d[j]] = [d[j], d[i]] }
      startHand(s, d, 0)
      let steps = 0
      while (activeHand(s) && steps++ < 300) {
        const legal = legalActions(s, s.actor!)!
        const choice = random(5)
        act(s, s.actor!, choice === 0 ? { type: 'fold' } : choice === 1 && legal.canRaise ? { type: 'raise', to: random(2) ? legal.maxRaiseTo : legal.minRaiseTo } : { type: legal.canCheck ? 'check' : 'call' }, steps)
        expect(tableChips(s)).toBe(total)
      }
      expect(s.phase).toBe('complete')
      expect(s.settlement.reduce((sum, p) => sum + p.wagered - p.returned, 0)).toBe(0)
    }
  })
})
describe('Hand evaluation and ZEC precision', () => {
  it('ranks a wheel below a six-high straight', () => {
    const wheel = [card(14), card(2, 1), card(3, 2), card(4), card(5)]
    const six = [card(2), card(3, 1), card(4, 2), card(5), card(6)]
    expect(evaluateHand(wheel).label).toBe('Straight'); expect(evaluateHand(wheel).score).toBeLessThan(evaluateHand(six).score)
  })
  it('selects the strongest full house from seven cards', () => {
    const full = evaluateHand([card(14, 0), card(14, 1), card(14, 2), card(13, 0), card(13, 1), card(13, 2), card(2)])
    expect(full.label).toBe('Full house')
    expect(full.score).toBe(evaluateHand([card(14, 0), card(14, 1), card(14, 2), card(13, 0), card(13, 1)]).score)
  })
  it('parses zatoshis without accepting exponent notation or extra decimals', () => {
    expect(parseZec('0.00000001')).toBe(1); expect(parseZec('0.01000001')).toBe(1000001)
    for (const invalid of ['1e5', '-1', 'NaN', '0.000000001', 'Infinity']) expect(parseZec(invalid)).toBeNull()
  })
})
