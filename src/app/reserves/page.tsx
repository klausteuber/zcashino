'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import JesterLogo from '@/components/ui/JesterLogo'

interface ReservesData {
  reserves: {
    totalOnChainBalance: number
    totalUserLiabilities: number
    reserveRatio: number
    isFullyBacked: boolean
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
  const [searchQuery, setSearchQuery] = useState('')

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

  const filteredAddresses = data?.addresses.filter((addr) =>
    addr.address.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? []

  return (
    <main className="min-h-screen felt-texture">
      {/* Header */}
      <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <JesterLogo size="md" className="text-jester-purple-light" />
            <span className="text-xl font-display font-bold tracking-tight">
              <span className="text-masque-gold">Cypher</span>
              <span className="text-bone-white">Jester</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/verify"
              className="text-venetian-gold/60 hover:text-masque-gold transition-colors"
            >
              Verify Game
            </Link>
            <Link
              href="/blackjack"
              className="text-venetian-gold/60 hover:text-masque-gold transition-colors"
            >
              Play
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-display font-bold text-bone-white">
            Proof of Reserves
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
          Verify that all user funds are backed 1:1 by transparent on-chain balances.
          Every deposit address is publicly auditable.
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
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-bone-white">
                    {data.reserves.isFullyBacked ? 'Fully Backed' : 'Warning: Under-Reserved'}
                  </h2>
                  <p className="text-venetian-gold/60">
                    Reserve ratio: {(data.reserves.reserveRatio * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                  label="On-Chain Balance"
                  value={`${data.reserves.totalOnChainBalance.toFixed(8)} ZEC`}
                  description="Total in transparent deposit addresses"
                />
                <StatCard
                  label="User Liabilities"
                  value={`${data.reserves.totalUserLiabilities.toFixed(8)} ZEC`}
                  description="Total owed to users"
                />
                <StatCard
                  label="Reserve Ratio"
                  value={`${(data.reserves.reserveRatio * 100).toFixed(2)}%`}
                  description="On-chain / Liabilities"
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

            {/* Address List */}
            <div className="bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h3 className="text-lg font-bold text-bone-white">
                  Deposit Addresses ({data.addressCount})
                </h3>
                <input
                  type="text"
                  placeholder="Search addresses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-midnight-black/60 border border-masque-gold/20 rounded-lg px-4 py-2 text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:border-masque-gold max-w-xs"
                />
              </div>

              {filteredAddresses.length === 0 ? (
                <div className="text-center py-8 text-venetian-gold/50">
                  {searchQuery ? 'No addresses match your search' : 'No deposit addresses yet'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-masque-gold/20">
                        <th className="text-left py-3 px-2 text-venetian-gold/60 font-medium">Address</th>
                        <th className="text-right py-3 px-2 text-venetian-gold/60 font-medium">On-Chain</th>
                        <th className="text-right py-3 px-2 text-venetian-gold/60 font-medium">User Balance</th>
                        <th className="text-center py-3 px-2 text-venetian-gold/60 font-medium">Status</th>
                        <th className="text-right py-3 px-2 text-venetian-gold/60 font-medium">Created</th>
                        <th className="text-center py-3 px-2 text-venetian-gold/60 font-medium">Verify</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAddresses.map((addr) => (
                        <tr key={addr.address} className="border-b border-masque-gold/10 hover:bg-masque-gold/5">
                          <td className="py-3 px-2">
                            <span className="font-mono text-bone-white">
                              {addr.address.substring(0, 8)}...{addr.address.substring(addr.address.length - 8)}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-bone-white">
                            {addr.cachedBalance.toFixed(8)}
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-bone-white">
                            {addr.userBalance.toFixed(8)}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                              addr.isAuthenticated
                                ? 'bg-jester-purple/20 text-jester-purple'
                                : 'bg-masque-gold/20 text-masque-gold'
                            }`}>
                              {addr.isAuthenticated ? 'Verified' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right text-venetian-gold/50">
                            {new Date(addr.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <a
                              href={`${data.explorerBaseUrl}/address/${addr.address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-masque-gold hover:text-venetian-gold transition-colors"
                              title="View on explorer"
                            >
                              <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* How It Works */}
            <div className="mt-8 bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20">
              <h3 className="text-lg font-bold text-bone-white mb-4">How Proof of Reserves Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-venetian-gold/70">
                <div>
                  <h4 className="text-bone-white font-medium mb-2">1. Transparent Deposits</h4>
                  <p>
                    All user deposits go to transparent t-addresses on the Zcash blockchain.
                    These addresses are publicly viewable by anyone.
                  </p>
                </div>
                <div>
                  <h4 className="text-bone-white font-medium mb-2">2. Independent Verification</h4>
                  <p>
                    Click any address to view it on the Zcash block explorer. You can verify
                    the balance matches what we report here.
                  </p>
                </div>
                <div>
                  <h4 className="text-bone-white font-medium mb-2">3. 1:1 Backing</h4>
                  <p>
                    The sum of all on-chain balances should equal or exceed total user
                    liabilities. A ratio below 100% indicates a problem.
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
