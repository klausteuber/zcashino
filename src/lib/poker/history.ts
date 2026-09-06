import type { Prisma, PokerTable as StoredTable } from '@prisma/client'
import { legalActions } from './engine'
import { TURN_MS, type PokerAction, type PokerState } from './types'
import { ensureIdentity } from './access'
import { INTEGRITY_RETENTION_MS, seal } from './integrity-crypto'

type Tx = Prisma.TransactionClient
export interface DecisionContext {
  seat: number
  opponents: { identityId: string; seat: number; contribution: number; streetBet: number; stack: number }[]
  action: PokerAction | { type: 'time-bank' }
  pot: number
  call: number
  committed: number
  contributionBefore: number
  stackBefore: number
  currentBet: number
  legal: ReturnType<typeof legalActions>
  bankActivated: boolean
  bankSpentMs: number
  board: number[]
  boardAfter: number[]
  cards: number[]
  exposedCards: { seat: number; cards: number[] }[]
}
export const handKey = (tableId: string, handNumber: number) => `${tableId}:${handNumber}`
async function identities(tx: Tx, s: PokerState) {
  const map = new Map<string, string>()
  for (const p of s.seats) if (p?.inHand) map.set(p.playerId, (await ensureIdentity(tx, p.playerId)).id)
  return map
}
function privateSnapshot(s: PokerState, map: Map<string, string>) {
  return { phase: s.phase, board: s.board, dealer: s.dealer,
    players: s.seats.flatMap((p, seat) => p?.inHand ? [{ identityId: map.get(p.playerId), seat, cards: p.cards, folded: p.folded, stack: p.stack, contribution: p.contribution }] : []), awards: s.awards }
}
export async function beginHistory(tx: Tx, row: StoredTable, s: PokerState, now: number, partial = false) {
  const id = handKey(row.id, s.handNumber)
  const existing = await tx.pokerHand.findUnique({ where: { id } })
  if (existing) return
  const map = await identities(tx, s)
  await tx.pokerHand.create({ data: { id, tableId: row.id, handNumber: s.handNumber, variant: s.variant, mode: row.mode, bigBlind: s.bigBlind,
    payload: seal({ partial, initial: privateSnapshot(s, map) }, id), startedAt: new Date(now), expiresAt: new Date(now + INTEGRITY_RETENTION_MS),
    players: { create: s.seats.flatMap((p, seat) => p?.inHand ? [{ identityId: map.get(p.playerId)!, seat, startStack: p.stack + p.contribution }] : []) },
  } })
}
export async function decisionHistory(tx: Tx, row: StoredTable, before: PokerState, after: PokerState, seat: number,
  action: PokerAction | { type: 'time-bank' }, source: 'player' | 'timeout' | 'leave', now: number) {
  await beginHistory(tx, row, before, now, true)
  const map = await identities(tx, before), player = before.seats[seat]!
  const handId = handKey(row.id, before.handNumber), id = `${handId}:${String(row.version + 1).padStart(12, '0')}`
  const normalDeadline = before.timeBankStartsAt ?? before.deadline
  const elapsedMs = source === 'player' && normalDeadline !== null ? Math.max(0, now - normalDeadline + TURN_MS) : null
  const legal = legalActions(before, seat)
  const context: DecisionContext = {
    seat, action, legal, pot: before.seats.reduce((sum, p) => sum + (p?.contribution ?? 0), 0), call: legal?.call ?? 0,
    committed: action.type === 'raise' ? action.to - player.streetBet : action.type === 'call' ? legal!.call : action.type === 'bring-in' ? legal!.bringIn! : 0,
    contributionBefore: player.contribution, stackBefore: player.stack, currentBet: before.currentBet,
    bankActivated: before.timeBankStartsAt !== null || action.type === 'time-bank',
    bankSpentMs: before.timeBankStartsAt === null ? 0 : Math.min(player.timeBankMs, Math.max(0, now - before.timeBankStartsAt)),
    opponents: before.seats.flatMap((p, i) => p?.inHand && !p.folded && i !== seat ? [{ identityId: map.get(p.playerId)!, seat: i, contribution: p.contribution, streetBet: p.streetBet, stack: p.stack }] : []),
    board: before.board, boardAfter: after.board, cards: player.cards,
    exposedCards: before.variant === 'stud' ? before.seats.flatMap((p, i) => p?.inHand ? [{ seat: i, cards: p.cards.slice(2, 6) }] : []) : [],
  }
  await tx.pokerDecision.create({ data: { id, handId, identityId: map.get(player.playerId)!, phase: before.phase, action: action.type, source, elapsedMs,
    payload: seal(context, id), createdAt: new Date(now) } })
}
export async function finishHistory(tx: Tx, row: StoredTable, s: PokerState, now: number) {
  const id = handKey(row.id, s.handNumber), map = await identities(tx, s)
  // A deployment may encounter an already-running hand; mark its history incomplete.
  await beginHistory(tx, row, s, now, true)
  const { unseal } = await import('./integrity-crypto')
  const stored = await tx.pokerHand.findUniqueOrThrow({ where: { id } })
  const initial = unseal<Record<string, unknown>>(stored.payload, id)
  await tx.pokerHand.update({ where: { id }, data: { completedAt: new Date(now), payload: seal({ ...initial, final: privateSnapshot(s, map) }, id) } })
  for (const result of s.settlement) await tx.pokerHandPlayer.updateMany({ where: { handId: id, identityId: map.get(result.playerId)! }, data: { wagered: result.wagered, returned: result.returned } })
}
