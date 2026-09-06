// @vitest-environment node
import { expect, it } from 'vitest'
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
it('applies the additive poker migration to an existing session table without changing balances', async () => {
  const db = createClient({ url: ':memory:' })
  try {
    await db.executeMultiple('CREATE TABLE "Session" ("id" TEXT PRIMARY KEY, "balance" REAL); INSERT INTO "Session" VALUES (\'existing\', 1.23456789);')
    await db.executeMultiple(readFileSync('prisma/migrations/20260906010000_add_six_max_poker/migration.sql', 'utf8'))
    await db.executeMultiple(readFileSync('prisma/migrations/20260906020000_poker_time_bank/migration.sql', 'utf8'))
    await db.executeMultiple(readFileSync('prisma/migrations/20260906030000_poker_integrity/migration.sql', 'utf8'))
    const row = (await db.execute('SELECT balance,pokerLockedZats,pokerTimeBankMs,pokerHandsDealt FROM "Session"')).rows[0]
    expect(row.pokerTimeBankMs).toBe(30000); expect(row.pokerHandsDealt).toBe(0)
    expect(row.balance).toBe(1.23456789); expect(Number(row.pokerLockedZats)).toBe(0)
    expect((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check).toBe('ok')
    expect((await db.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0)
  } finally { db.close() }
})
