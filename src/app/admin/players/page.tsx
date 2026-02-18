'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

function formatZec(value: number): string {
  return `${value.toFixed(4)} ZEC`
}

function shortId(value: string, prefix = 8, suffix = 6): string {
  if (value.length <= prefix + suffix + 3) return value
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface PlayerRow {
  id: string
  walletAddress: string
  balance: number
  totalDeposited: number
  totalWithdrawn: number
  totalWagered: number
  totalWon: number
  housePnl: number
  isAuthenticated: boolean
  lastActiveAt: string
  createdAt: string
  depositLimit: number | null
  lossLimit: number | null
  sessionLimit: number | null
  excludedUntil: string | null
  riskLevel?: string
  riskFlagCount?: number
}

type SortField = 'balance' | 'wagered' | 'pnl'
type RiskFilter = '' | 'low' | 'medium' | 'high' | 'critical'

const RISK_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  low: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', label: 'LOW' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'MED' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', label: 'HIGH' },
  critical: { bg: 'bg-blood-ruby/20', text: 'text-blood-ruby', border: 'border-blood-ruby/40', label: 'CRIT' },
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortField>('wagered')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [offset, setOffset] = useState(0)
  const [highRollers, setHighRollers] = useState(false)
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('')
  const [exporting, setExporting] = useState(false)
  const limit = 25

  // High-roller IDs for badge display
  const [highRollerIds, setHighRollerIds] = useState<Set<string>>(new Set())

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setOffset(0) // Reset to first page on new search
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Fetch high roller IDs on mount (for badge display regardless of current filter)
  useEffect(() => {
    async function fetchHighRollers() {
      try {
        const res = await fetch('/api/admin/players?highRollers=true')
        if (res.ok) {
          const data = await res.json()
          setHighRollerIds(new Set(data.sessions.map((s: PlayerRow) => s.id)))
        }
      } catch {
        // Non-critical, ignore
      }
    }
    fetchHighRollers()
  }, [])

  const fetchPlayers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sortParam = sort === 'wagered' ? 'totalWagered' : sort
      const params = new URLSearchParams({
        sort: sortParam,
        order,
        limit: String(limit),
        offset: String(offset),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (highRollers) params.set('highRollers', 'true')
      if (riskFilter) params.set('riskLevel', riskFilter)

      const res = await fetch(`/api/admin/players?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setPlayers(data.sessions)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch players')
    } finally {
      setLoading(false)
    }
  }, [sort, order, offset, debouncedSearch, highRollers, riskFilter])

  useEffect(() => {
    fetchPlayers()
  }, [fetchPlayers])

  async function handleExportCsv() {
    setExporting(true)
    try {
      const sortParam = sort === 'wagered' ? 'totalWagered' : sort
      const params = new URLSearchParams({ sort: sortParam, order, format: 'csv' })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (highRollers) params.set('highRollers', 'true')

      const res = await fetch(`/api/admin/players?${params}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `players-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('CSV export failed')
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="min-h-screen bg-midnight-black text-bone-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)]">
            Player Explorer
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCsv}
              disabled={exporting}
              className="px-3 py-1.5 text-sm border border-masque-gold/30 rounded text-venetian-gold hover:text-masque-gold hover:border-masque-gold/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-6">
          {/* Search */}
          <div className="flex-1 min-w-[250px]">
            <input
              type="text"
              placeholder="Search by session ID, wallet, or withdrawal address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white placeholder-bone-white/40 focus:border-masque-gold focus:outline-none text-sm"
            />
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortField)
              setOffset(0)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
          >
            <option value="wagered">Sort: Wagered</option>
            <option value="balance">Sort: Balance</option>
            <option value="pnl">Sort: House P&L</option>
          </select>

          {/* Order toggle */}
          <button
            onClick={() => {
              setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
              setOffset(0)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm hover:border-masque-gold transition-colors"
          >
            {order === 'desc' ? 'Desc' : 'Asc'}
          </button>

          {/* Risk filter */}
          <select
            value={riskFilter}
            onChange={(e) => {
              setRiskFilter(e.target.value as RiskFilter)
              setOffset(0)
            }}
            className="px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
          >
            <option value="">Risk: All</option>
            <option value="low">Risk: Low</option>
            <option value="medium">Risk: Medium</option>
            <option value="high">Risk: High</option>
            <option value="critical">Risk: Critical</option>
          </select>

          {/* High rollers toggle */}
          <button
            onClick={() => {
              setHighRollers((h) => !h)
              setOffset(0)
            }}
            className={`px-3 py-2 rounded text-sm transition-colors ${
              highRollers
                ? 'bg-masque-gold text-midnight-black font-semibold'
                : 'bg-midnight-black border border-masque-gold/30 text-bone-white hover:border-masque-gold'
            }`}
          >
            High Rollers
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-blood-ruby/20 border border-blood-ruby/40 rounded text-blood-ruby text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto border border-masque-gold/20 rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-masque-gold/20 bg-midnight-black/80">
                <th className="text-left px-4 py-3 text-masque-gold font-semibold">Session ID</th>
                <th className="text-center px-4 py-3 text-masque-gold font-semibold">Risk</th>
                <th className="text-right px-4 py-3 text-masque-gold font-semibold">Balance</th>
                <th className="text-right px-4 py-3 text-masque-gold font-semibold">Wagered</th>
                <th className="text-right px-4 py-3 text-masque-gold font-semibold">Won</th>
                <th className="text-right px-4 py-3 text-masque-gold font-semibold">House P&L</th>
                <th className="text-center px-4 py-3 text-masque-gold font-semibold">Auth</th>
                <th className="text-right px-4 py-3 text-masque-gold font-semibold">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-bone-white/50">
                    Loading players...
                  </td>
                </tr>
              ) : players.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-bone-white/50">
                    No players found.
                  </td>
                </tr>
              ) : (
                players.map((p) => {
                  const isHighRoller = highRollerIds.has(p.id)
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-masque-gold/10 hover:bg-masque-gold/5 transition-colors ${
                        isHighRoller ? 'border-l-2 border-l-masque-gold' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/players/${p.id}`}
                          className="text-venetian-gold hover:text-masque-gold transition-colors font-mono"
                        >
                          {shortId(p.id)}
                        </Link>
                        {isHighRoller && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-masque-gold/20 text-masque-gold border border-masque-gold/40 rounded font-semibold">
                            HIGH ROLLER
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const rl = p.riskLevel || 'low'
                          const rc = RISK_COLORS[rl] || RISK_COLORS.low
                          return rl !== 'low' ? (
                            <span className={`text-[10px] px-1.5 py-0.5 ${rc.bg} ${rc.text} border ${rc.border} rounded font-semibold`}>
                              {rc.label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-bone-white/30">—</span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-bone-white">
                        {formatZec(p.balance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-bone-white">
                        {formatZec(p.totalWagered)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-bone-white">
                        {formatZec(p.totalWon)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          p.housePnl >= 0 ? 'text-green-400' : 'text-blood-ruby'
                        }`}
                      >
                        {p.housePnl >= 0 ? '+' : ''}
                        {formatZec(p.housePnl)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.isAuthenticated ? (
                          <span className="text-green-400 text-xs font-semibold">YES</span>
                        ) : (
                          <span className="text-bone-white/40 text-xs">NO</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-bone-white/60 text-xs">
                        {formatDate(p.lastActiveAt)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!highRollers && total > limit && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-bone-white/50">
              Showing {offset + 1}--{Math.min(offset + limit, total)} of {total} players
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                disabled={offset === 0}
                className="px-3 py-1.5 text-sm bg-midnight-black border border-masque-gold/30 rounded text-bone-white hover:border-masque-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="px-3 py-1.5 text-sm text-bone-white/60">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setOffset((o) => o + limit)}
                disabled={offset + limit >= total}
                className="px-3 py-1.5 text-sm bg-midnight-black border border-masque-gold/30 rounded text-bone-white hover:border-masque-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Summary footer */}
        <div className="mt-4 text-xs text-bone-white/30">
          Total players: {total}
        </div>
      </div>
    </div>
  )
}
