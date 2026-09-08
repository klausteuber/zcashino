import { formatZec, type PokerState, type PokerVariant } from './types'

/** Immutable table terms. Missing policies on older tables mean no rake. */
export type RakePolicy = 'none' | 'zec-2.9-v1'
export const REAL_RAKE_POLICY: RakePolicy = 'zec-2.9-v1'
export function rakeLabel(policy: RakePolicy) {
  return policy === REAL_RAKE_POLICY ? '2.9% rake' : 'No rake'
}
export function rakeDisclosure(policy: RakePolicy, variant: PokerVariant, unit: number) {
  if (policy !== REAL_RAKE_POLICY) return 'No rake on this table.'
  const units = variant === 'stud' ? 'small bets' : 'big blinds'
  return `2.9% rake, capped per hand at 3 ${units} (${formatZec(unit * 3)} ZEC), or 1 (${formatZec(unit)} ZEC) when two players are dealt in. ${variant === 'stud' ? 'No fourth street' : 'No flop'}, no rake. Uncalled bets are returned without rake. One cap covers all side pots.`
}
export function calculateRake(s: PokerState, contestedPot: number): number {
  if (s.rakePolicy !== REAL_RAKE_POLICY) return 0
  const eligible = s.variant === 'stud'
    ? ['fourth', 'fifth', 'sixth', 'seventh'].includes(s.phase)
    : s.board.length >= 3
  if (!eligible) return 0
  const dealt = s.seats.filter(p => p?.inHand).length
  const cap = s.bigBlind * (dealt === 2 ? 1 : 3)
  // BigInt avoids floating-point percentages and rounds down to a whole zatoshi.
  const percentage = BigInt(contestedPot) * 29n / 1000n
  return Number(percentage < BigInt(cap) ? percentage : BigInt(cap))
}
