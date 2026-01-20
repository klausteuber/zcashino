import { NextRequest, NextResponse } from 'next/server'
import {
  getPoolStatus,
  checkAndRefillPool,
  cleanupExpiredCommitments,
  initializePool
} from '@/lib/provably-fair/commitment-pool'

/**
 * GET /api/admin/pool - Get pool status
 */
export async function GET() {
  try {
    const status = await getPoolStatus()
    return NextResponse.json({
      success: true,
      ...status,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Pool status error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get pool status' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/pool - Pool management actions
 *
 * Body:
 * - action: 'refill' | 'cleanup' | 'init'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'refill': {
        console.log('[Admin] Manual pool refill triggered')
        await checkAndRefillPool()
        const status = await getPoolStatus()
        return NextResponse.json({ success: true, action: 'refill', status })
      }

      case 'cleanup': {
        console.log('[Admin] Manual cleanup triggered')
        const cleaned = await cleanupExpiredCommitments()
        const status = await getPoolStatus()
        return NextResponse.json({
          success: true,
          action: 'cleanup',
          cleaned,
          status
        })
      }

      case 'init': {
        console.log('[Admin] Manual pool initialization triggered')
        await initializePool()
        const status = await getPoolStatus()
        return NextResponse.json({ success: true, action: 'init', status })
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: refill, cleanup, or init' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Pool action error:', error)
    return NextResponse.json(
      { success: false, error: 'Pool action failed' },
      { status: 500 }
    )
  }
}
