'use client'

import type { HandHistoryEntry } from '@/types'

function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

const OUTCOME_CONFIG = {
  blackjack: { icon: '\u2605', label: 'BJ', color: 'text-masque-gold' },
  win: { icon: '\u2713', label: 'Win', color: 'text-success' },
  lose: { icon: '\u2717', label: 'Loss', color: 'text-error' },
  push: { icon: '\u2550', label: 'Push', color: 'text-text-secondary' },
} as const

interface HandHistoryProps {
  entries: HandHistoryEntry[]
}

export function HandHistory({ entries }: HandHistoryProps) {
  if (entries.length === 0) return null

  return (
    <details className="bg-midnight-black/40 rounded-lg p-4 max-w-lg mx-auto border border-masque-gold/20 cyber-panel">
      <summary className="cursor-pointer text-venetian-gold/60 hover:text-masque-gold transition-colors flex items-center justify-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Recent Hands
        <span className="bg-masque-gold/20 text-masque-gold text-xs px-1.5 py-0.5 rounded-full font-mono">
          {entries.length}
        </span>
      </summary>
      <div className="mt-3 space-y-1.5">
        {entries.map((entry) => {
          const config = OUTCOME_CONFIG[entry.outcome]
          const net = entry.payout - entry.mainBet
          return (
            <div
              key={entry.id}
              className="flex items-center justify-between px-3 py-1.5 rounded bg-midnight-black/30 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className={`text-base font-bold ${config.color}`}>
                  {config.icon}
                </span>
                <span className={`font-medium ${config.color}`}>
                  {config.label}
                </span>
              </div>
              <div className="flex items-center gap-4 font-mono text-xs">
                <span className="text-venetian-gold/50">
                  {entry.mainBet.toFixed(2)}
                </span>
                <span className={net > 0 ? 'text-success' : net < 0 ? 'text-error' : 'text-venetian-gold/50'}>
                  {net > 0 ? '+' : ''}{net.toFixed(4)}
                </span>
                <span className="text-venetian-gold/30 w-16 text-right">
                  {timeAgo(entry.createdAt)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}
