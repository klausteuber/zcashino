import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkNodeStatus } from '@/lib/wallet/rpc'
import { DEFAULT_NETWORK } from '@/lib/wallet'

export async function GET() {
  const checks: Record<string, unknown> = {}
  let healthy = true

  // Database check
  try {
    await prisma.session.count()
    checks.db = true
  } catch {
    checks.db = false
    healthy = false
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
      // Node being down is not a hard failure in demo mode
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
    if (available < 5) {
      checks.commitmentPoolWarning = 'Pool is low, games may experience delays'
    }
  } catch {
    checks.commitmentPool = { available: 0 }
  }

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      ...checks,
    },
    { status: healthy ? 200 : 503 }
  )
}
