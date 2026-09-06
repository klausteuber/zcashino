import type { DecisionContext } from './history'
export interface DecisionSample {
  id: string; handId: string; identityId: string; variant: string; phase: string; action: string; source: string; elapsedMs: number | null; context: DecisionContext
}
export interface PairHand {
  id: string; bigBlind: number
  players: { identityId: string; wagered: number; returned: number }[]
  decisions: DecisionSample[]
}
/** Indicators for human review, not probabilities or findings of cheating. */
export function timingEvidence(samples: DecisionSample[]) {
  const eligible = samples.filter(s => s.source === 'player' && ['call', 'raise', 'fold', 'check'].includes(s.action) && s.context.bankSpentMs === 0 && s.elapsedMs !== null && s.elapsedMs >= 50)
  if (eligible.length < 80 || new Set(eligible.map(s => s.handId)).size < 40 || new Set(eligible.map(s => s.phase)).size < 2 || new Set(eligible.map(s => s.action)).size < 3) return null
  if (eligible.filter(s => s.context.call > 0).length < 30) return null
  const meanMs = eligible.reduce((sum, s) => sum + s.elapsedMs!, 0) / eligible.length
  const deviationMs = Math.sqrt(eligible.reduce((sum, s) => sum + (s.elapsedMs! - meanMs) ** 2, 0) / eligible.length)
  if (deviationMs / meanMs >= 0.025) return null
  return { decisionCount: eligible.length, handCount: new Set(eligible.map(s => s.handId)).size, meanMs, deviationMs, decisionIds: eligible.slice(-20).map(s => s.id), caveat: 'Unusually uniform timing across different decisions. Browser scheduling and connection effects require review. Decisions spending time-bank reserve and automatic actions excluded. Bank activation alone is not an indicator.' }
}
export function concessionEvidence(hands: PairHand[], loser: string, winner: string) {
  if (hands.length < 30) return null
  const large = hands.filter(h => {
    const a = h.players.find(p => p.identityId === loser)!, b = h.players.find(p => p.identityId === winner)!
    return Math.abs(a.returned - a.wagered) >= h.bigBlind * 20 && Math.abs(b.returned - b.wagered) >= h.bigBlind * 20
  })
  const directional = large.filter(h => h.players.find(p => p.identityId === loser)!.returned - h.players.find(p => p.identityId === loser)!.wagered < 0 && h.players.find(p => p.identityId === winner)!.returned - h.players.find(p => p.identityId === winner)!.wagered > 0)
  const concessions = directional.filter(h => h.decisions.some(s => s.identityId === loser && s.source === 'player' && s.action === 'fold' && s.context.call > 0 && s.context.call <= s.context.pot * 0.05 && s.context.contributionBefore >= h.bigBlind * 10 && s.context.opponents.some(p => p.identityId === winner)))
  if (concessions.length < 8 || directional.length / Math.max(1, large.length) < 0.8) return null
  return { sharedHands: hands.length, largePots: large.length, directionalLargePots: directional.length, lowCostConcessions: concessions.length, handIds: concessions.slice(-20).map(h => h.id), caveat: 'Repeated one-sided large pots with folds facing a small additional call. This is not proof of chip dumping or a calculation of direct transfers; cards, side pots and legitimate strategy need review.' }
}
export function passivityEvidence(samples: DecisionSample[], player: string, partner: string) {
  const eligible = samples.filter(s => s.identityId === player && s.source === 'player' && ['check', 'call', 'raise', 'fold'].includes(s.action) && s.context.legal?.canRaise && s.context.opponents.length === 1)
  const paired = eligible.filter(s => s.context.opponents[0].identityId === partner)
  const other = eligible.filter(s => s.context.opponents[0].identityId !== partner)
  if (paired.length < 40 || other.length < 40 || new Set(paired.map(s => s.handId)).size < 20 || new Set(other.map(s => s.handId)).size < 20 || new Set(other.map(s => s.context.opponents[0].identityId)).size < 3) return null
  const pairRaiseRate = paired.filter(s => s.action === 'raise').length / paired.length
  const otherRaiseRate = other.filter(s => s.action === 'raise').length / other.length
  if (pairRaiseRate > 0.05 || otherRaiseRate < 0.3) return null
  return { pairedDecisions: paired.length, otherDecisions: other.length, pairRaiseRate, otherRaiseRate, decisionIds: paired.slice(-20).map(s => s.id), caveat: 'Different aggression against one opponent. Cards, position and opponent strategy can explain this; no automated penalty.' }
}
