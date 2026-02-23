import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkNodeStatus, getWalletBalance } from '@/lib/wallet/rpc'
import { DEFAULT_NETWORK } from '@/lib/wallet'
import { isKillSwitchActive } from '@/lib/kill-switch'
import { getProvablyFairMode } from '@/lib/provably-fair/mode'
import { getSessionSeedPoolStatus } from '@/lib/services/session-seed-pool-manager'

// Severity thresholds
const POOL_LOW_THRESHOLD = 5
const BALANCE_WARN_THRESHOLD = parseFloat(process.env.HOUSE_BALANCE_ALERT_THRESHOLD || '0.5')

// Max time the health endpoint should take to respond.
// Keeps monitoring scripts (curl --max-time 15) from timing out.
const HEALTH_RPC_TIMEOUT_MS = 8_000

export async function GET() {
  const checks: Record<string, unknown> = {}
  let severity: 'ok' | 'warning' | 'critical' = 'ok'

  // Run all checks in parallel so a slow zcashd RPC doesn't block the
  // entire response.  Each check has its own error handling.

  const [dbResult, nodeResult, poolResult, balanceResult, withdrawalResult] =
    await Promise.allSettled([
      // 1. Database check
      prisma.session.count(),

      // 2. Zcash node check (uses 5s liveness timeout internally)
      checkNodeStatus(DEFAULT_NETWORK),

      // 3. Seed / commitment pool check
      (async () => {
        const fairnessMode = getProvablyFairMode()
        if (fairnessMode === 'session_nonce_v1') {
          return { mode: fairnessMode, seedPool: await getSessionSeedPoolStatus() }
        }
        const now = new Date()
        const available = await prisma.seedCommitment.count({
          where: { status: 'available', expiresAt: { gt: now } },
        })
        return { mode: fairnessMode, commitmentPool: { available } }
      })(),

      // 4. House wallet balance — short timeout so the health endpoint
      //    responds quickly even when zcashd is overloaded.
      raceTimeout(
        getWalletBalance(DEFAULT_NETWORK),
        HEALTH_RPC_TIMEOUT_MS,
        null
      ),

      // 5. Pending withdrawals count
      prisma.transaction.count({
        where: { type: 'withdrawal', status: { in: ['pending', 'pending_approval'] } },
      }),
    ])

  // --- Process results ---

  // DB
  if (dbResult.status === 'fulfilled') {
    checks.db = true
  } else {
    checks.db = false
    severity = 'critical'
  }

  // Zcash node
  if (nodeResult.status === 'fulfilled') {
    const nodeStatus = nodeResult.value
    checks.zcashNode = {
      connected: nodeStatus.connected,
      synced: nodeStatus.synced,
      blockHeight: nodeStatus.blockHeight,
    }
    if (!nodeStatus.connected) {
      checks.zcashNodeWarning = 'Node not connected (demo mode may be active)'
    }
  } else {
    checks.zcashNode = { connected: false, synced: false, blockHeight: 0 }
  }

  // Seed / commitment pool
  if (poolResult.status === 'fulfilled') {
    const poolData = poolResult.value
    checks.fairnessMode = poolData.mode

    if ('seedPool' in poolData) {
      checks.sessionSeedPool = poolData.seedPool
      if (poolData.seedPool.available === 0) {
        severity = 'critical'
        checks.sessionSeedPoolWarning = 'Session seed pool is empty — new seed streams cannot start'
      } else if (poolData.seedPool.available < POOL_LOW_THRESHOLD) {
        if (severity === 'ok') severity = 'warning'
        checks.sessionSeedPoolWarning = 'Session seed pool is low, rotations may experience delays'
      }
    } else if ('commitmentPool' in poolData) {
      checks.commitmentPool = poolData.commitmentPool
      if (poolData.commitmentPool.available === 0) {
        severity = 'critical'
        checks.commitmentPoolWarning = 'Pool is empty — games cannot start'
      } else if (poolData.commitmentPool.available < POOL_LOW_THRESHOLD) {
        if (severity === 'ok') severity = 'warning'
        checks.commitmentPoolWarning = 'Pool is low, games may experience delays'
      }
    }
  } else {
    checks.commitmentPool = { available: 0 }
  }

  // House balance
  if (balanceResult.status === 'fulfilled' && balanceResult.value != null) {
    const balance = balanceResult.value
    checks.houseBalance = {
      confirmed: balance.confirmed,
      pending: balance.pending,
    }
    const totalBalance = balance.confirmed + balance.pending
    if (totalBalance < BALANCE_WARN_THRESHOLD) {
      if (severity === 'ok') severity = 'warning'
      checks.houseBalanceWarning = `House balance low: ${totalBalance} ZEC (${balance.confirmed} confirmed)`
    }
  } else {
    // Balance unavailable (RPC timeout or error) — not critical
    checks.houseBalance = null
  }

  // Pending withdrawals
  if (withdrawalResult.status === 'fulfilled') {
    checks.pendingWithdrawals = withdrawalResult.value
  } else {
    checks.pendingWithdrawals = null
  }

  // Kill switch (synchronous, always available)
  checks.killSwitch = isKillSwitchActive()

  const healthy = severity !== 'critical'

  return NextResponse.json(
    {
      status: severity,
      timestamp: new Date().toISOString(),
      network: DEFAULT_NETWORK,
      ...checks,
    },
    { status: healthy ? 200 : 503 }
  )
}

/**
 * Race a promise against a timeout.  Returns the fallback value if the
 * promise doesn't settle within `ms` milliseconds.
 */
function raceTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}
