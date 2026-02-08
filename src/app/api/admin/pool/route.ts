import { NextRequest, NextResponse } from 'next/server'
import {
  getPoolStatus,
  checkAndRefillPool,
  cleanupExpiredCommitments,
  initializePool
} from '@/lib/provably-fair/commitment-pool'
import prisma from '@/lib/db'
import { getOperationStatus } from '@/lib/wallet/rpc'
import { DEFAULT_NETWORK } from '@/lib/wallet'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'

/**
 * GET /api/admin/pool - Get pool status
 */
export async function GET(request: NextRequest) {
  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.pool.status',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const adminCheck = requireAdmin(request)
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.pool.status',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const status = await getPoolStatus()
    await logAdminEvent({
      request,
      action: 'admin.pool.status',
      success: true,
      actor: adminCheck.session.username,
      details: 'Pool status fetched',
    })
    return NextResponse.json({
      success: true,
      ...status,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Pool status error:', error)
    await logAdminEvent({
      request,
      action: 'admin.pool.status',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Pool status fetch failed',
    })
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
  const actionLimit = checkAdminRateLimit(request, 'admin-action')
  if (!actionLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.pool.action',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: actionLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(actionLimit)
  }

  const adminCheck = requireAdmin(request)
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.pool.action',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'refill': {
        console.log('[Admin] Manual pool refill triggered')
        await checkAndRefillPool()
        const status = await getPoolStatus()
        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Pool refill completed',
          metadata: { adminAction: action },
        })
        return NextResponse.json({ success: true, action: 'refill', status })
      }

      case 'cleanup': {
        console.log('[Admin] Manual cleanup triggered')
        const cleaned = await cleanupExpiredCommitments()
        const status = await getPoolStatus()
        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Pool cleanup completed',
          metadata: { adminAction: action, cleaned },
        })
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
        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Pool initialized',
          metadata: { adminAction: action },
        })
        return NextResponse.json({ success: true, action: 'init', status })
      }

      case 'process-withdrawals': {
        console.log('[Admin] Processing pending withdrawals')
        const pendingTxs = await prisma.transaction.findMany({
          where: {
            type: 'withdrawal',
            status: 'pending',
            operationId: { not: null },
          },
        })

        const results: Array<{ id: string; result: string }> = []
        const network = DEFAULT_NETWORK

        for (const tx of pendingTxs) {
          try {
            const opStatus = await getOperationStatus(tx.operationId!, network)

            if (opStatus.status === 'success' && opStatus.txid) {
              await prisma.transaction.update({
                where: { id: tx.id },
                data: {
                  status: 'confirmed',
                  txHash: opStatus.txid,
                  confirmedAt: new Date(),
                },
              })
              results.push({ id: tx.id, result: 'confirmed' })
            } else if (opStatus.status === 'failed') {
              const totalAmount = tx.amount + tx.fee
              await prisma.session.update({
                where: { id: tx.sessionId },
                data: {
                  balance: { increment: totalAmount },
                  totalWithdrawn: { decrement: tx.amount },
                },
              })
              await prisma.transaction.update({
                where: { id: tx.id },
                data: {
                  status: 'failed',
                  failReason: opStatus.error || 'Operation failed',
                },
              })
              results.push({ id: tx.id, result: 'failed-refunded' })
            } else {
              results.push({ id: tx.id, result: 'still-pending' })
            }
          } catch (err) {
            results.push({
              id: tx.id,
              result: `error: ${err instanceof Error ? err.message : 'unknown'}`,
            })
          }
        }

        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Processed pending withdrawals',
          metadata: { adminAction: action, total: pendingTxs.length },
        })

        return NextResponse.json({
          success: true,
          action: 'process-withdrawals',
          processed: results,
          total: pendingTxs.length,
        })
      }

      default:
        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: false,
          actor: adminCheck.session.username,
          details: 'Invalid admin action',
          metadata: { adminAction: action },
        })
        return NextResponse.json(
          { error: 'Invalid action. Use: refill, cleanup, init, or process-withdrawals' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Pool action error:', error)
    await logAdminEvent({
      request,
      action: 'admin.pool.action',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Pool action failed',
    })
    return NextResponse.json(
      { success: false, error: 'Pool action failed' },
      { status: 500 }
    )
  }
}
