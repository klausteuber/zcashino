import { createHash, randomInt, randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient, PokerTable as StoredTable } from '@prisma/client'
import prisma from '@/lib/db'
import { reserveFunds } from '@/lib/services/ledger'
import { checkWagerAllowed } from '@/lib/services/responsible-gambling'
import { isKillSwitchActive } from '@/lib/kill-switch'
import { act, activeHand, automaticAction, createTableState, legalActions, PokerError, publicState, seatPlayer, startHand, tableChips, useTimeBank } from './engine'
import { type PokerMode, type PokerVariant, type PokerState, type PublicTable, type LobbyTable, type PokerAction, ZATS_PER_ZEC, TIME_BANK_MAX_MS } from './types'

import { accessStatus, requirePokerAccess } from './access'
import { beginHistory, decisionHistory, finishHistory } from './history'

export const STAKES = [10_000, 100_000, 1_000_000] as const
export function realMoneyEnabled() { return process.env.POKER_REAL_MONEY_ENABLED === 'true' }
type Tx = Prisma.TransactionClient
export type TableCommand =
  | { kind: 'join'; seat: number; buyIn: number; name: string }
  | { kind: 'ready'; ready: boolean }
  | { kind: 'leave' }
  | { kind: 'time-bank' }
  | { kind: 'act'; action: PokerAction }
export interface CreatePokerTable { name: string; playerName: string; mode: PokerMode; variant?: PokerVariant; bigBlind: number; buyIn: number }
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function parsePokerState(serialized: string): PokerState {
  const s = JSON.parse(serialized) as PokerState
  // Existing Hold'em tables can finish their hand without rewriting stored JSON.
  s.variant ??= 'holdem'; s.timeBankStartsAt ??= null; s.bringInSeat ??= null
  s.limitUnit ??= s.bigBlind; s.limitFullBet ??= 0; s.limitBets ??= 0
  for (const p of s.seats) if (p) { p.timeBankMs ??= TIME_BANK_MAX_MS; p.handsDealt ??= 0 }
  return s
}
const parse = (row: StoredTable) => parsePokerState(row.state)
function shuffledDeck() {
  const deck = Array.from({ length: 52 }, (_, i) => i)
  for (let i = 51; i > 0; i--) { const j = randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]] }
  return deck
}
function available(s: PokerState) { return s.seats.filter(p => p?.ready && !p.leaving && p.stack >= s.bigBlind).length }
function tickDate(s: PokerState) { const n = s.deadline ?? s.nextHandAt; return n === null ? null : new Date(n) }
function requireEntryEnabled(mode: string) {
  if (isKillSwitchActive()) throw new PokerError('New poker hands are paused for maintenance.', 503)
  if (mode === 'real' && !realMoneyEnabled()) throw new PokerError('Real ZEC poker tables are not enabled yet.', 503)
}
async function sessionForEntry(tx: Tx, id: string, mode: string) {
  const session = await tx.session.findUnique({ where: { id } })
  if (!session) throw new PokerError('Session expired. Please restore your wallet.', 401)
  if ((mode === 'practice') !== session.walletAddress.startsWith('demo_')) throw new PokerError('Practice and real ZEC balances cannot share a table.', 403)
  if (!session.isAuthenticated) throw new PokerError('Confirm a ZEC deposit before taking a seat.', 403)
  if (session.excludedUntil && session.excludedUntil > new Date()) throw new PokerError('Your session is self-excluded.', 403)
  return session
}
function checkExposure(session: Parameters<typeof checkWagerAllowed>[0], amount: number) {
  const allowed = checkWagerAllowed(session, amount / ZATS_PER_ZEC)
  if (!allowed.allowed) throw new PokerError(allowed.message || 'Your play limit has been reached.', 403)
}
async function cashOut(tx: Tx, row: StoredTable, s: PokerState, i: number) {
  const p = s.seats[i]!
  if (activeHand(s) && p.inHand) throw new PokerError('Finish the current hand before cashing out.', 409)
  // Balance transfers and seat removal commit together; retrying cannot pay twice.
  await tx.session.update({ where: { id: p.playerId }, data: { balance: { increment: p.stack / ZATS_PER_ZEC }, pokerLockedZats: 0n, pokerTimeBankMs: p.timeBankMs, pokerHandsDealt: p.handsDealt } })
  await tx.$executeRaw`UPDATE "Session" SET "balance" = ROUND("balance", 8) WHERE "id" = ${p.playerId}`
  await tx.pokerSeat.delete({ where: { sessionId: p.playerId } })
  await tx.pokerEvent.create({ data: { tableId: row.id, sessionId: p.playerId, requestId: randomUUID(), kind: 'cashout', amountZats: BigInt(p.stack), version: row.version + 1, details: '{}' } })
  row.escrowZats -= BigInt(p.stack)
  s.seats[i] = null
}
async function settle(tx: Tx, row: StoredTable, s: PokerState, now: number) {
  await finishHistory(tx, row, s, now)
  for (const result of s.settlement) {
    await tx.session.update({ where: { id: result.playerId }, data: {
      totalWagered: { increment: result.wagered / ZATS_PER_ZEC }, totalWon: { increment: result.returned / ZATS_PER_ZEC }, pokerLockedZats: BigInt(result.stack),
    } })
    await tx.$executeRaw`UPDATE "Session" SET "totalWagered" = ROUND("totalWagered", 8), "totalWon" = ROUND("totalWon", 8) WHERE "id" = ${result.playerId}`
  }
  await tx.pokerEvent.create({ data: { tableId: row.id, requestId: randomUUID(), kind: 'hand-settled', version: row.version + 1,
    details: JSON.stringify({ handNumber: s.handNumber, awards: s.awards, settlement: s.settlement }) } })
}
async function save(tx: Tx, row: StoredTable, s: PokerState) {
  const total = tableChips(s)
  if (!Number.isSafeInteger(total) || BigInt(total) !== row.escrowZats || s.seats.some(p => p && (!Number.isSafeInteger(p.stack) || p.stack < 0))) {
    throw new PokerError('Poker accounting check failed. The action was rolled back.', 500)
  }
  const updated = await tx.pokerTable.updateMany({ where: { id: row.id, version: row.version }, data: {
    state: JSON.stringify(s), escrowZats: row.escrowZats, version: { increment: 1 }, nextTickAt: tickDate(s), closed: s.seats.every(p => !p),
  } })
  if (updated.count !== 1) throw new PokerError('The table changed. Please try again.', 409)
  const before = parse(row)
  for (const p of s.seats) if (p) {
    const old = before.seats.find(seat => seat?.playerId === p.playerId)
    if (!old || old.timeBankMs !== p.timeBankMs || old.handsDealt !== p.handsDealt) {
      await tx.session.update({ where: { id: p.playerId }, data: { pokerTimeBankMs: p.timeBankMs, pokerHandsDealt: p.handsDealt } })
    }
  }
}
async function receipt(tx: Tx, requestId: string, sessionId: string, input: unknown) {
  const existing = await tx.pokerEvent.findUnique({ where: { requestId } })
  if (!existing) return null
  if (existing.sessionId !== sessionId || JSON.parse(existing.details).fingerprint !== fingerprint(input)) throw new PokerError('Request identifier already used.', 409)
  return existing.tableId
}
async function record(tx: Tx, row: StoredTable, requestId: string, sessionId: string, kind: string, input: unknown, amount = 0) {
  await tx.pokerEvent.create({ data: { tableId: row.id, requestId, sessionId, kind, amountZats: BigInt(amount), version: row.version + 1, details: JSON.stringify({ fingerprint: fingerprint(input) }) } })
}
async function join(tx: Tx, row: StoredTable, s: PokerState, sessionId: string, seat: number, amount: number, _name: string) {
  requireEntryEnabled(row.mode)
  const session = await sessionForEntry(tx, sessionId, row.mode)
  if (!Number.isInteger(seat) || seat < 0 || seat >= 6 || s.seats[seat]) throw new PokerError('That seat is no longer available.', 409)
  if (await tx.pokerSeat.findUnique({ where: { sessionId } })) throw new PokerError('Leave your current table before joining another.', 409)
  if (!Number.isSafeInteger(amount) || amount < s.bigBlind * 20 || amount > s.bigBlind * 100) throw new PokerError(`Buy in for 20–100 ${s.variant === 'stud' ? 'small bets' : 'big blinds'}.`)
  checkExposure(session, amount)
  const identity = await requirePokerAccess(tx, sessionId, true)
  const reserved = await reserveFunds(tx, sessionId, amount / ZATS_PER_ZEC, 'totalWagered', 0)
  if (!reserved) throw new PokerError('Insufficient available balance for this buy-in.')
  await tx.session.update({ where: { id: sessionId }, data: { pokerLockedZats: BigInt(amount) } })
  await tx.pokerSeat.create({ data: { tableId: row.id, sessionId, seatIndex: seat } })
  s.seats[seat] = seatPlayer(sessionId, identity.nickname!, amount)
  s.seats[seat]!.timeBankMs = session.pokerTimeBankMs
  s.seats[seat]!.handsDealt = session.pokerHandsDealt
  row.escrowZats += BigInt(amount)
}
async function trackedAct(tx: Tx, row: StoredTable, s: PokerState, index: number, action: PokerAction, source: 'player' | 'timeout' | 'leave', now: number) {
  const before = structuredClone(s)
  act(s, index, action, now)
  await decisionHistory(tx, row, before, s, index, action, source, now)
}

export class PokerService {
  constructor(private db: PrismaClient = prisma) {}
  async create(sessionId: string, input: CreatePokerTable, requestId: string): Promise<string> {
    if (!STAKES.some(n => n === input.bigBlind)) throw new PokerError('Invalid table stakes.')
    return this.db.$transaction(async tx => {
      const duplicate = await receipt(tx, requestId, sessionId, input)
      if (duplicate) return duplicate
      const s = createTableState(input.bigBlind, input.variant)
      const row = await tx.pokerTable.create({ data: { name: input.name, mode: input.mode, state: JSON.stringify(s) } })
      await join(tx, row, s, sessionId, 0, input.buyIn, input.playerName)
      await save(tx, row, s)
      await record(tx, row, requestId, sessionId, 'create-buyin', input, input.buyIn)
      return row.id
    })
  }
  async command(tableId: string, sessionId: string, command: TableCommand, version: number, requestId: string): Promise<void> {
    const input = { tableId, command, version }
    await this.db.$transaction(async tx => {
      if (await receipt(tx, requestId, sessionId, input)) return
      const row = await tx.pokerTable.findUnique({ where: { id: tableId } })
      if (!row || row.closed) throw new PokerError('Table not found.', 404)
      if (row.version !== version) throw new PokerError('The table changed. Please try again.', 409)
      const s = parse(row)
      const index = s.seats.findIndex(p => p?.playerId === sessionId)
      const now = Date.now()
      const wasActive = activeHand(s)
      if (command.kind === 'join') await join(tx, row, s, sessionId, command.seat, command.buyIn, command.name)
      else {
        if (index < 0) throw new PokerError('Take a seat first.', 403)
        const p = s.seats[index]!
        if (command.kind === 'leave') {
          p.ready = false; p.leaving = true
          if (!wasActive || !p.inHand) await cashOut(tx, row, s, index)
          // Leaving mid-hand means check/fold on the player's turn, including a future turn.
          else if (s.actor === index) await trackedAct(tx, row, s, index, automaticAction(s), 'leave', now)
        } else if (command.kind === 'time-bank') {
          const before = structuredClone(s)
          useTimeBank(s, index, now)
          await decisionHistory(tx, row, before, s, index, { type: 'time-bank' }, 'player', now)
        } else if (command.kind === 'ready') {
          if (p.leaving) throw new PokerError('You are leaving after this hand.')
          if (command.ready) {
            requireEntryEnabled(row.mode)
            const session = await sessionForEntry(tx, sessionId, row.mode)
            checkExposure({ ...session, pokerLockedZats: 0n }, p.stack)
            await requirePokerAccess(tx, sessionId, false, now)
            if (p.stack < s.bigBlind) throw new PokerError('Leave and buy in again to play another hand.')
          }
          p.ready = command.ready
        } else {
          if (s.deadline !== null && s.deadline <= now) throw new PokerError('Your action timer expired. Updating the table.', 409)
          await trackedAct(tx, row, s, index, command.action, 'player', now)
        }
      }
      if (wasActive && s.phase === 'complete') await settle(tx, row, s, now)
      // Keep seats visible throughout the result display; the worker cashes out at its end.
      if (!activeHand(s) && s.phase !== 'complete') s.nextHandAt = available(s) >= 2 ? (s.nextHandAt ?? now + 5_000) : null
      if (activeHand(s) && s.actor !== null && s.seats[s.actor]!.leaving) s.deadline = now
      await save(tx, row, s)
      await record(tx, row, requestId, sessionId, command.kind, input, command.kind === 'join' ? command.buyIn : 0)
    })
  }
  async tick(tableId: string, now = Date.now()): Promise<void> {
    await this.db.$transaction(async tx => {
      const row = await tx.pokerTable.findUnique({ where: { id: tableId } })
      if (!row || row.closed || !row.nextTickAt || row.nextTickAt.getTime() > now) return
      const s = parse(row)
      if (activeHand(s)) {
        if (s.actor === null) throw new PokerError('Missing acting player.', 500)
        const player = s.seats[s.actor]!
        player.ready = false // A disconnected player never auto-posts blinds in the next hand.
        await trackedAct(tx, row, s, s.actor, automaticAction(s), player.leaving ? 'leave' : 'timeout', now)
        if (s.phase === 'complete') await settle(tx, row, s, now)
        if (activeHand(s) && s.actor !== null && s.seats[s.actor]!.leaving) s.deadline = now
      } else {
        for (let i = 0; i < 6; i++) if (s.seats[i]?.leaving) await cashOut(tx, row, s, i)
        for (const p of s.seats) if (p?.ready) {
          try {
            requireEntryEnabled(row.mode)
            const session = await sessionForEntry(tx, p.playerId, row.mode)
            checkExposure({ ...session, pokerLockedZats: 0n }, p.stack)
            await requirePokerAccess(tx, p.playerId, false, now)
          } catch (error) {
            if (!(error instanceof PokerError)) throw error
            p.ready = false; p.lastAction = error.message
          }
        }
        s.nextHandAt = null
        if (available(s) >= 2) { startHand(s, shuffledDeck(), now); await beginHistory(tx, row, s, now) }
        else { s.phase = 'waiting'; s.board = []; s.awards = []; for (const p of s.seats) if (p) { p.inHand = false; p.cards = []; p.lastAction = p.ready ? 'Ready' : 'Sitting out' } }
      }
      await save(tx, row, s)
      await tx.pokerEvent.create({ data: { tableId, requestId: randomUUID(), kind: 'tick', version: row.version + 1, details: JSON.stringify({ handNumber: s.handNumber, phase: s.phase }) } })
    })
  }
  async snapshot(tableId: string, sessionId: string): Promise<PublicTable> {
    // A transaction keeps the table stack and available balance from different versions out of one response.
    return this.db.$transaction(async tx => {
      const row = await tx.pokerTable.findUnique({ where: { id: tableId } })
      if (!row) throw new PokerError('Table not found.', 404)
      const session = await tx.session.findUnique({ where: { id: sessionId }, select: { balance: true } })
      if (!session) throw new PokerError('Session expired.', 401)
      const s = parse(row)
      const viewer = s.seats.findIndex(p => p?.playerId === sessionId)
      return { id: row.id, name: row.name, mode: row.mode as PokerMode, version: row.version,
        buyInMin: s.bigBlind * 20, buyInMax: s.bigBlind * 100, state: publicState(s, sessionId), viewerSeat: viewer < 0 ? null : viewer,
        legal: legalActions(s, viewer), balanceZats: Math.round(session.balance * ZATS_PER_ZEC), serverTime: Date.now(), realMoneyEnabled: realMoneyEnabled(), access: await accessStatus(tx, sessionId) }
    })
  }
  async lobby(sessionId: string): Promise<LobbyTable[]> {
    const rows = await this.db.pokerTable.findMany({ where: { closed: false }, orderBy: { updatedAt: 'desc' }, take: 100 })
    return rows.map(row => { const s = parse(row); return { id: row.id, name: row.name, mode: row.mode as PokerMode, variant: s.variant,
      smallBlind: s.smallBlind, bigBlind: s.bigBlind, players: s.seats.filter(Boolean).length, phase: s.phase,
      myTable: s.seats.some(p => p?.playerId === sessionId) } })
  }
  async dueTables() { return this.db.pokerTable.findMany({ where: { closed: false, nextTickAt: { lte: new Date() } }, select: { id: true }, take: 100 }) }
}
export const poker = new PokerService()
