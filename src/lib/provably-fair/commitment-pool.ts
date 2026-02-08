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

// Configuration
const POOL_MIN_SIZE = 5 // Minimum available commitments before refill
const POOL_TARGET_SIZE = 15 // Target number of available commitments
const COMMITMENT_EXPIRY_HOURS = 24 // Commitments expire after 24 hours
const REFILL_BATCH_SIZE = 5 // Number of commitments to generate per batch

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
 * Get an available commitment from the pool
 * Returns null if pool is empty (should trigger refill)
 */
export async function getAvailableCommitment(): Promise<PooledCommitment | null> {
  try {
    // Find and claim an available commitment atomically
    const commitment = await prisma.seedCommitment.findFirst({
      where: {
        status: 'available',
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'asc' } // Use oldest first (FIFO)
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
 */
export async function markCommitmentUsed(
  commitmentId: string,
  gameId: string
): Promise<boolean> {
  try {
    await prisma.seedCommitment.update({
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
 * Generate new commitments and add to pool
 */
export async function refillPool(
  count: number = REFILL_BATCH_SIZE,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0

  console.log(`[CommitmentPool] Refilling pool with ${count} commitments...`)

  for (let i = 0; i < count; i++) {
    try {
      // Generate seed and hash
      const serverSeed = generateServerSeed()
      const serverSeedHash = await hashServerSeed(serverSeed)

      // Commit to blockchain
      const result = await commitServerSeedHash(serverSeedHash, network)

      if (!result.success || !result.txHash) {
        console.error(`[CommitmentPool] Commitment ${i + 1}/${count} failed:`, result.error)
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
      console.log(`[CommitmentPool] Commitment ${i + 1}/${count} created: ${result.txHash.substring(0, 16)}...`)
    } catch (error) {
      console.error(`[CommitmentPool] Error creating commitment ${i + 1}/${count}:`, error)
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
      isHealthy: available >= POOL_MIN_SIZE,
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

  const status = await getPoolStatus()

  if (status.available < POOL_MIN_SIZE) {
    const needed = POOL_TARGET_SIZE - status.available
    console.log(`[CommitmentPool] Pool low (${status.available}/${POOL_MIN_SIZE}), refilling ${needed} commitments`)
    await refillPool(needed, network)
  }
}

/**
 * Clean up expired commitments
 */
export async function cleanupExpiredCommitments(): Promise<number> {
  try {
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

  // Clean up any expired commitments first
  await cleanupExpiredCommitments()

  // Check current status
  const status = await getPoolStatus()
  console.log(`[CommitmentPool] Current status: ${status.available} available, ${status.used} used, ${status.expired} expired`)

  // Refill if needed
  if (status.available < POOL_TARGET_SIZE) {
    const needed = POOL_TARGET_SIZE - status.available
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

    // Store in database as already used (no expiry needed)
    const commitment = await prisma.seedCommitment.create({
      data: {
        serverSeed,
        serverSeedHash,
        txHash: result.txHash,
        blockHeight: result.blockHeight || 0,
        blockTimestamp: result.blockTimestamp || new Date(),
        status: 'used', // Mark as used immediately
        expiresAt: new Date() // Already expired/used
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
