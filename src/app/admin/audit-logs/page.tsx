'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ---------- Helpers ----------

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// ---------- Types ----------

interface AuditLog {
  id: string
  action: string
  actor: string | null
  success: boolean
  route: string | null
  method: string | null
  ipAddress: string | null
  userAgent: string | null
  details: string | null
  metadata: string | null
  createdAt: string
}

// ---------- Component ----------

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Filters
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [successFilter, setSuccessFilter] = useState<'' | 'true' | 'false'>('')
  const [searchFilter, setSearchFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const limit = 50

  // ---------- Fetch ----------

  const fetchLogs = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })

      if (actionFilter) params.set('action', actionFilter)
      if (actorFilter) params.set('actor', actorFilter)
      if (successFilter) params.set('success', successFilter)
      if (searchFilter) params.set('search', searchFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/admin/audit-logs?${params}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setLogs(data.logs)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs')
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, actorFilter, successFilter, searchFilter, startDate, endDate])

  useEffect(() => {
    setLoading(true)
    fetchLogs()
  }, [fetchLogs])

  // ---------- Export ----------

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ format: 'csv' })
      if (actionFilter) params.set('action', actionFilter)
      if (actorFilter) params.set('actor', actorFilter)
      if (successFilter) params.set('success', successFilter)
      if (searchFilter) params.set('search', searchFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/admin/audit-logs?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
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

  // ---------- Render ----------

  return (
    <div className="min-h-screen bg-midnight-black text-bone-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)]">
              Audit Logs
            </h1>
            <p className="text-[11px] text-bone-white/40 mt-0.5">
              {total.toLocaleString()} entries
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

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* Action filter */}
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
          >
            <option value="">All Actions</option>
            <option value="admin.auth">Auth</option>
            <option value="admin.overview">Overview</option>
            <option value="admin.analytics">Analytics</option>
            <option value="admin.players">Players</option>
            <option value="admin.games">Games</option>
            <option value="admin.alerts">Alerts</option>
            <option value="admin.settings">Settings</option>
            <option value="admin.pool">Pool/Withdrawals</option>
          </select>

          {/* Success filter */}
          <select
            value={successFilter}
            onChange={(e) => {
              setSuccessFilter(e.target.value as '' | 'true' | 'false')
              setPage(1)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
          >
            <option value="">All Results</option>
            <option value="true">Success</option>
            <option value="false">Failure</option>
          </select>

          {/* Actor text input */}
          <input
            type="text"
            placeholder="Actor..."
            value={actorFilter}
            onChange={(e) => {
              setActorFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none placeholder:text-bone-white/30 w-28"
          />

          {/* Search input */}
          <input
            type="text"
            placeholder="Search details..."
            value={searchFilter}
            onChange={(e) => {
              setSearchFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none placeholder:text-bone-white/30 w-40"
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
          {(actionFilter || actorFilter || successFilter || searchFilter || startDate || endDate) && (
            <button
              onClick={() => {
                setActionFilter('')
                setActorFilter('')
                setSuccessFilter('')
                setSearchFilter('')
                setStartDate('')
                setEndDate('')
                setPage(1)
              }}
              className="px-3 py-2 text-sm text-bone-white/50 hover:text-bone-white transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-blood-ruby/20 border border-blood-ruby/40 rounded-lg text-sm text-blood-ruby">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && logs.length === 0 && (
          <div className="text-center text-bone-white/50 py-12">
            Loading audit logs...
          </div>
        )}

        {/* Empty state */}
        {!loading && logs.length === 0 && !error && (
          <div className="text-center text-bone-white/50 py-12">
            No audit log entries found.
          </div>
        )}

        {/* Table */}
        {logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-masque-gold/20 text-left text-bone-white/60">
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 pr-4 font-medium">Action</th>
                  <th className="pb-3 pr-4 font-medium">Actor</th>
                  <th className="pb-3 pr-4 font-medium">Result</th>
                  <th className="pb-3 pr-4 font-medium">IP</th>
                  <th className="pb-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedId === log.id
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="border-b border-bone-white/5 hover:bg-bone-white/5 cursor-pointer transition-colors"
                    >
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <div className="text-bone-white/80">{formatTimestamp(log.createdAt)}</div>
                        <div className="text-[10px] text-bone-white/40">{timeAgo(log.createdAt)}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-jester-purple/20 text-jester-purple-light border border-jester-purple/30">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-bone-white/70">
                        {log.actor || '-'}
                      </td>
                      <td className="py-3 pr-4">
                        {log.success ? (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded bg-green-500/20 text-green-400 border border-green-500/30">
                            OK
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded bg-blood-ruby/20 text-blood-ruby border border-blood-ruby/30">
                            FAIL
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-bone-white/50 text-xs font-mono">
                        {log.ipAddress || '-'}
                      </td>
                      <td className="py-3 text-bone-white/60 max-w-xs">
                        <div className={isExpanded ? '' : 'truncate'}>
                          {log.details || '-'}
                        </div>
                        {isExpanded && log.metadata && (
                          <pre className="mt-2 p-2 bg-midnight-black/80 border border-bone-white/10 rounded text-xs text-bone-white/50 overflow-x-auto">
                            {JSON.stringify(JSON.parse(log.metadata), null, 2)}
                          </pre>
                        )}
                        {isExpanded && (
                          <div className="mt-2 text-[10px] text-bone-white/30 space-y-0.5">
                            <div>Route: {log.route || '-'} ({log.method || '-'})</div>
                            {log.userAgent && (
                              <div className="truncate max-w-md">UA: {log.userAgent}</div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

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
      </div>
    </div>
  )
}
