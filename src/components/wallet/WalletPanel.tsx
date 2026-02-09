'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DepositInfo, WalletBalance } from '@/types'

interface WalletPanelProps {
  sessionId: string
  onBalanceUpdate?: (balance: number) => void
  onAuthUpdate?: (isAuthenticated: boolean) => void
}

interface AuthStatus {
  isAuthenticated: boolean
  withdrawalAddress: string | null
  authTxHash: string | null
  authConfirmedAt: string | null
}

interface WalletData {
  wallet: {
    id: string
    depositAddress: string
    network: string
  }
  depositInfo: DepositInfo
  nodeStatus: {
    connected: boolean
    synced: boolean
  }
  balance: WalletBalance
  auth: AuthStatus
}

export function WalletPanel({ sessionId, onBalanceUpdate, onAuthUpdate }: WalletPanelProps) {
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [showSetAddress, setShowSetAddress] = useState(false)

  // Form states
  const [withdrawalAddressInput, setWithdrawalAddressInput] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [settingAddress, setSettingAddress] = useState(false)
  const [pendingWithdrawal, setPendingWithdrawal] = useState<{
    id: string
    status: string
    txHash?: string
    failReason?: string
    operationStatus?: string
  } | null>(null)

  const fetchWalletData = useCallback(async () => {
    try {
      const res = await fetch(`/api/wallet?sessionId=${sessionId}`)
      if (!res.ok) {
        throw new Error('Failed to fetch wallet data')
      }
      const data = await res.json()
      setWalletData(data)
      if (onBalanceUpdate) {
        onBalanceUpdate(data.balance.confirmed)
      }
      if (onAuthUpdate) {
        onAuthUpdate(data.auth.isAuthenticated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet')
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, onBalanceUpdate, onAuthUpdate])

  useEffect(() => {
    fetchWalletData()
  }, [fetchWalletData])

  // Poll withdrawal status when a withdrawal is pending
  useEffect(() => {
    if (!pendingWithdrawal || pendingWithdrawal.status !== 'pending') return

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'withdrawal-status',
            sessionId,
            transactionId: pendingWithdrawal.id,
          }),
        })
        const data = await res.json()
        if (data.transaction) {
          setPendingWithdrawal(data.transaction)
          if (data.transaction.status === 'confirmed' || data.transaction.status === 'failed') {
            clearInterval(pollInterval)
            await fetchWalletData()
          }
        }
      } catch (err) {
        console.error('Failed to check withdrawal status:', err)
      }
    }, 5000)

    return () => clearInterval(pollInterval)
  }, [pendingWithdrawal, sessionId, fetchWalletData])

  const checkDeposits = async () => {
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check-deposits',
          sessionId,
        }),
      })
      const data = await res.json()
      if (data.deposits?.length > 0 || data.auth?.justAuthenticated) {
        await fetchWalletData()
      }
    } catch (err) {
      console.error('Failed to check deposits:', err)
    }
  }

  const handleSetWithdrawalAddress = async () => {
    if (!withdrawalAddressInput) return

    setSettingAddress(true)
    setError(null)

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-withdrawal-address',
          sessionId,
          withdrawalAddress: withdrawalAddressInput,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to set withdrawal address')
      }

      setShowSetAddress(false)
      setShowDeposit(true)
      await fetchWalletData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set address')
    } finally {
      setSettingAddress(false)
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount) return

    setWithdrawing(true)
    setError(null)

    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'withdraw',
          sessionId,
          amount: parseFloat(withdrawAmount),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Withdrawal failed')
      }

      setWithdrawAmount('')
      if (data.transaction) {
        setPendingWithdrawal({
          id: data.transaction.id,
          status: data.transaction.status,
          txHash: data.transaction.txHash,
        })
      }
      await fetchWalletData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed')
    } finally {
      setWithdrawing(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (isLoading) {
    return (
      <div className="bg-midnight-black/40 rounded-lg p-4 border border-masque-gold/20">
        <div className="text-venetian-gold/60">Loading wallet...</div>
      </div>
    )
  }

  if (error && !walletData) {
    return (
      <div className="bg-midnight-black/40 rounded-lg p-4 border border-blood-ruby/50">
        <div className="text-blood-ruby">{error}</div>
      </div>
    )
  }

  const isAuthenticated = walletData?.auth.isAuthenticated ?? false
  const hasWithdrawalAddress = !!walletData?.auth.withdrawalAddress

  return (
    <div className="bg-midnight-black/40 rounded-lg p-4 border border-masque-gold/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-bone-white">Wallet</h3>
        <div className="flex items-center gap-2">
          {/* Auth Status Badge */}
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              isAuthenticated
                ? 'bg-jester-purple/20 text-jester-purple'
                : 'bg-masque-gold/20 text-masque-gold'
            }`}
          >
            {isAuthenticated ? '✓ Verified' : 'Not Verified'}
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              walletData?.nodeStatus.connected
                ? walletData.nodeStatus.synced
                  ? 'bg-green-500'
                  : 'bg-yellow-500'
                : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-venetian-gold/60">
            {walletData?.wallet.network}
          </span>
        </div>
      </div>

      {/* Balance */}
      <div className="mb-4">
        <div className="text-sm text-venetian-gold/60 mb-1">Balance</div>
        <div className="text-2xl font-bold text-masque-gold">
          {walletData?.balance.confirmed.toFixed(4)} ZEC
        </div>
        {(walletData?.balance.pending ?? 0) > 0 && (
          <div className="text-sm text-venetian-gold/60">
            + {walletData?.balance.pending.toFixed(4)} pending
          </div>
        )}
      </div>

      {/* Withdrawal Address */}
      {hasWithdrawalAddress && (
        <div className="mb-4 p-3 bg-midnight-black/60 rounded-lg border border-masque-gold/10">
          <div className="text-xs text-venetian-gold/60 mb-1">Withdrawal Address</div>
          <div className="font-mono text-xs text-bone-white break-all">
            {walletData?.auth.withdrawalAddress}
          </div>
        </div>
      )}

      {/* Authentication Required Message */}
      {!isAuthenticated && !hasWithdrawalAddress && (
        <div className="mb-4 p-3 bg-masque-gold/10 rounded-lg border border-masque-gold/30">
          <div className="text-sm text-masque-gold font-medium mb-1">
            Authentication Required
          </div>
          <div className="text-xs text-venetian-gold/70">
            Set your withdrawal address and make a deposit to start playing.
          </div>
        </div>
      )}

      {!isAuthenticated && hasWithdrawalAddress && (
        <div className="mb-4 p-3 bg-masque-gold/10 rounded-lg border border-masque-gold/30">
          <div className="text-sm text-masque-gold font-medium mb-1">
            Deposit Required
          </div>
          <div className="text-xs text-venetian-gold/70">
            Send ZEC to your deposit address to verify your account.
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        {!hasWithdrawalAddress ? (
          <button
            onClick={() => setShowSetAddress(!showSetAddress)}
            className="flex-1 bg-masque-gold hover:bg-masque-gold/80 text-midnight-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Set Withdrawal Address
          </button>
        ) : (
          <>
            <button
              onClick={() => setShowDeposit(!showDeposit)}
              className="flex-1 bg-masque-gold/20 hover:bg-masque-gold/30 text-masque-gold px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Deposit
            </button>
            <button
              onClick={() => setShowWithdraw(!showWithdraw)}
              disabled={!isAuthenticated}
              className="flex-1 bg-bone-white/10 hover:bg-bone-white/20 text-bone-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!isAuthenticated ? 'Deposit first to enable withdrawals' : undefined}
            >
              Withdraw
            </button>
          </>
        )}
        <button
          onClick={checkDeposits}
          className="bg-bone-white/10 hover:bg-bone-white/20 text-bone-white px-3 py-2 rounded-lg text-sm transition-colors"
          title="Check for deposits"
        >
          ↻
        </button>
      </div>

      {/* Set Withdrawal Address Panel */}
      {showSetAddress && (
        <div className="bg-midnight-black/60 rounded-lg p-4 mb-4 border border-masque-gold/10">
          <div className="text-sm text-venetian-gold/60 mb-2">
            Enter your Zcash address for withdrawals:
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={withdrawalAddressInput}
              onChange={(e) => setWithdrawalAddressInput(e.target.value)}
              placeholder="t1... or zs... or u1..."
              className="w-full bg-midnight-black/80 border border-masque-gold/20 rounded px-3 py-2 text-bone-white text-sm placeholder:text-venetian-gold/30"
            />
            <div className="text-xs text-venetian-gold/50">
              • This address will receive all your withdrawals
              <br />
              • You can use transparent (t), shielded (z), or unified (u) addresses
            </div>
            {error && (
              <div className="text-sm text-blood-ruby">{error}</div>
            )}
            <button
              onClick={handleSetWithdrawalAddress}
              disabled={settingAddress || !withdrawalAddressInput}
              className="w-full bg-masque-gold text-midnight-black px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {settingAddress ? 'Setting...' : 'Set Address & Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Deposit Panel */}
      {showDeposit && walletData && (
        <div className="bg-midnight-black/60 rounded-lg p-4 mb-4 border border-masque-gold/10">
          <div className="text-sm text-venetian-gold/60 mb-2">
            Send ZEC to this address:
          </div>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 bg-midnight-black/80 px-3 py-2 rounded text-xs text-bone-white break-all">
              {walletData.wallet.depositAddress}
            </code>
            <button
              onClick={() => copyToClipboard(walletData.wallet.depositAddress)}
              className="bg-masque-gold/20 hover:bg-masque-gold/30 text-masque-gold px-3 py-2 rounded text-sm"
            >
              Copy
            </button>
          </div>
          <div className="text-xs text-venetian-gold/50 space-y-1">
            <p>• Minimum deposit: {walletData.depositInfo.minimumDeposit} ZEC</p>
            <p>• {walletData.depositInfo.confirmationsRequired} confirmations required</p>
            <p>• Network: {walletData.wallet.network}</p>
            {!isAuthenticated && (
              <p className="text-masque-gold">
                • First deposit will verify your account
              </p>
            )}
          </div>
        </div>
      )}

      {/* Withdraw Panel */}
      {showWithdraw && isAuthenticated && (
        <div className="bg-midnight-black/60 rounded-lg p-4 border border-masque-gold/10">
          <div className="space-y-3">
            <div className="text-sm text-venetian-gold/60">
              Withdrawing to: <span className="text-bone-white font-mono text-xs">
                {walletData?.auth.withdrawalAddress?.substring(0, 12)}...
              </span>
            </div>
            <div>
              <label className="text-sm text-venetian-gold/60 block mb-1">
                Amount (ZEC)
              </label>
              <input
                type="number"
                step="0.0001"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-midnight-black/80 border border-masque-gold/20 rounded px-3 py-2 text-bone-white text-sm placeholder:text-venetian-gold/30"
              />
            </div>
            <div className="text-xs text-venetian-gold/50">
              Network fee: 0.0001 ZEC
            </div>
            {error && (
              <div className="text-sm text-blood-ruby">{error}</div>
            )}
            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawAmount}
              className="w-full bg-masque-gold text-midnight-black px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {withdrawing ? 'Processing...' : 'Withdraw'}
            </button>
          </div>
        </div>
      )}

      {/* Withdrawal Status */}
      {pendingWithdrawal && (
        <div className={`rounded-lg p-3 mb-4 border ${
          pendingWithdrawal.status === 'confirmed'
            ? 'bg-jester-purple/10 border-jester-purple/30'
            : pendingWithdrawal.status === 'failed'
            ? 'bg-blood-ruby/10 border-blood-ruby/30'
            : 'bg-masque-gold/10 border-masque-gold/30'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-venetian-gold/60">Withdrawal</span>
            <span className={`text-xs font-medium ${
              pendingWithdrawal.status === 'confirmed'
                ? 'text-jester-purple'
                : pendingWithdrawal.status === 'failed'
                ? 'text-blood-ruby'
                : 'text-masque-gold'
            }`}>
              {pendingWithdrawal.status === 'pending'
                ? `Processing${pendingWithdrawal.operationStatus ? ` (${pendingWithdrawal.operationStatus})` : '...'}`
                : pendingWithdrawal.status === 'confirmed'
                ? 'Confirmed'
                : 'Failed'}
            </span>
          </div>
          {pendingWithdrawal.txHash && (
            <div className="text-xs font-mono text-bone-white/70 break-all">
              TX: {pendingWithdrawal.txHash}
            </div>
          )}
          {pendingWithdrawal.failReason && (
            <div className="text-xs text-blood-ruby mt-1">
              {pendingWithdrawal.failReason}. Balance has been refunded.
            </div>
          )}
          {(pendingWithdrawal.status === 'confirmed' || pendingWithdrawal.status === 'failed') && (
            <button
              onClick={() => setPendingWithdrawal(null)}
              className="text-xs text-venetian-gold/50 hover:text-venetian-gold mt-2"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Proof of Reserves Link */}
      <div className="mt-4 pt-3 border-t border-masque-gold/10">
        <a
          href="/reserves"
          className="text-xs text-venetian-gold/50 hover:text-masque-gold transition-colors"
        >
          View Proof of Reserves →
        </a>
      </div>
    </div>
  )
}
