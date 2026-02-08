import { describe, it, expect } from 'vitest'
import type { Card, Suit, Rank } from '@/types'
import {
  createDeck,
  createShoe,
  shuffleDeck,
  generateShuffleOrder,
  getCardValue,
  calculateHandValue,
  isSoftHand,
  isBlackjack,
  isBusted,
  canSplit,
  canDouble,
  getCardColor,
  getPerfectPairsOutcome,
  cardToString,
  handToString,
} from './deck'

// Helper to create a card quickly
const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit, faceUp: true })

describe('createDeck', () => {
  it('returns exactly 52 cards', () => {
    expect(createDeck()).toHaveLength(52)
  })

  it('contains all 4 suits', () => {
    const deck = createDeck()
    const suits = new Set(deck.map((c) => c.suit))
    expect(suits).toEqual(new Set(['hearts', 'diamonds', 'clubs', 'spades']))
  })

  it('contains all 13 ranks', () => {
    const deck = createDeck()
    const ranks = new Set(deck.map((c) => c.rank))
    expect(ranks).toEqual(new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']))
  })

  it('has no duplicate cards', () => {
    const deck = createDeck()
    const keys = deck.map((c) => `${c.rank}_${c.suit}`)
    expect(new Set(keys).size).toBe(52)
  })

  it('all cards are face up', () => {
    const deck = createDeck()
    expect(deck.every((c) => c.faceUp === true)).toBe(true)
  })
})

describe('createShoe', () => {
  it('default 6 decks returns 312 cards', () => {
    expect(createShoe()).toHaveLength(312)
  })

  it('createShoe(1) returns 52 cards', () => {
    expect(createShoe(1)).toHaveLength(52)
  })

  it('createShoe(8) returns 416 cards', () => {
    expect(createShoe(8)).toHaveLength(416)
  })

  it('contains 6 copies of each card in default shoe', () => {
    const shoe = createShoe()
    const counts = new Map<string, number>()
    for (const c of shoe) {
      const key = `${c.rank}_${c.suit}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    for (const count of counts.values()) {
      expect(count).toBe(6)
    }
  })
})

describe('shuffleDeck', () => {
  it('returns same number of cards as input', () => {
    const deck = createDeck()
    expect(shuffleDeck(deck, 'seed1')).toHaveLength(52)
  })

  it('same seed produces same order (deterministic)', () => {
    const deck = createDeck()
    const a = shuffleDeck(deck, 'test-seed-123')
    const b = shuffleDeck(deck, 'test-seed-123')
    expect(a.map(cardToString)).toEqual(b.map(cardToString))
  })

  it('different seeds produce different orders', () => {
    const deck = createDeck()
    const a = shuffleDeck(deck, 'seed-alpha')
    const b = shuffleDeck(deck, 'seed-beta')
    // Very unlikely to be the same
    const aStr = a.map(cardToString).join(',')
    const bStr = b.map(cardToString).join(',')
    expect(aStr).not.toBe(bStr)
  })

  it('does not mutate original deck', () => {
    const deck = createDeck()
    const original = deck.map(cardToString)
    shuffleDeck(deck, 'some-seed')
    expect(deck.map(cardToString)).toEqual(original)
  })

  it('preserves all cards (no loss or duplication)', () => {
    const deck = createDeck()
    const shuffled = shuffleDeck(deck, 'preserve-test')
    const originalKeys = deck.map((c) => `${c.rank}_${c.suit}`).sort()
    const shuffledKeys = shuffled.map((c) => `${c.rank}_${c.suit}`).sort()
    expect(shuffledKeys).toEqual(originalKeys)
  })
})

describe('generateShuffleOrder', () => {
  it('returns array of correct length', () => {
    expect(generateShuffleOrder(52, 'seed')).toHaveLength(52)
  })

  it('contains every index exactly once (valid permutation)', () => {
    const order = generateShuffleOrder(10, 'perm-test')
    expect(order.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('same seed is deterministic', () => {
    const a = generateShuffleOrder(52, 'det-seed')
    const b = generateShuffleOrder(52, 'det-seed')
    expect(a).toEqual(b)
  })

  it('different seeds produce different orders', () => {
    const a = generateShuffleOrder(52, 'order-a')
    const b = generateShuffleOrder(52, 'order-b')
    expect(a).not.toEqual(b)
  })
})

describe('getCardValue', () => {
  it('Ace returns [1, 11]', () => {
    expect(getCardValue(card('A'))).toEqual([1, 11])
  })

  it('King returns [10]', () => {
    expect(getCardValue(card('K'))).toEqual([10])
  })

  it('Queen returns [10]', () => {
    expect(getCardValue(card('Q'))).toEqual([10])
  })

  it('Jack returns [10]', () => {
    expect(getCardValue(card('J'))).toEqual([10])
  })

  it('10 returns [10]', () => {
    expect(getCardValue(card('10'))).toEqual([10])
  })

  it('7 returns [7]', () => {
    expect(getCardValue(card('7'))).toEqual([7])
  })

  it('2 returns [2]', () => {
    expect(getCardValue(card('2'))).toEqual([2])
  })
})

describe('calculateHandValue', () => {
  it('two number cards sum correctly', () => {
    expect(calculateHandValue([card('5'), card('7')])).toBe(12)
  })

  it('face card + number card', () => {
    expect(calculateHandValue([card('K'), card('5')])).toBe(15)
  })

  it('single Ace = 11', () => {
    expect(calculateHandValue([card('A')])).toBe(11)
  })

  it('Ace + face = 21 (blackjack)', () => {
    expect(calculateHandValue([card('A'), card('K')])).toBe(21)
  })

  it('Ace + Ace = 12 (one as 11, one as 1)', () => {
    expect(calculateHandValue([card('A'), card('A')])).toBe(12)
  })

  it('Ace + 5 = 16 (soft)', () => {
    expect(calculateHandValue([card('A'), card('5')])).toBe(16)
  })

  it('Ace + 5 + 10 = 16 (ace demoted to 1)', () => {
    expect(calculateHandValue([card('A'), card('5'), card('10')])).toBe(16)
  })

  it('three Aces = 13 (11 + 1 + 1)', () => {
    expect(calculateHandValue([card('A'), card('A'), card('A')])).toBe(13)
  })

  it('Ace + 9 + Ace = 21', () => {
    expect(calculateHandValue([card('A'), card('9'), card('A')])).toBe(21)
  })

  it('bust: 10 + 10 + 5 = 25', () => {
    expect(calculateHandValue([card('10'), card('10'), card('5')])).toBe(25)
  })

  it('empty hand = 0', () => {
    expect(calculateHandValue([])).toBe(0)
  })
})

describe('isSoftHand', () => {
  it('Ace + 6 is soft', () => {
    expect(isSoftHand([card('A'), card('6')])).toBe(true)
  })

  it('10 + 7 is not soft (no ace)', () => {
    expect(isSoftHand([card('10'), card('7')])).toBe(false)
  })

  it('Ace + 5 + 10 is not soft (ace forced to 1)', () => {
    expect(isSoftHand([card('A'), card('5'), card('10')])).toBe(false)
  })

  it('Ace + K is soft (ace as 11 = 21)', () => {
    expect(isSoftHand([card('A'), card('K')])).toBe(true)
  })
})

describe('isBlackjack', () => {
  it('Ace + King = true', () => {
    expect(isBlackjack([card('A'), card('K')])).toBe(true)
  })

  it('Ace + 10 = true', () => {
    expect(isBlackjack([card('A'), card('10')])).toBe(true)
  })

  it('10 + 5 + 6 = false (21 with 3 cards)', () => {
    expect(isBlackjack([card('10'), card('5'), card('6')])).toBe(false)
  })

  it('Ace + 5 = false (only 16)', () => {
    expect(isBlackjack([card('A'), card('5')])).toBe(false)
  })

  it('single card = false', () => {
    expect(isBlackjack([card('A')])).toBe(false)
  })
})

describe('isBusted', () => {
  it('10 + 10 + 5 = true (25)', () => {
    expect(isBusted([card('10'), card('10'), card('5')])).toBe(true)
  })

  it('10 + 10 = false (20)', () => {
    expect(isBusted([card('10'), card('10')])).toBe(false)
  })

  it('Ace + 10 + 10 = false (21, ace=1)', () => {
    expect(isBusted([card('A'), card('10'), card('10')])).toBe(false)
  })

  it('K + Q + 5 = true (25)', () => {
    expect(isBusted([card('K'), card('Q'), card('5')])).toBe(true)
  })
})

describe('canSplit', () => {
  it('two same rank = true', () => {
    expect(canSplit([card('8', 'hearts'), card('8', 'spades')])).toBe(true)
  })

  it('two different ranks = false', () => {
    expect(canSplit([card('8'), card('9')])).toBe(false)
  })

  it('three cards = false', () => {
    expect(canSplit([card('8'), card('8'), card('8')])).toBe(false)
  })

  it('single card = false', () => {
    expect(canSplit([card('8')])).toBe(false)
  })

  it('two face cards of different rank = false (K vs Q)', () => {
    expect(canSplit([card('K'), card('Q')])).toBe(false)
  })
})

describe('canDouble', () => {
  it('two cards = true', () => {
    expect(canDouble([card('5'), card('6')])).toBe(true)
  })

  it('three cards = false', () => {
    expect(canDouble([card('5'), card('6'), card('7')])).toBe(false)
  })

  it('single card = false', () => {
    expect(canDouble([card('5')])).toBe(false)
  })
})

describe('getCardColor', () => {
  it('hearts = red', () => {
    expect(getCardColor(card('A', 'hearts'))).toBe('red')
  })

  it('diamonds = red', () => {
    expect(getCardColor(card('A', 'diamonds'))).toBe('red')
  })

  it('clubs = black', () => {
    expect(getCardColor(card('A', 'clubs'))).toBe('black')
  })

  it('spades = black', () => {
    expect(getCardColor(card('A', 'spades'))).toBe('black')
  })
})

describe('getPerfectPairsOutcome', () => {
  it('same rank + same suit = perfect (25x)', () => {
    const result = getPerfectPairsOutcome([card('K', 'spades'), card('K', 'spades')])
    expect(result).toEqual({ outcome: 'perfect', multiplier: 25 })
  })

  it('same rank + same color + different suit = colored (12x)', () => {
    // hearts and diamonds are both red
    const result = getPerfectPairsOutcome([card('K', 'hearts'), card('K', 'diamonds')])
    expect(result).toEqual({ outcome: 'colored', multiplier: 12 })
  })

  it('same rank + different color = mixed (6x)', () => {
    // hearts (red) and spades (black)
    const result = getPerfectPairsOutcome([card('K', 'hearts'), card('K', 'spades')])
    expect(result).toEqual({ outcome: 'mixed', multiplier: 6 })
  })

  it('different rank = none (0x)', () => {
    const result = getPerfectPairsOutcome([card('K'), card('Q')])
    expect(result).toEqual({ outcome: 'none', multiplier: 0 })
  })

  it('less than 2 cards = none (0x)', () => {
    expect(getPerfectPairsOutcome([card('K')])).toEqual({ outcome: 'none', multiplier: 0 })
    expect(getPerfectPairsOutcome([])).toEqual({ outcome: 'none', multiplier: 0 })
  })
})

describe('cardToString', () => {
  it('formats Ace of spades', () => {
    expect(cardToString(card('A', 'spades'))).toBe('A♠')
  })

  it('formats 10 of hearts', () => {
    expect(cardToString(card('10', 'hearts'))).toBe('10♥')
  })

  it('formats King of diamonds', () => {
    expect(cardToString(card('K', 'diamonds'))).toBe('K♦')
  })

  it('formats 5 of clubs', () => {
    expect(cardToString(card('5', 'clubs'))).toBe('5♣')
  })
})

describe('handToString', () => {
  it('formats multiple cards separated by space', () => {
    const hand = [card('A', 'spades'), card('K', 'hearts')]
    expect(handToString(hand)).toBe('A♠ K♥')
  })

  it('empty hand returns empty string', () => {
    expect(handToString([])).toBe('')
  })
})
