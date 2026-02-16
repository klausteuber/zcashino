#!/usr/bin/env node
/**
 * Guarded-live baseline snapshot
 *
 * Captures core money-safety invariants and appends a JSONL record for
 * day-over-day comparison during the guarded-live window.
 *
 * Usage:
 *   node scripts/guarded-live-baseline.js
 *   GUARDED_LIVE_BASELINE_LOG=/opt/zcashino/ops/guarded-live-baseline.jsonl node scripts/guarded-live-baseline.js
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { PrismaClient } = require('@prisma/client')

dotenv.config({ path: '.env.monitoring' })
dotenv.config({ path: '.env.mainnet' })
dotenv.config()

const prisma = new PrismaClient()

function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
}

async function captureBaseline() {
  const now = new Date()
  const olderThan30m = new Date(now.getTime() - 30 * 60 * 1000)

  const [
    sessionTotals,
    negativeBalanceCount,
    pendingOlderThan30m,
    poolAvailable,
    duplicateTxHashGroupsRaw,
    duplicateIdempotencyGroupsRaw,
  ] = await Promise.all([
    prisma.session.aggregate({
      _sum: {
        balance: true,
        totalDeposited: true,
        totalWithdrawn: true,
      },
    }),
    prisma.session.count({
      where: {
        balance: {
          lt: 0,
        },
      },
    }),
    prisma.transaction.count({
      where: {
        type: 'withdrawal',
        status: { in: ['pending', 'pending_approval'] },
        createdAt: { lte: olderThan30m },
      },
    }),
    prisma.seedCommitment.count({
      where: {
        status: 'available',
      },
    }),
    prisma.transaction.groupBy({
      by: ['sessionId', 'type', 'txHash'],
      where: { txHash: { not: null } },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['sessionId', 'type', 'idempotencyKey'],
      where: { idempotencyKey: { not: null } },
      _count: { _all: true },
    }),
  ])

  const duplicateTxHashGroups = duplicateTxHashGroupsRaw.filter((g) => g._count._all > 1)
  const duplicateIdempotencyGroups = duplicateIdempotencyGroupsRaw.filter((g) => g._count._all > 1)

  return {
    timestamp: now.toISOString(),
    network: process.env.ZCASH_NETWORK || 'unknown',
    guardedLive: {
      authMode: process.env.PLAYER_SESSION_AUTH_MODE || 'compat',
      withdrawalApprovalThreshold: process.env.WITHDRAWAL_APPROVAL_THRESHOLD || 'unset',
    },
    invariants: {
      negativeBalanceCount,
      pendingWithdrawalsOlderThan30m: pendingOlderThan30m,
      duplicateTxHashGroupCount: duplicateTxHashGroups.length,
      duplicateIdempotencyGroupCount: duplicateIdempotencyGroups.length,
      availableCommitments: poolAvailable,
    },
    totals: {
      liabilities: sessionTotals._sum.balance || 0,
      totalDeposited: sessionTotals._sum.totalDeposited || 0,
      totalWithdrawn: sessionTotals._sum.totalWithdrawn || 0,
    },
    duplicates: {
      txHash: duplicateTxHashGroups.slice(0, 25).map((g) => ({
        sessionId: g.sessionId,
        type: g.type,
        txHash: g.txHash,
        count: g._count._all,
      })),
      idempotencyKey: duplicateIdempotencyGroups.slice(0, 25).map((g) => ({
        sessionId: g.sessionId,
        type: g.type,
        idempotencyKey: g.idempotencyKey,
        count: g._count._all,
      })),
    },
  }
}

async function main() {
  const entry = await captureBaseline()
  const logPath = process.env.GUARDED_LIVE_BASELINE_LOG || path.join(process.cwd(), 'ops', 'guarded-live-baseline.jsonl')

  ensureDir(logPath)
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')

  console.log('[guarded-live-baseline] Snapshot saved')
  console.log(`[guarded-live-baseline] Log file: ${logPath}`)
  console.log(
    `[guarded-live-baseline] negative=${entry.invariants.negativeBalanceCount}, pending>30m=${entry.invariants.pendingWithdrawalsOlderThan30m}, dupTxHash=${entry.invariants.duplicateTxHashGroupCount}, dupIdempotency=${entry.invariants.duplicateIdempotencyGroupCount}, pool=${entry.invariants.availableCommitments}`
  )
}

main()
  .catch((error) => {
    console.error('[guarded-live-baseline] Failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
