'use client'

interface RTPDisplayProps {
  blackjack: {
    hands: number
    payout: number
  }
  videoPoker: {
    hands: number
    wagered: number
    payout: number
    rtp: number
  }
  theoretical: {
    blackjackRTP: number
    videoPokerRTP: number
  }
  totalWagered: number
  totalPayout: number
}

function RTPBar({ label, actual, theoretical, hands }: {
  label: string
  actual: number
  theoretical: number
  hands: number
}) {
  const maxRTP = Math.max(actual, theoretical, 100)
  const actualWidth = Math.min((actual / maxRTP) * 100, 100)
  const theoreticalPos = Math.min((theoretical / maxRTP) * 100, 100)
  const deviation = actual - theoretical
  const deviationColor = Math.abs(deviation) < 2
    ? 'text-jester-purple'
    : deviation > 0
      ? 'text-blood-ruby'
      : 'text-masque-gold'

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-sm text-venetian-gold/70">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-mono text-bone-white">{actual.toFixed(2)}%</span>
          <span className={`text-xs font-mono ${deviationColor}`}>
            ({deviation >= 0 ? '+' : ''}{deviation.toFixed(2)}%)
          </span>
          <span className="text-xs text-venetian-gold/40">{hands} hands</span>
        </div>
      </div>
      <div className="relative h-3 bg-midnight-black/70 rounded-full overflow-hidden border border-masque-gold/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-jester-purple/60"
          style={{ width: `${actualWidth}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-masque-gold"
          style={{ left: `${theoreticalPos}%` }}
          title={`Theoretical: ${theoretical.toFixed(2)}%`}
        />
      </div>
      <div className="flex justify-between text-xs text-venetian-gold/40">
        <span>0%</span>
        <span>Theoretical: {theoretical.toFixed(2)}%</span>
        <span>100%</span>
      </div>
    </div>
  )
}

export default function RTPDisplay({
  blackjack,
  videoPoker,
  theoretical,
  totalWagered,
  totalPayout,
}: RTPDisplayProps) {
  const overallRTP = totalWagered > 0 ? (totalPayout / totalWagered) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-venetian-gold/60">Overall RTP</span>
        <span className="text-lg font-mono font-bold text-bone-white">
          {overallRTP.toFixed(2)}%
        </span>
      </div>
      <RTPBar
        label="Blackjack"
        actual={totalWagered > 0 ? (blackjack.payout / totalWagered) * 100 : 0}
        theoretical={theoretical.blackjackRTP * 100}
        hands={blackjack.hands}
      />
      <RTPBar
        label="Video Poker"
        actual={videoPoker.rtp}
        theoretical={theoretical.videoPokerRTP * 100}
        hands={videoPoker.hands}
      />
    </div>
  )
}
