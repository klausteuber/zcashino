'use client'

import { useState } from 'react'

interface DepositWidgetProps {
  balance: number
  isDemo: boolean
  isAuthenticated: boolean
  pendingDeposit?: { amount: number; confirmations: number } | null
  onDepositClick: () => void
  onWithdrawClick?: () => void
  onSwitchToReal?: () => void
}

export function DepositWidget({
  balance,
  isDemo,
  isAuthenticated,
  pendingDeposit,
  onDepositClick,
  onWithdrawClick,
  onSwitchToReal
}: DepositWidgetProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (isDemo) {
    return (
      <div className="flex items-center gap-4">
        {/* Demo Mode Badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 bg-masque-gold/10 border border-masque-gold/30 rounded-lg"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <span className="text-venetian-gold text-sm">🎮</span>
          <span className="text-venetian-gold text-sm font-medium">DEMO</span>
        </div>

        {/* Balance */}
        <div className="text-bone-white font-mono">
          <span className="text-venetian-gold/50 text-sm mr-1">Balance:</span>
          <span className="text-lg font-semibold">{balance.toFixed(4)}</span>
          <span className="text-venetian-gold/50 ml-1">ZEC</span>
        </div>

        {/* Switch to Real Button */}
        {onSwitchToReal && (
          <button
            onClick={onSwitchToReal}
            className="btn-gold-shimmer px-3 py-1.5 text-midnight-black text-sm font-semibold rounded-lg"
          >
            Play with Real ZEC →
          </button>
        )}

        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute top-full mt-2 right-0 w-48 p-2 bg-midnight-black border border-masque-gold/30 rounded-lg shadow-xl text-xs text-venetian-gold z-50">
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
        <div className="flex items-center gap-1.5 px-2 py-1 bg-jester-purple/10 border border-jester-purple/30 rounded-lg">
          <span className="text-jester-purple-light text-xs">✓</span>
          <span className="text-jester-purple-light text-xs font-medium">Verified</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-masque-gold/10 border border-masque-gold/30 rounded-lg animate-pulse">
          <span className="text-venetian-gold text-xs">○</span>
          <span className="text-venetian-gold text-xs font-medium">Pending</span>
        </div>
      )}

      {/* Balance Display */}
      <div className="text-bone-white font-mono">
        <span className="text-venetian-gold/50 text-sm mr-1">Balance:</span>
        <span className="text-lg font-semibold">{balance.toFixed(4)}</span>
        <span className="text-venetian-gold/50 ml-1">ZEC</span>
      </div>

      {/* Pending Deposit Indicator */}
      {pendingDeposit && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-jester-purple-light/10 border border-jester-purple-light/30 rounded-lg">
          <div className="w-2 h-2 bg-jester-purple-light rounded-full animate-pulse" />
          <span className="text-jester-purple-light text-sm">
            +{pendingDeposit.amount.toFixed(4)} incoming
          </span>
          <span className="text-jester-purple-light/70 text-xs">
            ({pendingDeposit.confirmations}/3)
          </span>
        </div>
      )}

      {/* Deposit & Withdraw Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onDepositClick}
          className="btn-gold-shimmer flex items-center gap-1.5 px-3 py-1.5 text-midnight-black text-sm font-semibold rounded-lg"
        >
          <span>+</span>
          <span>Deposit</span>
        </button>
        {onWithdrawClick && balance > 0 && (
          <button
            onClick={onWithdrawClick}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-masque-gold/30 text-venetian-gold text-sm font-semibold rounded-lg hover:bg-masque-gold/10 transition-colors"
          >
            <span>&minus;</span>
            <span>Withdraw</span>
          </button>
        )}
      </div>
    </div>
  )
}

// Compact version for mobile
export function DepositWidgetCompact({
  balance,
  isDemo,
  pendingDeposit,
  onDepositClick,
  onWithdrawClick,
}: Omit<DepositWidgetProps, 'isAuthenticated' | 'onSwitchToReal'>) {
  return (
    <div className="flex items-center gap-2">
      {isDemo && (
        <span className="text-venetian-gold text-xs px-1.5 py-0.5 bg-masque-gold/20 rounded">
          DEMO
        </span>
      )}

      <div className="text-bone-white font-mono text-sm">
        <span className="font-semibold">{balance.toFixed(4)}</span>
        <span className="text-venetian-gold/50 ml-1">ZEC</span>
      </div>

      {pendingDeposit && (
        <div className="w-2 h-2 bg-jester-purple-light rounded-full animate-pulse" title={`+${pendingDeposit.amount} incoming`} />
      )}

      <button
        onClick={onDepositClick}
        className="w-8 h-8 flex items-center justify-center btn-gold-shimmer text-midnight-black font-bold rounded-lg"
      >
        +
      </button>
      {onWithdrawClick && balance > 0 && (
        <button
          onClick={onWithdrawClick}
          className="w-8 h-8 flex items-center justify-center border border-masque-gold/30 text-venetian-gold font-bold rounded-lg hover:bg-masque-gold/10 transition-colors"
        >
          &minus;
        </button>
      )}
    </div>
  )
}
