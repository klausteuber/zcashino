'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface GameListItem {
  id: string
  type: 'blackjack' | 'videoPoker'
  sessionId: string
  bet: number
  outcome: string | null
  payout: number | null
  status: string
  createdAt: string
  completedAt: string | null
}

interface GamesResponse {
  games: GameListItem[]
  total: number
  limit: number
  offset: number
}

function formatZec(value: number | null): string {
  if (value === null || value === undefined) return '0.0000 ZEC'
  return `${value.toFixed(4)} ZEC`
}

function shortId(value: string, prefix = 8, suffix = 6): string {
  if (value.length <= prefix + suffix + 3) return value
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function outcomeLabel(outcome: string | null): string {
  if (!outcome) return '-'
  const labels: Record<string, string> = {
    win: 'Win',
    lose: 'Loss',
    push: 'Push',
    blackjack: 'Blackjack',
    surrender: 'Surrender',
    royal_flush: 'Royal Flush',
    straight_flush: 'Straight Flush',
    four_of_a_kind: 'Four of a Kind',
    full_house: 'Full House',
    flush: 'Flush',
    straight: 'Straight',
    three_of_a_kind: 'Three of a Kind',
    two_pair: 'Two Pair',
    jacks_or_better: 'Jacks or Better',
    nothing: 'Nothing',
  }
  return labels[outcome] || outcome
}

function outcomeColor(outcome: string | null): string {
  if (!outcome) return 'text-bone-white/60'
  switch (outcome) {
    case 'win':
    case 'blackjack':
    case 'royal_flush':
    case 'straight_flush':
    case 'four_of_a_kind':
      return 'text-masque-gold'
    case 'lose':
    case 'nothing':
      return 'text-blood-ruby'
    case 'push':
      return 'text-bone-white/60'
    case 'surrender':
      return 'text-jester-purple'
    default:
      return 'text-venetian-gold'
  }
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<GameListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [outcomeFilter, setOutcomeFilter] = useState<string>('')
  const [minPayout, setMinPayout] = useState<string>('')
  const [sessionIdFilter, setSessionIdFilter] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  // Sort and pagination
  const [sort, setSort] = useState<string>('date')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [limit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [exporting, setExporting] = useState(false)

  const fetchGames = useCallback(async () => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (typeFilter) params.set('type', typeFilter)
    if (outcomeFilter) params.set('outcome', outcomeFilter)
    if (minPayout) params.set('minPayout', minPayout)
    if (sessionIdFilter) params.set('sessionId', sessionIdFilter)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    params.set('sort', sort)
    params.set('order', order)
    params.set('limit', String(limit))
    params.set('offset', String(offset))

    try {
      const res = await fetch(`/api/admin/games?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: GamesResponse = await res.json()
      setGames(data.games)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch games')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, outcomeFilter, minPayout, sessionIdFilter, fromDate, toDate, sort, order, limit, offset])

  useEffect(() => {
    fetchGames()
  }, [fetchGames])

  function handleApplyFilters() {
    setOffset(0)
    fetchGames()
  }

  function handleClearFilters() {
    setTypeFilter('')
    setOutcomeFilter('')
    setMinPayout('')
    setSessionIdFilter('')
    setFromDate('')
    setToDate('')
    setOffset(0)
  }

  function toggleSort(field: string) {
    if (sort === field) {
      setOrder(order === 'desc' ? 'asc' : 'desc')
    } else {
      setSort(field)
      setOrder('desc')
    }
    setOffset(0)
  }

  async function handleExportCsv() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ format: 'csv', sort, order })
      if (typeFilter) params.set('type', typeFilter)
      if (outcomeFilter) params.set('outcome', outcomeFilter)
      if (minPayout) params.set('minPayout', minPayout)
      if (sessionIdFilter) params.set('sessionId', sessionIdFilter)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)

      const res = await fetch(`/api/admin/games?${params.toString()}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `games-${new Date().toISOString().slice(0, 10)}.csv`
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
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)]">
            Game History
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

        {/* Filters */}
        <div className="bg-midnight-black/80 border border-masque-gold/20 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Game Type */}
            <div>
              <label className="block text-xs text-bone-white/60 mb-1">Game Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-midnight-black border border-masque-gold/30 rounded px-3 py-2 text-sm text-bone-white focus:border-masque-gold focus:outline-none"
              >
                <option value="">All</option>
                <option value="blackjack">Blackjack</option>
                <option value="videoPoker">Video Poker</option>
              </select>
            </div>

            {/* Outcome */}
            <div>
              <label className="block text-xs text-bone-white/60 mb-1">Outcome</label>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="w-full bg-midnight-black border border-masque-gold/30 rounded px-3 py-2 text-sm text-bone-white focus:border-masque-gold focus:outline-none"
              >
                <option value="">All</option>
                <optgroup label="Blackjack">
                  <option value="win">Win</option>
                  <option value="lose">Loss</option>
                  <option value="push">Push</option>
                  <option value="blackjack">Blackjack</option>
                  <option value="surrender">Surrender</option>
                </optgroup>
                <optgroup label="Video Poker">
                  <option value="royal_flush">Royal Flush</option>
                  <option value="straight_flush">Straight Flush</option>
                  <option value="four_of_a_kind">Four of a Kind</option>
                  <option value="full_house">Full House</option>
                  <option value="flush">Flush</option>
                  <option value="straight">Straight</option>
                  <option value="three_of_a_kind">Three of a Kind</option>
                  <option value="two_pair">Two Pair</option>
                  <option value="jacks_or_better">Jacks or Better</option>
                  <option value="nothing">Nothing</option>
                </optgroup>
              </select>
            </div>

            {/* Min Payout */}
            <div>
              <label className="block text-xs text-bone-white/60 mb-1">Min Payout (ZEC)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minPayout}
                onChange={(e) => setMinPayout(e.target.value)}
                placeholder="e.g. 1.0"
                className="w-full bg-midnight-black border border-masque-gold/30 rounded px-3 py-2 text-sm text-bone-white focus:border-masque-gold focus:outline-none placeholder:text-bone-white/30"
              />
            </div>

            {/* Session ID */}
            <div>
              <label className="block text-xs text-bone-white/60 mb-1">Session ID</label>
              <input
                type="text"
                value={sessionIdFilter}
                onChange={(e) => setSessionIdFilter(e.target.value)}
                placeholder="Filter by session"
                className="w-full bg-midnight-black border border-masque-gold/30 rounded px-3 py-2 text-sm text-bone-white focus:border-masque-gold focus:outline-none placeholder:text-bone-white/30"
              />
            </div>

            {/* From Date */}
            <div>
              <label className="block text-xs text-bone-white/60 mb-1">From</label>
              <input
                type="datetime-local"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-midnight-black border border-masque-gold/30 rounded px-3 py-2 text-sm text-bone-white focus:border-masque-gold focus:outline-none"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-xs text-bone-white/60 mb-1">To</label>
              <input
                type="datetime-local"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-midnight-black border border-masque-gold/30 rounded px-3 py-2 text-sm text-bone-white focus:border-masque-gold focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleApplyFilters}
              className="px-4 py-2 bg-masque-gold/20 border border-masque-gold/40 rounded text-sm text-masque-gold hover:bg-masque-gold/30 transition-colors"
            >
              Apply Filters
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 bg-transparent border border-bone-white/20 rounded text-sm text-bone-white/60 hover:text-bone-white hover:border-bone-white/40 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-blood-ruby/20 border border-blood-ruby/40 rounded-lg p-4 mb-6">
            <p className="text-blood-ruby text-sm">{error}</p>
          </div>
        )}

        {/* Table */}
        <div className="bg-midnight-black/80 border border-masque-gold/20 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-masque-gold/20">
                  <th className="text-left px-4 py-3 text-masque-gold/80 font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-masque-gold/80 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-masque-gold/80 font-medium">Bet</th>
                  <th className="text-left px-4 py-3 text-masque-gold/80 font-medium">Outcome</th>
                  <th
                    className="text-left px-4 py-3 text-masque-gold/80 font-medium cursor-pointer hover:text-masque-gold select-none"
                    onClick={() => toggleSort('payout')}
                  >
                    Payout {sort === 'payout' ? (order === 'desc' ? '\u2193' : '\u2191') : ''}
                  </th>
                  <th className="text-left px-4 py-3 text-masque-gold/80 font-medium">Session</th>
                  <th
                    className="text-left px-4 py-3 text-masque-gold/80 font-medium cursor-pointer hover:text-masque-gold select-none"
                    onClick={() => toggleSort('date')}
                  >
                    Date {sort === 'date' ? (order === 'desc' ? '\u2193' : '\u2191') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-bone-white/40">
                      Loading games...
                    </td>
                  </tr>
                ) : games.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-bone-white/40">
                      No games found
                    </td>
                  </tr>
                ) : (
                  games.map((game) => {
                    const isLargeWin = (game.payout ?? 0) > 1
                    return (
                      <tr
                        key={game.id}
                        className={`border-b border-masque-gold/10 hover:bg-masque-gold/5 transition-colors ${
                          isLargeWin ? 'border-l-2 border-l-masque-gold bg-masque-gold/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/games/${game.id}`}
                            className="text-venetian-gold hover:text-masque-gold transition-colors font-mono text-xs"
                          >
                            {shortId(game.id)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                            game.type === 'blackjack'
                              ? 'bg-jester-purple/20 text-jester-purple'
                              : 'bg-venetian-gold/20 text-venetian-gold'
                          }`}>
                            {game.type === 'blackjack' ? 'BJ' : 'VP'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {formatZec(game.bet)}
                        </td>
                        <td className={`px-4 py-3 font-medium ${outcomeColor(game.outcome)}`}>
                          {outcomeLabel(game.outcome)}
                        </td>
                        <td className={`px-4 py-3 font-mono text-xs ${isLargeWin ? 'text-masque-gold font-bold' : ''}`}>
                          {formatZec(game.payout)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/players/${game.sessionId}`}
                            className="text-venetian-gold/70 hover:text-venetian-gold transition-colors font-mono text-xs"
                          >
                            {shortId(game.sessionId)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-bone-white/60 text-xs">
                          {formatDate(game.completedAt)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-masque-gold/20">
              <p className="text-xs text-bone-white/40">
                Showing {offset + 1}-{Math.min(offset + limit, total)} of {total} games
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-3 py-1 text-xs border border-masque-gold/30 rounded text-bone-white/60 hover:text-bone-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-xs text-bone-white/40">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                  className="px-3 py-1 text-xs border border-masque-gold/30 rounded text-bone-white/60 hover:text-bone-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
