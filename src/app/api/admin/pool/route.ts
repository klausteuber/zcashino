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
import { getProvablyFairMode, SESSION_NONCE_MODE } from '@/lib/provably-fair/mode'
import {
  getSessionSeedPoolStatus,
  initializeSessionSeedPool,
  triggerSessionSeedPoolCheck,
} from '@/lib/services/session-seed-pool-manager'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { reserveFunds } from '@/lib/services/ledger'

/**
 * GET /api/admin/pool - Get pool status
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

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
    const fairnessMode = getProvablyFairMode()
    const status = fairnessMode === SESSION_NONCE_MODE
      ? await getSessionSeedPoolStatus()
      : await getPoolStatus()
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
      fairnessMode,
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
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

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
    const fairnessMode = getProvablyFairMode()
    const isSessionMode = fairnessMode === SESSION_NONCE_MODE

    switch (action) {
      case 'refill': {
        console.log('[Admin] Manual pool refill triggered')
        const status = isSessionMode
          ? await triggerSessionSeedPoolCheck()
          : await (async () => {
            await checkAndRefillPool()
            return getPoolStatus()
          })()
        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Pool refill completed',
          metadata: { adminAction: action },
        })
        return NextResponse.json({ success: true, action: 'refill', fairnessMode, status })
      }

      case 'cleanup': {
        console.log('[Admin] Manual cleanup triggered')
        const cleaned = isSessionMode ? 0 : await cleanupExpiredCommitments()
        const status = isSessionMode ? await getSessionSeedPoolStatus() : await getPoolStatus()
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
          fairnessMode,
          cleaned,
          status
        })
      }

      case 'init': {
        console.log('[Admin] Manual pool initialization triggered')
        if (isSessionMode) {
          await initializeSessionSeedPool()
        } else {
          await initializePool()
        }
        const status = isSessionMode ? await getSessionSeedPoolStatus() : await getPoolStatus()
        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Pool initialized',
          metadata: { adminAction: action },
        })
        return NextResponse.json({ success: true, action: 'init', fairnessMode, status })
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

      case 'poll-withdrawal': {
        const { transactionId } = body as { transactionId?: string }
        if (!transactionId || typeof transactionId !== 'string') {
          return NextResponse.json({ error: 'transactionId required' }, { status: 400 })
        }

        const txRow = await prisma.transaction.findFirst({
          where: { id: transactionId, type: 'withdrawal', status: 'pending', operationId: { not: null } },
        })

        if (!txRow) {
          return NextResponse.json(
            { error: 'Withdrawal not found or not pending with an operationId' },
            { status: 404 }
          )
        }

        const network = DEFAULT_NETWORK
        const opStatus = await getOperationStatus(txRow.operationId!, network)

        if (opStatus.status === 'success' && opStatus.txid) {
          const updated = await prisma.transaction.update({
            where: { id: txRow.id },
            data: {
              status: 'confirmed',
              txHash: opStatus.txid,
              confirmedAt: new Date(),
              failReason: null,
            },
          })
          await logAdminEvent({
            request,
            action: 'admin.pool.action',
            success: true,
            actor: adminCheck.session.username,
            details: 'Polled withdrawal: confirmed',
            metadata: { adminAction: action, transactionId, operationId: txRow.operationId },
          })
          return NextResponse.json({ success: true, action: 'poll-withdrawal', transaction: updated, operationStatus: opStatus })
        }

        if (opStatus.status === 'failed') {
          const refundTotal = roundZec(txRow.amount + txRow.fee)
          await prisma.$transaction([
            prisma.session.update({
              where: { id: txRow.sessionId },
              data: {
                balance: { increment: refundTotal },
                totalWithdrawn: { decrement: txRow.amount },
              },
            }),
            prisma.transaction.update({
              where: { id: txRow.id },
              data: {
                status: 'failed',
                failReason: opStatus.error || 'Operation failed',
              },
            }),
          ])

          await logAdminEvent({
            request,
            action: 'admin.pool.action',
            success: false,
            actor: adminCheck.session.username,
            details: 'Polled withdrawal: failed + refunded',
            metadata: { adminAction: action, transactionId, operationId: txRow.operationId, error: opStatus.error },
          })

          const updated = await prisma.transaction.findUnique({ where: { id: txRow.id } })
          return NextResponse.json({ success: true, action: 'poll-withdrawal', transaction: updated, operationStatus: opStatus })
        }

        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Polled withdrawal: still pending',
          metadata: { adminAction: action, transactionId, operationId: txRow.operationId, status: opStatus.status },
        })

        return NextResponse.json({ success: true, action: 'poll-withdrawal', transaction: txRow, operationStatus: opStatus })
      }

      case 'requeue-withdrawal': {
        const { transactionId } = body as { transactionId?: string }
        if (!transactionId || typeof transactionId !== 'string') {
          return NextResponse.json({ error: 'transactionId required' }, { status: 400 })
        }

        const failedTx = await prisma.transaction.findFirst({
          where: { id: transactionId, type: 'withdrawal', status: 'failed' },
          select: {
            id: true,
            sessionId: true,
            amount: true,
            fee: true,
            address: true,
            memo: true,
            isShielded: true,
          },
        })

        if (!failedTx) {
          return NextResponse.json(
            { error: 'Withdrawal not found or not failed' },
            { status: 404 }
          )
        }

        if (!failedTx.address) {
          return NextResponse.json(
            { error: 'Failed withdrawal has no destination address' },
            { status: 400 }
          )
        }

        const totalAmount = roundZec(failedTx.amount + failedTx.fee)
        const idempotencyKey = `admin_requeue:${failedTx.id}:${Date.now()}`

        const created = await prisma.$transaction(async (tx) => {
          const reserved = await reserveFunds(tx, failedTx.sessionId, totalAmount, 'totalWithdrawn', failedTx.amount)
          if (!reserved) {
            throw new Error('INSUFFICIENT_BALANCE')
          }

          return tx.transaction.create({
            data: {
              sessionId: failedTx.sessionId,
              type: 'withdrawal',
              amount: failedTx.amount,
              fee: failedTx.fee,
              address: failedTx.address,
              memo: failedTx.memo,
              isShielded: failedTx.isShielded,
              status: 'pending_approval',
              idempotencyKey,
            },
          })
        })

        await logAdminEvent({
          request,
          action: 'admin.pool.action',
          success: true,
          actor: adminCheck.session.username,
          details: 'Requeued failed withdrawal (new pending_approval transaction created)',
          metadata: {
            adminAction: action,
            originalTransactionId: failedTx.id,
            newTransactionId: created.id,
            amount: failedTx.amount,
            fee: failedTx.fee,
          },
        })

        return NextResponse.json({
          success: true,
          action: 'requeue-withdrawal',
          originalTransactionId: failedTx.id,
          newTransactionId: created.id,
          transaction: created,
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

        // Match z_sendmany minconf=1 to avoid false "insufficient house balance" checks.
        const houseBalance = await getAddressBalance(houseAddress, network, 1)
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

          // Poll opid briefly to catch immediate failures (e.g. insufficient funds)
          await new Promise((r) => setTimeout(r, 3000))
          const opCheck = await getOperationStatus(approveOpId, network)

          if (opCheck.status === 'failed') {
            // Refund the user — the z_sendmany failed before hitting the blockchain
            const refundTotal = roundZec(txToApprove.amount + WITHDRAWAL_FEE)
            await prisma.$transaction([
              prisma.transaction.update({
                where: { id: approveId },
                data: { status: 'failed', failReason: opCheck.error || 'z_sendmany failed' },
              }),
              prisma.session.update({
                where: { id: txToApprove.sessionId },
                data: {
                  balance: { increment: refundTotal },
                  totalWithdrawn: { decrement: txToApprove.amount },
                },
              }),
            ])

            await logAdminEvent({
              request,
              action: 'admin.pool.action',
              success: false,
              actor: adminCheck.session.username,
              details: `Withdrawal approval failed: ${opCheck.error}`,
              metadata: { adminAction: action, transactionId: approveId, operationId: approveOpId },
            })

            return NextResponse.json({
              error: `Withdrawal send failed: ${opCheck.error}`,
              action: 'approve-withdrawal',
              transactionId: approveId,
              operationId: approveOpId,
            }, { status: 500 })
          }

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
          { error: 'Invalid action. Use: refill, cleanup, init, process-withdrawals, poll-withdrawal, requeue-withdrawal, toggle-kill-switch, approve-withdrawal, reject-withdrawal, sweep, or sweep-status' },
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
