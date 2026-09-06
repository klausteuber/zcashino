// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PokerService } from './service'
import { accessStatus, ensureIdentity, setupIdentity } from './access'
import { browserMarker, POKER_BROWSER_COOKIE, verifyHuman } from './human-check'
import { unseal } from './integrity-crypto'
import { analyzeHand, expireIntegrityData } from './integrity-monitor'
const folder = mkdtempSync(join(tmpdir(), 'poker-integrity-')), databaseUrl = `file:${join(folder, 'poker.db')}`
const db = new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl }) }), service = new PokerService(db)
const input = { name: 'Integrity Test', playerName: 'Spoofed Nickname', mode: 'real' as const, bigBlind: 10000, buyIn: 1000000 }
const request = (cookie?: string) => new NextRequest('http://localhost/api/poker/access', { headers: { host: 'localhost', ...(cookie ? { cookie: `${POKER_BROWSER_COOKIE}=${cookie}` } : {}) } })
async function player(setup = true) {
  const p = await db.session.create({ data: { walletAddress: `poker-${randomUUID()}`, balance: 1, isAuthenticated: true } })
  if (setup) {
    await db.sessionRecoveryCredential.create({ data: { sessionId: p.id, keyHash: randomUUID() } })
    await db.$transaction(tx => setupIdentity(tx, p.id, `Player ${p.id.slice(-5)}`, true))
    await verify(p.id)
  }
  return p
}
async function verify(id: string, marker = browserMarker(request())) {
  const status = await accessStatus(db, id)
  return verifyHuman(db, id, `local-test:${status.nonce}`, status.nonce, request(marker))
}
async function send(id: string, sessionId: string, command: Parameters<PokerService['command']>[2]) {
  const view = await service.snapshot(id, sessionId)
  await service.command(id, sessionId, command, view.version, randomUUID())
}
async function table() {
  const a = await player(), b = await player()
  const id = await service.create(a.id, input, randomUUID())
  await send(id, b.id, { kind: 'join', seat: 1, buyIn: input.buyIn, name: 'Spoof' })
  for (const p of [a, b]) await send(id, p.id, { kind: 'ready', ready: true })
  await service.tick(id, (await service.snapshot(id, a.id)).state.nextHandAt! + 1)
  return { a, b, id }
}
beforeAll(() => {
  writeFileSync(join(folder, 'poker.db'), '')
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' })
}, 30_000)
beforeEach(async () => {
  process.env.KILL_SWITCH = 'false'; process.env.POKER_REAL_MONEY_ENABLED = 'true'; process.env.NODE_ENV = 'test'; process.env.ZCASH_NETWORK = 'testnet'; process.env.POKER_HUMAN_CHECK_MODE = 'local-test'; process.env.POKER_INTEGRITY_SECRET = 'poker-integrity-test-secret-at-least-32-chars'
  await db.pokerHand.deleteMany(); await db.pokerEvent.deleteMany(); await db.pokerSeat.deleteMany(); await db.pokerTable.deleteMany(); await db.sessionRecoveryCredential.deleteMany(); await db.session.deleteMany()
  await db.pokerObservation.deleteMany(); await db.pokerHumanToken.deleteMany(); await db.pokerIntegritySignal.deleteMany(); await db.adminAlert.deleteMany()
})
afterAll(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }) })
describe('Poker access, private histories and integrity persistence', () => {
  it('requires a saved recovery credential and human verification before reserving real funds', async () => {
    const p = await player(false)
    await expect(service.create(p.id, input, randomUUID())).rejects.toThrow('identity')
    await expect(db.$transaction(tx => setupIdentity(tx, p.id, 'Alice', true))).rejects.toThrow('recovery key')
    await db.sessionRecoveryCredential.create({ data: { sessionId: p.id, keyHash: randomUUID() } })
    await db.$transaction(tx => setupIdentity(tx, p.id, 'Alice', true))
    await expect(service.create(p.id, input, randomUUID())).rejects.toThrow('human check')
    expect(await db.pokerTable.count()).toBe(0)
    expect((await db.session.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(1)
  })
  it('keeps one stable pseudonym across restored authentication, brands and table choices', async () => {
    const p = await player(), identity = await ensureIdentity(db, p.id)
    await db.session.update({ where: { id: p.id }, data: { playerAuthVersion: { increment: 1 }, pokerTimeBankMs: 11000, pokerHandsDealt: 17 } })
    const restored = await accessStatus(db, p.id)
    expect(restored.identityId).toBe(identity.id)
    await expect(db.$transaction(tx => setupIdentity(tx, p.id, 'New name', true))).rejects.toThrow('stays the same')
    const id = await service.create(p.id, input, randomUUID()), view = await service.snapshot(id, p.id)
    expect(view.state.seats[0]?.name).toBe(identity.nickname); expect(view.state.seats[0]?.timeBankMs).toBe(11000)
    expect(view.state.seats[0]?.handsDealt).toBe(17)
    await send(id, p.id, { kind: 'leave' }); await verify(p.id)
    const next = await service.create(p.id, { ...input, variant: 'stud' }, randomUUID())
    expect((await service.snapshot(next, p.id)).access.identityId).toBe(identity.id)
  })
  it('consumes an entry grant once but preserves exactly-once command retries', async () => {
    const p = await player(), receipt = randomUUID()
    const id = await service.create(p.id, input, receipt)
    expect(await service.create(p.id, input, receipt)).toBe(id)
    await send(id, p.id, { kind: 'leave' })
    await expect(service.create(p.id, input, randomUUID())).rejects.toThrow('fresh human check')
    expect((await db.session.findUniqueOrThrow({ where: { id: p.id } })).balance).toBe(1)
  })
  it('rejects replayed/cross-identity checks and accepts only one concurrent redemption', async () => {
    const a = await player(), b = await player(), status = await accessStatus(db, a.id), marker = browserMarker(request())
    await expect(verifyHuman(db, b.id, `local-test:${status.nonce}`, status.nonce, request(marker))).rejects.toThrow('already used')
    const results = await Promise.allSettled([1, 2].map(() => verifyHuman(db, a.id, `local-test:${status.nonce}`, status.nonce, request(marker))))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    await expect(verifyHuman(db, a.id, `local-test:${status.nonce}`, status.nonce, request(marker))).rejects.toThrow('already used')
  })
  it('honors expiry/rechecks only between hands and still permits actions and cash-out', async () => {
    const { a, b, id } = await table()
    await db.pokerIdentity.update({ where: { sessionId: a.id }, data: { recheckRequired: true, humanVerifiedUntil: new Date(0) } })
    const before = await service.snapshot(id, a.id)
    expect(before.access.playVerified).toBe(false); expect(before.legal).not.toBeNull()
    await send(id, a.id, { kind: 'act', action: { type: 'fold' } })
    await service.tick(id, (await service.snapshot(id, a.id)).state.nextHandAt! + 1)
    const after = await service.snapshot(id, a.id)
    expect(after.state.seats[0]?.ready).toBe(false); expect(after.state.handNumber).toBe(1)
    await send(id, a.id, { kind: 'leave' }); await send(id, b.id, { kind: 'leave' })
    expect((await db.session.aggregate({ _sum: { balance: true } }))._sum.balance).toBeCloseTo(2)
  })
  it('requires a fresh check at 100 dealt hands and carries restrictions through restore', async () => {
    const p = await player()
    await db.session.update({ where: { id: p.id }, data: { pokerHandsDealt: 100, playerAuthVersion: { increment: 1 } } })
    await expect(service.create(p.id, input, randomUUID())).rejects.toThrow('human check')
    await verify(p.id)
    await db.pokerIdentity.update({ where: { sessionId: p.id }, data: { restrictedUntil: new Date(Date.now() + 60000) } })
    await expect(service.create(p.id, input, randomUUID())).rejects.toThrow('restricted')
    expect((await accessStatus(db, p.id)).restricted).toBe(true)
  })
  it.each(['holdem', 'omaha', 'stud'] as const)('records encrypted %s actions and completed cards without exposing them to spectators', async variant => {
    const a = await player(), b = await player(), outsider = await player()
    const id = await service.create(a.id, { ...input, variant }, randomUUID())
    await send(id, b.id, { kind: 'join', seat: 1, buyIn: input.buyIn, name: 'B' })
    for (const p of [a, b]) await send(id, p.id, { kind: 'ready', ready: true })
    await service.tick(id, (await service.snapshot(id, a.id)).state.nextHandAt! + 1)
    const view = await service.snapshot(id, outsider.id)
    expect(JSON.stringify(view)).not.toContain(a.id); expect(JSON.stringify(view)).not.toContain('payload')
    expect(view.state.seats[0]?.cards[0]).toBeNull()
    for (let n = 0; n < 30; n++) {
      const v = await service.snapshot(id, a.id)
      if (v.state.phase === 'complete') break
      const actor = v.state.actor === 0 ? a : b, mine = await service.snapshot(id, actor.id)
      await send(id, actor.id, { kind: 'act', action: { type: mine.legal!.bringIn !== null ? 'bring-in' : mine.legal!.canCheck ? 'check' : 'call' } })
    }
    const hand = await db.pokerHand.findFirstOrThrow({ include: { decisions: true, players: true } })
    expect(hand.completedAt).not.toBeNull(); expect(hand.decisions.length).toBeGreaterThan(0)
    expect(hand.payload).toMatch(/^v1\./); expect(hand.payload).not.toContain('cards')
    const record = unseal<{ partial: boolean; initial: unknown; final: unknown }>(hand.payload, hand.id)
    expect(record.partial).toBe(false); expect(record.final).toBeDefined()
    expect(JSON.stringify(record)).not.toContain('deck'); expect(JSON.stringify(record)).not.toContain(a.walletAddress)
    expect(hand.players.reduce((sum, p) => sum + p.wagered - p.returned, 0)).toBe(0)
  })
  it('labels automatic decisions and time-bank activation separately', async () => {
    const { a, id } = await table()
    await send(id, a.id, { kind: 'time-bank' })
    const v = await service.snapshot(id, a.id)
    await service.tick(id, v.state.deadline! + 1)
    const decisions = await db.pokerDecision.findMany({ orderBy: { createdAt: 'asc' } })
    expect(decisions.map(d => [d.action, d.source])).toEqual([['time-bank', 'player'], ['fold', 'timeout']])
    expect(decisions[1].elapsedMs).toBeNull()
    expect(unseal<{ bankSpentMs: number }>(decisions[1].payload, decisions[1].id).bankSpentMs).toBe(30000)
  })
  it('records a shared-browser indicator once without restricting anyone or changing funds', async () => {
    const { a, b, id } = await table(), marker = browserMarker(request())
    await verify(a.id, marker); await verify(b.id, marker)
    await send(id, a.id, { kind: 'act', action: { type: 'fold' } })
    const hand = await db.pokerHand.findFirstOrThrow(), before = await db.session.aggregate({ _sum: { balance: true, pokerLockedZats: true } })
    await analyzeHand(db, hand.id); await analyzeHand(db, hand.id)
    expect(await db.pokerIntegritySignal.count({ where: { kind: 'shared-browser' } })).toBe(1)
    expect(await db.adminAlert.count({ where: { type: 'poker_integrity' } })).toBe(1)
    expect(await db.pokerIdentity.count({ where: { recheckRequired: true } })).toBe(0)
    expect(await db.session.aggregate({ _sum: { balance: true, pokerLockedZats: true } })).toEqual(before)
    const observations = await db.pokerObservation.findMany()
    expect(observations.every(o => o.networkKey === null)).toBe(true)
  })
  it('expires private records while retaining identity, balances, time banks and financial receipts', async () => {
    const { a, b, id } = await table()
    await send(id, a.id, { kind: 'act', action: { type: 'fold' } })
    await send(id, a.id, { kind: 'leave' }); await send(id, b.id, { kind: 'leave' })
    const before = await db.session.findUniqueOrThrow({ where: { id: a.id } }), receipts = await db.pokerEvent.count()
    await expireIntegrityData(db, Date.now() + 31 * 86400000)
    expect(await db.pokerHand.count()).toBe(0); expect(await db.pokerDecision.count()).toBe(0); expect(await db.pokerObservation.count()).toBe(0)
    expect(await db.pokerEvent.count()).toBe(receipts)
    expect((await db.session.findUniqueOrThrow({ where: { id: a.id } })).balance).toBe(before.balance)
    expect((await db.session.findUniqueOrThrow({ where: { id: a.id } })).pokerTimeBankMs).toBe(before.pokerTimeBankMs)
    expect(await db.pokerIdentity.count()).toBe(2)
  })
})
