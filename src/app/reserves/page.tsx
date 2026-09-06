'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import JesterLogo from '@/components/ui/JesterLogo'
import SiteHeader from '@/components/layout/SiteHeader'

interface ReservesData {
  reserves: {
    totalOnChainBalance: number
    totalUserLiabilities: number
    reserveRatio: number
    isFullyBacked: boolean
    transparentAddressBalance?: number
    walletBalance?: {
      confirmed: number
      pending: number
      total: number
    }
  }
  stats: {
    totalSessions: number
    totalDeposited: number
    totalWithdrawn: number
    totalWagered: number
    totalWon: number
  }
  addresses: Array<{
    address: string
    cachedBalance: number
    userBalance: number
    isAuthenticated: boolean
    createdAt: string
    balanceUpdatedAt: string | null
  }>
  addressCount: number
  network: string
  explorerBaseUrl: string
  nodeStatus: {
    connected: boolean
    synced: boolean
  }
  lastUpdated: string
}

export default function ReservesPage() {
  const [data, setData] = useState<ReservesData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReserves = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/reserves')
      if (!res.ok) {
        throw new Error('Failed to fetch reserves data')
      }
      const responseData = await res.json()
      setData(responseData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch reserves')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReserves()
  }, [fetchReserves])

  return (
    <main className="min-h-screen felt-texture">
      {/* Header */}
      <SiteHeader />

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-display font-bold text-bone-white">
            Reserve Report
          </h1>
          <button
            onClick={fetchReserves}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-midnight-black/40 text-venetian-gold border border-masque-gold/20 hover:border-masque-gold/40 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <p className="text-venetian-gold/60 mb-8">
          Track reported wallet reserves against player balances, including funds at poker tables.
          Individual deposit addresses and player balances stay private.
        </p>

        {/* Error State */}
        {error && (
          <div className="bg-blood-ruby/30 border border-blood-ruby text-bone-white px-4 py-3 rounded-lg mb-8">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && !data && (
          <div className="flex items-center justify-center py-12">
            <div className="text-venetian-gold/60">Loading reserves data...</div>
          </div>
        )}

        {/* Data Display */}
        {data && (
          <>
            {/* Reserve Status Card */}
            <div className={`rounded-lg p-6 border mb-8 ${
              data.reserves.isFullyBacked
                ? 'bg-jester-purple/10 border-jester-purple'
                : 'bg-blood-ruby/10 border-blood-ruby'
            }`}>
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  data.reserves.isFullyBacked ? 'bg-jester-purple' : 'bg-blood-ruby'
                }`}>
                  {data.reserves.isFullyBacked ? (
                    <svg className="w-8 h-8 text-bone-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-bone-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-bone-white">
                    {data.reserves.isFullyBacked
                      ? 'Platform Reserves Cover Liabilities'
                      : 'Platform Reserves Below Liabilities'}
                  </h2>
                  <p className="text-venetian-gold/60">
                    Reserve ratio: {(data.reserves.reserveRatio * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                  label="Wallet Balance"
                  value={`${data.reserves.totalOnChainBalance.toFixed(8)} ZEC`}
                  description="Confirmed + pending wallet funds"
                />
                <StatCard
                  label="User Liabilities"
                  value={`${data.reserves.totalUserLiabilities.toFixed(8)} ZEC`}
                  description="Total owed to users"
                />
                <StatCard
                  label="Reserve Ratio"
                  value={`${(data.reserves.reserveRatio * 100).toFixed(2)}%`}
                  description="Wallet Balance / Liabilities"
                  highlight={data.reserves.isFullyBacked}
                />
              </div>
            </div>

            {/* Network Status */}
            <div className="bg-midnight-black/40 rounded-lg p-4 border border-masque-gold/20 mb-8 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  data.nodeStatus.connected ? 'bg-jester-purple' : 'bg-blood-ruby'
                }`} />
                <span className="text-sm text-venetian-gold/70">
                  Node: {data.nodeStatus.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  data.nodeStatus.synced ? 'bg-jester-purple' : 'bg-masque-gold'
                }`} />
                <span className="text-sm text-venetian-gold/70">
                  Sync: {data.nodeStatus.synced ? 'Synced' : 'Syncing'}
                </span>
              </div>
              <div className="text-sm text-venetian-gold/50">
                Network: {data.network}
              </div>
              <div className="text-sm text-venetian-gold/50">
                Last updated: {new Date(data.lastUpdated).toLocaleString()}
              </div>
            </div>

            {/* Platform Stats */}
            <div className="bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20 mb-8">
              <h3 className="text-lg font-bold text-bone-white mb-4">Platform Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <MiniStat label="Total Sessions" value={data.stats.totalSessions.toString()} />
                <MiniStat label="Total Deposited" value={`${data.stats.totalDeposited.toFixed(4)} ZEC`} />
                <MiniStat label="Total Withdrawn" value={`${data.stats.totalWithdrawn.toFixed(4)} ZEC`} />
                <MiniStat label="Total Wagered" value={`${data.stats.totalWagered.toFixed(4)} ZEC`} />
                <MiniStat label="Total Won" value={`${data.stats.totalWon.toFixed(4)} ZEC`} />
              </div>
            </div>

            <div className="bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20">
              <h3 className="text-lg font-bold text-bone-white mb-3">Player privacy</h3>
              <p className="text-sm text-venetian-gold/70 leading-relaxed">
                This report shows aggregate amounts. It does not publish individual deposit addresses,
                account balances, or links between a player’s wallet and their poker activity.
              </p>
            </div>

            {/* How It Works */}
            <div className="mt-8 bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20">
              <h3 className="text-lg font-bold text-bone-white mb-4">How Reserve Report Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-venetian-gold/70">
                <div>
                  <h4 className="text-bone-white font-medium mb-2">1. Reported Reserves</h4>
                  <p>
                    Wallet balance snapshots come from the platform’s Zcash node. Pending funds may
                    be included and are shown separately when available.
                  </p>
                </div>
                <div>
                  <h4 className="text-bone-white font-medium mb-2">2. Player Liabilities</h4>
                  <p>
                    Liabilities include available real-money balances and ZEC reserved at poker tables,
                    including chips committed to a pot. Practice balances are excluded.
                  </p>
                </div>
                <div>
                  <h4 className="text-bone-white font-medium mb-2">3. Interpretation</h4>
                  <p>
                    These are operator-reported figures, not an independent proof of solvency.
                    Independent verification of reserves and all liabilities requires a separate audit.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
  description,
  highlight = false,
}: {
  label: string
  value: string
  description: string
  highlight?: boolean
}) {
  return (
    <div className="bg-midnight-black/40 rounded-lg p-4">
      <div className="text-sm text-venetian-gold/60 mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${
        highlight ? 'text-jester-purple' : 'text-bone-white'
      }`}>
        {value}
      </div>
      <div className="text-xs text-venetian-gold/40 mt-1">{description}</div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-venetian-gold/50 mb-1">{label}</div>
      <div className="text-sm font-mono text-bone-white">{value}</div>
    </div>
  )
}
