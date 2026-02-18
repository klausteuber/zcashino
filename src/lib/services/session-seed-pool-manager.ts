import prisma from '@/lib/db'
import type { ZcashNetwork } from '@/types'
import { DEFAULT_NETWORK } from '@/lib/wallet'
import { createAnchoredFairnessSeed } from '@/lib/provably-fair/session-fairness'
import { getAdminSettings } from '@/lib/admin/runtime-settings'

const SESSION_SEED_POOL_CHECK_INTERVAL_MS = parseInt(process.env.SESSION_SEED_POOL_CHECK_INTERVAL_MS || '300000', 10)
const SESSION_SEED_REFILL_MAX_PER_RUN = 1

const FAIRNESS_SEED_STATUS = {
  AVAILABLE: 'available',
  ASSIGNED: 'assigned',
  REVEALED: 'revealed',
  EXPIRED: 'expired',
} as const

let isRunning = false
let checkIntervalId: ReturnType<typeof setInterval> | null = null

export interface SessionSeedPoolStatus {
  available: number
  assigned: number
  revealed: number
  expired: number
  total: number
  isHealthy: boolean
}

export interface SessionSeedPoolManagerStatus {
  isRunning: boolean
  lastCheck: Date | null
  poolStatus: SessionSeedPoolStatus | null
}

let lastCheck: Date | null = null
let cachedPoolStatus: SessionSeedPoolStatus | null = null
let refillInFlight: Promise<void> | null = null

async function getPoolTuning(): Promise<{ minHealthy: number; autoRefillThreshold: number; targetSize: number }> {
  const settings = await getAdminSettings()
  return {
    minHealthy: settings.pool.minHealthy,
    autoRefillThreshold: settings.pool.autoRefillThreshold,
    targetSize: settings.pool.targetSize,
  }
}

export async function getSessionSeedPoolStatus(): Promise<SessionSeedPoolStatus> {
  const tuning = await getPoolTuning()
  const [available, assigned, revealed, expired, total] = await Promise.all([
    prisma.fairnessSeed.count({ where: { status: FAIRNESS_SEED_STATUS.AVAILABLE } }),
    prisma.fairnessSeed.count({ where: { status: FAIRNESS_SEED_STATUS.ASSIGNED } }),
    prisma.fairnessSeed.count({ where: { status: FAIRNESS_SEED_STATUS.REVEALED } }),
    prisma.fairnessSeed.count({ where: { status: FAIRNESS_SEED_STATUS.EXPIRED } }),
    prisma.fairnessSeed.count(),
  ])

  return {
    available,
    assigned,
    revealed,
    expired,
    total,
    isHealthy: available >= tuning.minHealthy,
  }
}

export async function checkAndRefillSessionSeedPool(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<void> {
  if (refillInFlight) {
    return refillInFlight
  }

  refillInFlight = (async () => {
    const tuning = await getPoolTuning()
    const status = await getSessionSeedPoolStatus()
    cachedPoolStatus = status

    // Only refill when the pool is at/below the configured threshold.
    // This avoids constantly creating new commitments when the pool is only slightly below target.
    if (status.available > tuning.autoRefillThreshold) {
      return
    }

    const needed = Math.max(0, tuning.targetSize - status.available)
    if (needed === 0) return
    const toCreate = Math.min(needed, SESSION_SEED_REFILL_MAX_PER_RUN)

    for (let i = 0; i < toCreate; i++) {
      const created = await createAnchoredFairnessSeed(network)
      if (!created) {
        console.warn('[SessionSeedPoolManager] Seed creation failed during refill run', {
          network,
          available: status.available,
          target: tuning.targetSize,
        })
        break
      }
    }

    cachedPoolStatus = await getSessionSeedPoolStatus()
  })()

  try {
    await refillInFlight
  } finally {
    refillInFlight = null
  }
}

export async function initializeSessionSeedPool(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<void> {
  await checkAndRefillSessionSeedPool(network)
}

export async function startSessionSeedPoolManager(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<void> {
  if (isRunning) {
    return
  }

  isRunning = true

  try {
    await initializeSessionSeedPool(network)
    lastCheck = new Date()
    cachedPoolStatus = await getSessionSeedPoolStatus()
  } catch (error) {
    console.error('[SessionSeedPoolManager] Initialization failed:', error)
  }

  checkIntervalId = setInterval(async () => {
    try {
      await checkAndRefillSessionSeedPool(network)
      lastCheck = new Date()
      cachedPoolStatus = await getSessionSeedPoolStatus()
    } catch (error) {
      console.error('[SessionSeedPoolManager] Periodic refill failed:', error)
    }
  }, SESSION_SEED_POOL_CHECK_INTERVAL_MS)
}

export function stopSessionSeedPoolManager(): void {
  if (!isRunning) {
    return
  }

  if (checkIntervalId) {
    clearInterval(checkIntervalId)
    checkIntervalId = null
  }

  isRunning = false
}

export function getSessionSeedPoolManagerStatus(): SessionSeedPoolManagerStatus {
  return {
    isRunning,
    lastCheck,
    poolStatus: cachedPoolStatus,
  }
}

export async function triggerSessionSeedPoolCheck(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<SessionSeedPoolStatus | null> {
  await checkAndRefillSessionSeedPool(network)
  lastCheck = new Date()
  cachedPoolStatus = await getSessionSeedPoolStatus()
  return cachedPoolStatus
}

export async function initSessionSeedPoolForNextJS(): Promise<void> {
  if (typeof window !== 'undefined') {
    return
  }

  const globalKey = '__SESSION_SEED_POOL_MANAGER_INITIALIZED__'
  const globalWithInit = global as typeof global & { [key: string]: boolean }

  if (globalWithInit[globalKey]) {
    return
  }

  globalWithInit[globalKey] = true
  await startSessionSeedPoolManager()
}
