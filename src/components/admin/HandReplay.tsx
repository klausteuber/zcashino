'use client'

interface Card {
  rank: string
  suit: string
}

interface HandReplayProps {
  cards: Card[]
  label?: string
}

const SUIT_SYMBOLS: Record<string, string> = {
  spades: '\u2660',
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  s: '\u2660',
  h: '\u2665',
  d: '\u2666',
  c: '\u2663',
  S: '\u2660',
  H: '\u2665',
  D: '\u2666',
  C: '\u2663',
}

function getSuitSymbol(suit: string): string {
  return SUIT_SYMBOLS[suit.toLowerCase()] || suit
}

function isRedSuit(suit: string): boolean {
  const s = suit.toLowerCase()
  return s === 'hearts' || s === 'diamonds' || s === 'h' || s === 'd'
}

export function formatZec(value: number): string {
  return `${value.toFixed(4)} ZEC`
}

export function shortId(value: string, prefix = 8, suffix = 6): string {
  if (value.length <= prefix + suffix + 3) return value
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`
}

export default function HandReplay({ cards, label }: HandReplayProps) {
  if (!cards || cards.length === 0) {
    return (
      <div className="text-bone-white/30 text-sm italic">
        No cards to display
      </div>
    )
  }

  return (
    <div>
      {label && (
        <p className="text-xs text-masque-gold/70 mb-2 uppercase tracking-wider">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {cards.map((card, idx) => {
          const red = isRedSuit(card.suit)
          const symbol = getSuitSymbol(card.suit)
          return (
            <span
              key={idx}
              className={`inline-flex items-center justify-center px-3 py-2 rounded border font-mono text-sm font-bold ${
                red
                  ? 'bg-crimson-mask/10 border-crimson-mask/30 text-crimson-mask'
                  : 'bg-bone-white/5 border-bone-white/20 text-bone-white'
              }`}
            >
              {card.rank}{symbol}
            </span>
          )
        })}
      </div>
    </div>
  )
}
