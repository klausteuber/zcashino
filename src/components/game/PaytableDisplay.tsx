'use client'

import type { VideoPokerVariant, VideoPokerHandRank } from '@/types'
import { getPaytable, getHandRankDisplayNames } from '@/lib/game/video-poker'

interface PaytableDisplayProps {
  variant: VideoPokerVariant
  betMultiplier: number
  winningRank?: VideoPokerHandRank | null
  className?: string
}

export default function PaytableDisplay({
  variant,
  betMultiplier,
  winningRank,
  className = '',
}: PaytableDisplayProps) {
  const paytable = getPaytable(variant)
  const ranks = getHandRankDisplayNames(variant)

  return (
    <div className={`w-full max-w-xl mx-auto ${className}`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-masque-gold/30">
            <th className="text-left py-1 px-2 text-venetian-gold/70 font-medium">Hand</th>
            {[1, 2, 3, 4, 5].map(coin => (
              <th
                key={coin}
                className={`text-center py-1 px-1 w-12 font-medium transition-colors duration-200 ${
                  coin === betMultiplier
                    ? 'text-masque-gold bg-masque-gold/10 rounded-t'
                    : 'text-venetian-gold/50'
                }`}
              >
                {coin}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranks.map(({ rank, display }) => {
            const row = paytable[rank]
            if (!row) return null
            const isWinner = winningRank === rank

            return (
              <tr
                key={rank}
                className={`border-b border-masque-gold/10 transition-all duration-300 ${
                  isWinner
                    ? 'bg-masque-gold/20 text-masque-gold font-bold'
                    : 'text-bone-white/80'
                }`}
              >
                <td className={`py-1 px-2 text-left ${isWinner ? 'text-masque-gold' : ''}`}>
                  {display}
                </td>
                {row.map((payout, i) => {
                  const coin = i + 1
                  const isActiveCol = coin === betMultiplier
                  const isWinningCell = isWinner && isActiveCol

                  return (
                    <td
                      key={coin}
                      className={`text-center py-1 px-1 transition-colors duration-200 ${
                        isWinningCell
                          ? 'text-masque-gold font-bold bg-masque-gold/30 rounded'
                          : isActiveCol
                            ? 'text-masque-gold/80 bg-masque-gold/5'
                            : isWinner
                              ? 'text-masque-gold/70'
                              : 'text-bone-white/50'
                      }`}
                    >
                      {payout}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
