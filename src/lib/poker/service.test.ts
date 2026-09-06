// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
vi.hoisted(() => { process.env.KILL_SWITCH = 'false'; process.env.POKER_REAL_MONEY_ENABLED = 'true'; process.env.POKER_INTEGRITY_SECRET = 'poker-integrity-tests-only-secret-32-chars' })
import { PokerService } from './service'
import { reserveFunds } from '@/lib/services/ledger'
import { checkWagerAllowed } from '@/lib/services/responsible-gambling'

const folder = mkdtempSync(join(tmpdir(), 'six-max-tests-'))
const databaseUrl = `file:${join(folder, 'poker.db')}`
const db = new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl }) })
const service = new PokerService(db)
const input = { name: 'Test Table', playerName: 'Alice', mode: 'real' as const, bigBlind: 10_000, buyIn: 1_000_000 }
async function player(name = 'player', balance = 1) { return db.session.create({ data: { walletAddress: `${name}-${randomUUID()}`, balance, isAuthenticated: true,
  recoveryCredential: { create: { keyHash: randomUUID() } },
  pokerIdentity: { create: { nickname: name, recoverySavedAt: new Date(), humanVerifiedAt: new Date(), humanVerifiedUntil: new Date(Date.now() + 7200000), entryVerifiedUntil: new Date(Date.now() + 300000) } },
} }) }
async function send(id: string, session: string, command: Parameters<PokerService['command']>[2]) {
  const snapshot = await service.snapshot(id, session)
  return service.command(id, session, command, snapshot.version, randomUUID())
}
beforeAll(() => {
  writeFileSync(join(folder, 'poker.db'), '')
  // Build only a new temporary database. Never touch the developer or live wallet DB.
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' })
}, 30_000)
beforeEach(async () => {
  process.env.POKER_REAL_MONEY_ENABLED = 'true'
  await db.pokerHand.deleteMany(); await db.sessionRecoveryCredential.deleteMany();
  await db.pokerEvent.deleteMany(); await db.pokerSeat.deleteMany(); await db.pokerTable.deleteMany(); await db.session.deleteMany()
})
afterAll(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }) })
describe('Real ZEC poker with SQLite transactions', () => {
  it('moves the buy-in into table escrow and retries creation/cash-out exactly once', async () => {
    const p = await player()
    const request = randomUUID()
    const id = await service.create(p.id, input, request)
    expect(await service.create(p.id, input, request)).toBe(id)
    const saved = await db.session.findUniqueOrThrow({ where: { id: p.id } })
    expect(saved.balance).toBe(0.99); expect(saved.pokerLockedZats).toBe(1_000_000n); expect(saved.totalWagered).toBe(0)
    const view = await service.snapshot(id, p.id)
    const leaveId = randomUUID()
    await service.command(id, p.id, { kind: 'leave' }, view.version, leaveId)
    await service.command(id, p.id, { kind: 'leave' }, view.version, leaveId)
    const after = await db.session.findUniqueOrThrow({ where: { id: p.id } })
    expect(after.balance).toBe(1); expect(after.pokerLockedZats).toBe(0n); expect(after.totalWon).toBe(0)
    expect((await db.pokerTable.findUniqueOrThrow({ where: { id } })).escrowZats).toBe(0n)
    expect(await db.pokerEvent.count({ where: { kind: 'cashout' } })).toBe(1)
  })
  it('rolls back the table and seat when a buy-in cannot be funded', async () => {
    const p = await player('poor', 0.001)
    await expect(service.create(p.id, input, randomUUID())).rejects.toThrow('Insufficient')
    expect(await db.pokerTable.count()).toBe(0); expect(await db.pokerSeat.count()).toBe(0)
    expect((await db.session.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(0.001)
  })
  it('prevents demo money, excluded players and disabled real play from joining real tables', async () => {
    const demo = await player('demo_test')
    await expect(service.create(demo.id, input, randomUUID())).rejects.toThrow('cannot share')
    const p = await player()
    process.env.POKER_REAL_MONEY_ENABLED = 'false'
    await expect(service.create(p.id, input, randomUUID())).rejects.toThrow('not enabled')
    process.env.POKER_REAL_MONEY_ENABLED = 'true'
    await db.session.update({ where: { id: p.id }, data: { excludedUntil: new Date(Date.now() + 3600000) } })
    await expect(service.create(p.id, input, randomUUID())).rejects.toThrow('self-excluded')
  })
  it('includes table exposure in limits for other casino games', async () => {
    const p = await player()
    await db.session.update({ where: { id: p.id }, data: { lossLimit: 0.015 } })
    await service.create(p.id, input, randomUUID())
    const session = await db.session.findUniqueOrThrow({ where: { id: p.id } })
    expect(checkWagerAllowed(session, 0.006).allowed).toBe(false)
    expect(checkWagerAllowed(session, 0.005).allowed).toBe(true)
  })
  it('prevents withdrawals from spending a seated player’s table stack', async () => {
    const p = await player('small', 0.01)
    await service.create(p.id, input, randomUUID())
    const reserved = await db.$transaction(tx => reserveFunds(tx, p.id, 0.001, 'totalWithdrawn'))
    expect(reserved).toBe(false)
  })
  it('seats six distinct players and rejects a seventh or a second table for one player', async () => {
    const players = await Promise.all(Array.from({ length: 7 }, () => player()))
    const id = await service.create(players[0].id, input, randomUUID())
    for (let i = 1; i < 6; i++) await send(id, players[i].id, { kind: 'join', seat: i, buyIn: input.buyIn, name: `Player ${i}` })
    await expect(send(id, players[6].id, { kind: 'join', seat: 5, buyIn: input.buyIn, name: 'Seven' })).rejects.toThrow('seat')
    await expect(service.create(players[0].id, input, randomUUID())).rejects.toThrow('current table')
    expect(await db.pokerTable.count()).toBe(1); expect(await db.pokerSeat.count()).toBe(6)
    const outsider = await service.snapshot(id, players[6].id)
    expect(outsider.viewerSeat).toBeNull(); expect(JSON.stringify(outsider)).not.toContain(players[0].id)
  })
  it('allows only one concurrent buyer into a seat without debiting the loser', async () => {
    const p = await player(), a = await player(), b = await player()
    const id = await service.create(p.id, input, randomUUID())
    const snapshot = await service.snapshot(id, p.id)
    const results = await Promise.allSettled([a, b].map(q => service.command(id, q.id, { kind: 'join', seat: 1, buyIn: input.buyIn, name: 'Racer' }, snapshot.version, randomUUID())))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const total = await db.session.aggregate({ _sum: { balance: true, pokerLockedZats: true } })
    expect(total._sum.balance).toBeCloseTo(2.98); expect(total._sum.pokerLockedZats).toBe(2_000_000n)
  })
  it('rejects stale or replayed cross-player commands', async () => {
    const p = await player(), other = await player()
    const req = randomUUID(), id = await service.create(p.id, input, req)
    await expect(service.create(other.id, input, req)).rejects.toThrow('identifier')
    const version = (await service.snapshot(id, p.id)).version
    await send(id, p.id, { kind: 'ready', ready: true })
    await expect(service.command(id, p.id, { kind: 'leave' }, version, randomUUID())).rejects.toThrow('changed')
    await expect(send(id, other.id, { kind: 'act', action: { type: 'fold' } })).rejects.toThrow('seat')
  })
  it('reconstructs a live hand after restart, times out the actor and pays out exactly once', async () => {
    const a = await player(), b = await player()
    const id = await service.create(a.id, input, randomUUID())
    await send(id, b.id, { kind: 'join', seat: 1, buyIn: input.buyIn, name: 'Bob' })
    await send(id, a.id, { kind: 'ready', ready: true }); await send(id, b.id, { kind: 'ready', ready: true })
    await service.tick(id, Date.now() + 6000)
    const before = await service.snapshot(id, a.id)
    expect(before.state.phase).toBe('preflop'); expect(before.viewerSeat).toBe(0)
    const restartedDb = new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl }) })
    try {
      const restarted = new PokerService(restartedDb)
      const recovered = await restarted.snapshot(id, a.id)
      expect(recovered.state.seats[0]?.cards).toEqual(before.state.seats[0]?.cards)
      expect(recovered.state.seats[1]?.cards).toEqual([null, null])
      await restarted.tick(id, before.state.deadline! + 1)
      const after = await restarted.snapshot(id, a.id)
      expect(after.state.phase).toBe('complete'); expect(after.state.seats[0]?.ready).toBe(false)
      expect(await db.pokerEvent.count({ where: { kind: 'hand-settled' } })).toBe(1)
      await restarted.tick(id, before.state.deadline! + 2)
      expect(await db.pokerEvent.count({ where: { kind: 'hand-settled' } })).toBe(1)
      const totals = await db.session.aggregate({ _sum: { balance: true, pokerLockedZats: true, totalWagered: true, totalWon: true } })
      expect(totals._sum.balance).toBeCloseTo(1.98); expect(totals._sum.pokerLockedZats).toBe(2_000_000n)
      expect(totals._sum.totalWagered).toBe(totals._sum.totalWon)
    } finally { await restartedDb.$disconnect() }
  })
  it('queues a mid-hand departure and returns the stack after settlement even when real play is disabled', async () => {
    const a = await player(), b = await player()
    const id = await service.create(a.id, input, randomUUID())
    await send(id, b.id, { kind: 'join', seat: 1, buyIn: input.buyIn, name: 'Bob' })
    await send(id, a.id, { kind: 'ready', ready: true }); await send(id, b.id, { kind: 'ready', ready: true })
    await service.tick(id, Date.now() + 6000)
    await send(id, b.id, { kind: 'leave' })
    expect((await db.session.findUniqueOrThrow({ where: { id: b.id } })).balance).toBe(0.99)
    await send(id, a.id, { kind: 'act', action: { type: 'fold' } })
    const end = await service.snapshot(id, a.id)
    process.env.POKER_REAL_MONEY_ENABLED = 'false'
    await service.tick(id, end.state.nextHandAt! + 1)
    expect(await db.pokerSeat.findUnique({ where: { sessionId: b.id } })).toBeNull()
    expect((await db.session.findUniqueOrThrow({ where: { id: b.id } })).balance).toBe(1.00005)
    await send(id, a.id, { kind: 'leave' })
    expect((await db.session.aggregate({ _sum: { balance: true } }))._sum.balance).toBeCloseTo(2)
  })
})

describe('Variant balances and persistent time banks', () => {
  it.each(['omaha', 'stud'] as const)('settles a six-player %s hand, restores all funds, and records dealt hands once', async variant => {
    const players = await Promise.all(Array.from({ length: 6 }, () => player()))
    const id = await service.create(players[0].id, { ...input, variant }, randomUUID())
    for (let i = 1; i < 6; i++) await send(id, players[i].id, { kind: 'join', seat: i, name: `Player ${i}`, buyIn: input.buyIn })
    for (const p of players) await send(id, p.id, { kind: 'ready', ready: true })
    const waiting = await service.snapshot(id, players[0].id)
    await service.tick(id, waiting.state.nextHandAt! + 1)
    const lobby = await service.lobby(players[0].id)
    expect(lobby[0].variant).toBe(variant)
    for (let n = 0; n < 100; n++) {
      const view = await service.snapshot(id, players[0].id)
      if (view.state.phase === 'complete') break
      const actor = players[view.state.actor!]
      const mine = await service.snapshot(id, actor.id)
      expect(mine.state.seats[mine.viewerSeat!]!.cards.every(c => c !== null)).toBe(true)
      for (let i = 0; i < 6; i++) if (i !== mine.viewerSeat) expect(mine.state.seats[i]!.cards.slice(0, variant === 'omaha' ? 4 : 2).every(c => c === null)).toBe(true)
      await send(id, actor.id, { kind: 'act', action: { type: mine.legal!.bringIn !== null ? 'bring-in' : mine.legal!.canCheck ? 'check' : 'call' } })
    }
    expect((await service.snapshot(id, players[0].id)).state.phase).toBe('complete')
    for (const p of players) await send(id, p.id, { kind: 'leave' })
    const totals = await db.session.aggregate({ _sum: { balance: true, pokerLockedZats: true, totalWagered: true, totalWon: true } })
    expect(totals._sum.balance).toBeCloseTo(6, 8); expect(totals._sum.pokerLockedZats).toBe(0n)
    expect(totals._sum.totalWagered).toBeCloseTo(totals._sum.totalWon!, 8)
    expect(await db.session.count({ where: { pokerHandsDealt: 1 } })).toBe(6)
  })
  it('keeps unused time and refill progress across table changes and rejects duplicate extensions', async () => {
    const a = await player(), b = await player()
    const id = await service.create(a.id, input, randomUUID())
    await send(id, b.id, { kind: 'join', seat: 1, name: 'Bob', buyIn: input.buyIn })
    for (const p of [a, b]) await send(id, p.id, { kind: 'ready', ready: true })
    await service.tick(id, (await service.snapshot(id, a.id)).state.nextHandAt! + 1)
    const before = await service.snapshot(id, a.id), req = randomUUID()
    expect(before.viewerSeat).toBe(before.state.actor)
    await expect(send(id, b.id, { kind: 'time-bank' })).rejects.toThrow('turn')
    await service.command(id, a.id, { kind: 'time-bank' }, before.version, req)
    await service.command(id, a.id, { kind: 'time-bank' }, before.version, req)
    const activated = await service.snapshot(id, a.id)
    expect(activated.state.deadline).toBe(before.state.deadline! + 30_000)
    const now = vi.spyOn(Date, 'now').mockReturnValue(before.state.deadline! + 7_000)
    try { await send(id, a.id, { kind: 'act', action: { type: 'fold' } }) }
    finally { now.mockRestore() }
    await send(id, a.id, { kind: 'leave' })
    const saved = await db.session.findUniqueOrThrow({ where: { id: a.id } })
    expect(saved.pokerTimeBankMs).toBe(23_000); expect(saved.pokerHandsDealt).toBe(1)
    await db.pokerIdentity.update({ where: { sessionId: a.id }, data: { entryVerifiedUntil: new Date(Date.now() + 300000) } })
    const other = await service.create(a.id, { ...input, variant: 'stud' }, randomUUID())
    expect((await service.snapshot(other, a.id)).state.seats[0]!.timeBankMs).toBe(23_000)
    expect((await service.snapshot(other, a.id)).state.seats[0]!.handsDealt).toBe(1)
  })
  it('resumes an activated bank after restart, consumes it on timeout and sits the player out', async () => {
    const a = await player(), b = await player()
    const id = await service.create(a.id, { ...input, variant: 'omaha' }, randomUUID())
    await send(id, b.id, { kind: 'join', seat: 1, name: 'Bob', buyIn: input.buyIn })
    for (const p of [a, b]) await send(id, p.id, { kind: 'ready', ready: true })
    await service.tick(id, (await service.snapshot(id, a.id)).state.nextHandAt! + 1)
    await send(id, a.id, { kind: 'time-bank' })
    const view = await service.snapshot(id, a.id)
    const restartedDb = new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl }) })
    try {
      const restarted = new PokerService(restartedDb)
      await restarted.tick(id, view.state.timeBankStartsAt! + 1)
      expect((await restarted.snapshot(id, a.id)).state.actor).toBe(0)
      await restarted.tick(id, view.state.deadline! + 1)
      const after = await restarted.snapshot(id, a.id)
      expect(after.state.seats[0]!.timeBankMs).toBe(0); expect(after.state.seats[0]!.ready).toBe(false)
      expect((await restartedDb.session.findUniqueOrThrow({ where: { id: a.id } })).pokerTimeBankMs).toBe(0)
    } finally { await restartedDb.$disconnect() }
  })
  it('upgrades old Hold’em JSON in memory without resetting its hand or cards', async () => {
    const a = await player(), id = await service.create(a.id, input, randomUUID())
    const row = await db.pokerTable.findUniqueOrThrow({ where: { id } })
    const old = JSON.parse(row.state)
    delete old.variant; delete old.timeBankStartsAt; delete old.limitUnit; delete old.limitFullBet; delete old.limitBets; delete old.bringInSeat
    delete old.seats[0].timeBankMs; delete old.seats[0].handsDealt
    await db.pokerTable.update({ where: { id }, data: { state: JSON.stringify(old) } })
    const view = await service.snapshot(id, a.id)
    expect(view.state.variant).toBe('holdem'); expect(view.state.seats[0]!.timeBankMs).toBe(30_000)
    expect(view.state.handNumber).toBe(old.handNumber); expect(view.state.seats[0]!.stack).toBe(old.seats[0].stack)
    expect((await db.pokerTable.findUniqueOrThrow({ where: { id } })).state).toBe(JSON.stringify(old))
  })
})
