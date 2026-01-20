import type { Card, Suit, Rank } from '@/types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/**
 * Creates a standard 52-card deck
 */
export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, faceUp: true })
    }
  }
  return deck
}

/**
 * Creates multiple decks (for 6-deck shoe)
 */
export function createShoe(numDecks: number = 6): Card[] {
  const shoe: Card[] = []
  for (let i = 0; i < numDecks; i++) {
    shoe.push(...createDeck())
  }
  return shoe
}

/**
 * Fisher-Yates shuffle algorithm
 * Takes a seed for provably fair shuffling
 */
export function shuffleDeck(deck: Card[], seed: string): Card[] {
  // Create a copy to avoid mutating original
  const shuffled = [...deck]

  // Use seed to generate deterministic random numbers
  const random = seededRandom(seed)

  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

/**
 * Generate a deterministic shuffle order from a seed
 * Returns array of indices representing card positions after shuffle
 */
export function generateShuffleOrder(deckSize: number, seed: string): number[] {
  const indices = Array.from({ length: deckSize }, (_, i) => i)
  const random = seededRandom(seed)

  // Fisher-Yates shuffle on indices
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  return indices
}

/**
 * Seeded random number generator (mulberry32)
 * Deterministic PRNG for provably fair shuffling
 */
function seededRandom(seed: string): () => number {
  // Convert seed string to 32-bit integer
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }

  // Mulberry32 PRNG
  return function() {
    let t = hash += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/**
 * Get the numeric value(s) of a card for blackjack
 * Aces can be 1 or 11
 */
export function getCardValue(card: Card): number[] {
  switch (card.rank) {
    case 'A':
      return [1, 11]
    case 'K':
    case 'Q':
    case 'J':
      return [10]
    default:
      return [parseInt(card.rank)]
  }
}

/**
 * Calculate the best hand value (highest without busting)
 */
export function calculateHandValue(cards: Card[]): number {
  let baseValue = 0
  let aces = 0

  for (const card of cards) {
    const values = getCardValue(card)
    if (values.length === 2) {
      // It's an ace
      aces++
      baseValue += 1 // Count as 1 initially
    } else {
      baseValue += values[0]
    }
  }

  // Try to use aces as 11 where beneficial
  while (aces > 0 && baseValue + 10 <= 21) {
    baseValue += 10
    aces--
  }

  return baseValue
}

/**
 * Check if hand is soft (has an ace counting as 11)
 */
export function isSoftHand(cards: Card[]): boolean {
  let baseValue = 0
  let aces = 0

  for (const card of cards) {
    const values = getCardValue(card)
    if (values.length === 2) {
      aces++
      baseValue += 1
    } else {
      baseValue += values[0]
    }
  }

  // If we can use an ace as 11 without busting, it's soft
  return aces > 0 && baseValue + 10 <= 21
}

/**
 * Check if hand is a blackjack (21 with first two cards)
 */
export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && calculateHandValue(cards) === 21
}

/**
 * Check if hand is busted (over 21)
 */
export function isBusted(cards: Card[]): boolean {
  return calculateHandValue(cards) > 21
}

/**
 * Check if hand can be split (two cards of same rank)
 */
export function canSplit(cards: Card[]): boolean {
  return cards.length === 2 && cards[0].rank === cards[1].rank
}

/**
 * Check if hand can be doubled (typically only on 9, 10, 11 with two cards)
 * Vegas Strip rules allow double on any two cards
 */
export function canDouble(cards: Card[]): boolean {
  return cards.length === 2
}

/**
 * Get card color (for perfect pairs)
 */
export function getCardColor(card: Card): 'red' | 'black' {
  return card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : 'black'
}

/**
 * Determine Perfect Pairs outcome
 */
export function getPerfectPairsOutcome(cards: Card[]): {
  outcome: 'none' | 'mixed' | 'colored' | 'perfect'
  multiplier: number
} {
  if (cards.length < 2 || cards[0].rank !== cards[1].rank) {
    return { outcome: 'none', multiplier: 0 }
  }

  const card1 = cards[0]
  const card2 = cards[1]

  // Same suit = Perfect pair (25:1)
  if (card1.suit === card2.suit) {
    return { outcome: 'perfect', multiplier: 25 }
  }

  // Same color = Colored pair (12:1)
  if (getCardColor(card1) === getCardColor(card2)) {
    return { outcome: 'colored', multiplier: 12 }
  }

  // Different color = Mixed pair (6:1)
  return { outcome: 'mixed', multiplier: 6 }
}

/**
 * Get display string for card
 */
export function cardToString(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  }
  return `${card.rank}${suitSymbols[card.suit]}`
}

/**
 * Get display string for hand
 */
export function handToString(cards: Card[]): string {
  return cards.map(cardToString).join(' ')
}
