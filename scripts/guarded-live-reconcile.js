#!/usr/bin/env node
/**
 * Guarded-live daily reconciliation snapshot
 *
 * Compares liabilities to house wallet total and records withdrawal operational
 * queues (`pending`, `pending_approval`, `failed`) for manual ops reconciliation.
 *
 * Usage:
 *   node scripts/guarded-live-reconcile.js
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

async function fetchHealth(appBaseUrl) {
  const response = await fetch(`${appBaseUrl}/api/health`)
  if (!response.ok) {
    throw new Error(`Health endpoint failed: HTTP ${response.status}`)
  }
  return response.json()
}

async function main() {
  const now = new Date()
  const appBaseUrl = process.env.APP_BASE_URL || 'http://127.0.0.1:3000'
  const logPath = process.env.GUARDED_LIVE_RECONCILE_LOG || path.join(process.cwd(), 'ops', 'guarded-live-reconcile.jsonl')

  const health = await fetchHealth(appBaseUrl)

  const [sessionTotals, withdrawalQueues] = await Promise.all([
    prisma.session.aggregate({
      _sum: {
        balance: true,
      },
      _count: {
        id: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        type: 'withdrawal',
        status: {
          in: ['pending', 'pending_approval', 'failed'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
      select: {
        id: true,
        sessionId: true,
        status: true,
        amount: true,
        fee: true,
        operationId: true,
        txHash: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ])

  const liabilities = Number(sessionTotals._sum.balance || 0)
  const houseConfirmed = Number(health?.houseBalance?.confirmed || 0)
  const housePending = Number(health?.houseBalance?.pending || 0)
  const houseTotal = houseConfirmed + housePending
  const delta = Number((houseTotal - liabilities).toFixed(8))

  const byStatus = {
    pending: withdrawalQueues.filter((tx) => tx.status === 'pending').length,
    pendingApproval: withdrawalQueues.filter((tx) => tx.status === 'pending_approval').length,
    failed: withdrawalQueues.filter((tx) => tx.status === 'failed').length,
  }

  const entry = {
    timestamp: now.toISOString(),
    network: process.env.ZCASH_NETWORK || 'unknown',
    liabilities,
    houseBalance: {
      confirmed: houseConfirmed,
      pending: housePending,
      total: houseTotal,
    },
    delta,
    sessions: {
      totalCount: sessionTotals._count.id,
    },
    withdrawals: {
      queueCounts: byStatus,
      queueSample: withdrawalQueues.slice(0, 50),
    },
  }

  ensureDir(logPath)
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')

  console.log('[guarded-live-reconcile] Snapshot saved')
  console.log(`[guarded-live-reconcile] liabilities=${liabilities}, houseTotal=${houseTotal}, delta=${delta}`)
  console.log(
    `[guarded-live-reconcile] queue pending=${byStatus.pending}, pending_approval=${byStatus.pendingApproval}, failed=${byStatus.failed}`
  )
  console.log(`[guarded-live-reconcile] Log file: ${logPath}`)
}

main()
  .catch((error) => {
    console.error('[guarded-live-reconcile] Failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
