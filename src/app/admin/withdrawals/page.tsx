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
type SortField = 'amount' | 'createdAt'
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
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Filters & sorting (server-side)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [page, setPage] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sessionSearch, setSessionSearch] = useState('')

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Per-item action loading
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)

  const limit = 50

  // -------------------------------------------------------------------
  // Data fetching — now uses dedicated /api/admin/withdrawals endpoint
  // -------------------------------------------------------------------

  const fetchWithdrawals = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy: sortField,
        sortOrder,
      })

      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (sessionSearch) params.set('sessionId', sessionSearch)

      const res = await fetch(`/api/admin/withdrawals?${params}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        if (res.status === 401) {
          setError('Your admin session expired. Please sign in again.')
          return
        }
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setWithdrawals(data.withdrawals)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch withdrawals')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, sortField, sortOrder, startDate, endDate, sessionSearch])

  useEffect(() => {
    setLoading(true)
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
  // CSV Export
  // -------------------------------------------------------------------

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ format: 'csv' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (sessionSearch) params.set('sessionId', sessionSearch)

      const res = await fetch(`/api/admin/withdrawals?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `withdrawals-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export')
    } finally {
      setExporting(false)
    }
  }

  // -------------------------------------------------------------------
  // Derived counts (from current page data — approximate)
  // -------------------------------------------------------------------

  const pendingApprovalOnPage = withdrawals.filter(
    (w) => w.status === 'pending_approval'
  ).length

  // -------------------------------------------------------------------
  // Actions (unchanged — still go through /api/admin/pool)
  // -------------------------------------------------------------------

  const handleWithdrawalAction = async (transactionId: string, approve: boolean) => {
    const action = approve ? 'approve-withdrawal' : 'reject-withdrawal'

    if (approve) {
      if (!window.confirm('Approve this withdrawal? This will send funds from the house wallet.')) return
    }

    let rejectReason = ''
    if (!approve) {
      const input = window.prompt('Rejection reason (required):', '')
      if (input === null) return
      rejectReason = input.trim() || 'Rejected by admin'
    }

    setActionLoadingId(transactionId)
    setActionMessage(null)
    try {
      const bodyData: Record<string, string> = { action, transactionId }
      if (!approve) {
        bodyData.reason = rejectReason
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

    if (approve) {
      if (!window.confirm(`Approve ${count} withdrawal(s)? This will send funds from the house wallet for each.`)) return
    }

    let bulkRejectReason = ''
    if (!approve) {
      const input = window.prompt(`Rejection reason for ${count} withdrawal(s):`, '')
      if (input === null) return
      bulkRejectReason = input.trim() || 'Rejected by admin (bulk)'
    }

    setBulkLoading(true)
    setActionMessage(null)
    let successes = 0
    let failures = 0

    for (const transactionId of selectedIds) {
      try {
        const bodyData: Record<string, string> = { action, transactionId }
        if (!approve) {
          bodyData.reason = bulkRejectReason
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
    const visiblePendingApproval = withdrawals.filter((w) => w.status === 'pending_approval')
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
    setPage(1)
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
          <div>
            <h1 className="text-2xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)]">
              Withdrawals
            </h1>
            <p className="text-[11px] text-bone-white/40 mt-0.5">
              {total.toLocaleString()} total entries
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="text-sm px-3 py-1.5 rounded border border-masque-gold/30 text-masque-gold hover:border-masque-gold hover:bg-masque-gold/10 transition-colors disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <Link
              href="/admin"
              className="text-sm text-venetian-gold hover:text-masque-gold transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
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

        {/* Filters row */}
        <div className="flex flex-wrap gap-3 mb-4">
          {/* Status filter tabs */}
          <div className="flex gap-1 bg-midnight-black/80 border border-masque-gold/20 rounded-lg p-1">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  setStatusFilter(key)
                  setPage(1)
                  setSelectedIds(new Set())
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === key
                    ? 'bg-masque-gold text-midnight-black'
                    : 'text-bone-white/70 hover:text-bone-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Session search */}
          <input
            type="text"
            placeholder="Session ID..."
            value={sessionSearch}
            onChange={(e) => {
              setSessionSearch(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none placeholder:text-bone-white/30 w-36"
          />

          {/* Date range */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
          />

          {/* Clear filters */}
          {(statusFilter !== 'all' || startDate || endDate || sessionSearch) && (
            <button
              onClick={() => {
                setStatusFilter('all')
                setStartDate('')
                setEndDate('')
                setSessionSearch('')
                setPage(1)
              }}
              className="px-3 py-2 text-sm text-bone-white/50 hover:text-bone-white transition-colors"
            >
              Clear
            </button>
          )}
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
                {pendingApprovalOnPage > 0 && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={
                        pendingApprovalOnPage > 0 &&
                        withdrawals
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
                  onClick={() => handleSortToggle('createdAt')}
                >
                  Age{sortIndicator('createdAt')}
                </th>
                <th className="text-right px-4 py-3 text-masque-gold font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && withdrawals.length === 0 ? (
                <tr>
                  <td
                    colSpan={pendingApprovalOnPage > 0 ? 8 : 7}
                    className="px-4 py-8 text-center text-bone-white/50"
                  >
                    Loading withdrawals...
                  </td>
                </tr>
              ) : withdrawals.length === 0 ? (
                <tr>
                  <td
                    colSpan={pendingApprovalOnPage > 0 ? 8 : 7}
                    className="px-4 py-8 text-center text-bone-white/50"
                  >
                    No withdrawals matching filter.
                  </td>
                </tr>
              ) : (
                withdrawals.map((w) => {
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
                      {pendingApprovalOnPage > 0 && (
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 text-sm text-bone-white/60">
            <span>
              Page {page} of {totalPages} ({total.toLocaleString()} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded border border-masque-gold/30 text-bone-white/70 hover:text-bone-white hover:border-masque-gold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded border border-masque-gold/30 text-bone-white/70 hover:text-bone-white hover:border-masque-gold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Summary footer */}
        {totalPages <= 1 && (
          <div className="mt-4 text-xs text-bone-white/30">
            Showing {withdrawals.length} of {total} total withdrawals
          </div>
        )}
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
