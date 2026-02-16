'use client'

import Card from '@/components/game/Card'
import type { Card as CardType } from '@/types'

interface VideoPokerHandProps {
  cards: CardType[]
  heldCards: boolean[]
  onToggleHold?: (index: number) => void
  disabled?: boolean
  isWild?: (card: CardType) => boolean
  showResult?: boolean
  animateDealing?: boolean
  previousCardCount?: number
}

export default function VideoPokerHand({
  cards,
  heldCards,
  onToggleHold,
  disabled = false,
  isWild,
  showResult = false,
  animateDealing = false,
  previousCardCount = 0,
}: VideoPokerHandProps) {
  return (
    <div className="flex justify-center gap-2 sm:gap-3 lg:gap-4">
      {cards.map((card, index) => {
        const isHeld = heldCards[index]
        const cardIsWild = isWild?.(card) ?? false
        const isNew = animateDealing && index >= previousCardCount

        return (
          <div key={`${card.rank}-${card.suit}-${index}`} className="flex flex-col items-center gap-1">
            {/* HELD indicator */}
            <div className={`text-xs font-bold tracking-wider transition-all duration-150 h-5 ${
              isHeld ? 'text-masque-gold opacity-100 drop-shadow-[0_0_4px_rgba(201,162,39,0.6)]' : 'opacity-0'
            }`}>
              HELD
            </div>

            {/* Card with click handler */}
            <button
              onClick={() => onToggleHold?.(index)}
              disabled={disabled}
              className={`relative transition-all duration-200 ${
                !disabled ? 'cursor-pointer hover:-translate-y-1 hover:brightness-110 active:scale-95' : 'cursor-default'
              } ${isHeld ? 'ring-2 ring-masque-gold shadow-[0_0_14px_rgba(201,162,39,0.5)] -translate-y-3 rotate-[-1deg]' : ''}`}
            >
              {/* Responsive card sizes: md on mobile, lg on tablet, xl on desktop */}
              <div className="sm:hidden">
                <Card
                  card={card}
                  size="md"
                  isNew={isNew}
                  dealDelay={isNew ? (index - previousCardCount) * 120 : 0}
                  dealFromShoe={true}
                />
              </div>
              <div className="hidden sm:block lg:hidden">
                <Card
                  card={card}
                  size="lg"
                  isNew={isNew}
                  dealDelay={isNew ? (index - previousCardCount) * 120 : 0}
                  dealFromShoe={true}
                />
              </div>
              <div className="hidden lg:block">
                <Card
                  card={card}
                  size="xl"
                  isNew={isNew}
                  dealDelay={isNew ? (index - previousCardCount) * 120 : 0}
                  dealFromShoe={true}
                />
              </div>

              {/* Wild card indicator for Deuces Wild */}
              {cardIsWild && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-masque-gold text-midnight-black text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg animate-pulse">
                  WILD
                </div>
              )}
            </button>

            {/* Card position number (keyboard shortcut hint) */}
            <div className={`text-[10px] font-mono transition-all duration-200 ${
              onToggleHold && !disabled
                ? 'text-masque-gold/60 bg-masque-gold/10 rounded px-1'
                : 'text-venetian-gold/30'
            }`}>
              {index + 1}
            </div>
          </div>
        )
      })}
    </div>
  )
}
