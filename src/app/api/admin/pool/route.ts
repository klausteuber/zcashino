import { NextRequest, NextResponse } from 'next/server'
import {
  getPoolStatus,
  checkAndRefillPool,
  cleanupExpiredCommitments,
  initializePool
} from '@/lib/provably-fair/commitment-pool'
import prisma from '@/lib/db'
import { getOperationStatus, sendZec, checkNodeStatus, getAddressBalance } from '@/lib/wallet/rpc'
import { DEFAULT_NETWORK, roundZec, WITHDRAWAL_FEE } from '@/lib/wallet'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { isKillSwitchActive, setKillSwitch, getKillSwitchStatus } from '@/lib/kill-switch'
import {
  sweepDeposits,
  checkSweepStatus,
  getSweepHistory,
  getSweepServiceStatus,
} from '@/lib/services/deposit-sweep'

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
      killSwitch: getKillSwitchStatus(),
      sweepService: getSweepServiceStatus(),
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

      case 'toggle-kill-switch': {
        const { enabled } = body
        if (typeof enabled !== 'boolean') {
          return NextResponse.json(
            { error: 'Missing required field: enabled (boolean)' },
            { status: 400 }
          )
        }

        const wasActive = isKillSwitchActive()
        setKillSwitch(enabled, adminCheck.session.username)

        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: enabled ? 'Kill switch ACTIVATED' : 'Kill switch DEACTIVATED',
          metadata: { adminAction: action, wasActive, nowActive: enabled },
        })

        return NextResponse.json({
          success: true,
          action: 'toggle-kill-switch',
          killSwitch: getKillSwitchStatus(),
        })
      }

      case 'approve-withdrawal': {
        const { transactionId: approveId } = body
        if (!approveId) {
          return NextResponse.json({ error: 'transactionId required' }, { status: 400 })
        }

        const txToApprove = await prisma.transaction.findFirst({
          where: { id: approveId, type: 'withdrawal', status: 'pending_approval' },
          include: { session: { include: { wallet: true } } },
        })

        if (!txToApprove) {
          return NextResponse.json({ error: 'Withdrawal not found or not pending approval' }, { status: 404 })
        }

        const network = DEFAULT_NETWORK
        const houseAddress = network === 'mainnet'
          ? process.env.HOUSE_ZADDR_MAINNET
          : process.env.HOUSE_ZADDR_TESTNET

        if (!houseAddress) {
          return NextResponse.json({ error: 'House wallet not configured' }, { status: 500 })
        }

        // Check node and house balance
        const nodeStatus = await checkNodeStatus(network)
        if (!nodeStatus.connected) {
          return NextResponse.json({ error: 'Zcash node not connected' }, { status: 503 })
        }

        const houseBalance = await getAddressBalance(houseAddress, network)
        if (houseBalance.confirmed < txToApprove.amount) {
          return NextResponse.json({
            error: `Insufficient house balance: ${houseBalance.confirmed} ZEC available, ${txToApprove.amount} ZEC needed`,
          }, { status: 400 })
        }

        // Execute the withdrawal
        try {
          const { operationId: approveOpId } = await sendZec(
            houseAddress,
            txToApprove.address!,
            txToApprove.amount,
            txToApprove.memo || undefined,
            network
          )

          await prisma.transaction.update({
            where: { id: approveId },
            data: { status: 'pending', operationId: approveOpId },
          })

          await logAdminEvent({
            request,
            action: 'admin.pool.action',
            success: true,
            actor: adminCheck.session.username,
            details: `Withdrawal approved: ${txToApprove.amount} ZEC`,
            metadata: { adminAction: action, transactionId: approveId, operationId: approveOpId },
          })

          return NextResponse.json({
            success: true,
            action: 'approve-withdrawal',
            transactionId: approveId,
            operationId: approveOpId,
            amount: txToApprove.amount,
          })
        } catch (rpcErr) {
          return NextResponse.json({
            error: `RPC failed: ${rpcErr instanceof Error ? rpcErr.message : 'unknown'}`,
          }, { status: 500 })
        }
      }

      case 'reject-withdrawal': {
        const { transactionId: rejectId, reason: rejectReason } = body
        if (!rejectId) {
          return NextResponse.json({ error: 'transactionId required' }, { status: 400 })
        }

        const txToReject = await prisma.transaction.findFirst({
          where: { id: rejectId, type: 'withdrawal', status: 'pending_approval' },
        })

        if (!txToReject) {
          return NextResponse.json({ error: 'Withdrawal not found or not pending approval' }, { status: 404 })
        }

        // Refund the user
        const refundTotal = roundZec(txToReject.amount + txToReject.fee)
        await prisma.session.update({
          where: { id: txToReject.sessionId },
          data: {
            balance: { increment: refundTotal },
            totalWithdrawn: { decrement: txToReject.amount },
          },
        })

        await prisma.transaction.update({
          where: { id: rejectId },
          data: {
            status: 'failed',
            failReason: rejectReason || 'Rejected by admin',
          },
        })

        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: `Withdrawal rejected: ${txToReject.amount} ZEC — ${rejectReason || 'No reason'}`,
          metadata: { adminAction: action, transactionId: rejectId },
        })

        return NextResponse.json({
          success: true,
          action: 'reject-withdrawal',
          transactionId: rejectId,
          refundedAmount: refundTotal,
        })
      }

      case 'sweep': {
        console.log('[Admin] Manual deposit sweep triggered')
        const sweepResult = await sweepDeposits()

        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Deposit sweep triggered',
          metadata: {
            adminAction: action,
            swept: sweepResult.swept,
            skipped: sweepResult.skipped,
            errors: sweepResult.errors,
          },
        })

        return NextResponse.json({
          success: true,
          action: 'sweep',
          ...sweepResult,
        })
      }

      case 'sweep-status': {
        console.log('[Admin] Checking sweep status')
        const statusResult = await checkSweepStatus()
        const history = await getSweepHistory()

        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Sweep status checked',
          metadata: { adminAction: action },
        })

        return NextResponse.json({
          success: true,
          action: 'sweep-status',
          ...statusResult,
          history: history.sweeps,
          stats: history.stats,
          service: getSweepServiceStatus(),
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
          { error: 'Invalid action. Use: refill, cleanup, init, process-withdrawals, toggle-kill-switch, sweep, or sweep-status' },
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
