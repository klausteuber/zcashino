'use client'

import { useState, useEffect } from 'react'
import type { Card as CardType, Suit } from '@/types'
import { JesterBell } from '@/components/ui/JesterLogo'

interface CardProps {
  card: CardType
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  dealDelay?: number // Delay in ms before card deals in
  isNew?: boolean // Whether this card was just dealt
  dealFromShoe?: boolean // Whether to use the shoe-dealing animation
}

const suitSymbols: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
}

const suitClasses: Record<Suit, string> = {
  hearts: 'card-suit-red',
  diamonds: 'card-suit-red',
  clubs: 'card-suit-black',
  spades: 'card-suit-black',
}

const sizeClasses = {
  sm: 'w-12 h-[4.2rem] text-[0.65rem]',
  md: 'w-16 h-[5.6rem] text-xs',
  lg: 'w-20 h-[7rem] text-sm',
  xl: 'w-28 h-[9.8rem] text-base'
}

const centerSuitSize: Record<string, string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
}

const cornerSuitSize: Record<string, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
}

export default function Card({ card, size = 'md', className = '', dealDelay = 0, isNew = false, dealFromShoe = true }: CardProps) {
  const cSuit = centerSuitSize[size]
  const crSuit = cornerSuitSize[size]
  const [isDealt, setIsDealt] = useState(!isNew)
  const [isFlipping, setIsFlipping] = useState(false)
  const [showFace, setShowFace] = useState(card.faceUp)
  const [animationComplete, setAnimationComplete] = useState(!isNew)

  // Handle deal animation
  useEffect(() => {
    if (!isNew) return

    let animTimer: ReturnType<typeof setTimeout> | null = null
    const timer = setTimeout(() => {
      setIsDealt(true)
      // Mark animation complete after the animation duration.
      animTimer = setTimeout(() => {
        setAnimationComplete(true)
      }, 400) // Match animation duration
    }, dealDelay)

    return () => {
      clearTimeout(timer)
      if (animTimer) clearTimeout(animTimer)
    }
  }, [isNew, dealDelay])

  // Handle flip animation when card changes from face-down to face-up
  useEffect(() => {
    if (card.faceUp && !showFace) {
      const startFlipTimer = setTimeout(() => {
        setIsFlipping(true)
      }, 0)
      // At halfway through flip, show the face.
      const flipTimer = setTimeout(() => {
        setShowFace(true)
      }, 150)
      // End flip animation.
      const endTimer = setTimeout(() => {
        setIsFlipping(false)
      }, 300)
      return () => {
        clearTimeout(startFlipTimer)
        clearTimeout(flipTimer)
        clearTimeout(endTimer)
      }
    } else if (!card.faceUp && showFace) {
      const hideFaceTimer = setTimeout(() => {
        setIsFlipping(false)
        setShowFace(false)
      }, 0)

      return () => {
        clearTimeout(hideFaceTimer)
      }
    }
  }, [card.faceUp, showFace])

  // Animation classes - use shoe dealing animation for new cards
  const shouldAnimateFromShoe = isNew && isDealt && !animationComplete && dealFromShoe
  const dealAnimationClass = isNew && !isDealt
    ? 'opacity-0 translate-x-[300px] translate-y-[-200px] rotate-[15deg] scale-[0.8]'
    : shouldAnimateFromShoe
      ? 'deal-from-shoe'
      : ''
  const flipAnimationClass = isFlipping ? 'card-flip-3d' : ''
  const transitionClass = animationComplete ? 'transition-all duration-300 ease-out' : ''

  // Render face-down card back
  const renderCardBack = () => (
    <div className="card-back-inner w-3/4 h-3/4 border border-masque-gold/30 rounded-md bg-jester-purple-dark/60 flex items-center justify-center relative overflow-hidden">
      {/* Diamond tufted pattern overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 20 L20 0 L40 20 L20 40 Z' fill='none' stroke='%23C9A227' stroke-width='0.5' stroke-opacity='0.5'/%3E%3C/svg%3E")`,
          backgroundSize: '20px 20px'
        }}
      />
      <JesterBell className="w-6 h-6 text-masque-gold/60" />
    </div>
  )

  // Render card face
  const symbol = suitSymbols[card.suit]
  const suitClass = suitClasses[card.suit]

  const renderCardFace = () => (
    <>
      {/* Top left */}
      <div className={`flex flex-col items-start leading-none ${suitClass}`}>
        <span className="font-bold">{card.rank}</span>
        <span className={`${crSuit} -mt-0.5`}>{symbol}</span>
      </div>

      {/* Center */}
      <div className={`flex items-center justify-center ${suitClass}`}>
        <span className={cSuit}>{symbol}</span>
      </div>

      {/* Bottom right (rotated) */}
      <div className={`flex flex-col items-end leading-none rotate-180 ${suitClass}`}>
        <span className="font-bold">{card.rank}</span>
        <span className={`${crSuit} -mt-0.5`}>{symbol}</span>
      </div>
    </>
  )

  // Card is face down (and not flipping to face up)
  if (!showFace) {
    return (
      <div
        className={`${sizeClasses[size]} playing-card-back bg-gradient-to-br from-jester-purple-dark via-jester-purple to-jester-purple-dark rounded-lg shadow-lg flex items-center justify-center border-2 border-masque-gold/40 ${transitionClass} ${dealAnimationClass} ${flipAnimationClass} ${className}`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {renderCardBack()}
      </div>
    )
  }

  // Card is face up
  return (
    <div
      className={`${sizeClasses[size]} playing-card card-face-up rounded-lg shadow-lg flex flex-col justify-between p-1.5 overflow-hidden border border-venetian-gold/50 ${transitionClass} ${dealAnimationClass} ${flipAnimationClass} ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {renderCardFace()}
    </div>
  )
}

type HandResult = 'win' | 'lose' | 'push' | 'blackjack' | null

// Responsive card overlap based on size
const overlapClasses = {
  sm: '-ml-4',
  md: '-ml-6',
  lg: '-ml-8',
  xl: '-ml-10'
}

interface HandProps {
  cards: CardType[]
  size?: 'sm' | 'md' | 'lg' | 'xl'
  label?: string
  value?: number
  showValue?: boolean
  className?: string
  animateDealing?: boolean // Whether to animate cards dealing in
  previousCardCount?: number // How many cards were in the hand before
  isBust?: boolean
  isBlackjack?: boolean
  isActive?: boolean // Whether this hand is currently active (player's turn)
  isDealerTurn?: boolean // Whether the dealer is currently drawing
  result?: HandResult // The result of this hand after game ends
}

export function Hand({
  cards,
  size = 'md',
  label,
  value,
  showValue = true,
  className = '',
  animateDealing = false,
  previousCardCount = 0,
  isBust = false,
  isBlackjack = false,
  isActive = false,
  isDealerTurn = false,
  result = null
}: HandProps) {
  // Determine the hand highlight class based on state
  const getHandHighlightClass = () => {
    if (result === 'win' || result === 'blackjack') return 'winner-hand'
    if (result === 'lose') return 'loser-hand'
    if (result === 'push') return 'push-hand'
    if (isDealerTurn) return 'dealer-turn'
    if (isActive) return 'active-hand'
    return ''
  }
  // Determine which cards are "new" (for deal animation)
  const getIsNew = (index: number) => {
    if (!animateDealing) return false
    return index >= previousCardCount
  }

  // Calculate deal delay for staggered animation
  const getDealDelay = (index: number) => {
    if (!animateDealing || index < previousCardCount) return 0
    // Stagger each new card by 150ms
    return (index - previousCardCount) * 150
  }

  const highlightClass = getHandHighlightClass()
  const overlap = overlapClasses[size]

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {label && (
        <div className="text-sm font-semibold text-venetian-gold/50">{label}</div>
      )}

      <div className={`flex ${highlightClass}`}>
        {cards.map((card, index) => (
          <Card
            key={`${card.rank}-${card.suit}-${index}`}
            card={card}
            size={size}
            className={index > 0 ? overlap : ''}
            isNew={getIsNew(index)}
            dealDelay={getDealDelay(index)}
            dealFromShoe={true}
          />
        ))}
      </div>

      {showValue && value !== undefined && (
        <div className={`text-lg font-bold px-3 py-1 rounded-full border transition-all duration-300
          ${isBust
            ? 'text-blood-ruby bg-blood-ruby/20 border-blood-ruby/50 animate-pulse'
            : isBlackjack
              ? 'text-masque-gold bg-masque-gold/20 border-masque-gold win-glow'
              : 'text-masque-gold bg-midnight-black/40 border-masque-gold/30'
          }`}>
          {isBust && '💥 '}
          {value}
          {isBlackjack && ' 🎰'}
        </div>
      )}
    </div>
  )
}
