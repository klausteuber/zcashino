import { describe, expect, it } from 'vitest'
import { act, activeHand, automaticAction, createTableState, legalActions, publicState, seatPlayer, startHand, tableChips, useTimeBank } from './engine'
import { evaluateHand, evaluateOmaha } from './evaluator'
import { studOpener } from './stud'
import { type PokerState, type PokerVariant, TIME_BANK_MAX_MS } from './types'
const card = (rank: number, suit = 0) => (rank - 2) * 4 + suit
const deck = () => Array.from({ length: 52 }, (_, i) => i)
function table(variant: PokerVariant, stacks = [1000, 1000, 1000, 1000, 1000, 1000]) {
  const s = createTableState(10, variant)
  stacks.forEach((stack, i) => { s.seats[i] = seatPlayer(`p${i}`, `Player ${i}`, stack); s.seats[i]!.ready = true })
  startHand(s, deck(), 0)
  return s
}
function passive(s: PokerState) {
  const legal = legalActions(s, s.actor!)!
  act(s, s.actor!, { type: legal.bringIn !== null ? 'bring-in' : legal.canCheck ? 'check' : 'call' }, 1)
}
function until(s: PokerState, phase: string) { for (let i = 0; i < 200 && activeHand(s) && s.phase !== phase; i++) passive(s); expect(s.phase).toBe(phase) }

describe('Four-card pot-limit Omaha', () => {
  it('uses exactly two hole cards, including on a royal-flush board', () => {
    const board = [10, 11, 12, 13, 14].map(r => card(r, 3))
    expect(evaluateHand(board).label).toBe('Straight flush')
    expect(evaluateOmaha([card(2), card(3, 1), card(4, 2), card(5)], board).label).toBe('High card')
    expect(evaluateOmaha([card(14, 3), card(13, 3), card(2), card(4)], [card(10, 3), card(11, 3), card(12, 3), card(8), card(7)]).label).toBe('Straight flush')
  })
  it('does not make a flush with one suited hole card or a straight with three hole cards', () => {
    expect(evaluateOmaha([card(14, 3), card(13, 1), card(12, 2), card(11)], [card(10, 3), card(9, 3), card(8, 3), card(7, 3), card(2, 1)]).label).toBe('Straight')
    expect(evaluateOmaha([card(14), card(4, 1), card(5, 2), card(13, 2)], [card(2, 1), card(3), card(9, 2), card(12, 3), card(7, 3)]).label).toBe('High card')
  })
  it('rejects duplicate or wrong-sized Omaha hands', () => {
    expect(() => evaluateOmaha([0, 1], [2, 3, 4, 5, 6])).toThrow()
    expect(() => evaluateOmaha([0, 1, 2, 3], [3, 4, 5, 6, 7])).toThrow()
  })
  it('deals four private cards and caps first and subsequent raises by the called pot', () => {
    const s = table('omaha')
    expect(s.seats.every(p => p!.cards.length === 4)).toBe(true)
    expect(publicState(s, 'spectator').seats[0]!.cards).toEqual([null, null, null, null])
    expect(legalActions(s, 3)!.maxRaiseTo).toBe(35)
    expect(() => act(s, 3, { type: 'raise', to: 36 }, 1)).toThrow('Invalid raise')
    act(s, 3, { type: 'raise', to: 35 }, 1)
    expect(legalActions(s, 4)!.maxRaiseTo).toBe(120)
    until(s, 'flop')
    const pot = s.seats.reduce((sum, p) => sum + p!.contribution, 0)
    expect(legalActions(s, s.actor!)!.maxRaiseTo).toBe(pot)
    until(s, 'complete'); expect(tableChips(s)).toBe(6000)
  })
  it('allows a short all-in within the pot but refuses a stack-sized overbet', () => {
    const s = table('omaha', [1000, 1000, 1000, 15])
    expect(legalActions(s, 3)!.minRaiseTo).toBe(15)
    act(s, 3, { type: 'raise', to: 15 }, 1)
    expect(s.seats[3]!.stack).toBe(0)
    expect(() => act(s, s.actor!, { type: 'raise', to: 1000 }, 2)).toThrow('Invalid raise')
    until(s, 'complete'); expect(tableChips(s)).toBe(3015)
  })
})

describe('Fixed-limit seven-card stud', () => {
  it('antes without blinds and makes the lowest exposed card post or complete', () => {
    const s = table('stud')
    expect(s.phase).toBe('third'); expect(s.board).toEqual([])
    expect(s.seats.every(p => p!.contribution === 1 && p!.streetBet === 0 && p!.cards.length === 3)).toBe(true)
    const low = s.seats.findIndex(p => p!.cards[2] === Math.min(...s.seats.map(p => p!.cards[2])))
    expect(s.actor).toBe(low)
    expect(legalActions(s, low)!.bringIn).toBe(5)
    expect(() => act(s, low, { type: 'fold' }, 1)).toThrow('bring-in')
    expect(automaticAction(s)).toEqual({ type: 'bring-in' })
    act(s, low, { type: 'bring-in' }, 1)
    expect(s.currentBet).toBe(5); expect(s.limitBets).toBe(0)
    expect(legalActions(s, s.actor!)!.raiseOptions).toEqual([10])
    expect(() => act(s, s.actor!, { type: 'raise', to: 15 }, 2)).toThrow('Invalid raise')
  })
  it('allows completing immediately instead of posting a bring-in, and caps at four bets', () => {
    const s = table('stud')
    for (const to of [10, 20, 30, 40]) act(s, s.actor!, { type: 'raise', to }, 1)
    expect(s.limitBets).toBe(4); expect(legalActions(s, s.actor!)!.canRaise).toBe(false)
    expect(() => act(s, s.actor!, { type: 'raise', to: 50 }, 1)).toThrow('Invalid raise')
    until(s, 'fourth'); expect(s.limitBets).toBe(0)
  })
  it('exposes only upcards, deals seventh down, and uses no community board', () => {
    const s = table('stud')
    for (const phase of ['third', 'fourth', 'fifth', 'sixth', 'seventh']) {
      until(s, phase)
      const view = publicState(s, 'p0')
      for (let i = 1; i < 6; i++) {
        const cards = view.seats[i]!.cards
        expect(cards.slice(0, 2)).toEqual([null, null])
        expect(cards.slice(2, 6).every(c => c !== null)).toBe(true)
        if (phase === 'seventh') expect(cards[6]).toBeNull()
      }
      expect(s.board).toHaveLength(0)
      expect(s.seats.filter(p => p!.cards.length > 3).every(p => p!.cards.length <= 7)).toBe(true)
    }
    until(s, 'complete')
    expect(s.seats.every(p => p!.cards.length === 7)).toBe(true)
    expect(publicState(s, 'spectator').seats.every(p => p!.cards.every(c => c !== null))).toBe(true)
    expect(tableChips(s)).toBe(6000)
  })
  it('keeps folded downcards private, including at showdown', () => {
    const s = table('stud'); passive(s)
    const folded = s.actor!
    act(s, folded, { type: 'fold' }, 1)
    until(s, 'complete')
    expect(publicState(s, 'spectator').seats[folded]!.cards.slice(0, 2)).toEqual([null, null])
    expect(publicState(s, 'spectator').seats[folded]!.cards[2]).not.toBeNull()
  })
  it('opens later streets by highest exposed hand, with a seat tie-break rather than suit', () => {
    const s = table('stud', [1000, 1000, 1000])
    s.seats[0]!.cards = [0, 1, card(12, 1), card(12, 2)]
    s.seats[1]!.cards = [2, 3, card(12), card(12, 3)]
    s.seats[2]!.cards = [4, 5, card(14), card(13)]
    expect(studOpener(s, [2, 1, 0])).toBe(0)
    const other = table('stud'); until(other, 'fourth')
    expect(other.actor).toBe(studOpener(other, [0, 1, 2, 3, 4, 5]))
  })
  it('supports the fourth-street open-pair big bet and fifth-street doubled limits', () => {
    const s = table('stud'); until(s, 'fourth')
    s.seats[0]!.cards[2] = card(14); s.seats[0]!.cards[3] = card(14, 1)
    expect(legalActions(s, s.actor!)!.raiseOptions).toEqual([10, 20])
    act(s, s.actor!, { type: 'raise', to: 20 }, 1)
    expect(s.limitUnit).toBe(20); expect(legalActions(s, s.actor!)!.raiseOptions).toEqual([40])
    until(s, 'fifth'); expect(s.limitUnit).toBe(20)
    expect(legalActions(s, s.actor!)!.raiseOptions).toEqual([20])
  })
  it('reopens on a half-bet all-in but only allows a full completion after a smaller all-in', () => {
    for (const short of [4, 5]) {
      const s = table('stud', [1000, 1000, 1000]); until(s, 'fifth')
      // Isolate a small-limit street with legal matched chips before the short raise.
      s.limitUnit = 10; s.limitBets = 1; s.limitFullBet = 10; s.currentBet = 10
      s.actor = 1; s.pending = [1, 2]; s.seats.forEach(p => { if (p) { p.streetBet = 10; p.actedAtBet = 10 } })
      s.seats[1]!.stack = short; s.seats[1]!.actedAtBet = null
      act(s, 1, { type: 'raise', to: 10 + short }, 1)
      act(s, 2, { type: 'call' }, 2)
      expect(legalActions(s, 0)!.canRaise).toBe(short === 5)
      expect(legalActions(s, 0)!.raiseOptions).toEqual([short === 5 ? 25 : 20])
    }
  })
})

describe('Replenishing time bank', () => {
  it('adds the available bank to one decision and only spends time beyond the normal clock', () => {
    const s = table('holdem'), actor = s.actor!
    useTimeBank(s, actor, 20_000)
    expect(s.timeBankStartsAt).toBe(30_000); expect(s.deadline).toBe(60_000)
    expect(() => useTimeBank(s, actor, 25_000)).toThrow('not available')
    act(s, actor, { type: 'call' }, 37_250)
    expect(s.seats[actor]!.timeBankMs).toBe(22_750); expect(s.timeBankStartsAt).toBeNull()
    expect(s.deadline).toBe(67_250)
  })
  it('keeps the bank untouched when acting within normal time and rejects other players/expired clocks', () => {
    const s = table('omaha'), actor = s.actor!
    expect(() => useTimeBank(s, (actor + 1) % 6, 10)).toThrow('turn')
    expect(() => useTimeBank(s, actor, 30_000)).toThrow('not available')
    useTimeBank(s, actor, 10)
    act(s, actor, { type: 'call' }, 20_000)
    expect(s.seats[actor]!.timeBankMs).toBe(TIME_BANK_MAX_MS)
  })
  it('uses up only the available reserve on timeout, never a negative amount', () => {
    const s = table('stud'), actor = s.actor!
    s.seats[actor]!.timeBankMs = 7_000
    useTimeBank(s, actor, 1000)
    expect(s.deadline).toBe(37_000)
    act(s, actor, automaticAction(s), 40_000)
    expect(s.seats[actor]!.timeBankMs).toBe(0)
  })
  it('credits 5 seconds every ten dealt hands, caps at 30 seconds, and skips sit-outs', () => {
    const s = table('holdem', [1000, 1000, 1000]); until(s, 'complete')
    s.seats[0]!.handsDealt = 9; s.seats[0]!.timeBankMs = 2_000
    s.seats[1]!.handsDealt = 19; s.seats[1]!.timeBankMs = 29_000
    s.seats[2]!.ready = false; s.seats[2]!.handsDealt = 9; s.seats[2]!.timeBankMs = 0
    startHand(s, deck(), 10)
    expect(s.seats[0]!.timeBankMs).toBe(7_000); expect(s.seats[0]!.handsDealt).toBe(10)
    expect(s.seats[1]!.timeBankMs).toBe(30_000)
    expect(s.seats[2]!.timeBankMs).toBe(0); expect(s.seats[2]!.handsDealt).toBe(9)
  })
})

it.each(['omaha', 'stud'] as const)('%s conserves chips across 300 randomized six-player hands, including all-ins and side pots', variant => {
  let seed = 719
  const rand = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max }
  for (let hand = 0; hand < 300; hand++) {
    const s = createTableState(10, variant), cards = deck()
    for (let i = 51; i > 0; i--) { const j = rand(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]] }
    for (let i = 0; i < 6; i++) { s.seats[i] = seatPlayer(`p${i}`, `P${i}`, 10 + rand(200)); s.seats[i]!.ready = true }
    const total = tableChips(s)
    startHand(s, cards, 0)
    let moves = 0
    while (activeHand(s) && moves++ < 300) {
      const legal = legalActions(s, s.actor!)!, choice = rand(5)
      if (legal.bringIn !== null) act(s, s.actor!, { type: 'bring-in' }, moves)
      else if (choice <= 1 && legal.canRaise) act(s, s.actor!, { type: 'raise', to: choice === 0 ? legal.minRaiseTo : legal.maxRaiseTo }, moves)
      else if (choice === 2) act(s, s.actor!, { type: 'fold' }, moves)
      else passive(s)
      expect(tableChips(s)).toBe(total)
      expect(s.seats.every(p => Number.isSafeInteger(p!.stack) && p!.stack >= 0)).toBe(true)
    }
    expect(s.phase).toBe('complete')
    expect(s.settlement.reduce((sum, p) => sum + p.wagered - p.returned, 0)).toBe(0)
  }
})
