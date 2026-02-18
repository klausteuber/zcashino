'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useZecPrice } from '@/hooks/useZecPrice'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatZec(value: number): string {
  return `${value.toFixed(4)} ZEC`
}

function shortId(value: string, prefix = 8, suffix = 6): string {
  if (value.length <= prefix + suffix + 3) return value
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Withdrawal {
  id: string
  sessionId: string
  amount: number
  fee: number
  address: string | null
  operationId: string | null
  status: string
  failReason: string | null
  createdAt: string
  confirmedAt: string | null
  sessionWallet: string
  sessionBalance: number
  withdrawalAddress: string | null
}

type StatusFilter = 'all' | 'pending_approval' | 'pending' | 'failed' | 'confirmed'
type SortField = 'amount' | 'age'
type SortOrder = 'asc' | 'desc'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending_approval', label: 'Pending Approval' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'confirmed', label: 'Confirmed' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminWithdrawalsPage() {
  const { formatZecWithUsd } = useZecPrice()
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // Filters & sorting
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<SortField>('age')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Per-item action loading
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)

  // -------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------

  const fetchWithdrawals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/overview', { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) {
          setError('Your admin session expired. Please sign in again.')
          return
        }
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setWithdrawals(data.recentWithdrawals || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch withdrawals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWithdrawals()
  }, [fetchWithdrawals])

  // Auto-refresh every 20 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWithdrawals().catch(() => {})
    }, 20000)
    return () => clearInterval(interval)
  }, [fetchWithdrawals])

  // -------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------

  const statusCounts: Record<StatusFilter, number> = {
    all: withdrawals.length,
    pending_approval: withdrawals.filter((w) => w.status === 'pending_approval').length,
    pending: withdrawals.filter((w) => w.status === 'pending').length,
    failed: withdrawals.filter((w) => w.status === 'failed').length,
    confirmed: withdrawals.filter((w) => w.status === 'confirmed').length,
  }

  const filtered = withdrawals.filter(
    (w) => statusFilter === 'all' || w.status === statusFilter
  )

  const sorted = [...filtered].sort((a, b) => {
    if (sortField === 'amount') {
      return sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount
    }
    // age — sort by createdAt
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    return sortOrder === 'asc' ? aTime - bTime : bTime - aTime
  })

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------

  const handleWithdrawalAction = async (transactionId: string, approve: boolean) => {
    const action = approve ? 'approve-withdrawal' : 'reject-withdrawal'
    const msg = approve
      ? 'Approve this withdrawal? This will send funds from the house wallet.'
      : 'Reject this withdrawal? The user\'s balance will be refunded.'
    if (!window.confirm(msg)) return

    setActionLoadingId(transactionId)
    setActionMessage(null)
    try {
      const bodyData: Record<string, string> = { action, transactionId }
      if (!approve) {
        bodyData.reason = 'Rejected by admin'
      }
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `${action} failed`)
      setActionMessage(
        approve
          ? `Withdrawal approved (${shortId(transactionId)})`
          : `Withdrawal rejected and refunded (${shortId(transactionId)})`
      )
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(transactionId)
        return next
      })
      await fetchWithdrawals()
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : `${action} failed`)
    } finally {
      setActionLoadingId(null)
    }
  }

  const handlePollWithdrawal = async (transactionId: string) => {
    if (!window.confirm('Poll this pending withdrawal now?')) return

    setActionLoadingId(transactionId)
    setActionMessage(null)
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll-withdrawal', transactionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'poll-withdrawal failed')

      const txStatus = data.transaction?.status
      const opStatus = data.operationStatus?.status
      setActionMessage(`Polled withdrawal (${shortId(transactionId)}): ${txStatus || opStatus || 'ok'}`)
      await fetchWithdrawals()
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'poll-withdrawal failed')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleRequeueWithdrawal = async (transactionId: string) => {
    const msg =
      'Requeue this failed withdrawal? This creates a NEW pending-approval withdrawal (reserves funds again). You still need to approve the new withdrawal.'
    if (!window.confirm(msg)) return

    setActionLoadingId(transactionId)
    setActionMessage(null)
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'requeue-withdrawal', transactionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'requeue-withdrawal failed')

      const newId = typeof data.newTransactionId === 'string' ? data.newTransactionId : null
      setActionMessage(
        newId
          ? `Requeued (${shortId(transactionId)}) → new pending approval (${shortId(newId)})`
          : `Requeued withdrawal (${shortId(transactionId)})`
      )
      await fetchWithdrawals()
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'requeue-withdrawal failed')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleBulkAction = async (approve: boolean) => {
    const action = approve ? 'approve-withdrawal' : 'reject-withdrawal'
    const count = selectedIds.size
    const msg = approve
      ? `Approve ${count} withdrawal(s)? This will send funds from the house wallet for each.`
      : `Reject ${count} withdrawal(s)? Each user\'s balance will be refunded.`
    if (!window.confirm(msg)) return

    setBulkLoading(true)
    setActionMessage(null)
    let successes = 0
    let failures = 0

    for (const transactionId of selectedIds) {
      try {
        const bodyData: Record<string, string> = { action, transactionId }
        if (!approve) {
          bodyData.reason = 'Rejected by admin (bulk)'
        }
        const res = await fetch('/api/admin/pool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData),
        })
        if (!res.ok) {
          failures++
        } else {
          successes++
        }
      } catch {
        failures++
      }
    }

    setActionMessage(
      `Bulk ${approve ? 'approve' : 'reject'}: ${successes} succeeded, ${failures} failed`
    )
    setSelectedIds(new Set())
    setBulkLoading(false)
    await fetchWithdrawals()
  }

  // -------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    const visiblePendingApproval = sorted.filter((w) => w.status === 'pending_approval')
    const allSelected = visiblePendingApproval.every((w) => selectedIds.has(w.id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visiblePendingApproval.map((w) => w.id)))
    }
  }

  // -------------------------------------------------------------------
  // Sort toggle
  // -------------------------------------------------------------------

  const handleSortToggle = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return ''
    return sortOrder === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-midnight-black text-bone-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)]">
            Withdrawals
          </h1>
          <Link
            href="/admin"
            className="text-sm text-venetian-gold hover:text-masque-gold transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-blood-ruby/20 border border-blood-ruby/40 rounded-xl text-blood-ruby text-sm">
            {error}
          </div>
        )}

        {/* Action message */}
        {actionMessage && (
          <div className="mb-4 p-3 bg-masque-gold/10 border border-masque-gold/30 rounded-xl text-masque-gold text-sm">
            {actionMessage}
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setStatusFilter(key)
                setSelectedIds(new Set())
              }}
              className={`text-sm px-4 py-1.5 rounded-lg border transition-colors ${
                statusFilter === key
                  ? 'border-masque-gold/60 bg-masque-gold/20 text-masque-gold'
                  : 'border-masque-gold/20 text-venetian-gold/50 hover:text-masque-gold hover:border-masque-gold/40'
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs opacity-70">({statusCounts[key]})</span>
            </button>
          ))}
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-midnight-black/50 border border-masque-gold/20 rounded-xl">
            <span className="text-sm text-bone-white">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => handleBulkAction(true)}
              disabled={bulkLoading}
              className="text-sm px-3 py-1.5 rounded-lg bg-green-700/80 hover:bg-green-600 text-white disabled:opacity-60 transition-colors"
            >
              {bulkLoading ? 'Processing...' : 'Bulk Approve'}
            </button>
            <button
              onClick={() => handleBulkAction(false)}
              disabled={bulkLoading}
              className="text-sm px-3 py-1.5 rounded-lg bg-crimson-mask/80 hover:bg-crimson-mask text-white disabled:opacity-60 transition-colors"
            >
              {bulkLoading ? 'Processing...' : 'Bulk Reject'}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm px-3 py-1.5 rounded-lg border border-masque-gold/20 text-venetian-gold/60 hover:text-masque-gold transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto border border-masque-gold/20 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-masque-gold/20 bg-midnight-black/80">
                {/* Checkbox column — only show if there are pending_approval items */}
                {statusCounts.pending_approval > 0 && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={
                        sorted.filter((w) => w.status === 'pending_approval').length > 0 &&
                        sorted
                          .filter((w) => w.status === 'pending_approval')
                          .every((w) => selectedIds.has(w.id))
                      }
                      onChange={toggleSelectAll}
                      className="accent-masque-gold"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-masque-gold font-semibold">
                  Transaction ID
                </th>
                <th className="text-left px-4 py-3 text-masque-gold font-semibold">
                  Session
                </th>
                <th
                  className="text-right px-4 py-3 text-masque-gold font-semibold cursor-pointer select-none hover:text-bone-white transition-colors"
                  onClick={() => handleSortToggle('amount')}
                >
                  Amount{sortIndicator('amount')}
                </th>
                <th className="text-left px-4 py-3 text-masque-gold font-semibold">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-masque-gold font-semibold">
                  Fail Reason
                </th>
                <th
                  className="text-left px-4 py-3 text-masque-gold font-semibold cursor-pointer select-none hover:text-bone-white transition-colors"
                  onClick={() => handleSortToggle('age')}
                >
                  Age{sortIndicator('age')}
                </th>
                <th className="text-right px-4 py-3 text-masque-gold font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={statusCounts.pending_approval > 0 ? 8 : 7}
                    className="px-4 py-8 text-center text-bone-white/50"
                  >
                    Loading withdrawals...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={statusCounts.pending_approval > 0 ? 8 : 7}
                    className="px-4 py-8 text-center text-bone-white/50"
                  >
                    No withdrawals matching filter.
                  </td>
                </tr>
              ) : (
                sorted.map((w) => {
                  const ageMs = Date.now() - new Date(w.createdAt).getTime()
                  const ageHours = ageMs / (1000 * 60 * 60)
                  const ageText =
                    ageHours < 1
                      ? `${Math.round(ageMs / (1000 * 60))}m ago`
                      : ageHours < 24
                        ? `${Math.round(ageHours)}h ago`
                        : `${Math.round(ageHours / 24)}d ago`
                  const ageColor =
                    ageHours < 1
                      ? 'text-jester-purple'
                      : ageHours < 24
                        ? 'text-masque-gold'
                        : 'text-blood-ruby'

                  return (
                    <tr
                      key={w.id}
                      className="border-b border-masque-gold/10 hover:bg-masque-gold/5 transition-colors"
                    >
                      {/* Checkbox */}
                      {statusCounts.pending_approval > 0 && (
                        <td className="w-10 px-3 py-3">
                          {w.status === 'pending_approval' ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(w.id)}
                              onChange={() => toggleSelect(w.id)}
                              className="accent-masque-gold"
                            />
                          ) : (
                            <span />
                          )}
                        </td>
                      )}

                      {/* Transaction ID */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigator.clipboard.writeText(w.id)}
                          className="font-mono text-bone-white hover:text-masque-gold transition-colors text-left group"
                          title="Click to copy full ID"
                        >
                          {shortId(w.id)}
                          <span className="ml-1 text-venetian-gold/30 group-hover:text-masque-gold/60 text-xs">
                            copy
                          </span>
                        </button>
                      </td>

                      {/* Session */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/players/${w.sessionId}`}
                          className="font-mono text-venetian-gold hover:text-masque-gold transition-colors"
                        >
                          {shortId(w.sessionId)}
                        </Link>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 text-right text-bone-white font-mono">
                        {formatZecWithUsd(w.amount)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={w.status} />
                      </td>

                      {/* Fail Reason */}
                      <td className="px-4 py-3">
                        {w.status === 'failed' && w.failReason ? (
                          <span
                            className="text-xs text-blood-ruby/70 max-w-[200px] truncate block"
                            title={w.failReason}
                          >
                            {w.failReason}
                          </span>
                        ) : (
                          <span className="text-venetian-gold/30">--</span>
                        )}
                      </td>

                      {/* Age */}
                      <td className={`px-4 py-3 text-sm ${ageColor}`}>{ageText}</td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {w.status === 'pending_approval' ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => handleWithdrawalAction(w.id, true)}
                              disabled={
                                actionLoadingId === w.id || bulkLoading
                              }
                              className="text-xs px-2.5 py-1 rounded bg-green-700/80 hover:bg-green-600 text-white disabled:opacity-60 transition-colors"
                            >
                              {actionLoadingId === w.id ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleWithdrawalAction(w.id, false)}
                              disabled={
                                actionLoadingId === w.id || bulkLoading
                              }
                              className="text-xs px-2.5 py-1 rounded bg-crimson-mask/80 hover:bg-crimson-mask text-white disabled:opacity-60 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : w.status === 'pending' ? (
                          <button
                            onClick={() => handlePollWithdrawal(w.id)}
                            disabled={actionLoadingId === w.id || bulkLoading || !w.operationId}
                            className="text-xs px-2.5 py-1 rounded bg-masque-gold/20 hover:bg-masque-gold/30 text-masque-gold disabled:opacity-60 transition-colors"
                            title={w.operationId ? 'Poll operation status now' : 'Missing operationId'}
                          >
                            {actionLoadingId === w.id ? '...' : 'Poll'}
                          </button>
                        ) : w.status === 'failed' ? (
                          <button
                            onClick={() => handleRequeueWithdrawal(w.id)}
                            disabled={actionLoadingId === w.id || bulkLoading}
                            className="text-xs px-2.5 py-1 rounded bg-jester-purple/20 hover:bg-jester-purple/30 text-jester-purple disabled:opacity-60 transition-colors"
                          >
                            {actionLoadingId === w.id ? '...' : 'Requeue'}
                          </button>
                        ) : (
                          <span className="text-xs text-venetian-gold/40">--</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Summary footer */}
        <div className="mt-4 text-xs text-bone-white/30">
          Showing {sorted.length} of {withdrawals.length} total withdrawals
          {statusFilter !== 'all' && ` (filtered: ${statusFilter})`}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending_approval':
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-masque-gold/20 text-masque-gold font-bold">
          NEEDS APPROVAL
        </span>
      )
    case 'failed':
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-blood-ruby/20 text-blood-ruby font-bold">
          FAILED
        </span>
      )
    case 'confirmed':
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-jester-purple/20 text-jester-purple font-bold">
          CONFIRMED
        </span>
      )
    case 'pending':
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-masque-gold/10 text-venetian-gold/70 font-bold">
          PENDING
        </span>
      )
    default:
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-midnight-black/50 text-bone-white/50 font-bold">
          {status.toUpperCase()}
        </span>
      )
  }
}
