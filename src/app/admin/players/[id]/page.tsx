'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

function formatZec(value: number): string {
  return `${value.toFixed(4)} ZEC`
}

function shortId(value: string, prefix = 8, suffix = 6): string {
  if (value.length <= prefix + suffix + 3) return value
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Types ---

interface SessionDetail {
  id: string
  walletAddress: string
  withdrawalAddress: string | null
  balance: number
  totalDeposited: number
  totalWithdrawn: number
  totalWagered: number
  totalWon: number
  housePnl: number
  isAuthenticated: boolean
  authTxHash: string | null
  authConfirmedAt: string | null
  depositLimit: number | null
  lossLimit: number | null
  sessionLimit: number | null
  excludedUntil: string | null
  lastActiveAt: string
  createdAt: string
  updatedAt: string
  depositWallet: {
    unifiedAddr: string | null
    transparentAddr: string
    cachedBalance: number
    totalSwept: number
  } | null
}

interface TransactionRow {
  id: string
  type: string
  amount: number
  fee: number
  status: string
  txHash: string | null
  failReason: string | null
  createdAt: string
  confirmedAt: string | null
}

interface BlackjackGameRow {
  id: string
  mainBet: number
  perfectPairsBet: number
  outcome: string | null
  payout: number | null
  status: string
  createdAt: string
  completedAt: string | null
}

interface VideoPokerGameRow {
  id: string
  totalBet: number
  handRank: string | null
  payout: number | null
  status: string
  createdAt: string
  completedAt: string | null
}

interface RiskFlags {
  isHighRoller: boolean
  velocityAlert: boolean
  lossChasingAlert: boolean
  rtpOutlier: boolean
  sessionMarathon: boolean
  rapidCycle: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

interface PlayerStats {
  totalHands: number
  blackjackCompleted: number
  videoPokerCompleted: number
  sessionDurationHours: number
  realizedRtp: number
}

interface PlayerDetailData {
  session: SessionDetail
  risk: RiskFlags
  stats: PlayerStats
  transactions: TransactionRow[]
  blackjackGames: BlackjackGameRow[]
  videoPokerGames: VideoPokerGameRow[]
  counts: {
    blackjack: number
    videoPoker: number
    transactions: number
  }
}

type TabId = 'transactions' | 'blackjack' | 'videoPoker'

const RISK_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  low: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', label: 'LOW' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'MEDIUM' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', label: 'HIGH' },
  critical: { bg: 'bg-blood-ruby/20', text: 'text-blood-ruby', border: 'border-blood-ruby/40', label: 'CRITICAL' },
}

const RISK_FLAG_INFO: Record<string, { label: string; desc: string }> = {
  velocityAlert: { label: 'Velocity Alert', desc: 'Recent wager rate is >3x the session average' },
  lossChasingAlert: { label: 'Loss Chasing', desc: 'Increasing bet sizes after consecutive losses' },
  rtpOutlier: { label: 'RTP Outlier', desc: 'Realized RTP is >150% over 50+ hands' },
  sessionMarathon: { label: 'Session Marathon', desc: 'Active session duration exceeds 4 hours' },
  rapidCycle: { label: 'Rapid Cycle', desc: 'Deposit → wager → withdrawal within 1 hour' },
}

// --- Status badge helper ---
function StatusBadge({ status }: { status: string }) {
  let color = 'text-bone-white/50 border-bone-white/20'
  if (status === 'confirmed' || status === 'completed') {
    color = 'text-green-400 border-green-400/30'
  } else if (status === 'failed') {
    color = 'text-blood-ruby border-blood-ruby/30'
  } else if (status === 'pending' || status === 'pending_approval' || status === 'active') {
    color = 'text-masque-gold border-masque-gold/30'
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 border rounded font-semibold uppercase ${color}`}>
      {status}
    </span>
  )
}

// --- Outcome badge helper ---
function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-bone-white/30">--</span>
  let color = 'text-bone-white/50'
  if (outcome === 'win' || outcome === 'blackjack') color = 'text-green-400'
  else if (outcome === 'lose') color = 'text-blood-ruby'
  else if (outcome === 'push') color = 'text-masque-gold'
  return <span className={`font-semibold uppercase text-xs ${color}`}>{outcome}</span>
}

export default function AdminPlayerDetailPage() {
  const params = useParams()
  const playerId = params.id as string

  const [data, setData] = useState<PlayerDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('transactions')

  // Editable RG controls
  const [editingLimits, setEditingLimits] = useState(false)
  const [limitSaving, setLimitSaving] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [limitSuccess, setLimitSuccess] = useState(false)
  const [editDepositLimit, setEditDepositLimit] = useState('')
  const [editLossLimit, setEditLossLimit] = useState('')
  const [editSessionLimit, setEditSessionLimit] = useState('')
  const [editExcludedUntil, setEditExcludedUntil] = useState('')

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/players/${playerId}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch player detail')
      } finally {
        setLoading(false)
      }
    }
    if (playerId) fetchDetail()
  }, [playerId])

  if (loading) {
    return (
      <div className="min-h-screen bg-midnight-black text-bone-white flex items-center justify-center">
        <p className="text-bone-white/50">Loading player detail...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-midnight-black text-bone-white p-6">
        <div className="max-w-5xl mx-auto">
          <Link href="/admin/players" className="text-venetian-gold hover:text-masque-gold text-sm">
            Back to Players
          </Link>
          <div className="mt-4 p-4 bg-blood-ruby/20 border border-blood-ruby/40 rounded text-blood-ruby">
            {error || 'Player not found.'}
          </div>
        </div>
      </div>
    )
  }

  const { session: s, risk, stats, transactions, blackjackGames, videoPokerGames, counts } = data

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'transactions', label: 'Transactions', count: counts.transactions },
    { id: 'blackjack', label: 'Blackjack', count: counts.blackjack },
    { id: 'videoPoker', label: 'Video Poker', count: counts.videoPoker },
  ]

  return (
    <div className="min-h-screen bg-midnight-black text-bone-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          <Link href="/admin" className="text-venetian-gold hover:text-masque-gold transition-colors">
            Dashboard
          </Link>
          <span className="text-bone-white/30">/</span>
          <Link href="/admin/players" className="text-venetian-gold hover:text-masque-gold transition-colors">
            Players
          </Link>
          <span className="text-bone-white/30">/</span>
          <span className="text-bone-white/60 font-mono">{shortId(s.id)}</span>
        </div>

        {/* Header */}
        <div className="mb-6 p-4 border border-masque-gold/20 rounded bg-midnight-black/80">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)] mb-1">
                Player Detail
              </h1>
              <p className="text-xs font-mono text-bone-white/60 mb-2">
                Session: {s.id}
              </p>
              <p className="text-xs text-bone-white/50">
                Wallet: <span className="font-mono text-bone-white/70">{shortId(s.walletAddress, 12, 8)}</span>
              </p>
              {s.withdrawalAddress && (
                <p className="text-xs text-bone-white/50">
                  Withdrawal: <span className="font-mono text-bone-white/70">{shortId(s.withdrawalAddress, 12, 8)}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-bone-white/50">Balance</p>
              <p className="text-2xl font-mono text-masque-gold">{formatZec(s.balance)}</p>
              <p className="text-xs mt-1">
                {s.isAuthenticated ? (
                  <span className="text-green-400 font-semibold">Authenticated</span>
                ) : (
                  <span className="text-bone-white/40">Not authenticated</span>
                )}
              </p>
              <p className="text-xs text-bone-white/40 mt-1">
                Created {formatDate(s.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Financial summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <FinancialCard label="Deposited" value={s.totalDeposited} />
          <FinancialCard label="Withdrawn" value={s.totalWithdrawn} />
          <FinancialCard label="Wagered" value={s.totalWagered} />
          <FinancialCard label="Won" value={s.totalWon} />
          <FinancialCard
            label="House P&L"
            value={s.housePnl}
            color={s.housePnl >= 0 ? 'text-green-400' : 'text-blood-ruby'}
            prefix={s.housePnl >= 0 ? '+' : ''}
          />
        </div>

        {/* Risk Assessment + Stats */}
        {risk && (
          <div className="mb-6 p-4 border border-masque-gold/15 rounded bg-midnight-black/60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-masque-gold uppercase tracking-wide">Risk Assessment</h3>
              {(() => {
                const rc = RISK_COLORS[risk.riskLevel] || RISK_COLORS.low
                return (
                  <span className={`text-[11px] px-2 py-0.5 ${rc.bg} ${rc.text} border ${rc.border} rounded font-semibold`}>
                    {rc.label} RISK
                  </span>
                )
              })()}
            </div>

            {/* Stats row */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="text-xs">
                  <span className="text-bone-white/40">Total Hands</span>
                  <p className="font-mono text-bone-white text-sm">{stats.totalHands.toLocaleString()}</p>
                </div>
                <div className="text-xs">
                  <span className="text-bone-white/40">Session Duration</span>
                  <p className="font-mono text-bone-white text-sm">{stats.sessionDurationHours}h</p>
                </div>
                <div className="text-xs">
                  <span className="text-bone-white/40">Realized RTP</span>
                  <p className={`font-mono text-sm ${stats.realizedRtp > 100 ? 'text-blood-ruby' : 'text-green-400'}`}>
                    {stats.realizedRtp}%
                  </p>
                </div>
                <div className="text-xs">
                  <span className="text-bone-white/40">High Roller</span>
                  <p className="text-sm">
                    {risk.isHighRoller ? (
                      <span className="text-masque-gold font-semibold">Yes</span>
                    ) : (
                      <span className="text-bone-white/40">No</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Risk flags */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(RISK_FLAG_INFO).map(([key, info]) => {
                const isActive = risk[key as keyof RiskFlags] as boolean
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-xs ${
                      isActive
                        ? 'bg-blood-ruby/10 border border-blood-ruby/30'
                        : 'bg-bone-white/5 border border-bone-white/10'
                    }`}
                  >
                    <span className={`text-sm ${isActive ? 'text-blood-ruby' : 'text-bone-white/20'}`}>
                      {isActive ? '!' : '-'}
                    </span>
                    <div>
                      <span className={isActive ? 'text-blood-ruby font-semibold' : 'text-bone-white/40'}>
                        {info.label}
                      </span>
                      <p className={`text-[10px] ${isActive ? 'text-blood-ruby/70' : 'text-bone-white/25'}`}>
                        {info.desc}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Deposit wallet info */}
        {s.depositWallet && (
          <div className="mb-6 p-3 border border-masque-gold/10 rounded bg-midnight-black/60">
            <h3 className="text-xs font-semibold text-masque-gold mb-2">Deposit Wallet</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-bone-white/40">Transparent:</span>
                <p className="font-mono text-bone-white/70 break-all">{shortId(s.depositWallet.transparentAddr, 10, 6)}</p>
              </div>
              {s.depositWallet.unifiedAddr && (
                <div>
                  <span className="text-bone-white/40">Unified:</span>
                  <p className="font-mono text-bone-white/70 break-all">{shortId(s.depositWallet.unifiedAddr, 10, 6)}</p>
                </div>
              )}
              <div>
                <span className="text-bone-white/40">Cached Balance:</span>
                <p className="font-mono text-bone-white">{formatZec(s.depositWallet.cachedBalance)}</p>
              </div>
              <div>
                <span className="text-bone-white/40">Total Swept:</span>
                <p className="font-mono text-bone-white">{formatZec(s.depositWallet.totalSwept)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Responsible gambling — editable */}
        <div className="mb-6 p-3 border border-jester-purple/20 rounded bg-jester-purple/5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-jester-purple">Responsible Gambling Limits</h3>
            {!editingLimits ? (
              <button
                onClick={() => {
                  setEditDepositLimit(s.depositLimit !== null ? String(s.depositLimit) : '')
                  setEditLossLimit(s.lossLimit !== null ? String(s.lossLimit) : '')
                  setEditSessionLimit(s.sessionLimit !== null ? String(s.sessionLimit) : '')
                  setEditExcludedUntil(s.excludedUntil ? new Date(s.excludedUntil).toISOString().slice(0, 10) : '')
                  setEditingLimits(true)
                  setLimitError(null)
                  setLimitSuccess(false)
                }}
                className="text-[10px] px-2 py-1 bg-jester-purple/20 text-jester-purple border border-jester-purple/30 rounded hover:bg-jester-purple/30 transition-colors"
              >
                Edit Limits
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setLimitSaving(true)
                    setLimitError(null)
                    try {
                      const body: Record<string, unknown> = {}
                      body.depositLimit = editDepositLimit === '' ? null : parseFloat(editDepositLimit)
                      body.lossLimit = editLossLimit === '' ? null : parseFloat(editLossLimit)
                      body.sessionLimit = editSessionLimit === '' ? null : parseInt(editSessionLimit, 10)
                      body.excludedUntil = editExcludedUntil === '' ? null : new Date(editExcludedUntil).toISOString()

                      // Validate parsed values
                      if (body.depositLimit !== null && (isNaN(body.depositLimit as number) || (body.depositLimit as number) < 0)) {
                        throw new Error('Deposit limit must be a positive number')
                      }
                      if (body.lossLimit !== null && (isNaN(body.lossLimit as number) || (body.lossLimit as number) < 0)) {
                        throw new Error('Loss limit must be a positive number')
                      }
                      if (body.sessionLimit !== null && (isNaN(body.sessionLimit as number) || (body.sessionLimit as number) < 0)) {
                        throw new Error('Session limit must be a positive integer')
                      }

                      const res = await fetch(`/api/admin/players/${playerId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      })
                      if (!res.ok) {
                        const errBody = await res.json().catch(() => ({}))
                        throw new Error(errBody.error || `HTTP ${res.status}`)
                      }
                      const result = await res.json()
                      // Update local state
                      setData((prev) => {
                        if (!prev) return prev
                        return {
                          ...prev,
                          session: {
                            ...prev.session,
                            depositLimit: result.updated.depositLimit,
                            lossLimit: result.updated.lossLimit,
                            sessionLimit: result.updated.sessionLimit,
                            excludedUntil: result.updated.excludedUntil,
                          },
                        }
                      })
                      setEditingLimits(false)
                      setLimitSuccess(true)
                      setTimeout(() => setLimitSuccess(false), 3000)
                    } catch (err) {
                      setLimitError(err instanceof Error ? err.message : 'Failed to save')
                    } finally {
                      setLimitSaving(false)
                    }
                  }}
                  disabled={limitSaving}
                  className="text-[10px] px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded hover:bg-green-500/30 transition-colors disabled:opacity-50"
                >
                  {limitSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditingLimits(false)
                    setLimitError(null)
                  }}
                  className="text-[10px] px-2 py-1 bg-bone-white/10 text-bone-white/60 border border-bone-white/20 rounded hover:bg-bone-white/15 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {limitError && (
            <p className="text-[10px] text-blood-ruby mb-2">{limitError}</p>
          )}
          {limitSuccess && (
            <p className="text-[10px] text-green-400 mb-2">Limits updated successfully.</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-bone-white/40">Deposit Limit (ZEC):</span>
              {editingLimits ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editDepositLimit}
                  onChange={(e) => setEditDepositLimit(e.target.value)}
                  placeholder="None"
                  className="mt-1 w-full bg-midnight-black border border-jester-purple/30 rounded px-2 py-1 text-xs text-bone-white placeholder:text-bone-white/30 focus:outline-none focus:border-jester-purple/60"
                />
              ) : (
                <p className="text-bone-white">
                  {s.depositLimit !== null ? formatZec(s.depositLimit) : 'None'}
                </p>
              )}
            </div>
            <div>
              <span className="text-bone-white/40">Loss Limit (ZEC):</span>
              {editingLimits ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editLossLimit}
                  onChange={(e) => setEditLossLimit(e.target.value)}
                  placeholder="None"
                  className="mt-1 w-full bg-midnight-black border border-jester-purple/30 rounded px-2 py-1 text-xs text-bone-white placeholder:text-bone-white/30 focus:outline-none focus:border-jester-purple/60"
                />
              ) : (
                <p className="text-bone-white">
                  {s.lossLimit !== null ? formatZec(s.lossLimit) : 'None'}
                </p>
              )}
            </div>
            <div>
              <span className="text-bone-white/40">Session Limit (min):</span>
              {editingLimits ? (
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={editSessionLimit}
                  onChange={(e) => setEditSessionLimit(e.target.value)}
                  placeholder="None"
                  className="mt-1 w-full bg-midnight-black border border-jester-purple/30 rounded px-2 py-1 text-xs text-bone-white placeholder:text-bone-white/30 focus:outline-none focus:border-jester-purple/60"
                />
              ) : (
                <p className="text-bone-white">
                  {s.sessionLimit !== null ? `${s.sessionLimit} min` : 'None'}
                </p>
              )}
            </div>
            <div>
              <span className="text-bone-white/40">Excluded Until:</span>
              {editingLimits ? (
                <input
                  type="date"
                  value={editExcludedUntil}
                  onChange={(e) => setEditExcludedUntil(e.target.value)}
                  className="mt-1 w-full bg-midnight-black border border-jester-purple/30 rounded px-2 py-1 text-xs text-bone-white placeholder:text-bone-white/30 focus:outline-none focus:border-jester-purple/60"
                />
              ) : (
                <p className={s.excludedUntil ? 'text-blood-ruby font-semibold' : 'text-bone-white'}>
                  {s.excludedUntil ? formatDate(s.excludedUntil) : 'None'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-masque-gold/20 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'text-masque-gold border-b-2 border-masque-gold font-semibold'
                  : 'text-bone-white/50 hover:text-bone-white/80'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-[10px] text-bone-white/40">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'transactions' && (
          <TransactionsTable transactions={transactions} />
        )}
        {activeTab === 'blackjack' && (
          <BlackjackTable games={blackjackGames} />
        )}
        {activeTab === 'videoPoker' && (
          <VideoPokerTable games={videoPokerGames} />
        )}

        {/* Showing count note */}
        <div className="mt-3 text-xs text-bone-white/30">
          Showing most recent 50 entries per tab.
        </div>
      </div>
    </div>
  )
}

// --- Sub-components ---

function FinancialCard({
  label,
  value,
  color,
  prefix = '',
}: {
  label: string
  value: number
  color?: string
  prefix?: string
}) {
  return (
    <div className="p-3 border border-masque-gold/15 rounded bg-midnight-black/60">
      <p className="text-[10px] text-bone-white/40 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-lg font-mono ${color || 'text-bone-white'}`}>
        {prefix}
        {formatZec(value)}
      </p>
    </div>
  )
}

function TransactionsTable({ transactions }: { transactions: TransactionRow[] }) {
  if (transactions.length === 0) {
    return <p className="text-bone-white/40 text-sm py-4">No transactions.</p>
  }

  return (
    <div className="overflow-x-auto border border-masque-gold/15 rounded">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-masque-gold/15 bg-midnight-black/80">
            <th className="text-left px-3 py-2 text-masque-gold font-semibold">Type</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Amount</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Fee</th>
            <th className="text-center px-3 py-2 text-masque-gold font-semibold">Status</th>
            <th className="text-left px-3 py-2 text-masque-gold font-semibold">Tx Hash</th>
            <th className="text-left px-3 py-2 text-masque-gold font-semibold">Fail Reason</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Created</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Confirmed</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b border-masque-gold/8 hover:bg-masque-gold/5 transition-colors">
              <td className="px-3 py-2">
                <span
                  className={`uppercase font-semibold ${
                    tx.type === 'deposit' ? 'text-green-400' : 'text-venetian-gold'
                  }`}
                >
                  {tx.type}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-bone-white">{formatZec(tx.amount)}</td>
              <td className="px-3 py-2 text-right font-mono text-bone-white/50">{formatZec(tx.fee)}</td>
              <td className="px-3 py-2 text-center">
                <StatusBadge status={tx.status} />
              </td>
              <td className="px-3 py-2 font-mono text-bone-white/60">
                {tx.txHash ? shortId(tx.txHash, 8, 6) : '--'}
              </td>
              <td className="px-3 py-2 text-blood-ruby/80 max-w-[150px] truncate">
                {tx.failReason || '--'}
              </td>
              <td className="px-3 py-2 text-right text-bone-white/50">{formatDate(tx.createdAt)}</td>
              <td className="px-3 py-2 text-right text-bone-white/50">{formatDate(tx.confirmedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BlackjackTable({ games }: { games: BlackjackGameRow[] }) {
  if (games.length === 0) {
    return <p className="text-bone-white/40 text-sm py-4">No blackjack games.</p>
  }

  return (
    <div className="overflow-x-auto border border-masque-gold/15 rounded">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-masque-gold/15 bg-midnight-black/80">
            <th className="text-left px-3 py-2 text-masque-gold font-semibold">Game ID</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Main Bet</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">PP Bet</th>
            <th className="text-center px-3 py-2 text-masque-gold font-semibold">Outcome</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Payout</th>
            <th className="text-center px-3 py-2 text-masque-gold font-semibold">Status</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Created</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Completed</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id} className="border-b border-masque-gold/8 hover:bg-masque-gold/5 transition-colors">
              <td className="px-3 py-2">
                <Link
                  href={`/admin/games/${g.id}`}
                  className="font-mono text-venetian-gold hover:text-masque-gold transition-colors"
                >
                  {shortId(g.id)}
                </Link>
              </td>
              <td className="px-3 py-2 text-right font-mono text-bone-white">{formatZec(g.mainBet)}</td>
              <td className="px-3 py-2 text-right font-mono text-bone-white/50">
                {g.perfectPairsBet > 0 ? formatZec(g.perfectPairsBet) : '--'}
              </td>
              <td className="px-3 py-2 text-center">
                <OutcomeBadge outcome={g.outcome} />
              </td>
              <td className="px-3 py-2 text-right font-mono text-bone-white">
                {g.payout !== null ? formatZec(g.payout) : '--'}
              </td>
              <td className="px-3 py-2 text-center">
                <StatusBadge status={g.status} />
              </td>
              <td className="px-3 py-2 text-right text-bone-white/50">{formatDate(g.createdAt)}</td>
              <td className="px-3 py-2 text-right text-bone-white/50">{formatDate(g.completedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VideoPokerTable({ games }: { games: VideoPokerGameRow[] }) {
  if (games.length === 0) {
    return <p className="text-bone-white/40 text-sm py-4">No video poker games.</p>
  }

  return (
    <div className="overflow-x-auto border border-masque-gold/15 rounded">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-masque-gold/15 bg-midnight-black/80">
            <th className="text-left px-3 py-2 text-masque-gold font-semibold">Game ID</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Total Bet</th>
            <th className="text-center px-3 py-2 text-masque-gold font-semibold">Hand Rank</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Payout</th>
            <th className="text-center px-3 py-2 text-masque-gold font-semibold">Status</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Created</th>
            <th className="text-right px-3 py-2 text-masque-gold font-semibold">Completed</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id} className="border-b border-masque-gold/8 hover:bg-masque-gold/5 transition-colors">
              <td className="px-3 py-2">
                <Link
                  href={`/admin/games/${g.id}`}
                  className="font-mono text-venetian-gold hover:text-masque-gold transition-colors"
                >
                  {shortId(g.id)}
                </Link>
              </td>
              <td className="px-3 py-2 text-right font-mono text-bone-white">{formatZec(g.totalBet)}</td>
              <td className="px-3 py-2 text-center text-bone-white/70 uppercase text-[10px] font-semibold">
                {g.handRank ? g.handRank.replace(/_/g, ' ') : '--'}
              </td>
              <td className="px-3 py-2 text-right font-mono text-bone-white">
                {g.payout !== null ? formatZec(g.payout) : '--'}
              </td>
              <td className="px-3 py-2 text-center">
                <StatusBadge status={g.status} />
              </td>
              <td className="px-3 py-2 text-right text-bone-white/50">{formatDate(g.createdAt)}</td>
              <td className="px-3 py-2 text-right text-bone-white/50">{formatDate(g.completedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
