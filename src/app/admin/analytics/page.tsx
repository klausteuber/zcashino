'use client'

import { useCallback, useEffect, useState } from 'react'
import GGRChart from '@/components/admin/charts/GGRChart'
import DepositWithdrawalChart from '@/components/admin/charts/DepositWithdrawalChart'
import WagerTrendChart from '@/components/admin/charts/WagerTrendChart'
import RTPDisplay from '@/components/admin/charts/RTPDisplay'
import SessionTrendChart from '@/components/admin/charts/SessionTrendChart'
import { useZecPrice } from '@/hooks/useZecPrice'

type Period = '24h' | '7d' | '30d' | 'all'

interface DailyTrend {
  date: string
  deposits: number
  withdrawals: number
  netFlow: number
  bjWagered: number
  bjPayout: number
  vpWagered: number
  vpPayout: number
  activeSessions: number
  totalWagered: number
  totalPayout: number
  ggr: number
  priceUsd: number | null
  ggrUsd: number | null
  wageredUsd: number | null
}

interface RetentionCohort {
  cohortDate: string
  cohortSize: number
  d1: number
  d7: number
  d30: number
  d1Pct: number
  d7Pct: number
  d30Pct: number
}

interface HeatmapCell {
  dow: number
  hour: number
  hands: number
  wagered: number
}

interface AnalyticsData {
  period: string
  periodStart: string
  summary: {
    realizedGGR: {
      totalWagered: number
      totalPayout: number
      ggr: number
      houseEdgePct: number
    }
    activeExposure: {
      activeGames: number
    }
  }
  byGame: {
    blackjack: { hands: number; wagered: number; payout: number; rtp: number }
    videoPoker: {
      hands: number
      wagered: number
      payout: number
      rtp: number
      handRankBreakdown: Record<string, number>
    }
  }
  sideBets: {
    perfectPairs: { count: number; wagered: number }
    insurance: { count: number; wagered: number }
  }
  theoretical: {
    blackjackRTP: number
    videoPokerRTP: number
  }
  trends: {
    daily: DailyTrend[]
  }
  retention?: {
    newSessionsByDay: Array<{ date: string; count: number }>
    firstWagerByDay: Array<{ date: string; count: number }>
    cohorts: RetentionCohort[]
  }
  activityPatterns?: {
    heatmap: HeatmapCell[]
  }
}

const PERIODS: { key: Period; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All' },
]

function formatZec(value: number): string {
  return `${value.toFixed(4)} ZEC`
}

type Tab = 'overview' | 'retention' | 'activity'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'retention', label: 'Retention' },
  { key: 'activity', label: 'Activity Patterns' },
]

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function retentionColor(pct: number): string {
  if (pct >= 50) return 'bg-jester-purple/60 text-bone-white'
  if (pct >= 30) return 'bg-jester-purple/40 text-bone-white'
  if (pct >= 15) return 'bg-jester-purple/20 text-bone-white'
  if (pct > 0) return 'bg-jester-purple/10 text-venetian-gold/80'
  return 'text-venetian-gold/40'
}

function heatmapColor(value: number, max: number): string {
  if (max === 0 || value === 0) return 'bg-midnight-black/70'
  const intensity = value / max
  if (intensity > 0.75) return 'bg-jester-purple/70'
  if (intensity > 0.5) return 'bg-jester-purple/50'
  if (intensity > 0.25) return 'bg-jester-purple/30'
  return 'bg-jester-purple/15'
}

export default function AnalyticsPage() {
  const { formatZecWithUsd } = useZecPrice()
  const [period, setPeriod] = useState<Period>('7d')
  const [tab, setTab] = useState<Tab>('overview')
  const [showUsd, setShowUsd] = useState(false)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const fetchAnalytics = useCallback(async (p: Period) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/analytics?period=${p}`, {
        cache: 'no-store',
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Failed to load analytics.')
      }

      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics(period)
  }, [period, fetchAnalytics])

  async function handleExportCsv() {
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/analytics?period=${period}&format=csv`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('CSV export failed')
    } finally {
      setExporting(false)
    }
  }

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchAnalytics(period).catch(() => {
        // Errors are surfaced in state.
      })
    }, 60_000)

    return () => clearInterval(intervalId)
  }, [period, fetchAnalytics])

  const ggrChartData = (data?.trends.daily ?? []).map((d) => ({
    date: d.date,
    ggr: showUsd && d.ggrUsd !== null ? d.ggrUsd : d.ggr,
  }))

  const hasUsdData = (data?.trends.daily ?? []).some((d) => d.priceUsd !== null)

  const depositWithdrawalData = (data?.trends.daily ?? []).map((d) => ({
    date: d.date,
    deposits: d.deposits,
    withdrawals: d.withdrawals,
  }))

  const wagerTrendData = (data?.trends.daily ?? []).map((d) => ({
    date: d.date,
    vpWagered: d.vpWagered,
    bjWagered: d.bjWagered,
    bjPayout: d.bjPayout,
    vpPayout: d.vpPayout,
  }))

  const sessionTrendData = (data?.trends.daily ?? []).map((d) => ({
    date: d.date,
    activeSessions: d.activeSessions,
  }))

  const peakDailySessions =
    sessionTrendData.length > 0
      ? Math.max(...sessionTrendData.map((d) => d.activeSessions))
      : 0

  const avgDailySessions =
    sessionTrendData.length > 0
      ? (
          sessionTrendData.reduce((sum, d) => sum + d.activeSessions, 0) /
          sessionTrendData.length
        ).toFixed(1)
      : '0.0'

  return (
    <main className="min-h-screen felt-texture pb-10">
      {/* Header */}
      <header className="border-b border-masque-gold/20 bg-midnight-black/40 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-bone-white">
              Analytics
            </h1>
            <p className="text-xs text-venetian-gold/60 mt-0.5">
              {data
                ? `${data.period} from ${new Date(data.periodStart).toLocaleDateString()}`
                : 'Loading...'}
            </p>
          </div>

          {/* Period Selector + Export */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    period === p.key
                      ? 'bg-masque-gold/20 border border-masque-gold/60 text-masque-gold'
                      : 'border border-masque-gold/20 text-venetian-gold/50 hover:text-masque-gold hover:border-masque-gold/40'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleExportCsv}
              disabled={exporting || !data}
              className="px-3 py-1.5 text-sm border border-masque-gold/30 rounded-lg text-venetian-gold hover:text-masque-gold hover:border-masque-gold/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="container mx-auto px-4 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-masque-gold text-masque-gold'
                  : 'border-transparent text-venetian-gold/50 hover:text-venetian-gold/80'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Loading State */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="bg-midnight-black/60 border border-masque-gold/20 rounded-xl p-6 text-venetian-gold/70">
              Loading analytics...
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-blood-ruby/20 border border-blood-ruby/50 rounded-lg p-3 text-blood-ruby">
            {error}
          </div>
        )}

        {data && tab === 'overview' && (
          <>
            {/* Variance warning for tiny sample sizes */}
            {data.byGame.blackjack.hands + data.byGame.videoPoker.hands < 500 && (
              <div className="bg-masque-gold/10 border border-masque-gold/30 rounded-lg p-3 text-sm text-venetian-gold/80">
                Low sample size ({data.byGame.blackjack.hands + data.byGame.videoPoker.hands} total hands). Short-term variance can dominate realized house edge.
              </div>
            )}
            {/* Summary GGR Cards */}
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="text-sm text-venetian-gold/60">
                  Gross Gaming Revenue
                </div>
                <div
                  className={`text-2xl font-bold mt-1 ${
                    data.summary.realizedGGR.ggr >= 0
                      ? 'text-jester-purple'
                      : 'text-blood-ruby'
                  }`}
                >
                  {formatZecWithUsd(data.summary.realizedGGR.ggr)}
                </div>
                <div className="text-xs text-venetian-gold/50 mt-2">
                  House edge: {data.summary.realizedGGR.houseEdgePct.toFixed(2)}%
                </div>
              </div>

              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="text-sm text-venetian-gold/60">Total Wagered</div>
                <div className="text-2xl font-bold text-masque-gold mt-1">
                  {formatZecWithUsd(data.summary.realizedGGR.totalWagered)}
                </div>
                <div className="text-xs text-venetian-gold/50 mt-2">
                  Total payout: {formatZecWithUsd(data.summary.realizedGGR.totalPayout)}
                </div>
              </div>

              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="text-sm text-venetian-gold/60">Total Payout</div>
                <div className="text-2xl font-bold text-masque-gold mt-1">
                  {formatZecWithUsd(data.summary.realizedGGR.totalPayout)}
                </div>
                <div className="text-xs text-venetian-gold/50 mt-2">
                  {data.summary.activeExposure.activeGames} active game(s)
                </div>
              </div>

              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="text-sm text-venetian-gold/60">House Edge</div>
                <div
                  className={`text-2xl font-bold mt-1 ${
                    data.summary.realizedGGR.houseEdgePct >= 0
                      ? 'text-jester-purple'
                      : 'text-blood-ruby'
                  }`}
                >
                  {data.summary.realizedGGR.houseEdgePct.toFixed(2)}%
                </div>
                <div className="text-xs text-venetian-gold/50 mt-2">
                  Realized over {data.period}
                </div>
              </div>
            </section>

            {/* Charts Grid */}
            <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* GGR Over Time */}
              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-bone-white">
                    GGR Over Time
                  </h2>
                  {hasUsdData && (
                    <button
                      onClick={() => setShowUsd(!showUsd)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        showUsd
                          ? 'bg-masque-gold/20 border-masque-gold/60 text-masque-gold'
                          : 'border-masque-gold/20 text-venetian-gold/50 hover:text-masque-gold'
                      }`}
                    >
                      {showUsd ? 'USD' : 'ZEC'}
                    </button>
                  )}
                </div>
                <GGRChart data={ggrChartData} />
              </div>

              {/* Deposits vs Withdrawals */}
              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <h2 className="text-lg font-semibold text-bone-white mb-3">
                  Deposits vs Withdrawals
                </h2>
                <DepositWithdrawalChart data={depositWithdrawalData} />
              </div>

              {/* Wager / Payout Trends */}
              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <h2 className="text-lg font-semibold text-bone-white mb-3">
                  Wager / Payout Trends
                </h2>
                <WagerTrendChart data={wagerTrendData} />
              </div>

              {/* RTP Display */}
              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <h2 className="text-lg font-semibold text-bone-white mb-3">
                  Return to Player
                </h2>
                <RTPDisplay
                  blackjack={data.byGame.blackjack}
                  videoPoker={data.byGame.videoPoker}
                  theoretical={data.theoretical}
                  totalWagered={data.summary.realizedGGR.totalWagered}
                  totalPayout={data.summary.realizedGGR.totalPayout}
                />
              </div>
            </section>

            {/* Player Activity */}
            <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-bone-white mb-3">
                Player Activity
              </h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-midnight-black/70 border border-masque-gold/10 rounded-lg p-3">
                  <div className="text-sm text-venetian-gold/60">
                    Peak Daily Sessions
                  </div>
                  <div className="text-2xl font-bold text-teal-400 mt-1 font-mono">
                    {peakDailySessions}
                  </div>
                </div>
                <div className="bg-midnight-black/70 border border-masque-gold/10 rounded-lg p-3">
                  <div className="text-sm text-venetian-gold/60">
                    Avg Daily Sessions
                  </div>
                  <div className="text-2xl font-bold text-teal-400 mt-1 font-mono">
                    {avgDailySessions}
                  </div>
                </div>
              </div>
              <SessionTrendChart data={sessionTrendData} />
            </section>

            {/* Per-Game Breakdown */}
            <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-bone-white mb-3">
                Per-Game Breakdown
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Blackjack */}
                <div className="bg-midnight-black/70 border border-masque-gold/10 rounded-lg p-3">
                  <div className="text-sm text-venetian-gold/60 mb-2">
                    Blackjack
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Hands Played</span>
                      <span className="text-bone-white font-mono">
                        {data.byGame.blackjack.hands}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Total Wagered</span>
                      <span className="text-bone-white font-mono">
                        {formatZec(data.byGame.blackjack.wagered)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Total Payout</span>
                      <span className="text-bone-white font-mono">
                        {formatZec(data.byGame.blackjack.payout)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">RTP</span>
                      <span
                        className={`font-mono font-medium ${
                          data.byGame.blackjack.rtp > 100
                            ? 'text-blood-ruby'
                            : 'text-jester-purple'
                        }`}
                      >
                        {data.byGame.blackjack.rtp.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Video Poker */}
                <div className="bg-midnight-black/70 border border-masque-gold/10 rounded-lg p-3">
                  <div className="text-sm text-venetian-gold/60 mb-2">
                    Video Poker
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Hands Played</span>
                      <span className="text-bone-white font-mono">
                        {data.byGame.videoPoker.hands}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Total Wagered</span>
                      <span className="text-bone-white font-mono">
                        {formatZec(data.byGame.videoPoker.wagered)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Total Payout</span>
                      <span className="text-bone-white font-mono">
                        {formatZec(data.byGame.videoPoker.payout)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">RTP</span>
                      <span
                        className={`font-mono font-medium ${
                          data.byGame.videoPoker.rtp > 100
                            ? 'text-blood-ruby'
                            : 'text-jester-purple'
                        }`}
                      >
                        {data.byGame.videoPoker.rtp.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Video Poker Hand Rank Distribution */}
            <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-bone-white mb-3">
                Video Poker Hand Distribution
              </h2>
              {Object.keys(data.byGame.videoPoker.handRankBreakdown).length === 0 ? (
                <div className="text-venetian-gold/50 text-sm">
                  No video poker hand data for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-masque-gold/20 text-venetian-gold/60">
                        <th className="text-left py-2 px-2">Hand Rank</th>
                        <th className="text-right py-2 px-2">Count</th>
                        <th className="text-right py-2 px-2">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const breakdown = data.byGame.videoPoker.handRankBreakdown
                        const totalHands = Object.values(breakdown).reduce(
                          (sum, count) => sum + count,
                          0
                        )
                        const sorted = Object.entries(breakdown).sort(
                          ([, a], [, b]) => b - a
                        )

                        return sorted.map(([rank, count]) => (
                          <tr
                            key={rank}
                            className="border-b border-masque-gold/10"
                          >
                            <td className="py-2 px-2 text-bone-white">
                              {rank}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-bone-white">
                              {count}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-masque-gold">
                              {totalHands > 0
                                ? ((count / totalHands) * 100).toFixed(1)
                                : '0.0'}
                              %
                            </td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Side Bet Stats */}
            <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-bone-white mb-3">
                Side Bets
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-midnight-black/70 border border-masque-gold/10 rounded-lg p-3">
                  <div className="text-sm text-venetian-gold/60 mb-2">
                    Perfect Pairs
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Bets Placed</span>
                      <span className="text-bone-white font-mono">
                        {data.sideBets.perfectPairs.count}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Total Wagered</span>
                      <span className="text-bone-white font-mono">
                        {formatZec(data.sideBets.perfectPairs.wagered)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-midnight-black/70 border border-masque-gold/10 rounded-lg p-3">
                  <div className="text-sm text-venetian-gold/60 mb-2">
                    Insurance
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Bets Placed</span>
                      <span className="text-bone-white font-mono">
                        {data.sideBets.insurance.count}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-venetian-gold/60">Total Wagered</span>
                      <span className="text-bone-white font-mono">
                        {formatZec(data.sideBets.insurance.wagered)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ===== Retention Tab ===== */}
        {data && tab === 'retention' && (
          <>
            {/* Acquisition Summary Cards */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="text-sm text-venetian-gold/60">New Sessions</div>
                <div className="text-2xl font-bold text-masque-gold mt-1 font-mono">
                  {(data.retention?.newSessionsByDay ?? []).reduce((s, d) => s + d.count, 0)}
                </div>
                <div className="text-xs text-venetian-gold/50 mt-2">In selected period</div>
              </div>
              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="text-sm text-venetian-gold/60">First-Time Players</div>
                <div className="text-2xl font-bold text-jester-purple mt-1 font-mono">
                  {(data.retention?.firstWagerByDay ?? []).reduce((s, d) => s + d.count, 0)}
                </div>
                <div className="text-xs text-venetian-gold/50 mt-2">Sessions that placed first wager</div>
              </div>
              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="text-sm text-venetian-gold/60">Avg D1 Retention</div>
                <div className="text-2xl font-bold text-teal-400 mt-1 font-mono">
                  {(() => {
                    const cohorts = data.retention?.cohorts ?? []
                    if (cohorts.length === 0) return '0%'
                    const avg = cohorts.reduce((s, c) => s + c.d1Pct, 0) / cohorts.length
                    return `${Math.round(avg)}%`
                  })()}
                </div>
                <div className="text-xs text-venetian-gold/50 mt-2">Return within 1 day</div>
              </div>
            </section>

            {/* Acquisition Chart - New Sessions vs First Wager per Day */}
            <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-bone-white mb-3">
                Acquisition: New Sessions vs First Wagers
              </h2>
              {(data.retention?.newSessionsByDay ?? []).length === 0 ? (
                <div className="text-venetian-gold/50 text-sm py-8 text-center">
                  No acquisition data for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-masque-gold/20 text-venetian-gold/60">
                        <th className="text-left py-2 px-2">Date</th>
                        <th className="text-right py-2 px-2">New Sessions</th>
                        <th className="text-right py-2 px-2">First Wagers</th>
                        <th className="text-right py-2 px-2">Activation %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const sessions = data.retention?.newSessionsByDay ?? []
                        const wagers = data.retention?.firstWagerByDay ?? []
                        const wagerMap = new Map(wagers.map((w) => [w.date, w.count]))
                        return sessions.map((s) => {
                          const fw = wagerMap.get(s.date) ?? 0
                          const pct = s.count > 0 ? Math.round((fw / s.count) * 100) : 0
                          return (
                            <tr key={s.date} className="border-b border-masque-gold/10">
                              <td className="py-2 px-2 text-bone-white">{s.date}</td>
                              <td className="py-2 px-2 text-right font-mono text-bone-white">{s.count}</td>
                              <td className="py-2 px-2 text-right font-mono text-jester-purple">{fw}</td>
                              <td className="py-2 px-2 text-right font-mono text-masque-gold">{pct}%</td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Cohort Retention Table */}
            <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-bone-white mb-1">
                Cohort Retention
              </h2>
              <p className="text-xs text-venetian-gold/50 mb-3">
                Only sessions that placed at least one wager. D1/D7/D30 = % active after N days.
              </p>
              {(data.retention?.cohorts ?? []).length === 0 ? (
                <div className="text-venetian-gold/50 text-sm py-8 text-center">
                  No retention cohort data for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-masque-gold/20 text-venetian-gold/60">
                        <th className="text-left py-2 px-2">Cohort Date</th>
                        <th className="text-right py-2 px-2">Size</th>
                        <th className="text-center py-2 px-3">D1</th>
                        <th className="text-center py-2 px-3">D7</th>
                        <th className="text-center py-2 px-3">D30</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.retention?.cohorts ?? []).map((c) => (
                        <tr key={c.cohortDate} className="border-b border-masque-gold/10">
                          <td className="py-2 px-2 text-bone-white">{c.cohortDate}</td>
                          <td className="py-2 px-2 text-right font-mono text-bone-white">{c.cohortSize}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-mono ${retentionColor(c.d1Pct)}`}>
                              {c.d1Pct}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-mono ${retentionColor(c.d7Pct)}`}>
                              {c.d7Pct}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-mono ${retentionColor(c.d30Pct)}`}>
                              {c.d30Pct}%
                            </span>
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

        {/* ===== Activity Patterns Tab ===== */}
        {data && tab === 'activity' && (
          <>
            {/* Summary Stats */}
            {(() => {
              const heatmap = data.activityPatterns?.heatmap ?? []
              if (heatmap.length === 0) return (
                <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-6 text-venetian-gold/50 text-sm text-center">
                  No activity pattern data for this period.
                </div>
              )

              const maxHands = Math.max(...heatmap.map((h) => h.hands))
              const maxWagered = Math.max(...heatmap.map((h) => h.wagered))
              const busiestCell = heatmap.reduce((a, b) => (b.wagered > a.wagered ? b : a), heatmap[0])
              const busiestDow = DOW_LABELS[busiestCell.dow]
              const busiestHour = `${busiestCell.hour}:00`

              // Aggregate by DOW
              const dowTotals = Array.from({ length: 7 }, () => ({ hands: 0, wagered: 0 }))
              for (const cell of heatmap) {
                dowTotals[cell.dow].hands += cell.hands
                dowTotals[cell.dow].wagered += cell.wagered
              }
              const busiestDay = DOW_LABELS[dowTotals.indexOf(dowTotals.reduce((a, b) => (b.wagered > a.wagered ? b : a)))]

              // Aggregate by hour
              const hourTotals = Array.from({ length: 24 }, () => ({ hands: 0, wagered: 0 }))
              for (const cell of heatmap) {
                hourTotals[cell.hour].hands += cell.hands
                hourTotals[cell.hour].wagered += cell.wagered
              }
              const busiestHourIdx = hourTotals.indexOf(hourTotals.reduce((a, b) => (b.wagered > a.wagered ? b : a)))

              return (
                <>
                  {/* Summary Cards */}
                  <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                      <div className="text-sm text-venetian-gold/60">Busiest Day</div>
                      <div className="text-2xl font-bold text-masque-gold mt-1">{busiestDay}</div>
                      <div className="text-xs text-venetian-gold/50 mt-2">By wager volume</div>
                    </div>
                    <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                      <div className="text-sm text-venetian-gold/60">Peak Hour</div>
                      <div className="text-2xl font-bold text-jester-purple mt-1">{busiestHourIdx}:00</div>
                      <div className="text-xs text-venetian-gold/50 mt-2">By wager volume</div>
                    </div>
                    <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                      <div className="text-sm text-venetian-gold/60">Peak Slot</div>
                      <div className="text-2xl font-bold text-teal-400 mt-1">{busiestDow} {busiestHour}</div>
                      <div className="text-xs text-venetian-gold/50 mt-2">{busiestCell.hands} hands, {busiestCell.wagered.toFixed(4)} ZEC</div>
                    </div>
                  </section>

                  {/* Heatmap: DOW x Hour */}
                  <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                    <h2 className="text-lg font-semibold text-bone-white mb-1">
                      Activity Heatmap
                    </h2>
                    <p className="text-xs text-venetian-gold/50 mb-3">
                      Color intensity by wager volume. Rows = day of week, columns = hour (UTC).
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="text-left py-1 px-1 text-venetian-gold/60 w-12"></th>
                            {Array.from({ length: 24 }, (_, i) => (
                              <th key={i} className="text-center py-1 px-0.5 text-venetian-gold/40 font-mono w-10">
                                {i}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {DOW_LABELS.map((dayLabel, dow) => {
                            return (
                              <tr key={dow}>
                                <td className="py-1 px-1 text-venetian-gold/60 font-medium">{dayLabel}</td>
                                {Array.from({ length: 24 }, (_, hour) => {
                                  const cell = heatmap.find((h) => h.dow === dow && h.hour === hour)
                                  const wagered = cell?.wagered ?? 0
                                  const hands = cell?.hands ?? 0
                                  return (
                                    <td
                                      key={hour}
                                      className={`py-1.5 px-0.5 text-center rounded-sm ${heatmapColor(wagered, maxWagered)}`}
                                      title={`${dayLabel} ${hour}:00 — ${hands} hands, ${wagered.toFixed(4)} ZEC`}
                                    >
                                      <span className="font-mono text-[10px]">
                                        {hands > 0 ? hands : ''}
                                      </span>
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* DOW Breakdown Table */}
                  <section className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                    <h2 className="text-lg font-semibold text-bone-white mb-3">
                      Day-of-Week Breakdown
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-masque-gold/20 text-venetian-gold/60">
                            <th className="text-left py-2 px-2">Day</th>
                            <th className="text-right py-2 px-2">Hands</th>
                            <th className="text-right py-2 px-2">Wagered (ZEC)</th>
                            <th className="text-right py-2 px-2">% of Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dowTotals.map((dt, i) => {
                            const totalW = dowTotals.reduce((s, d) => s + d.wagered, 0)
                            const pct = totalW > 0 ? ((dt.wagered / totalW) * 100).toFixed(1) : '0.0'
                            return (
                              <tr key={i} className="border-b border-masque-gold/10">
                                <td className="py-2 px-2 text-bone-white">{DOW_LABELS[i]}</td>
                                <td className="py-2 px-2 text-right font-mono text-bone-white">{dt.hands}</td>
                                <td className="py-2 px-2 text-right font-mono text-masque-gold">{dt.wagered.toFixed(4)}</td>
                                <td className="py-2 px-2 text-right font-mono text-venetian-gold/70">{pct}%</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )
            })()}
          </>
        )}
      </div>
    </main>
  )
}
