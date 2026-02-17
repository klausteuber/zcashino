'use client'

import { useCallback, useEffect, useState } from 'react'
import GGRChart from '@/components/admin/charts/GGRChart'
import DepositWithdrawalChart from '@/components/admin/charts/DepositWithdrawalChart'
import WagerTrendChart from '@/components/admin/charts/WagerTrendChart'
import RTPDisplay from '@/components/admin/charts/RTPDisplay'

type Period = '24h' | '7d' | '30d' | 'all'

interface DailyTrend {
  date: string
  deposits: number
  withdrawals: number
  netFlow: number
  bjPayout: number
  vpWagered: number
  vpPayout: number
  activeSessions: number
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
    blackjack: { hands: number; payout: number }
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

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    ggr: d.vpWagered - d.vpPayout - d.bjPayout,
  }))

  const depositWithdrawalData = (data?.trends.daily ?? []).map((d) => ({
    date: d.date,
    deposits: d.deposits,
    withdrawals: d.withdrawals,
  }))

  const wagerTrendData = (data?.trends.daily ?? []).map((d) => ({
    date: d.date,
    vpWagered: d.vpWagered,
    bjPayout: d.bjPayout,
    vpPayout: d.vpPayout,
  }))

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

          {/* Period Selector */}
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

        {data && (
          <>
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
                  {formatZec(data.summary.realizedGGR.ggr)}
                </div>
                <div className="text-xs text-venetian-gold/50 mt-2">
                  House edge: {data.summary.realizedGGR.houseEdgePct.toFixed(2)}%
                </div>
              </div>

              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="text-sm text-venetian-gold/60">Total Wagered</div>
                <div className="text-2xl font-bold text-masque-gold mt-1">
                  {formatZec(data.summary.realizedGGR.totalWagered)}
                </div>
                <div className="text-xs text-venetian-gold/50 mt-2">
                  Total payout: {formatZec(data.summary.realizedGGR.totalPayout)}
                </div>
              </div>

              <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4">
                <div className="text-sm text-venetian-gold/60">Total Payout</div>
                <div className="text-2xl font-bold text-masque-gold mt-1">
                  {formatZec(data.summary.realizedGGR.totalPayout)}
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
                <h2 className="text-lg font-semibold text-bone-white mb-3">
                  GGR Over Time
                </h2>
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
                      <span className="text-venetian-gold/60">Total Payout</span>
                      <span className="text-bone-white font-mono">
                        {formatZec(data.byGame.blackjack.payout)}
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
      </div>
    </main>
  )
}
