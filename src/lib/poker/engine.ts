import { evaluateHand, evaluateOmaha } from './evaluator'
import { studOpener, studRaiseTargets, recordStudRaise } from './stud'
import { consumeTimeBank, creditDealtHand } from './time-bank'
import { MAX_SEATS, TURN_MS, BETWEEN_HANDS_MS, TIME_BANK_MAX_MS, studAnte, studBringIn, POKER_VARIANTS, type PokerVariant, type PokerAction, type PokerState, type PokerSeat, type LegalActions } from './types'

export class PokerError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export function createTableState(bigBlind: number, variant: PokerVariant = 'holdem'): PokerState {
  if (!Number.isSafeInteger(bigBlind) || bigBlind < 2 || bigBlind % 2) throw new PokerError('Invalid blinds')
  if (!POKER_VARIANTS.includes(variant)) throw new PokerError('Unknown poker variant')
  return { variant, timeBankStartsAt: null, bringInSeat: null, limitUnit: bigBlind, limitFullBet: 0, limitBets: 0, seats: Array(MAX_SEATS).fill(null), phase: 'waiting', handNumber: 0, dealer: -1,
    smallBlind: bigBlind / 2, bigBlind, deck: [], board: [], currentBet: 0, lastFullRaise: bigBlind,
    pending: [], actor: null, deadline: null, nextHandAt: null, settlement: [], awards: [], log: [] }
}
export function activeHand(s: PokerState): boolean { return s.phase !== 'waiting' && s.phase !== 'complete' }
export function seatPlayer(playerId: string, name: string, stack: number): PokerSeat {
  return { playerId, name, stack, ready: false, leaving: false, needsEntryBlind: true, inHand: false, folded: false, cards: [], streetBet: 0, contribution: 0, actedAtBet: null, lastAction: 'Seated', timeBankMs: TIME_BANK_MAX_MS, handsDealt: 0 }
}
function occupied(s: PokerState): number[] { return s.seats.flatMap((p, i) => p ? [i] : []) }
function contenders(s: PokerState): number[] { return occupied(s).filter(i => s.seats[i]!.inHand && !s.seats[i]!.folded) }
function canAct(s: PokerState, i: number): boolean { const p = s.seats[i]; return !!p && p.inHand && !p.folded && p.stack > 0 }
function after(indices: number[], from: number): number[] { return [...indices].sort((a, b) => ((a - from + 5) % 6) - ((b - from + 5) % 6)) }
function next(indices: number[], from: number): number { return after(indices, from)[0] }
function note(s: PokerState, message: string) { s.log = [...s.log, message].slice(-30) }
function pay(s: PokerState, i: number, amount: number) {
  const p = s.seats[i]!
  const value = Math.min(amount, p.stack)
  p.stack -= value; p.streetBet += value; p.contribution += value
}
function setActor(s: PokerState, i: number, now: number) { s.actor = i; s.deadline = now + TURN_MS; s.timeBankStartsAt = null }
export function tableChips(s: PokerState): number { return s.seats.reduce((total, p) => total + (p ? p.stack + p.contribution : 0), 0) }

export function startHand(s: PokerState, deck: number[], now: number): void {
  if (activeHand(s)) throw new PokerError('A hand is already running', 409)
  const players = occupied(s).filter(i => s.seats[i]!.ready && !s.seats[i]!.leaving && s.seats[i]!.stack >= s.bigBlind)
  if (players.length < 2) throw new PokerError('At least two ready players are needed')
  if (deck.length !== 52 || new Set(deck).size !== 52 || deck.some(c => !Number.isInteger(c) || c < 0 || c > 51)) throw new PokerError('Invalid deck')
  s.phase = s.variant === 'stud' ? 'third' : 'preflop'; s.handNumber++; s.dealer = next(players, s.dealer)
  s.deck = [...deck]; s.board = []; s.awards = []; s.settlement = []; s.nextHandAt = null
  s.currentBet = s.bigBlind; s.lastFullRaise = s.bigBlind
  s.bringInSeat = null; s.limitUnit = s.bigBlind; s.limitFullBet = 0; s.limitBets = 0; s.timeBankStartsAt = null
  for (const i of occupied(s)) {
    if (!players.includes(i)) s.seats[i]!.needsEntryBlind = true
    Object.assign(s.seats[i]!, { inHand: players.includes(i), folded: false, cards: [], streetBet: 0, contribution: 0, actedAtBet: null, lastAction: players.includes(i) ? '' : 'Sitting out' })
  }
  for (const i of players) creditDealtHand(s, i)
  const order = after(players, s.dealer)
  const holeCount = s.variant === 'omaha' ? 4 : s.variant === 'stud' ? 3 : 2
  for (let round = 0; round < holeCount; round++) for (const i of order) s.seats[i]!.cards.push(s.deck.shift()!)
  if (s.variant === 'stud') {
    for (const i of players) { pay(s, i, studAnte(s.bigBlind)); s.seats[i]!.streetBet = 0; s.seats[i]!.lastAction = 'Ante'; s.seats[i]!.needsEntryBlind = false }
    s.currentBet = 0
    // Rank/suit encoding is clubs < diamonds < hearts < spades, with ace high.
    s.bringInSeat = [...players].sort((a, b) => s.seats[a]!.cards[2] - s.seats[b]!.cards[2])[0]
    s.pending = [...players]
    note(s, `Hand #${s.handNumber} · antes posted · third street`)
    setActor(s, s.bringInSeat, now)
    return
  }
  const sb = players.length === 2 ? s.dealer : next(players, s.dealer)
  const bb = next(players, sb)
  pay(s, sb, s.smallBlind); pay(s, bb, s.bigBlind)
  s.seats[sb]!.lastAction = 'Small blind'; s.seats[bb]!.lastAction = 'Big blind'
  // Room rule: after the opening hand, arrivals/returning sit-outs post a live BB.
  // Any normal blind already posted counts toward it; this prevents free-hand cycling.
  for (const i of players) {
    const p = s.seats[i]!
    if (s.handNumber > 1 && p.needsEntryBlind && p.streetBet < s.bigBlind) {
      pay(s, i, s.bigBlind - p.streetBet); p.lastAction = 'Entry blind'
    }
    p.needsEntryBlind = false
  }
  s.pending = after(players.filter(i => canAct(s, i)), bb)
  note(s, `Hand #${s.handNumber} · blinds posted`)
  advance(s, bb, now)
}
export function legalActions(s: PokerState, index: number): LegalActions | null {
  if (!activeHand(s) || s.actor !== index || !canAct(s, index)) return null
  const p = s.seats[index]!
  const stackTotal = p.streetBet + p.stack
  const call = Math.min(p.stack, Math.max(0, s.currentBet - p.streetBet))
  const pot = s.seats.reduce((total, seat) => total + (seat?.contribution ?? 0), 0)
  const maxRaiseTo = s.variant === 'omaha' ? Math.min(stackTotal, p.streetBet + call + pot + call) : stackTotal
  const minRaiseTo = s.currentBet < s.bigBlind ? s.bigBlind : s.currentBet + s.lastFullRaise
  const reopenAmount = s.variant === 'stud' ? s.limitUnit / 2 : s.lastFullRaise
  const reopened = p.actedAtBet === null || p.actedAtBet === 0 || s.currentBet - p.actedAtBet >= reopenAmount
  const options = s.variant === 'stud' ? studRaiseTargets(s, stackTotal) : null
  const bringIn = s.bringInSeat === index ? Math.min(p.stack, studBringIn(s.bigBlind)) : null
  return { canCheck: bringIn === null && p.streetBet >= s.currentBet, call,
    bringIn, raiseOptions: options,
    minRaiseTo: options ? (options[0] ?? stackTotal) : Math.min(minRaiseTo, stackTotal),
    maxRaiseTo: options ? (options[options.length - 1] ?? stackTotal) : maxRaiseTo,
    canRaise: reopened && (options ? options.length > 0 : maxRaiseTo >= Math.min(minRaiseTo, stackTotal) && maxRaiseTo > s.currentBet) && contenders(s).some(i => i !== index && canAct(s, i)) }
}
export function useTimeBank(s: PokerState, index: number, now: number) {
  if (!legalActions(s, index) || s.seats[index]!.leaving) throw new PokerError('It is not your turn', 409)
  if (s.deadline === null || now >= s.deadline || s.timeBankStartsAt !== null || s.seats[index]!.timeBankMs <= 0) throw new PokerError('Time bank is not available for this decision', 409)
  s.timeBankStartsAt = s.deadline
  s.deadline += s.seats[index]!.timeBankMs
  note(s, `${s.seats[index]!.name}: Time bank activated`)
}
export function automaticAction(s: PokerState): PokerAction {
  const legal = legalActions(s, s.actor!)!
  return { type: legal.bringIn !== null ? 'bring-in' : legal.canCheck ? 'check' : 'fold' }
}

export function act(s: PokerState, index: number, action: PokerAction, now: number): void {
  const legal = legalActions(s, index)
  if (!legal) throw new PokerError('It is not your turn', 409)
  const p = s.seats[index]!
  if (legal.bringIn !== null && action.type !== 'bring-in' && action.type !== 'raise') throw new PokerError('Post the bring-in or complete the bet')
  if (action.type === 'bring-in') {
    if (legal.bringIn === null) throw new PokerError('No bring-in is due')
    pay(s, index, legal.bringIn); s.currentBet = p.streetBet; p.lastAction = 'Bring-in'
  } else if (action.type === 'fold') { p.folded = true; p.lastAction = 'Fold' }
  else if (action.type === 'check') {
    if (!legal.canCheck) throw new PokerError('You must call or fold')
    p.lastAction = 'Check'
  } else if (action.type === 'call') {
    if (!legal.call) throw new PokerError('There is no bet to call')
    pay(s, index, legal.call); p.lastAction = p.stack === 0 ? 'All-in call' : 'Call'
  } else {
    if (!legal.canRaise || !Number.isSafeInteger(action.to) || action.to < legal.minRaiseTo || action.to > legal.maxRaiseTo || (legal.raiseOptions !== null && !legal.raiseOptions.includes(action.to))) throw new PokerError('Invalid raise amount')
    if (s.variant === 'stud') recordStudRaise(s, action.to)
    const increase = action.to - s.currentBet
    if (increase >= s.lastFullRaise) s.lastFullRaise = increase
    pay(s, index, action.to - p.streetBet)
    s.currentBet = action.to
    p.lastAction = p.stack === 0 ? 'All-in' : 'Raise'
  }
  consumeTimeBank(s, now)
  s.bringInSeat = null
  p.actedAtBet = s.currentBet
  s.pending = s.pending.filter(i => i !== index && canAct(s, i))
  for (const i of contenders(s)) if (i !== index && canAct(s, i) && s.seats[i]!.streetBet < s.currentBet && !s.pending.includes(i)) s.pending.push(i)
  note(s, `${p.name}: ${p.lastAction}`)
  advance(s, index, now)
}
function advance(s: PokerState, from: number, now: number): void {
  if (contenders(s).length === 1) { finish(s, now); return }
  const actors = contenders(s).filter(i => canAct(s, i))
  // No betting into a dry side pot; only a call/fold decision remains if money is owed.
  if (actors.length <= 1) s.pending = actors.filter(i => s.seats[i]!.streetBet < Math.min(s.currentBet, Math.max(...contenders(s).filter(j => j !== i).map(j => s.seats[j]!.streetBet))))
  if (s.pending.length) { setActor(s, next(s.pending, from), now); return }
  if (s.phase === 'river' || s.phase === 'seventh') { finish(s, now); return }
  s.deck.shift() // burn
  if (s.variant === 'stud') {
    for (const i of after(contenders(s), s.dealer)) s.seats[i]!.cards.push(s.deck.shift()!)
    s.phase = s.phase === 'third' ? 'fourth' : s.phase === 'fourth' ? 'fifth' : s.phase === 'fifth' ? 'sixth' : 'seventh'
    s.limitUnit = s.phase === 'fourth' ? s.bigBlind : s.bigBlind * 2
    s.limitFullBet = 0; s.limitBets = 0
  } else {
    const count = s.phase === 'preflop' ? 3 : 1
    for (let i = 0; i < count; i++) s.board.push(s.deck.shift()!)
    s.phase = s.phase === 'preflop' ? 'flop' : s.phase === 'flop' ? 'turn' : 'river'
  }
  s.currentBet = 0; s.lastFullRaise = s.bigBlind
  for (const p of s.seats) if (p) { p.streetBet = 0; p.actedAtBet = null; if (p.inHand && !p.folded && p.stack) p.lastAction = '' }
  s.pending = after(actors, s.dealer)
  note(s, s.phase[0].toUpperCase() + s.phase.slice(1) + (s.variant === 'stud' ? ' street' : ''))
  const fromSeat = s.variant === 'stud' && actors.length ? (studOpener(s, actors) + 5) % 6 : s.dealer
  advance(s, fromSeat, now)
}
function finish(s: PokerState, now: number): void {
  const remaining = contenders(s)
  const levels = [...new Set(s.seats.flatMap(p => p && p.contribution > 0 ? [p.contribution] : []))].sort((a, b) => a - b)
  let previous = 0
  const scores = new Map(remaining.map(i => [i, remaining.length > 1 ? (s.variant === 'omaha' ? evaluateOmaha(s.seats[i]!.cards, s.board) : evaluateHand([...s.seats[i]!.cards, ...s.board])) : { score: 0, label: 'Uncontested' }]))
  for (const level of levels) {
    const contributors = occupied(s).filter(i => s.seats[i]!.contribution >= level)
    const amount = (level - previous) * contributors.length
    previous = level
    if (contributors.length === 1) {
      const seat = contributors[0]; s.seats[seat]!.stack += amount
      s.awards.push({ seat, amount, label: 'Uncalled bet returned', refund: true }); continue
    }
    const eligible = remaining.filter(i => s.seats[i]!.contribution >= level)
    if (!eligible.length) throw new PokerError('Pot has no eligible player', 500)
    const best = Math.max(...eligible.map(i => scores.get(i)!.score))
    const winners = after(eligible.filter(i => scores.get(i)!.score === best), s.dealer)
    const share = Math.floor(amount / winners.length)
    winners.forEach((seat, i) => {
      const award = share + (i < amount % winners.length ? 1 : 0)
      s.seats[seat]!.stack += award
      s.awards.push({ seat, amount: award, label: scores.get(seat)!.label, refund: false })
    })
  }
  s.settlement = s.seats.flatMap((p, i) => p && p.inHand ? [{
    playerId: p.playerId,
    wagered: p.contribution - s.awards.filter(a => a.seat === i && a.refund).reduce((sum, a) => sum + a.amount, 0),
    returned: s.awards.filter(a => a.seat === i && !a.refund).reduce((sum, a) => sum + a.amount, 0),
    stack: p.stack,
  }] : [])
  for (const p of s.seats) if (p) { p.contribution = 0; p.streetBet = 0; if (p.stack < s.bigBlind) p.ready = false }
  s.timeBankStartsAt = null; s.bringInSeat = null
  s.phase = 'complete'; s.actor = null; s.deadline = null; s.pending = []; s.deck = []
  s.nextHandAt = now + BETWEEN_HANDS_MS
  note(s, s.awards.filter(a => !a.refund).map(a => `${s.seats[a.seat]!.name} wins · ${a.label}`).join(' / '))
}
/** Explicit allowlist: neither deck, session identifiers nor folded opponents' cards leave the server. */
export function publicState(s: PokerState, viewerId: string) {
  const { deck: _deck, pending: _pending, settlement: _settlement, seats, ...visible } = s
  void _deck; void _pending; void _settlement
  const showdown = s.phase === 'complete' && contenders(s).length > 1
  return { ...visible, seats: seats.map(p => {
    if (!p) return null
    const { playerId, cards, actedAtBet: _acted, ...seat } = p
    void _acted
    const exposed = cards.map((_, i) => s.variant === 'stud' && i >= 2 && i <= 5)
    return { ...seat, exposed, cards: cards.map((c, i) => playerId === viewerId || exposed[i] || (showdown && p.inHand && !p.folded) ? c : null) }
  }) }
}
