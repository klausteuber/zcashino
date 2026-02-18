/**
 * Commitment Pool Service
 *
 * Manages a pool of pre-generated blockchain commitments for provably fair games.
 * Pre-generating commitments allows instant game starts without waiting for
 * blockchain confirmation during gameplay.
 *
 * Pool lifecycle:
 * 1. Generate server seeds and hashes
 * 2. Commit hashes to blockchain (async, in background)
 * 3. Store confirmed commitments in database
 * 4. Games consume commitments from pool
 * 5. Expired/unused commitments are cleaned up
 */

import prisma from '@/lib/db'
import { generateServerSeed, hashServerSeed } from './index'
import { commitServerSeedHash, isBlockchainAvailable } from './blockchain'
import type { ZcashNetwork } from '@/types'
import { DEFAULT_NETWORK } from '@/lib/wallet'
import type { Prisma } from '@prisma/client'
import { getAdminSettings } from '@/lib/admin/runtime-settings'

// Configuration
const COMMITMENT_EXPIRY_HOURS = 24 // Commitments expire after 24 hours
const REFILL_BATCH_SIZE = 5 // Number of commitments to generate per batch
const CLAIM_STALE_TIMEOUT_MINUTES = 5 // Reclaim claimed commitments stuck past this age

let refillInFlight: Promise<void> | null = null

export interface PooledCommitment {
  id: string
  serverSeed: string
  serverSeedHash: string
  txHash: string
  blockHeight: number
  blockTimestamp: Date
}

export interface PoolStatus {
  available: number
  used: number
  expired: number
  total: number
  isHealthy: boolean
  blockchainAvailable: boolean
}

/**
 * Get an available commitment from the pool (ATOMIC)
 *
 * Uses a Prisma interactive transaction to atomically find AND claim
 * a commitment. This prevents race conditions where two concurrent
 * game starts could claim the same commitment (which would reuse the
 * same server seed — a provably fair violation).
 *
 * Returns null if pool is empty (should trigger refill)
 */
export async function getAvailableCommitment(): Promise<PooledCommitment | null> {
  try {
    const commitment = await prisma.$transaction(async (tx) => {
      // Find oldest available commitment
      const found = await tx.seedCommitment.findFirst({
        where: {
          status: 'available',
          expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: 'asc' } // FIFO
      })

      if (!found) return null

      // Atomically claim it — only succeeds if status is still 'available'
      const claimed = await tx.seedCommitment.updateMany({
        where: {
          id: found.id,
          status: 'available' // Guard: another request may have claimed it
        },
        data: {
          status: 'claimed',
          usedAt: new Date()
        }
      })

      // If 0 rows updated, another concurrent request won the race
      if (claimed.count === 0) return null

      return found
    })

    if (!commitment) {
      console.warn('[CommitmentPool] No available commitments in pool')
      return null
    }

    return {
      id: commitment.id,
      serverSeed: commitment.serverSeed,
      serverSeedHash: commitment.serverSeedHash,
      txHash: commitment.txHash,
      blockHeight: commitment.blockHeight,
      blockTimestamp: commitment.blockTimestamp
    }
  } catch (error) {
    console.error('[CommitmentPool] Error getting commitment:', error)
    return null
  }
}

/**
 * Mark a commitment as used by a game
 * Transitions from 'claimed' → 'used' (set by getAvailableCommitment)
 */
export async function markCommitmentUsed(
  commitmentId: string,
  gameId: string,
  tx?: Prisma.TransactionClient
): Promise<boolean> {
  try {
    const client = tx ?? prisma
    await client.seedCommitment.update({
      where: { id: commitmentId },
      data: {
        status: 'used',
        usedByGameId: gameId,
        usedAt: new Date()
      }
    })
    return true
  } catch (error) {
    console.error('[CommitmentPool] Error marking commitment used:', error)
    return false
  }
}

/**
 * Release a claimed commitment back to available if a game could not start.
 */
export async function releaseClaimedCommitment(
  commitmentId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? prisma
  await client.seedCommitment.updateMany({
    where: {
      id: commitmentId,
      status: 'claimed',
    },
    data: {
      status: 'available',
      usedAt: null,
      usedByGameId: null,
    },
  })
}

/**
 * Reclaim commitments stuck in 'claimed' state (e.g., crashed request before mark/release).
 */
export async function reclaimStaleClaimedCommitments(): Promise<number> {
  const cutoff = new Date(Date.now() - CLAIM_STALE_TIMEOUT_MINUTES * 60 * 1000)
  const result = await prisma.seedCommitment.updateMany({
    where: {
      status: 'claimed',
      usedByGameId: null,
      usedAt: { lt: cutoff },
      expiresAt: { gt: new Date() },
    },
    data: {
      status: 'available',
      usedAt: null,
    },
  })

  if (result.count > 0) {
    console.warn(`[CommitmentPool] Reclaimed ${result.count} stale claimed commitments`)
  }

  return result.count
}

/**
 * Generate new commitments and add to pool
 */
export async function refillPool(
  count: number = REFILL_BATCH_SIZE,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0

  // Attempt a bounded batch. If Sapling witness constraints block subsequent
  // spends, we detect "Missing witness" and stop early.
  const effectiveCount = Math.max(0, Math.min(count, REFILL_BATCH_SIZE))

  if (effectiveCount === 0) {
    return { success: 0, failed: 0 }
  }

  console.log(`[CommitmentPool] Refilling pool (creating up to ${effectiveCount} of ${count} needed)...`)

  for (let i = 0; i < effectiveCount; i++) {
    try {
      // Generate seed and hash
      const serverSeed = generateServerSeed()
      const serverSeedHash = await hashServerSeed(serverSeed)

      // Commit to blockchain
      const result = await commitServerSeedHash(serverSeedHash, network)

      if (!result.success || !result.txHash) {
        const errorMsg = result.error || 'Unknown error'
        console.error(`[CommitmentPool] Commitment ${i + 1} failed:`, errorMsg)

        // "Missing witness" means all balance is in unconfirmed Sapling notes.
        // No point retrying — must wait for the next block to anchor the witness.
        if (errorMsg.includes('Missing witness')) {
          console.log('[CommitmentPool] Waiting for Sapling note confirmation before next attempt')
          failed += (effectiveCount - i)
          break
        }

        failed++
        continue
      }

      // Store in database
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + COMMITMENT_EXPIRY_HOURS)

      await prisma.seedCommitment.create({
        data: {
          serverSeed,
          serverSeedHash,
          txHash: result.txHash,
          blockHeight: result.blockHeight || 0,
          blockTimestamp: result.blockTimestamp || new Date(),
          status: 'available',
          expiresAt
        }
      })

      success++
      console.log(`[CommitmentPool] Commitment created: ${result.txHash.substring(0, 16)}...`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[CommitmentPool] Error creating commitment:`, errorMsg)

      // Stop on witness errors
      if (errorMsg.includes('Missing witness')) {
        console.log('[CommitmentPool] Waiting for Sapling note confirmation before next attempt')
        failed += (effectiveCount - i)
        break
      }

      failed++
    }
  }

  console.log(`[CommitmentPool] Refill complete: ${success} success, ${failed} failed`)
  return { success, failed }
}

/**
 * Get current pool status
 */
export async function getPoolStatus(): Promise<PoolStatus> {
  try {
    const now = new Date()
    const settings = await getAdminSettings()
    const minHealthy = settings.pool.minHealthy

    const [available, used, expired, total] = await Promise.all([
      prisma.seedCommitment.count({
        where: { status: 'available', expiresAt: { gt: now } }
      }),
      prisma.seedCommitment.count({
        where: { status: 'used' }
      }),
      prisma.seedCommitment.count({
        where: {
          OR: [
            { status: 'expired' },
            { status: 'available', expiresAt: { lte: now } }
          ]
        }
      }),
      prisma.seedCommitment.count()
    ])

    const blockchainAvailable = await isBlockchainAvailable()

    return {
      available,
      used,
      expired,
      total,
      isHealthy: available >= minHealthy,
      blockchainAvailable
    }
  } catch (error) {
    console.error('[CommitmentPool] Error getting pool status:', error)
    return {
      available: 0,
      used: 0,
      expired: 0,
      total: 0,
      isHealthy: false,
      blockchainAvailable: false
    }
  }
}

/**
 * Check if pool needs refilling and refill if necessary
 */
export async function checkAndRefillPool(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<void> {
  // In demo mode, skip pool refill - mock commitments are created on-demand
  if (process.env.DEMO_MODE === 'true') {
    return
  }

  if (refillInFlight) {
    await refillInFlight
    return
  }

  refillInFlight = (async () => {
    const settings = await getAdminSettings()
    const autoRefillThreshold = settings.pool.autoRefillThreshold
    const targetSize = settings.pool.targetSize

    await reclaimStaleClaimedCommitments().catch((error) => {
      console.error('[CommitmentPool] Failed to reclaim stale claimed commitments:', error)
    })

    const status = await getPoolStatus()

    if (status.available <= autoRefillThreshold) {
      const needed = targetSize - status.available
      if (needed <= 0) return
      console.log(`[CommitmentPool] Pool low (${status.available}/${autoRefillThreshold}), refilling ${needed} commitments`)
      await refillPool(needed, network)
    }
  })()

  try {
    await refillInFlight
  } finally {
    refillInFlight = null
  }
}

/**
 * Clean up expired commitments
 */
export async function cleanupExpiredCommitments(): Promise<number> {
  try {
    await reclaimStaleClaimedCommitments()

    const result = await prisma.seedCommitment.updateMany({
      where: {
        status: 'available',
        expiresAt: { lte: new Date() }
      },
      data: {
        status: 'expired'
      }
    })

    if (result.count > 0) {
      console.log(`[CommitmentPool] Marked ${result.count} commitments as expired`)
    }

    return result.count
  } catch (error) {
    console.error('[CommitmentPool] Error cleaning up commitments:', error)
    return 0
  }
}

/**
 * Initialize the pool on startup
 * Creates initial commitments if pool is empty
 */
export async function initializePool(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<void> {
  // In demo mode, skip pool initialization - mock commitments are created on-demand
  if (process.env.DEMO_MODE === 'true') {
    console.log('[CommitmentPool] DEMO_MODE enabled, skipping pool initialization (using on-demand mock commitments)')
    return
  }

  console.log('[CommitmentPool] Initializing commitment pool...')

  const settings = await getAdminSettings()
  const targetSize = settings.pool.targetSize

  // Clean up any expired commitments first
  await cleanupExpiredCommitments()

  // Check current status
  const status = await getPoolStatus()
  console.log(`[CommitmentPool] Current status: ${status.available} available, ${status.used} used, ${status.expired} expired`)

  // Refill if needed
  if (status.available < targetSize) {
    const needed = targetSize - status.available
    console.log(`[CommitmentPool] Generating ${needed} initial commitments...`)
    await refillPool(needed, network)
  } else {
    console.log('[CommitmentPool] Pool is healthy, no refill needed')
  }
}

/**
 * Create a fallback commitment when pool is empty
 * This is synchronous and slower but ensures games can always start
 */
export async function createFallbackCommitment(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<PooledCommitment | null> {
  console.warn('[CommitmentPool] Creating fallback commitment (pool was empty)')

  try {
    const serverSeed = generateServerSeed()
    const serverSeedHash = await hashServerSeed(serverSeed)
    const result = await commitServerSeedHash(serverSeedHash, network)

    if (!result.success || !result.txHash) {
      console.error('[CommitmentPool] Fallback commitment failed:', result.error)
      return null
    }

    // Store as claimed so normal mark/release flow works if game creation fails.
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + COMMITMENT_EXPIRY_HOURS)

    const commitment = await prisma.seedCommitment.create({
      data: {
        serverSeed,
        serverSeedHash,
        txHash: result.txHash,
        blockHeight: result.blockHeight || 0,
        blockTimestamp: result.blockTimestamp || new Date(),
        status: 'claimed',
        usedAt: new Date(),
        expiresAt,
      }
    })

    return {
      id: commitment.id,
      serverSeed,
      serverSeedHash,
      txHash: result.txHash,
      blockHeight: result.blockHeight || 0,
      blockTimestamp: result.blockTimestamp || new Date()
    }
  } catch (error) {
    console.error('[CommitmentPool] Fallback commitment error:', error)
    return null
  }
}

/**
 * Get or create a commitment for a new game
 * Tries pool first, falls back to on-demand creation
 */
export async function getOrCreateCommitment(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<PooledCommitment | null> {
  // Try to get from pool first
  const pooled = await getAvailableCommitment()
  if (pooled) {
    return pooled
  }

  // Fall back to on-demand creation
  console.warn('[CommitmentPool] Pool empty, creating on-demand commitment')
  return createFallbackCommitment(network)
}
