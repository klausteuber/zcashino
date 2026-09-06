import { exposedStudScore } from './evaluator'
import type { PokerState } from './types'

export function studOpener(s: PokerState, players: number[]) {
  // On a tied board, the lowest numbered seat acts first; suits do not break ties.
  return [...players].sort((a, b) => exposedStudScore(s.seats[b]!.cards) - exposedStudScore(s.seats[a]!.cards) || a - b)[0]
}
export function studHasOpenPair(s: PokerState) {
  return s.phase === 'fourth' && s.seats.some(p => p?.inHand && !p.folded && Math.floor(p.cards[2] / 4) === Math.floor(p.cards[3] / 4))
}
export function studRaiseTargets(s: PokerState, stackTotal: number) {
  if (s.limitBets >= 4) return [] // Room cap: an opening bet plus three raises, including heads-up.
  const targets = [s.limitFullBet + s.limitUnit]
  if (s.limitUnit === s.bigBlind && studHasOpenPair(s)) targets.push(s.limitFullBet + 2 * s.bigBlind)
  return [...new Set(targets.map(n => Math.min(n, stackTotal)))].filter(n => n > s.currentBet)
}
export function recordStudRaise(s: PokerState, to: number) {
  if (s.limitUnit === s.bigBlind && studHasOpenPair(s) && to > s.limitFullBet + s.limitUnit) s.limitUnit = 2 * s.bigBlind
  // A half-bet or larger all-in counts as a full limit bet and reopens action.
  if (to - s.limitFullBet >= s.limitUnit / 2) { s.limitBets++; s.limitFullBet = to }
}
