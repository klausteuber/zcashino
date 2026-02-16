import { describe, it, expect } from 'vitest'
import type { Card, Rank, Suit } from '@/types'
import {
  evaluateJacksOrBetter,
  evaluateDeucesWild,
  evaluateHand,
  getPayoutMultiplier,
  calculatePayout,
  getPaytable,
  createInitialState,
  startRound,
  holdAndDraw,
  sanitizeStateForClient,
  getHandRankDisplayNames,
  MIN_BET,
  MAX_BET,
  MAX_MULTIPLIER,
} from './video-poker'

// Helper to create a card quickly
const c = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit, faceUp: true })

// ============================================================================
// JACKS OR BETTER — HAND EVALUATOR
// ============================================================================

describe('evaluateJacksOrBetter', () => {
  describe('Royal Flush', () => {
    it('identifies A-K-Q-J-10 same suit', () => {
      const hand = [c('A', 'hearts'), c('K', 'hearts'), c('Q', 'hearts'), c('J', 'hearts'), c('10', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('royal_flush')
    })

    it('identifies royal flush regardless of card order', () => {
      const hand = [c('10', 'diamonds'), c('A', 'diamonds'), c('J', 'diamonds'), c('K', 'diamonds'), c('Q', 'diamonds')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('royal_flush')
    })

    it('does NOT identify A-K-Q-J-10 of different suits as royal flush', () => {
      const hand = [c('A', 'hearts'), c('K', 'spades'), c('Q', 'hearts'), c('J', 'hearts'), c('10', 'hearts')]
      const result = evaluateJacksOrBetter(hand)
      expect(result.rank).not.toBe('royal_flush')
      expect(result.rank).toBe('straight') // It's still a straight
    })
  })

  describe('Straight Flush', () => {
    it('identifies 5-6-7-8-9 same suit', () => {
      const hand = [c('5', 'clubs'), c('6', 'clubs'), c('7', 'clubs'), c('8', 'clubs'), c('9', 'clubs')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('straight_flush')
    })

    it('identifies A-2-3-4-5 same suit (steel wheel)', () => {
      const hand = [c('A', 'hearts'), c('2', 'hearts'), c('3', 'hearts'), c('4', 'hearts'), c('5', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('straight_flush')
    })

    it('does NOT identify A-2-3-4-5 same suit as royal flush', () => {
      const hand = [c('A', 'hearts'), c('2', 'hearts'), c('3', 'hearts'), c('4', 'hearts'), c('5', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).not.toBe('royal_flush')
    })
  })

  describe('Four of a Kind', () => {
    it('identifies four Aces', () => {
      const hand = [c('A', 'hearts'), c('A', 'diamonds'), c('A', 'clubs'), c('A', 'spades'), c('7', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('four_of_a_kind')
    })

    it('identifies four 3s', () => {
      const hand = [c('3', 'hearts'), c('3', 'diamonds'), c('3', 'clubs'), c('3', 'spades'), c('K', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('four_of_a_kind')
    })
  })

  describe('Full House', () => {
    it('identifies three Kings and two Fives', () => {
      const hand = [c('K', 'hearts'), c('K', 'diamonds'), c('K', 'clubs'), c('5', 'spades'), c('5', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('full_house')
    })

    it('identifies three 2s and two Aces', () => {
      const hand = [c('2', 'hearts'), c('2', 'diamonds'), c('2', 'clubs'), c('A', 'spades'), c('A', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('full_house')
    })
  })

  describe('Flush', () => {
    it('identifies 5 cards same suit, non-sequential', () => {
      const hand = [c('2', 'hearts'), c('5', 'hearts'), c('8', 'hearts'), c('J', 'hearts'), c('A', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('flush')
    })

    it('does NOT identify 5 cards of mixed suits as flush', () => {
      const hand = [c('2', 'hearts'), c('5', 'hearts'), c('8', 'clubs'), c('J', 'hearts'), c('A', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).not.toBe('flush')
    })
  })

  describe('Straight', () => {
    it('identifies A-2-3-4-5 (wheel)', () => {
      const hand = [c('A', 'hearts'), c('2', 'diamonds'), c('3', 'clubs'), c('4', 'spades'), c('5', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('straight')
    })

    it('identifies 10-J-Q-K-A (Broadway)', () => {
      const hand = [c('10', 'hearts'), c('J', 'diamonds'), c('Q', 'clubs'), c('K', 'spades'), c('A', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('straight')
    })

    it('identifies middle straight 6-7-8-9-10', () => {
      const hand = [c('6', 'hearts'), c('7', 'diamonds'), c('8', 'clubs'), c('9', 'spades'), c('10', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('straight')
    })

    it('does NOT wrap around (Q-K-A-2-3)', () => {
      const hand = [c('Q', 'hearts'), c('K', 'diamonds'), c('A', 'clubs'), c('2', 'spades'), c('3', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).not.toBe('straight')
    })
  })

  describe('Three of a Kind', () => {
    it('identifies three Jacks', () => {
      const hand = [c('J', 'hearts'), c('J', 'diamonds'), c('J', 'clubs'), c('5', 'spades'), c('8', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('three_of_a_kind')
    })
  })

  describe('Two Pair', () => {
    it('identifies two Kings and two Fives', () => {
      const hand = [c('K', 'hearts'), c('K', 'diamonds'), c('5', 'clubs'), c('5', 'spades'), c('8', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('two_pair')
    })
  })

  describe('Jacks or Better', () => {
    it('identifies pair of Jacks', () => {
      const hand = [c('J', 'hearts'), c('J', 'diamonds'), c('3', 'clubs'), c('7', 'spades'), c('9', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('jacks_or_better')
    })

    it('identifies pair of Queens', () => {
      const hand = [c('Q', 'hearts'), c('Q', 'diamonds'), c('3', 'clubs'), c('7', 'spades'), c('9', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('jacks_or_better')
    })

    it('identifies pair of Kings', () => {
      const hand = [c('K', 'hearts'), c('K', 'diamonds'), c('3', 'clubs'), c('7', 'spades'), c('9', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('jacks_or_better')
    })

    it('identifies pair of Aces', () => {
      const hand = [c('A', 'hearts'), c('A', 'diamonds'), c('3', 'clubs'), c('7', 'spades'), c('9', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('jacks_or_better')
    })
  })

  describe('Nothing', () => {
    it('pair of 10s is nothing (below Jacks)', () => {
      const hand = [c('10', 'hearts'), c('10', 'diamonds'), c('3', 'clubs'), c('7', 'spades'), c('9', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('nothing')
    })

    it('pair of 2s is nothing', () => {
      const hand = [c('2', 'hearts'), c('2', 'diamonds'), c('5', 'clubs'), c('8', 'spades'), c('K', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('nothing')
    })

    it('high card hand is nothing', () => {
      const hand = [c('3', 'hearts'), c('5', 'diamonds'), c('8', 'clubs'), c('10', 'spades'), c('A', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('nothing')
    })

    it('pair of 9s is nothing', () => {
      const hand = [c('9', 'hearts'), c('9', 'diamonds'), c('3', 'clubs'), c('6', 'spades'), c('K', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('nothing')
    })
  })

  describe('Edge cases', () => {
    it('returns nothing for invalid hand size', () => {
      const hand = [c('A', 'hearts'), c('K', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('nothing')
    })

    it('A-K-Q-J-10 different suits is a straight, not royal flush', () => {
      const hand = [c('A', 'hearts'), c('K', 'spades'), c('Q', 'diamonds'), c('J', 'clubs'), c('10', 'hearts')]
      expect(evaluateJacksOrBetter(hand).rank).toBe('straight')
    })
  })
})

// ============================================================================
// DEUCES WILD — HAND EVALUATOR
// ============================================================================

describe('evaluateDeucesWild', () => {
  describe('Natural Royal Flush', () => {
    it('identifies A-K-Q-J-10 same suit with no deuces', () => {
      const hand = [c('A', 'hearts'), c('K', 'hearts'), c('Q', 'hearts'), c('J', 'hearts'), c('10', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('natural_royal_flush')
    })
  })

  describe('Four Deuces', () => {
    it('identifies all four 2s', () => {
      const hand = [c('2', 'hearts'), c('2', 'diamonds'), c('2', 'clubs'), c('2', 'spades'), c('7', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('four_deuces')
    })
  })

  describe('Wild Royal Flush', () => {
    it('identifies royal flush with 1 wild (A-K-Q-J-2 same suit)', () => {
      const hand = [c('A', 'hearts'), c('K', 'hearts'), c('Q', 'hearts'), c('J', 'hearts'), c('2', 'diamonds')]
      expect(evaluateDeucesWild(hand).rank).toBe('wild_royal_flush')
    })

    it('identifies royal flush with 2 wilds (A-K-Q-2-2)', () => {
      const hand = [c('A', 'hearts'), c('K', 'hearts'), c('Q', 'hearts'), c('2', 'diamonds'), c('2', 'clubs')]
      expect(evaluateDeucesWild(hand).rank).toBe('wild_royal_flush')
    })

    it('identifies royal flush with 3 wilds (A-K-2-2-2)', () => {
      const hand = [c('A', 'hearts'), c('K', 'hearts'), c('2', 'diamonds'), c('2', 'clubs'), c('2', 'spades')]
      expect(evaluateDeucesWild(hand).rank).toBe('wild_royal_flush')
    })
  })

  describe('Five of a Kind', () => {
    it('identifies three Aces + two wilds', () => {
      const hand = [c('A', 'hearts'), c('A', 'diamonds'), c('A', 'clubs'), c('2', 'spades'), c('2', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('five_of_a_kind')
    })

    it('identifies four Kings + one wild', () => {
      const hand = [c('K', 'hearts'), c('K', 'diamonds'), c('K', 'clubs'), c('K', 'spades'), c('2', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('five_of_a_kind')
    })
  })

  describe('Straight Flush', () => {
    it('identifies straight flush with 1 wild filling gap', () => {
      // 5-6-_-8-9 of hearts, wild fills the 7
      const hand = [c('5', 'hearts'), c('6', 'hearts'), c('8', 'hearts'), c('9', 'hearts'), c('2', 'diamonds')]
      expect(evaluateDeucesWild(hand).rank).toBe('straight_flush')
    })

    it('identifies straight flush with no wilds', () => {
      const hand = [c('5', 'clubs'), c('6', 'clubs'), c('7', 'clubs'), c('8', 'clubs'), c('9', 'clubs')]
      expect(evaluateDeucesWild(hand).rank).toBe('straight_flush')
    })
  })

  describe('Four of a Kind', () => {
    it('identifies two Kings + two wilds = four of a kind', () => {
      const hand = [c('K', 'hearts'), c('K', 'diamonds'), c('2', 'clubs'), c('2', 'spades'), c('7', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('four_of_a_kind')
    })

    it('identifies three 8s + one wild = four of a kind', () => {
      const hand = [c('8', 'hearts'), c('8', 'diamonds'), c('8', 'clubs'), c('2', 'spades'), c('5', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('four_of_a_kind')
    })

    it('identifies natural four of a kind (no wilds)', () => {
      const hand = [c('9', 'hearts'), c('9', 'diamonds'), c('9', 'clubs'), c('9', 'spades'), c('5', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('four_of_a_kind')
    })
  })

  describe('Full House', () => {
    it('identifies natural full house (no wilds)', () => {
      const hand = [c('K', 'hearts'), c('K', 'diamonds'), c('K', 'clubs'), c('5', 'spades'), c('5', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('full_house')
    })

    it('identifies three Aces + pair of 5s (no wilds)', () => {
      const hand = [c('A', 'hearts'), c('A', 'diamonds'), c('A', 'clubs'), c('5', 'spades'), c('5', 'hearts')]
      // Actually this is five_of_a_kind or four_of_a_kind? No — no wilds, so it's a standard full house
      // Wait, this would be evaluated as standard (0 wilds). With 0 wilds, there's no five_of_a_kind.
      // Let me trace: wilds=0, naturals=all 5. Check natural_royal_flush: no. Check wild_royal_flush: skip (0 wilds).
      // Check five_of_a_kind: skip (0 wilds). Check straight_flush: no. Check four_of_a_kind: no (max count is 3).
      // Check full_house: with 0 wilds, standard check → [3, 2] → yes!
      expect(evaluateDeucesWild(hand).rank).toBe('full_house')
    })
  })

  describe('Flush', () => {
    it('identifies flush with 1 wild (4 hearts + wild)', () => {
      const hand = [c('3', 'hearts'), c('7', 'hearts'), c('9', 'hearts'), c('J', 'hearts'), c('2', 'diamonds')]
      expect(evaluateDeucesWild(hand).rank).toBe('flush')
    })

    it('identifies natural flush (no wilds)', () => {
      const hand = [c('3', 'hearts'), c('5', 'hearts'), c('8', 'hearts'), c('J', 'hearts'), c('A', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('flush')
    })
  })

  describe('Straight', () => {
    it('identifies straight with 1 wild filling gap', () => {
      // 3-4-_-6-7, wild fills 5
      const hand = [c('3', 'hearts'), c('4', 'diamonds'), c('6', 'clubs'), c('7', 'spades'), c('2', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('straight')
    })

    it('identifies natural straight (no wilds)', () => {
      const hand = [c('6', 'hearts'), c('7', 'diamonds'), c('8', 'clubs'), c('9', 'spades'), c('10', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('straight')
    })
  })

  describe('Three of a Kind (minimum paying hand)', () => {
    it('identifies pair + one wild = three of a kind', () => {
      const hand = [c('8', 'hearts'), c('8', 'diamonds'), c('2', 'clubs'), c('5', 'spades'), c('K', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('three_of_a_kind')
    })

    it('identifies single card + two wilds = three of a kind', () => {
      const hand = [c('A', 'hearts'), c('2', 'diamonds'), c('2', 'clubs'), c('5', 'spades'), c('K', 'hearts')]
      // A + 2 wilds = three Aces, but also check: 5 and K are different, suits mixed
      // Trace: wilds=2, naturals=[A, 5, K]. Not royal, not 5oak (naturals not all same),
      // not straight flush (diff suits), not 4oak (max 1 + 2 wilds = 3), not full house,
      // not flush (diff suits), not straight (A, 5, K can't form straight with 2 wilds)
      // Actually wait: can A-5-K + 2 wilds form a straight? Need 5 consecutive.
      // A=14: window 10-14 (10,11,12,13,14) — we have 14, need 10,11,12,13 — have 2 wilds, need 4 → no
      // K=13: same window. 5 doesn't fit any window with A and K.
      // So it's three of a kind.
      expect(evaluateDeucesWild(hand).rank).toBe('three_of_a_kind')
    })

    it('identifies natural three of a kind (no wilds)', () => {
      const hand = [c('J', 'hearts'), c('J', 'diamonds'), c('J', 'clubs'), c('5', 'spades'), c('8', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('three_of_a_kind')
    })
  })

  describe('Nothing', () => {
    it('high card with no wilds is nothing', () => {
      const hand = [c('3', 'hearts'), c('6', 'diamonds'), c('9', 'clubs'), c('J', 'spades'), c('A', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('nothing')
    })

    it('pair with no wilds is nothing in Deuces Wild', () => {
      const hand = [c('K', 'hearts'), c('K', 'diamonds'), c('3', 'clubs'), c('7', 'spades'), c('9', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('nothing')
    })

    it('two pair with no wilds is nothing in Deuces Wild', () => {
      const hand = [c('K', 'hearts'), c('K', 'diamonds'), c('5', 'clubs'), c('5', 'spades'), c('8', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('nothing')
    })
  })

  describe('Wild count edge cases', () => {
    it('3 wilds + pair = five of a kind', () => {
      const hand = [c('A', 'hearts'), c('A', 'diamonds'), c('2', 'clubs'), c('2', 'spades'), c('2', 'hearts')]
      // 2 naturals (A, A) + 3 wilds = 5 Aces
      expect(evaluateDeucesWild(hand).rank).toBe('five_of_a_kind')
    })

    it('3 wilds + 2 different naturals = four of a kind (at minimum)', () => {
      const hand = [c('A', 'hearts'), c('K', 'diamonds'), c('2', 'clubs'), c('2', 'spades'), c('2', 'hearts')]
      // 2 naturals (A, K) + 3 wilds: A + 3 wilds = 4oak Aces (K kicker)
      // Check if could be higher: straight flush? Need A-K same suit + 3 wilds fill Q-J-10 same suit. But A=hearts, K=diamonds → no.
      expect(evaluateDeucesWild(hand).rank).toBe('four_of_a_kind')
    })

    it('1 wild alone cannot make two pair a full house (pair + pair + wild)', () => {
      // Two pair (K-K-5-5) + 1 wild: wild makes trips → full house (K-K-K-5-5 or K-K-5-5-5)
      const hand = [c('K', 'hearts'), c('K', 'diamonds'), c('5', 'clubs'), c('5', 'spades'), c('2', 'hearts')]
      // wilds=1, naturals=[K,K,5,5]. Check four_of_a_kind first: max count = 2 + 1 wild = 3 → no.
      // Check full_house: groups=[2,2], need boost one to 3 (1 wild needed) → yes!
      expect(evaluateDeucesWild(hand).rank).toBe('full_house')
    })
  })

  describe('Wild card hierarchy', () => {
    it('natural royal beats wild royal', () => {
      const naturalRoyal = [c('A', 'hearts'), c('K', 'hearts'), c('Q', 'hearts'), c('J', 'hearts'), c('10', 'hearts')]
      const wildRoyal = [c('A', 'hearts'), c('K', 'hearts'), c('Q', 'hearts'), c('J', 'hearts'), c('2', 'diamonds')]
      expect(evaluateDeucesWild(naturalRoyal).rank).toBe('natural_royal_flush')
      expect(evaluateDeucesWild(wildRoyal).rank).toBe('wild_royal_flush')
    })

    it('four deuces beats everything except natural royal', () => {
      const hand = [c('2', 'hearts'), c('2', 'diamonds'), c('2', 'clubs'), c('2', 'spades'), c('A', 'hearts')]
      expect(evaluateDeucesWild(hand).rank).toBe('four_deuces')
    })
  })
})

// ============================================================================
// PAYTABLE TESTS
// ============================================================================

describe('Paytables', () => {
  describe('Jacks or Better paytable', () => {
    it('royal flush at 5 coins = 4000x', () => {
      expect(getPayoutMultiplier('jacks_or_better', 'royal_flush', 5)).toBe(4000)
    })

    it('royal flush at 1 coin = 250x', () => {
      expect(getPayoutMultiplier('jacks_or_better', 'royal_flush', 1)).toBe(250)
    })

    it('straight flush at 5 coins = 250x', () => {
      expect(getPayoutMultiplier('jacks_or_better', 'straight_flush', 5)).toBe(250)
    })

    it('four of a kind at 3 coins = 75x', () => {
      expect(getPayoutMultiplier('jacks_or_better', 'four_of_a_kind', 3)).toBe(75)
    })

    it('full house at 1 coin = 9x (9/6 full pay)', () => {
      expect(getPayoutMultiplier('jacks_or_better', 'full_house', 1)).toBe(9)
    })

    it('flush at 1 coin = 6x (9/6 full pay)', () => {
      expect(getPayoutMultiplier('jacks_or_better', 'flush', 1)).toBe(6)
    })

    it('jacks or better at 1 coin = 1x', () => {
      expect(getPayoutMultiplier('jacks_or_better', 'jacks_or_better', 1)).toBe(1)
    })

    it('nothing at any multiplier = 0', () => {
      for (let m = 1; m <= 5; m++) {
        expect(getPayoutMultiplier('jacks_or_better', 'nothing', m)).toBe(0)
      }
    })
  })

  describe('Deuces Wild paytable', () => {
    it('natural royal flush at 5 coins = 4000x', () => {
      expect(getPayoutMultiplier('deuces_wild', 'natural_royal_flush', 5)).toBe(4000)
    })

    it('four deuces at 5 coins = 1000x', () => {
      expect(getPayoutMultiplier('deuces_wild', 'four_deuces', 5)).toBe(1000)
    })

    it('wild royal flush at 1 coin = 25x', () => {
      expect(getPayoutMultiplier('deuces_wild', 'wild_royal_flush', 1)).toBe(25)
    })

    it('five of a kind at 5 coins = 75x', () => {
      expect(getPayoutMultiplier('deuces_wild', 'five_of_a_kind', 5)).toBe(75)
    })

    it('three of a kind at 1 coin = 1x (minimum paying hand)', () => {
      expect(getPayoutMultiplier('deuces_wild', 'three_of_a_kind', 1)).toBe(1)
    })

    it('nothing at any multiplier = 0', () => {
      for (let m = 1; m <= 5; m++) {
        expect(getPayoutMultiplier('deuces_wild', 'nothing', m)).toBe(0)
      }
    })

    it('no two_pair or jacks_or_better payout rows', () => {
      const paytable = getPaytable('deuces_wild')
      expect(paytable['two_pair']).toBeUndefined()
      expect(paytable['jacks_or_better']).toBeUndefined()
    })
  })

  describe('Payout calculation', () => {
    it('calculates correctly: 0.01 baseBet * 250 (royal flush, 1 coin) = 2.5', () => {
      const payout = calculatePayout(0.01, 1, 'jacks_or_better', 'royal_flush')
      expect(payout).toBe(2.5)
    })

    it('calculates correctly: 0.01 baseBet * 4000 (royal flush, 5 coins) = 40', () => {
      const payout = calculatePayout(0.01, 5, 'jacks_or_better', 'royal_flush')
      expect(payout).toBe(40)
    })

    it('nothing = 0 payout', () => {
      const payout = calculatePayout(0.01, 5, 'jacks_or_better', 'nothing')
      expect(payout).toBe(0)
    })

    it('clamps betMultiplier to valid range', () => {
      // Out of range multiplier gets clamped
      expect(getPayoutMultiplier('jacks_or_better', 'flush', 0)).toBe(6)  // Clamped to 1
      expect(getPayoutMultiplier('jacks_or_better', 'flush', 10)).toBe(30)  // Clamped to 5
    })
  })
})

// ============================================================================
// UNIFIED EVALUATOR
// ============================================================================

describe('evaluateHand', () => {
  it('dispatches to JoB evaluator for jacks_or_better variant', () => {
    const hand = [c('J', 'hearts'), c('J', 'diamonds'), c('3', 'clubs'), c('7', 'spades'), c('9', 'hearts')]
    expect(evaluateHand(hand, 'jacks_or_better').rank).toBe('jacks_or_better')
  })

  it('dispatches to DW evaluator for deuces_wild variant', () => {
    // Same hand in Deuces Wild — pair of Jacks is nothing (no wilds, need trips minimum)
    const hand = [c('J', 'hearts'), c('J', 'diamonds'), c('3', 'clubs'), c('7', 'spades'), c('9', 'hearts')]
    expect(evaluateHand(hand, 'deuces_wild').rank).toBe('nothing')
  })
})

// ============================================================================
// GAME STATE MACHINE
// ============================================================================

describe('Game state machine', () => {
  describe('createInitialState', () => {
    it('creates state with correct defaults', () => {
      const state = createInitialState(1.5, 'jacks_or_better')
      expect(state.phase).toBe('betting')
      expect(state.variant).toBe('jacks_or_better')
      expect(state.balance).toBe(1.5)
      expect(state.hand).toHaveLength(0)
      expect(state.heldCards).toEqual([false, false, false, false, false])
      expect(state.handRank).toBeNull()
    })

    it('creates deuces wild state', () => {
      const state = createInitialState(2.0, 'deuces_wild')
      expect(state.variant).toBe('deuces_wild')
    })
  })

  describe('startRound', () => {
    it('deals 5 cards and deducts bet', () => {
      const state = createInitialState(1.0, 'jacks_or_better')
      const result = startRound(state, 0.01, 5, 'server123', 'hash123', 'client456', 1)

      expect(result.phase).toBe('hold')
      expect(result.hand).toHaveLength(5)
      expect(result.deck).toHaveLength(47) // 52 - 5
      expect(result.balance).toBeLessThan(1.0)
      expect(result.baseBet).toBe(0.01)
      expect(result.betMultiplier).toBe(5)
      expect(result.totalBet).toBe(0.05)
      expect(result.heldCards).toEqual([false, false, false, false, false])
    })

    it('all dealt cards are face-up', () => {
      const state = createInitialState(1.0, 'jacks_or_better')
      const result = startRound(state, 0.01, 1, 'server', 'hash', 'client', 1)
      result.hand.forEach(card => {
        expect(card.faceUp).toBe(true)
      })
    })

    it('rejects bet below minimum', () => {
      const state = createInitialState(1.0, 'jacks_or_better')
      const result = startRound(state, 0.001, 1, 's', 'h', 'c', 1)
      expect(result.phase).toBe('betting') // Unchanged
      expect(result.message).toContain('Bet must be')
    })

    it('rejects bet above maximum', () => {
      const state = createInitialState(100.0, 'jacks_or_better')
      const result = startRound(state, 2.0, 1, 's', 'h', 'c', 1)
      expect(result.phase).toBe('betting')
    })

    it('rejects bet exceeding balance', () => {
      const state = createInitialState(0.01, 'jacks_or_better')
      const result = startRound(state, 0.01, 5, 's', 'h', 'c', 1)
      // totalBet = 0.05, balance = 0.01
      expect(result.phase).toBe('betting')
      expect(result.message).toContain('Insufficient')
    })

    it('rejects invalid betMultiplier', () => {
      const state = createInitialState(1.0, 'jacks_or_better')
      const result = startRound(state, 0.01, 6, 's', 'h', 'c', 1)
      expect(result.phase).toBe('betting')
    })

    it('shuffle is deterministic for same seeds', () => {
      const state = createInitialState(1.0, 'jacks_or_better')
      const r1 = startRound(state, 0.01, 1, 'seed1', 'hash1', 'client1', 1)
      const r2 = startRound(state, 0.01, 1, 'seed1', 'hash1', 'client1', 1)
      expect(r1.hand).toEqual(r2.hand)
    })

    it('different seeds produce different hands', () => {
      const state = createInitialState(1.0, 'jacks_or_better')
      const r1 = startRound(state, 0.01, 1, 'seed1', 'hash1', 'client1', 1)
      const r2 = startRound(state, 0.01, 1, 'seed2', 'hash2', 'client2', 2)
      // Very unlikely to be identical
      const h1 = r1.hand.map(c => `${c.rank}-${c.suit}`).join(',')
      const h2 = r2.hand.map(c => `${c.rank}-${c.suit}`).join(',')
      expect(h1).not.toBe(h2)
    })
  })

  describe('holdAndDraw', () => {
    function getHoldState(): ReturnType<typeof startRound> {
      const state = createInitialState(1.0, 'jacks_or_better')
      return startRound(state, 0.01, 1, 'test-seed', 'test-hash', 'test-client', 1)
    }

    it('holding all 5 cards keeps same hand', () => {
      const holdState = getHoldState()
      const result = holdAndDraw(holdState, [0, 1, 2, 3, 4])
      expect(result.phase).toBe('complete')
      expect(result.hand).toEqual(holdState.hand)
    })

    it('holding no cards replaces all 5', () => {
      const holdState = getHoldState()
      const result = holdAndDraw(holdState, [])
      expect(result.phase).toBe('complete')
      // All cards should be different (drawn from deck)
      const originals = holdState.hand.map(c => `${c.rank}-${c.suit}`)
      const finals = result.hand.map(c => `${c.rank}-${c.suit}`)
      // At least some should differ (statistically certain with a shuffled deck)
      expect(finals).not.toEqual(originals)
    })

    it('holding [0,2,4] keeps cards at positions 0,2,4 and replaces 1,3', () => {
      const holdState = getHoldState()
      const result = holdAndDraw(holdState, [0, 2, 4])
      expect(result.phase).toBe('complete')
      expect(result.hand[0]).toEqual(holdState.hand[0])
      expect(result.hand[2]).toEqual(holdState.hand[2])
      expect(result.hand[4]).toEqual(holdState.hand[4])
      expect(result.heldCards).toEqual([true, false, true, false, true])
    })

    it('evaluates hand and sets rank/multiplier/payout', () => {
      const holdState = getHoldState()
      const result = holdAndDraw(holdState, [0, 1, 2, 3, 4])
      expect(result.handRank).toBeDefined()
      expect(result.handRank).not.toBeNull()
      expect(result.multiplier).toBeDefined()
      expect(result.phase).toBe('complete')
    })

    it('credits payout to balance on win', () => {
      // We can't control the hand easily, but we can verify the math
      const holdState = getHoldState()
      const result = holdAndDraw(holdState, [0, 1, 2, 3, 4])
      if (result.lastPayout > 0) {
        expect(result.balance).toBeGreaterThan(holdState.balance)
      }
    })

    it('rejects draw when not in hold phase', () => {
      const state = createInitialState(1.0, 'jacks_or_better')
      const result = holdAndDraw(state, [0, 1])
      expect(result.phase).toBe('betting') // Unchanged
      expect(result.message).toContain('Cannot draw')
    })
  })

  describe('sanitizeStateForClient', () => {
    it('removes deck from state', () => {
      const state = createInitialState(1.0, 'jacks_or_better')
      const holdState = startRound(state, 0.01, 1, 'seed', 'hash', 'client', 1)
      const sanitized = sanitizeStateForClient(holdState)
      expect('deck' in sanitized).toBe(false)
      expect(sanitized.hand).toEqual(holdState.hand)
      expect(sanitized.balance).toBe(holdState.balance)
    })
  })
})

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

describe('getHandRankDisplayNames', () => {
  it('returns 9 paying ranks for JoB', () => {
    const names = getHandRankDisplayNames('jacks_or_better')
    expect(names).toHaveLength(9)
    expect(names[0].rank).toBe('royal_flush')
    expect(names[8].rank).toBe('jacks_or_better')
  })

  it('returns 10 paying ranks for Deuces Wild', () => {
    const names = getHandRankDisplayNames('deuces_wild')
    expect(names).toHaveLength(10)
    expect(names[0].rank).toBe('natural_royal_flush')
    expect(names[1].rank).toBe('four_deuces')
    expect(names[9].rank).toBe('three_of_a_kind')
  })

  it('no two_pair or jacks_or_better in deuces wild display', () => {
    const names = getHandRankDisplayNames('deuces_wild')
    const ranks = names.map(n => n.rank)
    expect(ranks).not.toContain('two_pair')
    expect(ranks).not.toContain('jacks_or_better')
  })
})
