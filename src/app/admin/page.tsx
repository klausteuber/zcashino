'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import JesterLogo from '@/components/ui/JesterLogo'

type AdminAction = 'refill' | 'cleanup' | 'init' | 'process-withdrawals'

interface AdminOverview {
  timestamp: string
  network: string
  admin: {
    username: string
  }
  platform: {
    totalSessions: number
    authenticatedSessions: number
    activeGames: number
    liabilities: number
    totalDeposited: number
    totalWithdrawn: number
    totalWagered: number
    totalWon: number
    netFlow: number
  }
  transactions: {
    pendingWithdrawalCount: number
    failedWithdrawalCount: number
    confirmedDepositCount: number
    confirmedDepositVolume: number
    confirmedWithdrawalCount: number
    confirmedWithdrawalVolume: number
  }
  pendingWithdrawals: Array<{
    id: string
    sessionId: string
    amount: number
    fee: number
    address: string | null
    operationId: string | null
    createdAt: string
    sessionWallet: string
    sessionBalance: number
    withdrawalAddress: string | null
  }>
  pool: {
    available: number
    used: number
    expired: number
    total: number
    isHealthy: boolean
    blockchainAvailable: boolean
  }
  nodeStatus: {
    connected: boolean
    synced: boolean
    blockHeight: number
    error?: string
  }
  security: {
    failedLoginAttempts24h: number
    rateLimitedEvents24h: number
  }
  auditLogs: Array<{
    id: string
    action: string
    actor: string | null
    success: boolean
    ipAddress: string | null
    details: string | null
    createdAt: string
  }>
}

const ACTIONS: Record<
  AdminAction,
  { label: string; description: string; confirmText: string }
> = {
  refill: {
    label: 'Refill Pool',
    description: 'Create new seed commitments when pool supply is low.',
    confirmText: 'Refill the provably-fair commitment pool?',
  },
  cleanup: {
    label: 'Cleanup Expired',
    description: 'Mark stale commitments as expired.',
    confirmText: 'Run cleanup for expired commitments?',
  },
  init: {
    label: 'Initialize Pool',
    description: 'Initialize and backfill the commitment pool.',
    confirmText: 'Initialize the commitment pool now?',
  },
  'process-withdrawals': {
    label: 'Process Withdrawals',
    description: 'Retry / finalize pending withdrawal operations.',
    confirmText: 'Process pending withdrawal operations now?',
  },
}

function formatZec(value: number): string {
  return `${value.toFixed(4)} ZEC`
}

function shortId(value: string, prefix: number = 8, suffix: number = 6): string {
  if (value.length <= prefix + suffix + 3) {
    return value
  }
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`
}

export default function AdminPage() {
  const [authChecked, setAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [missingConfig, setMissingConfig] = useState<string[]>([])
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [currentAdmin, setCurrentAdmin] = useState<string>('admin')

  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [isLoadingOverview, setIsLoadingOverview] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [runningAction, setRunningAction] = useState<AdminAction | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const fetchOverview = useCallback(async () => {
    setIsLoadingOverview(true)
    setOverviewError(null)

    try {
      const res = await fetch('/api/admin/overview', { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false)
          setOverview(null)
          setOverviewError('Your admin session expired. Please sign in again.')
          return
        }
        throw new Error(data.error || 'Failed to load admin overview.')
      }

      setOverview(data)
      if (data.admin?.username) {
        setCurrentAdmin(data.admin.username)
      }
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Failed to load admin overview.')
    } finally {
      setIsLoadingOverview(false)
    }
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/auth', { cache: 'no-store' })
      const data = await res.json()

      if (res.status === 503) {
        setConfigured(false)
        setMissingConfig(Array.isArray(data.missing) ? data.missing : [])
        setIsAuthenticated(false)
        return
      }

      setConfigured(true)
      setMissingConfig([])

      if (data.authenticated) {
        setIsAuthenticated(true)
        setCurrentAdmin(data.username || 'admin')
        setUsername(data.username || 'admin')
        await fetchOverview()
      } else {
        setIsAuthenticated(false)
      }
    } catch {
      setAuthError('Failed to reach admin auth endpoint.')
      setIsAuthenticated(false)
    } finally {
      setAuthChecked(true)
    }
  }, [fetchOverview])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    const intervalId = setInterval(() => {
      fetchOverview().catch(() => {
        // Errors are surfaced in fetchOverview state.
      })
    }, 20000)

    return () => clearInterval(intervalId)
  }, [isAuthenticated, fetchOverview])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setAuthError(null)
    setActionMessage(null)

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
        }),
      })

      const data = await res.json()

      if (res.status === 503) {
        setConfigured(false)
        setMissingConfig(Array.isArray(data.missing) ? data.missing : [])
        return
      }

      if (!res.ok) {
        throw new Error(data.error || 'Login failed.')
      }

      setIsAuthenticated(true)
      setCurrentAdmin(data.username || username)
      setPassword('')
      await fetchOverview()
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed.')
    }
  }

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    setIsAuthenticated(false)
    setOverview(null)
    setActionMessage(null)
  }

  const runAdminAction = async (action: AdminAction) => {
    const details = ACTIONS[action]
    const confirmed = window.confirm(details.confirmText)
    if (!confirmed) {
      return
    }

    setRunningAction(action)
    setActionMessage(null)

    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Action "${action}" failed.`)
      }

      const summary =
        action === 'process-withdrawals'
          ? `Processed ${data.total ?? 0} pending withdrawals.`
          : `Action "${action}" completed successfully.`

      setActionMessage(summary)
      await fetchOverview()
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Admin action failed.')
    } finally {
      setRunningAction(null)
    }
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen felt-texture flex items-center justify-center px-4">
        <div className="bg-midnight-black/60 border border-masque-gold/20 rounded-xl p-6 text-venetian-gold/70">
          Checking admin session...
        </div>
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="min-h-screen felt-texture flex items-center justify-center px-4">
        <div className="w-full max-w-2xl bg-midnight-black/70 border border-blood-ruby/60 rounded-xl p-6">
          <h1 className="text-2xl font-display font-bold text-bone-white mb-3">
            Admin Dashboard Not Configured
          </h1>
          <p className="text-venetian-gold/70 mb-4">
            Set the following environment variables before using `/admin`.
          </p>
          <div className="bg-midnight-black/70 border border-masque-gold/20 rounded-lg p-4">
            {missingConfig.length > 0 ? (
              <ul className="list-disc list-inside text-masque-gold font-mono text-sm">
                {missingConfig.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : (
              <div className="text-masque-gold font-mono text-sm">
                ADMIN_PASSWORD, ADMIN_SESSION_SECRET
              </div>
            )}
          </div>
        </div>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen felt-texture flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-midnight-black/70 border border-masque-gold/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <JesterLogo size="sm" className="text-jester-purple-light" />
            <h1 className="text-2xl font-display font-bold text-bone-white">
              Admin Sign In
            </h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-venetian-gold/60 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full bg-midnight-black/80 border border-masque-gold/20 rounded px-3 py-2 text-bone-white"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-venetian-gold/60 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-midnight-black/80 border border-masque-gold/20 rounded px-3 py-2 text-bone-white"
                autoComplete="current-password"
                required
              />
            </div>

            {authError && (
              <div className="text-sm text-blood-ruby">{authError}</div>
            )}

            <button
              type="submit"
              className="w-full btn-gold-shimmer text-midnight-black px-4 py-2 rounded-lg font-semibold"
            >
              Sign In
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen felt-texture pb-10">
      <header className="border-b border-masque-gold/20 bg-midnight-black/40 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <JesterLogo size="sm" className="text-jester-purple-light" />
            <div>
              <h1 className="text-2xl font-display font-bold text-bone-white">
                Admin Dashboard
              </h1>
              <p className="text-xs text-venetian-gold/60">
                Signed in as {currentAdmin}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchOverview()}
              className="px-3 py-2 rounded-lg border border-masque-gold/30 text-masque-gold hover:bg-masque-gold/10 transition-colors"
              disabled={isLoadingOverview}
            >
              {isLoadingOverview ? 'Refreshing...' : 'Refresh'}
            </button>
            <a
              href="/blackjack"
              className="px-3 py-2 rounded-lg border border-masque-gold/20 text-venetian-gold/70 hover:text-masque-gold"
            >
              Back to Game
            </a>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg border border-blood-ruby/50 text-blood-ruby hover:bg-blood-ruby/10 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {overviewError && (
          <div className="bg-blood-ruby/20 border border-blood-ruby/50 rounded-lg p-3 text-blood-ruby">
            {overviewError}
          </div>
        )}

        {actionMessage && (
          <div className="bg-masque-gold/10 border border-masque-gold/30 rounded-lg p-3 text-masque-gold">
            {actionMessage}
          </div>
        )}

        {overview && (
          <>
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <MetricCard
                label="User Liabilities"
                value={formatZec(overview.platform.liabilities)}
                detail={`${overview.platform.authenticatedSessions}/${overview.platform.totalSessions} verified sessions`}
              />
              <MetricCard
                label="Net Flow"
                value={formatZec(overview.platform.netFlow)}
                detail={`Deposited ${formatZec(overview.platform.totalDeposited)} • Withdrawn ${formatZec(overview.platform.totalWithdrawn)}`}
              />
              <MetricCard
                label="Pending Withdrawals"
                value={String(overview.transactions.pendingWithdrawalCount)}
                detail={`${overview.transactions.failedWithdrawalCount} failed all-time`}
              />
              <MetricCard
                label="Active Games"
                value={String(overview.platform.activeGames)}
                detail={`Total wagers ${formatZec(overview.platform.totalWagered)}`}
              />
              <MetricCard
                label="Failed Logins (24h)"
                value={String(overview.security.failedLoginAttempts24h)}
                detail={`${overview.security.rateLimitedEvents24h} rate-limited admin events`}
              />
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <h2 className="text-lg font-semibold text-bone-white mb-3">Infrastructure</h2>
                <div className="space-y-2 text-sm">
                  <StatusRow
                    label="Network"
                    value={overview.network}
                    positive
                  />
                  <StatusRow
                    label="Node"
                    value={
                      overview.nodeStatus.connected
                        ? overview.nodeStatus.synced
                          ? `Connected (height ${overview.nodeStatus.blockHeight})`
                          : `Connected (syncing at ${overview.nodeStatus.blockHeight})`
                        : 'Disconnected'
                    }
                    positive={overview.nodeStatus.connected}
                  />
                  <StatusRow
                    label="Pool Health"
                    value={
                      overview.pool.isHealthy
                        ? `${overview.pool.available} commitments available`
                        : `Low: ${overview.pool.available} available`
                    }
                    positive={overview.pool.isHealthy}
                  />
                  <StatusRow
                    label="Blockchain Commitments"
                    value={overview.pool.blockchainAvailable ? 'Available' : 'Unavailable'}
                    positive={overview.pool.blockchainAvailable}
                  />
                  {overview.nodeStatus.error && (
                    <div className="text-blood-ruby text-xs mt-2">
                      Node error: {overview.nodeStatus.error}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <h2 className="text-lg font-semibold text-bone-white mb-3">Pool & Transaction Totals</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <InlineStat label="Pool Available" value={String(overview.pool.available)} />
                  <InlineStat label="Pool Used" value={String(overview.pool.used)} />
                  <InlineStat label="Pool Expired" value={String(overview.pool.expired)} />
                  <InlineStat label="Pool Total" value={String(overview.pool.total)} />
                  <InlineStat
                    label="Confirmed Deposits"
                    value={`${overview.transactions.confirmedDepositCount} (${formatZec(overview.transactions.confirmedDepositVolume)})`}
                  />
                  <InlineStat
                    label="Confirmed Withdrawals"
                    value={`${overview.transactions.confirmedWithdrawalCount} (${formatZec(overview.transactions.confirmedWithdrawalVolume)})`}
                  />
                </div>
                <div className="text-xs text-venetian-gold/50 mt-3">
                  Last updated: {new Date(overview.timestamp).toLocaleString()}
                </div>
              </div>
            </section>

            <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-bone-white mb-3">Admin Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(Object.keys(ACTIONS) as AdminAction[]).map((action) => (
                  <button
                    key={action}
                    onClick={() => runAdminAction(action)}
                    disabled={runningAction !== null}
                    className="text-left p-3 rounded-lg border border-masque-gold/20 bg-midnight-black/60 hover:border-masque-gold/50 disabled:opacity-60"
                  >
                    <div className="text-bone-white font-medium">{ACTIONS[action].label}</div>
                    <div className="text-xs text-venetian-gold/60 mt-1">
                      {ACTIONS[action].description}
                    </div>
                    {runningAction === action && (
                      <div className="text-xs text-masque-gold mt-2">Running...</div>
                    )}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-bone-white mb-3">Pending Withdrawals</h2>

              {overview.pendingWithdrawals.length === 0 ? (
                <div className="text-venetian-gold/60 text-sm">No pending withdrawals.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-masque-gold/20 text-venetian-gold/60">
                        <th className="text-left py-2 px-1">Transaction</th>
                        <th className="text-left py-2 px-1">Session</th>
                        <th className="text-right py-2 px-1">Amount</th>
                        <th className="text-left py-2 px-1">Operation</th>
                        <th className="text-right py-2 px-1">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.pendingWithdrawals.map((withdrawal) => (
                        <tr key={withdrawal.id} className="border-b border-masque-gold/10">
                          <td className="py-2 px-1 font-mono text-bone-white">
                            {shortId(withdrawal.id)}
                          </td>
                          <td className="py-2 px-1">
                            <div className="font-mono text-bone-white">
                              {shortId(withdrawal.sessionId)}
                            </div>
                            <div className="text-xs text-venetian-gold/50">
                              Balance {formatZec(withdrawal.sessionBalance)}
                            </div>
                          </td>
                          <td className="py-2 px-1 text-right text-bone-white font-mono">
                            {formatZec(withdrawal.amount)}
                          </td>
                          <td className="py-2 px-1">
                            <span className="font-mono text-xs text-venetian-gold/70">
                              {withdrawal.operationId ? shortId(withdrawal.operationId) : 'n/a'}
                            </span>
                          </td>
                          <td className="py-2 px-1 text-right text-venetian-gold/50">
                            {new Date(withdrawal.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-bone-white mb-3">Recent Admin Audit Log</h2>

              {overview.auditLogs.length === 0 ? (
                <div className="text-venetian-gold/60 text-sm">No admin audit events yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-masque-gold/20 text-venetian-gold/60">
                        <th className="text-left py-2 px-1">Time</th>
                        <th className="text-left py-2 px-1">Action</th>
                        <th className="text-left py-2 px-1">Actor</th>
                        <th className="text-left py-2 px-1">IP</th>
                        <th className="text-left py-2 px-1">Result</th>
                        <th className="text-left py-2 px-1">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.auditLogs.map((entry) => (
                        <tr key={entry.id} className="border-b border-masque-gold/10">
                          <td className="py-2 px-1 text-venetian-gold/50">
                            {new Date(entry.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 px-1 font-mono text-bone-white">
                            {entry.action}
                          </td>
                          <td className="py-2 px-1 text-bone-white">
                            {entry.actor || '-'}
                          </td>
                          <td className="py-2 px-1 text-bone-white font-mono">
                            {entry.ipAddress || '-'}
                          </td>
                          <td className="py-2 px-1">
                            <span
                              className={
                                entry.success ? 'text-jester-purple font-medium' : 'text-blood-ruby font-medium'
                              }
                            >
                              {entry.success ? 'Success' : 'Failed'}
                            </span>
                          </td>
                          <td className="py-2 px-1 text-venetian-gold/70">
                            {entry.details || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
      <div className="text-sm text-venetian-gold/60">{label}</div>
      <div className="text-2xl font-bold text-masque-gold mt-1">{value}</div>
      <div className="text-xs text-venetian-gold/50 mt-2">{detail}</div>
    </div>
  )
}

function StatusRow({
  label,
  value,
  positive,
}: {
  label: string
  value: string
  positive: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-venetian-gold/60">{label}</span>
      <span className={positive ? 'text-jester-purple' : 'text-blood-ruby'}>{value}</span>
    </div>
  )
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-midnight-black/70 border border-masque-gold/10 rounded-lg p-2">
      <div className="text-xs text-venetian-gold/60">{label}</div>
      <div className="text-sm text-bone-white mt-1">{value}</div>
    </div>
  )
}
