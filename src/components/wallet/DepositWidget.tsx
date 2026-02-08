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
      <div className="flex items-center gap-4">
        {/* Demo Mode Badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 bg-monaco-gold/10 border border-monaco-gold/30 rounded-lg"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <span className="text-champagne-gold text-sm">🎮</span>
          <span className="text-champagne-gold text-sm font-medium">DEMO</span>
        </div>

        {/* Balance */}
        <div className="text-ivory-white font-mono">
          <span className="text-champagne-gold/50 text-sm mr-1">Balance:</span>
          <span className="text-lg font-semibold">{balance.toFixed(4)}</span>
          <span className="text-champagne-gold/50 ml-1">ZEC</span>
        </div>

        {/* Switch to Real Button */}
        {onSwitchToReal && (
          <button
            onClick={onSwitchToReal}
            className="btn-gold-shimmer px-3 py-1.5 text-rich-black text-sm font-semibold rounded-lg"
          >
            Play with Real ZEC →
          </button>
        )}

        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute top-full mt-2 right-0 w-48 p-2 bg-rich-black border border-monaco-gold/30 rounded-lg shadow-xl text-xs text-champagne-gold z-50">
            Demo mode uses play money. Switch to real ZEC to play for real.
          </div>
        )}
      </div>
    )
  }

  // Real ZEC mode
  return (
    <div className="flex items-center gap-4">
      {/* Auth Status Badge */}
      {isAuthenticated ? (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-pepe-green/10 border border-pepe-green/30 rounded-lg">
          <span className="text-pepe-green-light text-xs">✓</span>
          <span className="text-pepe-green-light text-xs font-medium">Verified</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-monaco-gold/10 border border-monaco-gold/30 rounded-lg animate-pulse">
          <span className="text-champagne-gold text-xs">○</span>
          <span className="text-champagne-gold text-xs font-medium">Pending</span>
        </div>
      )}

      {/* Balance Display */}
      <div className="text-ivory-white font-mono">
        <span className="text-champagne-gold/50 text-sm mr-1">Balance:</span>
        <span className="text-lg font-semibold">{balance.toFixed(4)}</span>
        <span className="text-champagne-gold/50 ml-1">ZEC</span>
      </div>

      {/* Pending Deposit Indicator */}
      {pendingDeposit && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-pepe-green-light/10 border border-pepe-green-light/30 rounded-lg">
          <div className="w-2 h-2 bg-pepe-green-light rounded-full animate-pulse" />
          <span className="text-pepe-green-light text-sm">
            +{pendingDeposit.amount.toFixed(4)} incoming
          </span>
          <span className="text-pepe-green-light/70 text-xs">
            ({pendingDeposit.confirmations}/3)
          </span>
        </div>
      )}

      {/* Deposit Button */}
      <button
        onClick={onDepositClick}
        className="btn-gold-shimmer flex items-center gap-1.5 px-3 py-1.5 text-rich-black text-sm font-semibold rounded-lg"
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
        <span className="text-champagne-gold text-xs px-1.5 py-0.5 bg-monaco-gold/20 rounded">
          DEMO
        </span>
      )}

      <div className="text-ivory-white font-mono text-sm">
        <span className="font-semibold">{balance.toFixed(4)}</span>
        <span className="text-champagne-gold/50 ml-1">ZEC</span>
      </div>

      {pendingDeposit && (
        <div className="w-2 h-2 bg-pepe-green-light rounded-full animate-pulse" title={`+${pendingDeposit.amount} incoming`} />
      )}

      <button
        onClick={onDepositClick}
        className="w-8 h-8 flex items-center justify-center btn-gold-shimmer text-rich-black font-bold rounded-lg"
      >
        +
      </button>
    </div>
  )
}
