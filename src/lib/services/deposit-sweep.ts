/**
 * Deposit Sweep Service
 *
 * Background service that periodically consolidates transparent deposit
 * address funds → house shielded z-address. This ensures:
 * 1. House wallet has liquidity for withdrawals
 * 2. Deposit addresses don't accumulate stale balances
 * 3. Funds move into the shielded pool for privacy
 *
 * Runs alongside the commitment pool manager in instrumentation.ts.
 */

import prisma from '@/lib/db'
import { DEFAULT_NETWORK, roundZec } from '@/lib/wallet'
import {
  checkNodeStatus,
  getAddressBalance,
  sendZec,
  getOperationStatus,
} from '@/lib/wallet/rpc'
import type { ZcashNetwork } from '@/types'

// Configuration
const SWEEP_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const STATUS_CHECK_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes (check pending sweeps)
const MIN_SWEEP_AMOUNT = 0.001 // Don't sweep dust — fees would eat it

let isRunning = false
let sweepIntervalId: ReturnType<typeof setInterval> | null = null
let statusIntervalId: ReturnType<typeof setInterval> | null = null
let lastSweep: Date | null = null
let lastStatusCheck: Date | null = null

export interface SweepServiceStatus {
  isRunning: boolean
  lastSweep: Date | null
  lastStatusCheck: Date | null
  pendingSweeps: number
}

let cachedPendingSweeps = 0

/**
 * Get the house z-address for the given network
 */
function getHouseAddress(network: ZcashNetwork): string | null {
  return network === 'mainnet'
    ? process.env.HOUSE_ZADDR_MAINNET || null
    : process.env.HOUSE_ZADDR_TESTNET || null
}

/**
 * Sweep deposits from all transparent deposit addresses to house z-address.
 * Only sweeps addresses with confirmed balance above MIN_SWEEP_AMOUNT.
 */
export async function sweepDeposits(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{
  swept: number
  skipped: number
  errors: number
  details: Array<{ address: string; amount: number; status: string }>
}> {
  const houseAddress = getHouseAddress(network)
  if (!houseAddress) {
    console.log('[Sweep] No house address configured — skipping')
    return { swept: 0, skipped: 0, errors: 0, details: [] }
  }

  // Check node
  const nodeStatus = await checkNodeStatus(network)
  if (!nodeStatus.connected || !nodeStatus.synced) {
    console.log('[Sweep] Node not connected or not synced — skipping')
    return { swept: 0, skipped: 0, errors: 0, details: [] }
  }

  // Get all deposit wallets on this network
  const wallets = await prisma.depositWallet.findMany({
    where: { network },
  })

  let swept = 0
  let skipped = 0
  let errors = 0
  const details: Array<{ address: string; amount: number; status: string }> = []

  for (const wallet of wallets) {
    try {
      const balance = await getAddressBalance(wallet.transparentAddr, network)
      const sweepAmount = roundZec(balance.confirmed)

      if (sweepAmount < MIN_SWEEP_AMOUNT) {
        skipped++
        continue
      }

      // Check for already-pending sweep on this address
      const pendingSweep = await prisma.sweepLog.findFirst({
        where: {
          depositWalletId: wallet.id,
          status: 'pending',
        },
      })

      if (pendingSweep) {
        skipped++
        details.push({
          address: wallet.transparentAddr,
          amount: sweepAmount,
          status: 'already-pending',
        })
        continue
      }

      // Send from deposit t-address → house z-address
      const { operationId } = await sendZec(
        wallet.transparentAddr,
        houseAddress,
        sweepAmount,
        undefined,
        network
      )

      // Record the sweep
      await prisma.sweepLog.create({
        data: {
          depositWalletId: wallet.id,
          fromAddress: wallet.transparentAddr,
          toAddress: houseAddress,
          amount: sweepAmount,
          operationId,
          status: 'pending',
        },
      })

      swept++
      details.push({
        address: wallet.transparentAddr,
        amount: sweepAmount,
        status: 'pending',
      })

      console.log(
        `[Sweep] Initiated sweep: ${sweepAmount} ZEC from ${wallet.transparentAddr.substring(0, 16)}... → house (opId: ${operationId})`
      )
    } catch (err) {
      errors++
      details.push({
        address: wallet.transparentAddr,
        amount: 0,
        status: `error: ${err instanceof Error ? err.message : 'unknown'}`,
      })
      console.error(`[Sweep] Error sweeping ${wallet.transparentAddr}:`, err)
    }
  }

  lastSweep = new Date()
  console.log(
    `[Sweep] Complete: ${swept} swept, ${skipped} skipped, ${errors} errors`
  )

  return { swept, skipped, errors, details }
}

/**
 * Check status of pending sweep operations.
 * Updates SweepLog records and DepositWallet tracking fields.
 */
export async function checkSweepStatus(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{
  confirmed: number
  failed: number
  stillPending: number
}> {
  const pendingSweeps = await prisma.sweepLog.findMany({
    where: { status: 'pending' },
  })

  let confirmed = 0
  let failed = 0
  let stillPending = 0

  for (const sweep of pendingSweeps) {
    if (!sweep.operationId) {
      failed++
      await prisma.sweepLog.update({
        where: { id: sweep.id },
        data: { status: 'failed', failReason: 'No operation ID' },
      })
      continue
    }

    try {
      const opStatus = await getOperationStatus(sweep.operationId, network)

      if (opStatus.status === 'success' && opStatus.txid) {
        await prisma.sweepLog.update({
          where: { id: sweep.id },
          data: {
            status: 'confirmed',
            txHash: opStatus.txid,
            confirmedAt: new Date(),
          },
        })

        // Update deposit wallet sweep tracking
        await prisma.depositWallet.update({
          where: { id: sweep.depositWalletId },
          data: {
            lastSweptAt: new Date(),
            totalSwept: { increment: sweep.amount },
            cachedBalance: 0,
            balanceUpdatedAt: new Date(),
          },
        })

        confirmed++
        console.log(
          `[Sweep] Confirmed: ${sweep.amount} ZEC from ${sweep.fromAddress.substring(0, 16)}... (tx: ${opStatus.txid.substring(0, 16)}...)`
        )
      } else if (opStatus.status === 'failed') {
        await prisma.sweepLog.update({
          where: { id: sweep.id },
          data: {
            status: 'failed',
            failReason: opStatus.error || 'Operation failed',
          },
        })
        failed++
        console.error(
          `[Sweep] Failed: ${sweep.fromAddress.substring(0, 16)}... — ${opStatus.error}`
        )
      } else {
        stillPending++
      }
    } catch (err) {
      console.error(`[Sweep] Error checking status for ${sweep.id}:`, err)
      stillPending++
    }
  }

  lastStatusCheck = new Date()
  cachedPendingSweeps = stillPending

  return { confirmed, failed, stillPending }
}

/**
 * Get sweep history for admin dashboard
 */
export async function getSweepHistory(limit: number = 20): Promise<{
  sweeps: Array<{
    id: string
    fromAddress: string
    toAddress: string
    amount: number
    fee: number
    status: string
    txHash: string | null
    failReason: string | null
    createdAt: Date
    confirmedAt: Date | null
  }>
  stats: {
    totalSwept: number
    totalFees: number
    pendingCount: number
    confirmedCount: number
    failedCount: number
  }
}> {
  const sweeps = await prisma.sweepLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const stats = await prisma.sweepLog.groupBy({
    by: ['status'],
    _sum: { amount: true, fee: true },
    _count: true,
  })

  let totalSwept = 0
  let totalFees = 0
  let pendingCount = 0
  let confirmedCount = 0
  let failedCount = 0

  for (const group of stats) {
    if (group.status === 'confirmed') {
      totalSwept += group._sum.amount || 0
      totalFees += group._sum.fee || 0
      confirmedCount = group._count
    } else if (group.status === 'pending') {
      pendingCount = group._count
    } else if (group.status === 'failed') {
      failedCount = group._count
    }
  }

  return {
    sweeps,
    stats: {
      totalSwept: roundZec(totalSwept),
      totalFees: roundZec(totalFees),
      pendingCount,
      confirmedCount,
      failedCount,
    },
  }
}

/**
 * Get service status
 */
export function getSweepServiceStatus(): SweepServiceStatus {
  return {
    isRunning,
    lastSweep,
    lastStatusCheck,
    pendingSweeps: cachedPendingSweeps,
  }
}

// ============================================================================
// Background Service Lifecycle
// ============================================================================

/**
 * Start the deposit sweep service
 */
export async function startSweepService(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<void> {
  if (isRunning) {
    console.log('[Sweep] Already running')
    return
  }

  console.log('[Sweep] Starting deposit sweep service...')
  isRunning = true

  // Check pending sweeps on startup
  try {
    await checkSweepStatus(network)
  } catch (error) {
    console.error('[Sweep] Initial status check failed:', error)
  }

  // Periodic sweep
  sweepIntervalId = setInterval(async () => {
    try {
      await sweepDeposits(network)
    } catch (error) {
      console.error('[Sweep] Periodic sweep failed:', error)
    }
  }, SWEEP_INTERVAL_MS)

  // Periodic status check for pending operations
  statusIntervalId = setInterval(async () => {
    try {
      await checkSweepStatus(network)
    } catch (error) {
      console.error('[Sweep] Periodic status check failed:', error)
    }
  }, STATUS_CHECK_INTERVAL_MS)

  console.log('[Sweep] Started successfully')
}

/**
 * Stop the deposit sweep service
 */
export function stopSweepService(): void {
  if (!isRunning) return

  console.log('[Sweep] Stopping...')

  if (sweepIntervalId) {
    clearInterval(sweepIntervalId)
    sweepIntervalId = null
  }
  if (statusIntervalId) {
    clearInterval(statusIntervalId)
    statusIntervalId = null
  }

  isRunning = false
  console.log('[Sweep] Stopped')
}

/**
 * Initialize for Next.js (hot-reload safe)
 */
export async function initSweepForNextJS(): Promise<void> {
  if (typeof window !== 'undefined') return

  const globalKey = '__DEPOSIT_SWEEP_SERVICE_INITIALIZED__'
  const globalWithInit = global as typeof global & { [key: string]: boolean }

  if (globalWithInit[globalKey]) {
    console.log('[Sweep] Already initialized (hot reload detected)')
    return
  }

  globalWithInit[globalKey] = true
  await startSweepService()
}
