// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const context = vi.hoisted(() => ({ db: null as import('@prisma/client').PrismaClient | null }))
vi.mock('@/lib/db', () => ({ default: new Proxy({}, {
  get: (_target, key) => {
    const value = Reflect.get(context.db!, key)
    return typeof value === 'function' ? value.bind(context.db) : value
  },
}) }))

import { commitBlackjackAction } from './blackjack-action'

describe('blackjack transaction integrity with SQLite', () => {
  let directory: string
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'blackjack-security-'))
    const url = `file:${join(directory, 'test.db')}`
    writeFileSync(join(directory, 'test.db'), '')
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], {
      env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', timeout: 30000,
    })
    context.db = new PrismaClient({ adapter: new PrismaLibSql({ url }) })
  }, 40000)
  afterAll(async () => {
    await context.db?.$disconnect()
    if (directory) rmSync(directory, { recursive: true, force: true })
  })
  beforeEach(async () => {
    await context.db!.blackjackGame.deleteMany()
    await context.db!.session.deleteMany()
    await context.db!.session.create({ data: { id: 'player', walletAddress: 'demo_integrity', balance: 1 } })
    await context.db!.blackjackGame.create({ data: {
      id: 'game', sessionId: 'player', mainBet: 0.1, initialState: '{}', serverSeedHash: 'hash', clientSeed: 'seed', nonce: 0,
    } })
  })
  const action = { gameId: 'game', sessionId: 'player', expectedVersion: 0, additionalBet: 0.1, payout: null, data: { actionHistory: '["double"]' } }

  it('applies the exact additive security migration while preserving existing records', async () => {
    await context.db!.adminUser.create({ data: { id: 'admin', username: 'audit-admin', passwordHash: 'unused' } })
    await context.db!.$executeRawUnsafe('ALTER TABLE "AdminUser" DROP COLUMN "authVersion"')
    await context.db!.$executeRawUnsafe('ALTER TABLE "BlackjackGame" DROP COLUMN "version"')
    const migration = readFileSync('prisma/migrations/20260905050000_security_session_and_game_versions/migration.sql', 'utf8')
    for (const sql of migration.split(';').filter(sql => sql.trim())) await context.db!.$executeRawUnsafe(sql)
    expect((await context.db!.adminUser.findUniqueOrThrow({ where: { id: 'admin' } })).authVersion).toBe(1)
    expect((await context.db!.blackjackGame.findUniqueOrThrow({ where: { id: 'game' } })).version).toBe(0)
    expect((await context.db!.session.findUniqueOrThrow({ where: { id: 'player' } })).balance).toBe(1)
    expect(await context.db!.$queryRawUnsafe('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
  })

  it('repairs missing historical admin tables and preserves already provisioned accounts', async () => {
    const repair = readFileSync('prisma/migrations/20260905045900_add_missing_admin_schema/migration.sql', 'utf8')
    const applyRepair = async () => {
      for (const sql of repair.split(';').filter(sql => sql.trim())) await context.db!.$executeRawUnsafe(sql)
    }
    await applyRepair()
    expect((await context.db!.adminUser.findUniqueOrThrow({ where: { id: 'admin' } })).passwordHash).toBe('unused')
    for (const table of ['PromotionRedemption', 'Promotion', 'ZecPriceSnapshot', 'AdminUser']) {
      await context.db!.$executeRawUnsafe(`DROP TABLE "${table}"`)
    }
    await context.db!.$executeRawUnsafe('ALTER TABLE "BlackjackGame" DROP COLUMN "version"')
    await applyRepair()
    const security = readFileSync('prisma/migrations/20260905050000_security_session_and_game_versions/migration.sql', 'utf8')
    for (const sql of security.split(';').filter(sql => sql.trim())) await context.db!.$executeRawUnsafe(sql)
    await context.db!.adminUser.create({ data: { username: 'new-admin', passwordHash: 'unused' } })
    expect(await context.db!.adminUser.count()).toBe(1)
    expect(await context.db!.promotion.count()).toBe(0)
    expect(await context.db!.zecPriceSnapshot.count()).toBe(0)
    expect((await context.db!.session.findUniqueOrThrow({ where: { id: 'player' } })).balance).toBe(1)
    expect(await context.db!.$queryRawUnsafe('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
  })

  it('accepts only one concurrent action against the same version', async () => {
    const results = await Promise.allSettled([commitBlackjackAction(action), commitBlackjackAction(action)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const session = await context.db!.session.findUniqueOrThrow({ where: { id: 'player' } })
    const game = await context.db!.blackjackGame.findUniqueOrThrow({ where: { id: 'game' } })
    expect(session.balance).toBe(0.9)
    expect(session.totalWagered).toBe(0.1)
    expect(game.version).toBe(1)
    expect(game.actionHistory).toBe('["double"]')
  })

  it('rolls back the version claim and charge if persisting the game fails', async () => {
    await expect(commitBlackjackAction({ ...action, data: { sessionId: 'missing-foreign-key' } })).rejects.toThrow()
    expect((await context.db!.session.findUniqueOrThrow({ where: { id: 'player' } })).balance).toBe(1)
    expect((await context.db!.blackjackGame.findUniqueOrThrow({ where: { id: 'game' } })).version).toBe(0)
  })

  it('settles once and rejects subsequent stale history updates', async () => {
    await commitBlackjackAction({ ...action, payout: 0.4 })
    await expect(commitBlackjackAction({ ...action, data: { actionHistory: '["hit"]' } })).rejects.toThrow()
    const session = await context.db!.session.findUniqueOrThrow({ where: { id: 'player' } })
    expect(session.balance).toBe(1.3)
    expect(session.totalWon).toBe(0.4)
    expect((await context.db!.blackjackGame.findUniqueOrThrow({ where: { id: 'game' } })).actionHistory).toBe('["double"]')
  })
})
