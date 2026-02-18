'use client'

import { useEffect, useState } from 'react'

interface DemoWinNudgeProps {
  amount: number
  onDeposit?: () => void
  onDismiss: () => void
}

export function DemoWinNudge({ amount, onDeposit, onDismiss }: DemoWinNudgeProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    // Slide in after a brief delay
    const showTimer = setTimeout(() => setVisible(true), 300)

    // Auto-dismiss after 6 seconds
    const hideTimer = setTimeout(() => {
      setExiting(true)
      setTimeout(onDismiss, 400)
    }, 6000)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [onDismiss])

  const handleDismiss = () => {
    setExiting(true)
    setTimeout(onDismiss, 400)
  }

  return (
    <div
      className={`demo-nudge-toast fixed bottom-6 right-6 z-50 max-w-sm transition-all duration-400 ${
        visible && !exiting
          ? 'translate-x-0 opacity-100'
          : 'translate-x-full opacity-0'
      }`}
    >
      <div className="bg-midnight-black/95 border border-masque-gold/40 rounded-xl cyber-panel shadow-2xl p-4">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-venetian-gold/40 hover:text-bone-white text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0">🎉</div>
          <div>
            <p className="text-sm font-medium text-bone-white">
              Nice! You won {amount.toFixed(4)} ZEC
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
