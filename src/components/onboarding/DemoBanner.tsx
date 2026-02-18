'use client'

interface DemoBannerProps {
  balance: number
  onDepositClick: () => void
}

export function DemoBanner({ balance, onDepositClick }: DemoBannerProps) {
  return (
    <div className="demo-banner w-full flex items-center justify-between gap-4 px-4 py-2 bg-masque-gold/10 border border-masque-gold/30 rounded-lg">
      <div className="flex items-center gap-3">
        <span className="demo-banner-badge inline-flex items-center gap-1.5 px-2 py-0.5 bg-masque-gold/20 border border-masque-gold/40 rounded text-xs font-semibold text-masque-gold uppercase tracking-wider">
          Demo
        </span>
        <span className="text-sm text-venetian-gold/70">
          Playing with play money
        </span>
        <span className="text-sm text-venetian-gold/40">·</span>
        <span className="text-sm font-mono text-bone-white">
          {balance.toFixed(4)} ZEC
        </span>
      </div>
      <button
        onClick={onDepositClick}
        className="demo-banner-cta flex-shrink-0 px-3 py-1 btn-gold-shimmer text-midnight-black text-sm font-semibold rounded-lg transition-colors"
      >
        Deposit Real ZEC →
      </button>
    </div>
  )
}
