'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

// ---------- Helpers ----------

function formatZec(value: number): string {
  return `${value.toFixed(4)} ZEC`
}

function shortId(value: string, prefix = 8, suffix = 6): string {
  if (value.length <= prefix + suffix + 3) return value
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// ---------- Types ----------

interface AdminAlert {
  id: string
  type: string
  severity: string
  title: string
  description: string
  sessionId: string | null
  gameId: string | null
  metadata: string | null
  dismissed: boolean
  dismissedBy: string | null
  dismissedAt: string | null
  createdAt: string
}

type FilterTab = 'all' | 'active' | 'dismissed'
type AlertType =
  | ''
  | 'large_win'
  | 'high_rtp'
  | 'rapid_cycle'
  | 'withdrawal_velocity'
  | 'withdrawals_failed_backlog'
  | 'withdrawals_pending_stuck'
  | 'kill_switch_active'
  | 'pool_critical'
type AlertSeverity = '' | 'critical' | 'warning' | 'info'

const TYPE_LABELS: Record<string, string> = {
  large_win: 'Large Win',
  high_rtp: 'High RTP',
  rapid_cycle: 'Rapid Cycle',
  withdrawal_velocity: 'Withdrawal Velocity',
  withdrawals_failed_backlog: 'Failed Withdrawals',
  withdrawals_pending_stuck: 'Pending Withdrawals Stuck',
  kill_switch_active: 'Kill Switch Active',
  pool_critical: 'Pool Critical',
}

const SEVERITY_COLORS: Record<string, { dot: string; border: string }> = {
  critical: { dot: 'bg-blood-ruby', border: 'border-blood-ruby/40' },
  warning: { dot: 'bg-masque-gold', border: 'border-masque-gold/40' },
  info: { dot: 'bg-jester-purple', border: 'border-jester-purple/40' },
}

// ---------- Component ----------

export default function AdminAlertsPage() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [total, setTotal] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serviceStatus, setServiceStatus] = useState<{
    isRunning: boolean
    lastRun: string | null
    lastAlertCount: number | null
  } | null>(null)
  const [runningNow, setRunningNow] = useState(false)

  const [filterTab, setFilterTab] = useState<FilterTab>('active')
  const [typeFilter, setTypeFilter] = useState<AlertType>('')
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity>('')
  const [offset, setOffset] = useState(0)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  const limit = 25
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ---------- Fetch ----------

  const fetchAlerts = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      })

      if (filterTab === 'active') params.set('dismissed', 'false')
      else if (filterTab === 'dismissed') params.set('dismissed', 'true')
      // 'all' omits the dismissed param

      if (typeFilter) params.set('type', typeFilter)
      if (severityFilter) params.set('severity', severityFilter)

      const res = await fetch(`/api/admin/alerts?${params}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setAlerts(data.alerts)
      setTotal(data.total)
      setActiveCount(data.activeCount)
      setServiceStatus(data.serviceStatus ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alerts')
    } finally {
      setLoading(false)
    }
  }, [filterTab, typeFilter, severityFilter, offset])

  useEffect(() => {
    setLoading(true)
    fetchAlerts()
  }, [fetchAlerts])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    refreshRef.current = setInterval(fetchAlerts, 30_000)
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current)
    }
  }, [fetchAlerts])

  // ---------- Dismiss ----------

  async function handleDismiss(id: string) {
    setDismissingId(id)
    try {
      const res = await fetch('/api/admin/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      // Refresh the list
      await fetchAlerts()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to dismiss alert'
      )
    } finally {
      setDismissingId(null)
    }
  }

  async function runAlertChecksNow() {
    setRunningNow(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/alerts', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      await fetchAlerts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run alert checks')
    } finally {
      setRunningNow(false)
    }
  }

  // ---------- Pagination ----------

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  // ---------- Render ----------

  return (
    <div className="min-h-screen bg-midnight-black text-bone-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)]">
                Alerts
              </h1>
              <p className="text-[11px] text-bone-white/40 mt-0.5">
                Generator: {serviceStatus
                  ? `${serviceStatus.isRunning ? 'running' : 'stopped'}${serviceStatus.lastRun ? `, last run ${timeAgo(serviceStatus.lastRun)}` : ''}`
                  : 'unknown'}
              </p>
            </div>
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-xs font-bold rounded-full bg-blood-ruby text-bone-white">
                {activeCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={runAlertChecksNow}
              disabled={runningNow}
              className="text-sm px-3 py-1.5 rounded border border-masque-gold/30 text-masque-gold hover:border-masque-gold hover:bg-masque-gold/10 transition-colors disabled:opacity-50"
              title="Runs alert checks immediately and persists any new alerts."
            >
              {runningNow ? 'Running...' : 'Run Checks Now'}
            </button>
            <Link
              href="/admin"
              className="text-sm text-venetian-gold hover:text-masque-gold transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-4 mb-6">
          {/* Tab buttons */}
          <div className="flex gap-1 bg-midnight-black/80 border border-masque-gold/20 rounded-lg p-1">
            {(['all', 'active', 'dismissed'] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setFilterTab(tab)
                  setOffset(0)
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filterTab === tab
                    ? 'bg-masque-gold text-midnight-black'
                    : 'text-bone-white/70 hover:text-bone-white'
                }`}
              >
                {tab === 'all' ? 'All' : tab === 'active' ? 'Active' : 'Dismissed'}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as AlertType)
              setOffset(0)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="large_win">Large Win</option>
            <option value="high_rtp">High RTP</option>
            <option value="rapid_cycle">Rapid Cycle</option>
            <option value="withdrawal_velocity">Withdrawal Velocity</option>
            <option value="withdrawals_failed_backlog">Failed Withdrawals</option>
            <option value="withdrawals_pending_stuck">Pending Withdrawals Stuck</option>
            <option value="kill_switch_active">Kill Switch Active</option>
            <option value="pool_critical">Pool Critical</option>
          </select>

          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value as AlertSeverity)
              setOffset(0)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-blood-ruby/20 border border-blood-ruby/40 rounded-lg text-sm text-blood-ruby">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && alerts.length === 0 && (
          <div className="text-center text-bone-white/50 py-12">
            Loading alerts...
          </div>
        )}

        {/* Empty state */}
        {!loading && alerts.length === 0 && !error && (
          <div className="text-center text-bone-white/50 py-12">
            {filterTab === 'active'
              ? 'No active alerts.'
              : filterTab === 'dismissed'
                ? 'No dismissed alerts.'
                : 'No alerts found.'}
          </div>
        )}

        {/* Alert cards */}
        <div className="space-y-3">
          {alerts.map((alert) => {
            const sev = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info
            const isDismissed = alert.dismissed

            return (
              <div
                key={alert.id}
                className={`bg-midnight-black/50 border rounded-xl p-4 transition-colors ${
                  sev.border
                } ${isDismissed ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: severity dot + content */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Severity dot */}
                    <div className="pt-1 flex-shrink-0">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${sev.dot}`}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Title + badges */}
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-bone-white text-sm">
                          {alert.title}
                        </span>
                        <span className="inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-jester-purple/20 text-jester-purple-light border border-jester-purple/30">
                          {TYPE_LABELS[alert.type] || alert.type}
                        </span>
                        {isDismissed && (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-bone-white/10 text-bone-white/50 border border-bone-white/10">
                            Dismissed
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-sm text-bone-white/70 mb-2">
                        {alert.description}
                      </p>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-bone-white/40">
                        <span>{timeAgo(alert.createdAt)}</span>

                        {alert.sessionId && (
                          <Link
                            href={`/admin/players/${alert.sessionId}`}
                            className="text-venetian-gold hover:text-masque-gold transition-colors"
                          >
                            Session {shortId(alert.sessionId)}
                          </Link>
                        )}

                        {alert.gameId && (
                          <Link
                            href={`/admin/games/${alert.gameId}`}
                            className="text-venetian-gold hover:text-masque-gold transition-colors"
                          >
                            Game {shortId(alert.gameId)}
                          </Link>
                        )}

                        {isDismissed && alert.dismissedBy && (
                          <span>
                            Dismissed by {alert.dismissedBy}
                            {alert.dismissedAt
                              ? ` ${timeAgo(alert.dismissedAt)}`
                              : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: dismiss button */}
                  {!isDismissed && (
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      disabled={dismissingId === alert.id}
                      className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded border border-masque-gold/30 text-bone-white/70 hover:text-bone-white hover:border-masque-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {dismissingId === alert.id ? 'Dismissing...' : 'Dismiss'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 text-sm text-bone-white/60">
            <span>
              Page {currentPage} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-3 py-1.5 rounded border border-masque-gold/30 text-bone-white/70 hover:text-bone-white hover:border-masque-gold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={currentPage >= totalPages}
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
