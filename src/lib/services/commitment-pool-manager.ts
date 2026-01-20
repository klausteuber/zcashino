/**
 * Commitment Pool Manager
 *
 * Background service that maintains the commitment pool for provably fair games.
 * Runs periodically to:
 * - Refill the pool when running low
 * - Clean up expired commitments
 * - Monitor pool health
 *
 * In production, this would run as:
 * - A cron job (e.g., every 5 minutes)
 * - A Next.js middleware that checks on each request
 * - A separate worker process
 */

import {
  initializePool,
  checkAndRefillPool,
  cleanupExpiredCommitments,
  getPoolStatus
} from '@/lib/provably-fair/commitment-pool'
import { DEFAULT_NETWORK } from '@/lib/wallet'
import type { ZcashNetwork } from '@/types'

// Configuration
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

let isRunning = false
let checkIntervalId: ReturnType<typeof setInterval> | null = null
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null

export interface PoolManagerStatus {
  isRunning: boolean
  lastCheck: Date | null
  lastCleanup: Date | null
  poolStatus: {
    available: number
    used: number
    expired: number
    total: number
    isHealthy: boolean
    blockchainAvailable: boolean
  } | null
}

let lastCheck: Date | null = null
let lastCleanup: Date | null = null
let cachedPoolStatus: PoolManagerStatus['poolStatus'] | null = null

/**
 * Start the commitment pool manager
 * Should be called once at application startup
 */
export async function startPoolManager(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<void> {
  if (isRunning) {
    console.log('[PoolManager] Already running')
    return
  }

  console.log('[PoolManager] Starting commitment pool manager...')
  isRunning = true

  // Initialize pool on startup
  try {
    await initializePool(network)
    lastCheck = new Date()
    cachedPoolStatus = await getPoolStatus()
  } catch (error) {
    console.error('[PoolManager] Initialization failed:', error)
  }

  // Set up periodic check interval
  checkIntervalId = setInterval(async () => {
    try {
      await checkAndRefillPool(network)
      lastCheck = new Date()
      cachedPoolStatus = await getPoolStatus()
    } catch (error) {
      console.error('[PoolManager] Periodic check failed:', error)
    }
  }, CHECK_INTERVAL_MS)

  // Set up periodic cleanup interval
  cleanupIntervalId = setInterval(async () => {
    try {
      const cleaned = await cleanupExpiredCommitments()
      lastCleanup = new Date()
      if (cleaned > 0) {
        console.log(`[PoolManager] Cleaned up ${cleaned} expired commitments`)
        cachedPoolStatus = await getPoolStatus()
      }
    } catch (error) {
      console.error('[PoolManager] Cleanup failed:', error)
    }
  }, CLEANUP_INTERVAL_MS)

  console.log('[PoolManager] Started successfully')
}

/**
 * Stop the commitment pool manager
 */
export function stopPoolManager(): void {
  if (!isRunning) {
    return
  }

  console.log('[PoolManager] Stopping...')

  if (checkIntervalId) {
    clearInterval(checkIntervalId)
    checkIntervalId = null
  }

  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = null
  }

  isRunning = false
  console.log('[PoolManager] Stopped')
}

/**
 * Get current manager status
 */
export function getManagerStatus(): PoolManagerStatus {
  return {
    isRunning,
    lastCheck,
    lastCleanup,
    poolStatus: cachedPoolStatus
  }
}

/**
 * Trigger an immediate pool check (useful for API endpoints)
 */
export async function triggerPoolCheck(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<PoolManagerStatus['poolStatus']> {
  try {
    await checkAndRefillPool(network)
    lastCheck = new Date()
    cachedPoolStatus = await getPoolStatus()
    return cachedPoolStatus
  } catch (error) {
    console.error('[PoolManager] Manual check failed:', error)
    return cachedPoolStatus
  }
}

/**
 * Middleware-style check that can be called on each request
 * Non-blocking, just triggers refill if needed
 */
export function ensurePoolHealthy(
  network: ZcashNetwork = DEFAULT_NETWORK
): void {
  // Don't block the request, just check in background
  if (cachedPoolStatus && !cachedPoolStatus.isHealthy) {
    console.log('[PoolManager] Pool unhealthy, triggering refill...')
    checkAndRefillPool(network).catch(err =>
      console.error('[PoolManager] Background refill failed:', err)
    )
  }
}

// ============================================================================
// Next.js Integration Helpers
// ============================================================================

/**
 * Initialize pool manager for Next.js
 * Call this from a server-side initialization file
 */
export async function initForNextJS(): Promise<void> {
  // Only run on server
  if (typeof window !== 'undefined') {
    return
  }

  // Check if already initialized (hot reload protection)
  const globalKey = '__COMMITMENT_POOL_MANAGER_INITIALIZED__'
  const globalWithInit = global as typeof global & { [key: string]: boolean }

  if (globalWithInit[globalKey]) {
    console.log('[PoolManager] Already initialized (hot reload detected)')
    return
  }

  globalWithInit[globalKey] = true
  await startPoolManager()
}

/**
 * API route handler for pool status
 * Can be mounted at /api/admin/pool-status
 */
export async function handlePoolStatusRequest(): Promise<Response> {
  const status = getManagerStatus()
  return new Response(JSON.stringify(status), {
    headers: { 'Content-Type': 'application/json' }
  })
}

/**
 * API route handler for manual pool refill
 * Can be mounted at /api/admin/pool-refill (POST)
 */
export async function handlePoolRefillRequest(): Promise<Response> {
  try {
    const status = await triggerPoolCheck()
    return new Response(JSON.stringify({ success: true, status }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
