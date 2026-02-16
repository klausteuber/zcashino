'use client'

import { useState, useEffect } from 'react'
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
    <div className="flex justify-center gap-2 sm:gap-3">
      {cards.map((card, index) => {
        const isHeld = heldCards[index]
        const cardIsWild = isWild?.(card) ?? false
        const isNew = animateDealing && index >= previousCardCount

        return (
          <div key={`${card.rank}-${card.suit}-${index}`} className="flex flex-col items-center gap-1">
            {/* HELD indicator */}
            <div className={`text-xs font-bold tracking-wider transition-all duration-200 h-5 ${
              isHeld ? 'text-masque-gold opacity-100' : 'opacity-0'
            }`}>
              HELD
            </div>

            {/* Card with click handler */}
            <button
              onClick={() => onToggleHold?.(index)}
              disabled={disabled}
              className={`relative transition-all duration-200 ${
                !disabled ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'
              } ${isHeld ? 'ring-2 ring-masque-gold shadow-[0_0_12px_rgba(201,162,39,0.4)] -translate-y-2' : ''}`}
            >
              <Card
                card={card}
                size="lg"
                isNew={isNew}
                dealDelay={isNew ? (index - previousCardCount) * 120 : 0}
                dealFromShoe={true}
              />

              {/* Wild card indicator for Deuces Wild */}
              {cardIsWild && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-masque-gold text-midnight-black text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg animate-pulse">
                  WILD
                </div>
              )}
            </button>

            {/* Card position number (keyboard shortcut hint) */}
            <div className="text-[10px] text-venetian-gold/30 font-mono hidden sm:block">
              {index + 1}
            </div>
          </div>
        )
      })}
    </div>
  )
}
