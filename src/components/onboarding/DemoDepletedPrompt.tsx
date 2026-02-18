'use client'

interface DemoDepletedPromptProps {
  onDeposit: () => void
  onResetDemo: () => void
}

export function DemoDepletedPrompt({ onDeposit, onResetDemo }: DemoDepletedPromptProps) {
  return (
    <div className="demo-depleted flex flex-col items-center gap-4 py-6 px-4">
      <div className="text-4xl">🃏</div>
      <h3 className="text-lg font-display font-bold text-bone-white">
        Demo Balance Depleted
      </h3>
      <p className="text-sm text-venetian-gold/60 text-center max-w-xs">
        Ready to play for real? Deposit ZEC and win real cryptocurrency.
      </p>
      <button
        onClick={onDeposit}
        className="btn-gold-shimmer px-6 py-3 text-midnight-black font-semibold rounded-lg transition-colors text-sm"
      >
        Deposit Real ZEC →
      </button>
      <button
        onClick={onResetDemo}
        className="text-xs text-venetian-gold/40 hover:text-venetian-gold/70 underline transition-colors"
      >
        Reset demo balance
      </button>
    </div>
  )
}
