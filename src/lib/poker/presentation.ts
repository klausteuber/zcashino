import type { LegalActions, PokerVariant } from './types'

/** Presets are total street bets, including the call; the server sets all limits. */
export function betPresets(legal: LegalActions, streetBet: number, pot: number, variant: PokerVariant) {
  const clamp = (value: number) => Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, value))
  const afterCall = pot + legal.call
  const base = streetBet + legal.call
  return [
    { label: 'Min', amount: clamp(legal.minRaiseTo) },
    { label: '½ pot', amount: clamp(base + Math.floor(afterCall / 2)) },
    { label: '¾ pot', amount: clamp(base + Math.floor(afterCall * 3 / 4)) },
    { label: 'Pot', amount: clamp(base + afterCall) },
    { label: variant === 'omaha' ? 'Max' : 'All-in', amount: legal.maxRaiseTo },
  ]
}
