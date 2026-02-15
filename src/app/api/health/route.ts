import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkNodeStatus, getAddressBalance } from '@/lib/wallet/rpc'
import { DEFAULT_NETWORK, getHouseAddress } from '@/lib/wallet'
import { isKillSwitchActive } from '@/lib/kill-switch'

// Severity thresholds
const POOL_LOW_THRESHOLD = 5
const BALANCE_WARN_THRESHOLD = parseFloat(process.env.HOUSE_BALANCE_ALERT_THRESHOLD || '0.5')

export async function GET() {
  const checks: Record<string, unknown> = {}
  let severity: 'ok' | 'warning' | 'critical' = 'ok'

  // Database check
  try {
    await prisma.session.count()
    checks.db = true
  } catch {
    checks.db = false
    severity = 'critical'
  }

  // Zcash node check
  try {
    const nodeStatus = await checkNodeStatus(DEFAULT_NETWORK)
    checks.zcashNode = {
      connected: nodeStatus.connected,
      synced: nodeStatus.synced,
      blockHeight: nodeStatus.blockHeight,
    }
    if (!nodeStatus.connected) {
      checks.zcashNodeWarning = 'Node not connected (demo mode may be active)'
    }
  } catch {
    checks.zcashNode = { connected: false, synced: false, blockHeight: 0 }
  }

  // Commitment pool check
  try {
    const available = await prisma.seedCommitment.count({
      where: { status: 'available' },
    })
    checks.commitmentPool = { available }
    if (available === 0) {
      severity = severity === 'critical' ? 'critical' : 'critical'
      checks.commitmentPoolWarning = 'Pool is empty — games cannot start'
    } else if (available < POOL_LOW_THRESHOLD) {
      if (severity === 'ok') severity = 'warning'
      checks.commitmentPoolWarning = 'Pool is low, games may experience delays'
    }
  } catch {
    checks.commitmentPool = { available: 0 }
  }

  // House wallet balance check
  try {
    const houseAddr = getHouseAddress(DEFAULT_NETWORK)
    if (houseAddr && !houseAddr.startsWith('ztestsapling1...')) {
      const balance = await getAddressBalance(houseAddr, DEFAULT_NETWORK)
      checks.houseBalance = {
        confirmed: balance.confirmed,
        pending: balance.pending,
      }
      // Use total (confirmed + pending) for the warning, since pending change
      // from self-send commitment txs is still fully under our control
      const totalBalance = balance.confirmed + balance.pending
      if (totalBalance < BALANCE_WARN_THRESHOLD) {
        if (severity === 'ok') severity = 'warning'
        checks.houseBalanceWarning = `House balance low: ${totalBalance} ZEC (${balance.confirmed} confirmed)`
      }
    }
  } catch {
    // Balance check failure is not critical — node may be offline
    checks.houseBalance = null
  }

  // Pending withdrawals check
  try {
    const pendingWithdrawals = await prisma.transaction.count({
      where: { type: 'withdrawal', status: { in: ['pending', 'pending_approval'] } },
    })
    checks.pendingWithdrawals = pendingWithdrawals
  } catch {
    checks.pendingWithdrawals = null
  }

  // Kill switch status
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
