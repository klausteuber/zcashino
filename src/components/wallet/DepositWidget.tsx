'use client'

import { useState } from 'react'

interface DepositWidgetProps {
  balance: number
  isDemo: boolean
  isAuthenticated: boolean
  pendingDeposit?: { amount: number; confirmations: number } | null
  onDepositClick: () => void
  onSwitchToReal?: () => void
}

export function DepositWidget({
  balance,
  isDemo,
  isAuthenticated,
  pendingDeposit,
  onDepositClick,
  onSwitchToReal
}: DepositWidgetProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (isDemo) {
    return (
      <div className="flex items-center gap-3">
        {/* Demo Mode Badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <span className="text-amber-400 text-sm">🎮</span>
          <span className="text-amber-400 text-sm font-medium">DEMO</span>
        </div>

        {/* Balance */}
        <div className="text-white font-mono">
          <span className="text-zinc-400 text-sm mr-1">Balance:</span>
          <span className="text-lg font-semibold">{balance.toFixed(4)}</span>
          <span className="text-zinc-400 ml-1">ZEC</span>
        </div>

        {/* Switch to Real Button */}
        {onSwitchToReal && (
          <button
            onClick={onSwitchToReal}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black text-sm font-semibold rounded-lg transition-all shadow-lg shadow-amber-500/20"
          >
            Play with Real ZEC →
          </button>
        )}

        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute top-full mt-2 right-0 w-48 p-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl text-xs text-zinc-300 z-50">
            Demo mode uses play money. Switch to real ZEC to play for real.
          </div>
        )}
      </div>
    )
  }

  // Real ZEC mode
  return (
    <div className="flex items-center gap-3">
      {/* Auth Status Badge */}
      {isAuthenticated ? (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded-lg">
          <span className="text-green-400 text-xs">✓</span>
          <span className="text-green-400 text-xs font-medium">Verified</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg animate-pulse">
          <span className="text-amber-400 text-xs">○</span>
          <span className="text-amber-400 text-xs font-medium">Pending</span>
        </div>
      )}

      {/* Balance Display */}
      <div className="text-white font-mono">
        <span className="text-zinc-400 text-sm mr-1">Balance:</span>
        <span className="text-lg font-semibold">{balance.toFixed(4)}</span>
        <span className="text-zinc-400 ml-1">ZEC</span>
      </div>

      {/* Pending Deposit Indicator */}
      {pendingDeposit && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          <span className="text-blue-400 text-sm">
            +{pendingDeposit.amount.toFixed(4)} incoming
          </span>
          <span className="text-blue-300 text-xs">
            ({pendingDeposit.confirmations}/3)
          </span>
        </div>
      )}

      {/* Deposit Button */}
      <button
        onClick={onDepositClick}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg transition-colors"
      >
        <span>+</span>
        <span>Deposit</span>
      </button>
    </div>
  )
}

// Compact version for mobile
export function DepositWidgetCompact({
  balance,
  isDemo,
  pendingDeposit,
  onDepositClick
}: Omit<DepositWidgetProps, 'isAuthenticated' | 'onSwitchToReal'>) {
  return (
    <div className="flex items-center gap-2">
      {isDemo && (
        <span className="text-amber-400 text-xs px-1.5 py-0.5 bg-amber-500/20 rounded">
          DEMO
        </span>
      )}

      <div className="text-white font-mono text-sm">
        <span className="font-semibold">{balance.toFixed(4)}</span>
        <span className="text-zinc-400 ml-1">ZEC</span>
      </div>

      {pendingDeposit && (
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" title={`+${pendingDeposit.amount} incoming`} />
      )}

      <button
        onClick={onDepositClick}
        className="w-8 h-8 flex items-center justify-center bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors"
      >
        +
      </button>
    </div>
  )
}
