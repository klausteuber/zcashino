// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { NextRequest } from 'next/server'

const folder = mkdtempSync(join(tmpdir(), 'deposit-recovery-tests-'))
const databaseUrl = `file:${join(folder, 'test.db')}`
const db = new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl }) })
const rpc = vi.hoisted(() => ({ transactions: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: db }))
vi.mock('@/lib/admin/rate-limit', () => ({ checkPublicRateLimit: () => ({ allowed: true }), createRateLimitResponse: vi.fn() }))
vi.mock('@/lib/notifications/player-activity', () => ({ sendPlayerDepositAlert: vi.fn() }))
vi.mock('@/lib/wallet/rpc', () => ({
  checkNodeStatus: async () => ({ connected: true, synced: true }),
  getAddressBalance: async () => ({ confirmed: 1, pending: 0 }),
  listAddressTransactions: rpc.transactions,
  sendZec: vi.fn(), validateAddressViaRPC: vi.fn(), getOperationStatus: vi.fn(),
}))
let depositPOST: typeof import('./route').POST
let recoveryPOST: typeof import('../session/recovery/route').POST
let createToken: typeof import('@/lib/auth/player-session').createPlayerSessionToken
let hashKey: typeof import('@/lib/auth/session-recovery').hashRecoveryKey
beforeAll(async () => {
  writeFileSync(join(folder, 'test.db'), '')
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe',
  })
  depositPOST = (await import('./route')).POST
  recoveryPOST = (await import('../session/recovery/route')).POST
  createToken = (await import('@/lib/auth/player-session')).createPlayerSessionToken
  hashKey = (await import('@/lib/auth/session-recovery')).hashRecoveryKey
}, 30_000)
afterAll(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }) })

describe('Funded wallet deposit and recovery with real SQLite', () => {
  it.each(['new', 'pending'])('credits a %s 1 ZEC deposit at the exact daily limit without timing out or double crediting', async status => {
    const id = randomUUID(), txHash = randomUUID()
    const player = await db.session.create({ data: { walletAddress: `real_${id}`, depositLimit: 1,
      wallet: { create: { transparentAddr: `t1${id}`, network: 'testnet' } } } })
    if (status === 'pending') await db.transaction.create({ data: {
      sessionId: player.id, type: 'deposit', amount: 1, txHash, status: 'pending', confirmations: 2,
    } })
    rpc.transactions.mockResolvedValue([{ txid: txHash, category: 'receive', amount: 1, confirmations: 20 }])
    const token = createToken({ sessionId: player.id, walletAddress: player.walletAddress, authVersion: 1, exp: Date.now() + 60_000 })
    const request = () => new NextRequest('https://21z.cash/api/wallet', { method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `zcashino_player_session=${token}` },
      body: JSON.stringify({ action: 'check-deposits', sessionId: player.id }) })
    const response = await depositPOST(request())
    expect(response.status).toBe(200)
    expect((await response.json()).session).toEqual({ balance: 1, isAuthenticated: true })
    const repeated = await depositPOST(request())
    expect(repeated.status).toBe(200)
    const saved = await db.session.findUniqueOrThrow({ where: { id: player.id } })
    expect(saved.balance).toBe(1); expect(saved.totalDeposited).toBe(1)
    expect(await db.transaction.count({ where: { sessionId: player.id, type: 'deposit' } })).toBe(1)
  }, 15_000)

  it('restores a funded wallet while a pending deposit is being processed', async () => {
    const id = randomUUID(), txHash = randomUUID(), key = `zrec_${'ab'.repeat(32)}`
    const player = await db.session.create({ data: { walletAddress: `real_${id}`,
      wallet: { create: { transparentAddr: `t1${id}`, network: 'testnet' } },
      recoveryCredential: { create: { keyHash: hashKey(key) } },
    } })
    await db.transaction.create({ data: { sessionId: player.id, type: 'deposit', amount: 1, txHash, status: 'pending', confirmations: 2 } })
    rpc.transactions.mockResolvedValue([{ txid: txHash, category: 'receive', amount: 1, confirmations: 20 }])
    const token = createToken({ sessionId: player.id, walletAddress: player.walletAddress, authVersion: 1, exp: Date.now() + 60_000 })
    const [deposit, recovered] = await Promise.all([
      depositPOST(new NextRequest('https://21z.cash/api/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: `zcashino_player_session=${token}` }, body: JSON.stringify({ action: 'check-deposits', sessionId: player.id }) })),
      recoveryPOST(new NextRequest('https://21z.cash/api/session/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', recoveryKey: key }) })),
    ])
    expect(recovered.status).toBe(200)
    expect(recovered.cookies.get('zcashino_player_session')?.value).toBeTruthy()
    // Recovery may revoke the old cookie before the deposit request authenticates.
    expect([200, 401]).toContain(deposit.status)
    const body = await recovered.json()
    expect(body.id).toBe(player.id)
    const newToken = recovered.cookies.get('zcashino_player_session')!.value
    const retry = await depositPOST(new NextRequest('https://21z.cash/api/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: `zcashino_player_session=${newToken}` }, body: JSON.stringify({ action: 'check-deposits', sessionId: player.id }) }))
    expect(retry.status).toBe(200)
    expect((await retry.json()).session).toEqual({ balance: 1, isAuthenticated: true })
  }, 15_000)
})
