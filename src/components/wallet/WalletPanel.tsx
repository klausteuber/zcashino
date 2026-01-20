'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DepositInfo, WalletBalance } from '@/types'

interface WalletPanelProps {
  sessionId: string
  onBalanceUpdate?: (balance: number) => void
}

interface WalletData {
  wallet: {
    id: string
    depositAddress: string
    saplingAddress?: string
    network: string
  }
  depositInfo: DepositInfo
  nodeStatus: {
    connected: boolean
    synced: boolean
  }
  balance: WalletBalance
}

export function WalletPanel({ sessionId, onBalanceUpdate }: WalletPanelProps) {
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawAddress, setWithdrawAddress] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet')
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, onBalanceUpdate])

  useEffect(() => {
    fetchWalletData()
  }, [fetchWalletData])

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
      if (data.deposits?.length > 0) {
        await fetchWalletData()
      }
    } catch (err) {
      console.error('Failed to check deposits:', err)
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawAddress || !withdrawAmount) return

    setWithdrawing(true)
    setError(null)

    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'withdraw',
          sessionId,
          destinationAddress: withdrawAddress,
          amount: parseFloat(withdrawAmount),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Withdrawal failed')
      }

      setWithdrawAddress('')
      setWithdrawAmount('')
      setShowWithdraw(false)
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
      <div className="bg-rich-black/40 rounded-lg p-4 border border-monaco-gold/20">
        <div className="text-champagne-gold/60">Loading wallet...</div>
      </div>
    )
  }

  if (error && !walletData) {
    return (
      <div className="bg-rich-black/40 rounded-lg p-4 border border-burgundy/50">
        <div className="text-burgundy">{error}</div>
      </div>
    )
  }

  return (
    <div className="bg-rich-black/40 rounded-lg p-4 border border-monaco-gold/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-ivory-white">Wallet</h3>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              walletData?.nodeStatus.connected
                ? walletData.nodeStatus.synced
                  ? 'bg-green-500'
                  : 'bg-yellow-500'
                : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-champagne-gold/60">
            {walletData?.wallet.network}
          </span>
        </div>
      </div>

      {/* Balance */}
      <div className="mb-4">
        <div className="text-sm text-champagne-gold/60 mb-1">Balance</div>
        <div className="text-2xl font-bold text-monaco-gold">
          {walletData?.balance.confirmed.toFixed(4)} ZEC
        </div>
        {(walletData?.balance.pending ?? 0) > 0 && (
          <div className="text-sm text-champagne-gold/60">
            + {walletData?.balance.pending.toFixed(4)} pending
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowDeposit(!showDeposit)}
          className="flex-1 bg-monaco-gold/20 hover:bg-monaco-gold/30 text-monaco-gold px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Deposit
        </button>
        <button
          onClick={() => setShowWithdraw(!showWithdraw)}
          className="flex-1 bg-ivory-white/10 hover:bg-ivory-white/20 text-ivory-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Withdraw
        </button>
        <button
          onClick={checkDeposits}
          className="bg-ivory-white/10 hover:bg-ivory-white/20 text-ivory-white px-3 py-2 rounded-lg text-sm transition-colors"
          title="Check for deposits"
        >
          ↻
        </button>
      </div>

      {/* Deposit Panel */}
      {showDeposit && walletData && (
        <div className="bg-rich-black/60 rounded-lg p-4 mb-4 border border-monaco-gold/10">
          <div className="text-sm text-champagne-gold/60 mb-2">
            Send ZEC to this address:
          </div>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 bg-rich-black/80 px-3 py-2 rounded text-xs text-ivory-white break-all">
              {walletData.wallet.depositAddress}
            </code>
            <button
              onClick={() => copyToClipboard(walletData.wallet.depositAddress)}
              className="bg-monaco-gold/20 hover:bg-monaco-gold/30 text-monaco-gold px-3 py-2 rounded text-sm"
            >
              Copy
            </button>
          </div>
          <div className="text-xs text-champagne-gold/50 space-y-1">
            <p>• Minimum deposit: {walletData.depositInfo.minimumDeposit} ZEC</p>
            <p>• {walletData.depositInfo.confirmationsRequired} confirmations required</p>
            <p>• Network: {walletData.wallet.network}</p>
          </div>
        </div>
      )}

      {/* Withdraw Panel */}
      {showWithdraw && (
        <div className="bg-rich-black/60 rounded-lg p-4 border border-monaco-gold/10">
          <div className="space-y-3">
            <div>
              <label className="text-sm text-champagne-gold/60 block mb-1">
                Destination Address
              </label>
              <input
                type="text"
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                placeholder="t1... or zs... or u1..."
                className="w-full bg-rich-black/80 border border-monaco-gold/20 rounded px-3 py-2 text-ivory-white text-sm placeholder:text-champagne-gold/30"
              />
            </div>
            <div>
              <label className="text-sm text-champagne-gold/60 block mb-1">
                Amount (ZEC)
              </label>
              <input
                type="number"
                step="0.0001"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-rich-black/80 border border-monaco-gold/20 rounded px-3 py-2 text-ivory-white text-sm placeholder:text-champagne-gold/30"
              />
            </div>
            <div className="text-xs text-champagne-gold/50">
              Network fee: 0.0001 ZEC
            </div>
            {error && (
              <div className="text-sm text-burgundy">{error}</div>
            )}
            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawAddress || !withdrawAmount}
              className="w-full bg-monaco-gold text-rich-black px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {withdrawing ? 'Processing...' : 'Withdraw'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
