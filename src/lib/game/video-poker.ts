import type {
  Card,
  Rank,
  VideoPokerVariant,
  VideoPokerGameState,
  VideoPokerHandRank,
  JacksOrBetterHandRank,
  DeucesWildHandRank,
} from '@/types'
import { createDeck, shuffleDeck, cardToString } from './deck'
import { roundZec } from '@/lib/wallet'

// Game constants
export const MIN_BET = 0.01    // 0.01 ZEC
export const MAX_BET = 1       // 1 ZEC
export const MAX_MULTIPLIER = 5 // 1-5 coins
export const HAND_SIZE = 5

// Rank numeric values for evaluation (2=2, ..., A=14)
const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

// ============================================================================
// PAYTABLES
// ============================================================================

// Jacks or Better 9/6 Full Pay (~0.46% house edge)
// Maps hand rank → [1-coin, 2-coin, 3-coin, 4-coin, 5-coin] multipliers
const JACKS_OR_BETTER_PAYTABLE: Record<JacksOrBetterHandRank, number[]> = {
  royal_flush:      [250, 500, 750, 1000, 4000],
  straight_flush:   [50, 100, 150, 200, 250],
  four_of_a_kind:   [25, 50, 75, 100, 125],
  full_house:       [9, 18, 27, 36, 45],
  flush:            [6, 12, 18, 24, 30],
  straight:         [4, 8, 12, 16, 20],
  three_of_a_kind:  [3, 6, 9, 12, 15],
  two_pair:         [2, 4, 6, 8, 10],
  jacks_or_better:  [1, 2, 3, 4, 5],
  nothing:          [0, 0, 0, 0, 0],
}

// Deuces Wild Full Pay (~0.76% house edge)
const DEUCES_WILD_PAYTABLE: Record<DeucesWildHandRank, number[]> = {
  natural_royal_flush: [250, 500, 750, 1000, 4000],
  four_deuces:         [200, 400, 600, 800, 1000],
  wild_royal_flush:    [25, 50, 75, 100, 125],
  five_of_a_kind:      [15, 30, 45, 60, 75],
  straight_flush:      [9, 18, 27, 36, 45],
  four_of_a_kind:      [5, 10, 15, 20, 25],
  full_house:          [3, 6, 9, 12, 15],
  flush:               [2, 4, 6, 8, 10],
  straight:            [2, 4, 6, 8, 10],
  three_of_a_kind:     [1, 2, 3, 4, 5],
  nothing:             [0, 0, 0, 0, 0],
}

export function getPaytable(variant: VideoPokerVariant): Record<string, number[]> {
  return variant === 'jacks_or_better' ? JACKS_OR_BETTER_PAYTABLE : DEUCES_WILD_PAYTABLE
}

export function getPayoutMultiplier(
  variant: VideoPokerVariant,
  rank: VideoPokerHandRank,
  betMultiplier: number
): number {
  const paytable = getPaytable(variant)
  const row = paytable[rank]
  if (!row) return 0
  const coinIndex = Math.min(Math.max(betMultiplier, 1), MAX_MULTIPLIER) - 1
  return row[coinIndex]
}

export function calculatePayout(
  baseBet: number,
  betMultiplier: number,
  variant: VideoPokerVariant,
  rank: VideoPokerHandRank
): number {
  const multiplier = getPayoutMultiplier(variant, rank, betMultiplier)
  return roundZec(baseBet * multiplier)
}

// ============================================================================
// HAND EVALUATION — JACKS OR BETTER
// ============================================================================

interface HandEvalResult {
  rank: VideoPokerHandRank
  description: string
}

export function evaluateJacksOrBetter(cards: Card[]): HandEvalResult {
  if (cards.length !== HAND_SIZE) {
    return { rank: 'nothing', description: 'Invalid hand' }
  }

  const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => a - b)
  const suits = cards.map(c => c.suit)

  const isFlush = suits.every(s => s === suits[0])
  const isStraight = checkStraight(values)

  // Rank counts: Map<value, count>
  const counts = new Map<number, number>()
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1)
  }
  const countValues = Array.from(counts.values()).sort((a, b) => b - a)

  // Royal Flush: A-K-Q-J-10 same suit
  if (isFlush && isStraight && values[0] === 10 && values[4] === 14) {
    return { rank: 'royal_flush', description: 'Royal Flush' }
  }

  // Straight Flush
  if (isFlush && isStraight) {
    return { rank: 'straight_flush', description: 'Straight Flush' }
  }

  // Four of a Kind
  if (countValues[0] === 4) {
    return { rank: 'four_of_a_kind', description: 'Four of a Kind' }
  }

  // Full House
  if (countValues[0] === 3 && countValues[1] === 2) {
    return { rank: 'full_house', description: 'Full House' }
  }

  // Flush
  if (isFlush) {
    return { rank: 'flush', description: 'Flush' }
  }

  // Straight
  if (isStraight) {
    return { rank: 'straight', description: 'Straight' }
  }

  // Three of a Kind
  if (countValues[0] === 3) {
    return { rank: 'three_of_a_kind', description: 'Three of a Kind' }
  }

  // Two Pair
  if (countValues[0] === 2 && countValues[1] === 2) {
    return { rank: 'two_pair', description: 'Two Pair' }
  }

  // Jacks or Better (pair of J, Q, K, or A)
  if (countValues[0] === 2) {
    for (const [value, count] of counts) {
      if (count === 2 && value >= 11) { // J=11, Q=12, K=13, A=14
        return { rank: 'jacks_or_better', description: 'Jacks or Better' }
      }
    }
  }

  return { rank: 'nothing', description: 'Nothing' }
}

// ============================================================================
// HAND EVALUATION — DEUCES WILD
// ============================================================================

export function evaluateDeucesWild(cards: Card[]): HandEvalResult {
  if (cards.length !== HAND_SIZE) {
    return { rank: 'nothing', description: 'Invalid hand' }
  }

  const wilds = cards.filter(c => c.rank === '2')
  const naturals = cards.filter(c => c.rank !== '2')
  const numWilds = wilds.length

  // Four Deuces — always top payout (except natural royal)
  if (numWilds === 4) {
    return { rank: 'four_deuces', description: 'Four Deuces' }
  }

  const naturalValues = naturals.map(c => RANK_VALUES[c.rank]).sort((a, b) => a - b)
  const naturalSuits = naturals.map(c => c.suit)

  // Natural Royal Flush (0 wilds, A-K-Q-J-10 same suit)
  if (numWilds === 0) {
    const allSameSuit = naturalSuits.every(s => s === naturalSuits[0])
    const isRoyal = naturalValues[0] === 10 && naturalValues[1] === 11 &&
      naturalValues[2] === 12 && naturalValues[3] === 13 && naturalValues[4] === 14
    if (allSameSuit && isRoyal) {
      return { rank: 'natural_royal_flush', description: 'Natural Royal Flush' }
    }
  }

  // Wild Royal Flush (with wilds, completes A-K-Q-J-10 same suit)
  if (numWilds > 0 && checkWildRoyalFlush(naturals, numWilds)) {
    return { rank: 'wild_royal_flush', description: 'Wild Royal Flush' }
  }

  // Five of a Kind (only possible with wilds)
  if (numWilds > 0 && checkFiveOfAKind(naturals, numWilds)) {
    return { rank: 'five_of_a_kind', description: 'Five of a Kind' }
  }

  // Straight Flush (with or without wilds)
  if (checkWildStraightFlush(naturals, numWilds)) {
    return { rank: 'straight_flush', description: 'Straight Flush' }
  }

  // Four of a Kind
  if (checkWildNOfAKind(naturals, numWilds, 4)) {
    return { rank: 'four_of_a_kind', description: 'Four of a Kind' }
  }

  // Full House
  if (checkWildFullHouse(naturals, numWilds)) {
    return { rank: 'full_house', description: 'Full House' }
  }

  // Flush
  if (checkWildFlush(naturals, numWilds)) {
    return { rank: 'flush', description: 'Flush' }
  }

  // Straight
  if (checkWildStraight(naturals, numWilds)) {
    return { rank: 'straight', description: 'Straight' }
  }

  // Three of a Kind (minimum paying hand in Deuces Wild)
  if (checkWildNOfAKind(naturals, numWilds, 3)) {
    return { rank: 'three_of_a_kind', description: 'Three of a Kind' }
  }

  return { rank: 'nothing', description: 'Nothing' }
}

// ============================================================================
// WILD CARD HELPERS
// ============================================================================

function checkStraight(sortedValues: number[]): boolean {
  // Standard straight: consecutive values
  const uniqueValues = [...new Set(sortedValues)]
  if (uniqueValues.length !== 5) return false

  if (uniqueValues[4] - uniqueValues[0] === 4) return true

  // Wheel: A-2-3-4-5 (A as low)
  if (uniqueValues[0] === 2 && uniqueValues[1] === 3 && uniqueValues[2] === 4 &&
    uniqueValues[3] === 5 && uniqueValues[4] === 14) {
    return true
  }

  return false
}

function checkWildRoyalFlush(naturals: Card[], numWilds: number): boolean {
  // All naturals must be same suit and in {10, J, Q, K, A}
  if (naturals.length === 0) return numWilds >= 5 // All wilds (impossible with 4 max, but safe)
  const suit = naturals[0].suit
  const royalRanks = new Set([10, 11, 12, 13, 14])

  for (const card of naturals) {
    if (card.suit !== suit) return false
    if (!royalRanks.has(RANK_VALUES[card.rank])) return false
  }

  // Check all naturals have unique values
  const naturalValues = naturals.map(c => RANK_VALUES[c.rank])
  if (new Set(naturalValues).size !== naturalValues.length) return false

  // Wilds fill remaining slots — always possible if above checks pass
  return true
}

function checkFiveOfAKind(naturals: Card[], numWilds: number): boolean {
  // All naturals must be the same rank
  if (naturals.length === 0) return true // All wilds
  const rank = naturals[0].rank
  if (!naturals.every(c => c.rank === rank)) return false
  // naturals.length + numWilds must be >= 5 (always true since total is 5)
  return true
}

function checkWildStraightFlush(naturals: Card[], numWilds: number): boolean {
  if (naturals.length === 0) return true // All wilds can make any straight flush

  // All naturals must be same suit
  const suit = naturals[0].suit
  if (!naturals.every(c => c.suit === suit)) return false

  const values = naturals.map(c => RANK_VALUES[c.rank]).sort((a, b) => a - b)

  // Check if naturals + wilds can form a 5-card straight
  return canFormStraight(values, numWilds)
}

function checkWildNOfAKind(naturals: Card[], numWilds: number, n: number): boolean {
  if (naturals.length === 0) return numWilds >= n

  // Count occurrences of each rank among naturals
  const counts = new Map<string, number>()
  for (const card of naturals) {
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1)
  }

  // Check if any rank + wilds reaches n
  for (const count of counts.values()) {
    if (count + numWilds >= n) return true
  }

  return false
}

function checkWildFullHouse(naturals: Card[], numWilds: number): boolean {
  if (numWilds === 0) {
    // Standard: need 3+2
    const counts = getRankCounts(naturals)
    const sorted = counts.sort((a, b) => b - a)
    return sorted[0] === 3 && sorted[1] === 2
  }

  // With wilds: need to form two groups that sum to 5 (one ≥3, one ≥2)
  // Count natural rank occurrences
  const rankMap = new Map<string, number>()
  for (const card of naturals) {
    rankMap.set(card.rank, (rankMap.get(card.rank) || 0) + 1)
  }
  const groups = Array.from(rankMap.values()).sort((a, b) => b - a)

  // Need at least 2 distinct ranks among naturals for a full house
  // OR 1 rank where wilds create the second group
  if (groups.length >= 2) {
    // Best case: boost largest group to 3, next to 2
    let wildsNeeded = Math.max(0, 3 - groups[0]) + Math.max(0, 2 - groups[1])
    if (wildsNeeded <= numWilds) return true
  }

  if (groups.length === 1) {
    // One natural rank. Wilds form the other group.
    // E.g., pair + 3 wilds → trip wilds + pair = full house? No, wilds must all be same rank.
    // Actually: wilds can be ANY rank. With 1 natural group:
    //   group=3, wilds=2 → wilds become pair of anything = full house ✓
    //   group=2, wilds=3 → one wild boosts pair to trips, two wilds become pair = full house ✓
    //   group=1, wilds=4 → impossible (max 4 wilds + 1 natural = 5, but 4 deuces already handled)
    //   group=2, wilds=2 → can we make full house? boost pair to trips (1 wild), need pair (1 wild alone can't be a pair) → NO
    //   Wait: FH needs 3+2 of DIFFERENT ranks. With 2 naturals same rank + 2 wilds:
    //     - make trips (1 wild) + need another pair. Only 1 wild left, can't form a pair alone. → NO
    //     So group=2, wilds=2 is NOT a full house. It's four_of_a_kind (pair + 2 wilds = 4 of same).
    if (groups[0] >= 3 && numWilds >= 2) return true
    if (groups[0] >= 2 && numWilds >= 3) return true
  }

  if (groups.length === 0) {
    // All wilds (already handled as four_deuces or five_of_a_kind)
    return numWilds >= 5
  }

  return false
}

function checkWildFlush(naturals: Card[], numWilds: number): boolean {
  if (naturals.length === 0) return true // All wilds
  // All naturals must be same suit (wilds match any suit)
  const suit = naturals[0].suit
  return naturals.every(c => c.suit === suit)
}

function checkWildStraight(naturals: Card[], numWilds: number): boolean {
  if (naturals.length === 0) return true // All wilds

  const values = naturals.map(c => RANK_VALUES[c.rank]).sort((a, b) => a - b)
  return canFormStraight(values, numWilds)
}

/**
 * Check if sorted natural values + N wilds can form a 5-card straight.
 * Tries all possible 5-card windows and checks if naturals fit + wilds fill gaps.
 * Also handles A-low (wheel) straights.
 */
function canFormStraight(sortedValues: number[], numWilds: number): boolean {
  // Unique values only (duplicate ranks can't both be in a straight)
  const uniqueValues = [...new Set(sortedValues)]

  // Try all possible 5-card straight windows: low card from 2 to 10 (for 2-6 through 10-A)
  for (let low = 2; low <= 10; low++) {
    const high = low + 4
    const needed = new Set<number>()
    for (let v = low; v <= high; v++) needed.add(v)

    // Remove values we have
    for (const v of uniqueValues) needed.delete(v)

    // Check no naturals are outside this window
    const allFit = uniqueValues.every(v => v >= low && v <= high)
    if (!allFit) continue

    if (needed.size <= numWilds) return true
  }

  // Check wheel: A-2-3-4-5 (A=14 counts as 1)
  const wheelValues = new Set([14, 3, 4, 5]) // 2s are wild in deuces wild, but this also handles JoB
  // For non-wild: we need A + subset of {3,4,5} with wilds filling rest
  // But 2 is wild in Deuces Wild, so 2 is never in naturals
  // However this function is also used for straight flush checks
  const wheelNeeded = new Set([14, 3, 4, 5])
  for (const v of uniqueValues) wheelNeeded.delete(v)
  const allFitWheel = uniqueValues.every(v => wheelValues.has(v))
  if (allFitWheel && wheelNeeded.size <= numWilds) return true

  // Also try full wheel with 2 included (for JoB where 2 is not wild)
  const fullWheelValues = new Set([14, 2, 3, 4, 5])
  const fullWheelNeeded = new Set([14, 2, 3, 4, 5])
  for (const v of uniqueValues) fullWheelNeeded.delete(v)
  const allFitFullWheel = uniqueValues.every(v => fullWheelValues.has(v))
  if (allFitFullWheel && fullWheelNeeded.size <= numWilds) return true

  return false
}

function getRankCounts(cards: Card[]): number[] {
  const counts = new Map<string, number>()
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1)
  }
  return Array.from(counts.values())
}

// ============================================================================
// UNIFIED EVALUATOR
// ============================================================================

export function evaluateHand(cards: Card[], variant: VideoPokerVariant): HandEvalResult {
  return variant === 'jacks_or_better'
    ? evaluateJacksOrBetter(cards)
    : evaluateDeucesWild(cards)
}

// ============================================================================
// GAME STATE MACHINE
// ============================================================================

export function createInitialState(balance: number, variant: VideoPokerVariant): VideoPokerGameState {
  return {
    phase: 'betting',
    variant,
    hand: [],
    heldCards: [false, false, false, false, false],
    deck: [],
    balance,
    baseBet: MIN_BET,
    betMultiplier: 5,
    totalBet: 0,
    serverSeedHash: '',
    clientSeed: '',
    nonce: 0,
    handRank: null,
    multiplier: null,
    lastPayout: 0,
    message: 'Place your bet and deal',
  }
}

export function startRound(
  state: VideoPokerGameState,
  baseBet: number,
  betMultiplier: number,
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number
): VideoPokerGameState {
  // Validate bet
  if (baseBet < MIN_BET || baseBet > MAX_BET) {
    return { ...state, message: `Bet must be between ${MIN_BET} and ${MAX_BET} ZEC` }
  }
  if (betMultiplier < 1 || betMultiplier > MAX_MULTIPLIER) {
    return { ...state, message: `Coin multiplier must be between 1 and ${MAX_MULTIPLIER}` }
  }

  const totalBet = roundZec(baseBet * betMultiplier)
  if (totalBet > state.balance) {
    return { ...state, message: 'Insufficient balance' }
  }

  // Create single 52-card deck and shuffle with combined seed
  const combinedSeed = `${serverSeed}:${clientSeed}:${nonce}`
  const deck = createDeck()
  const shuffledDeck = shuffleDeck(deck, combinedSeed)

  // Deal first 5 cards (all face-up to player)
  const hand = shuffledDeck.slice(0, HAND_SIZE).map(c => ({ ...c, faceUp: true }))
  const remainingDeck = shuffledDeck.slice(HAND_SIZE)

  return {
    ...state,
    phase: 'hold',
    hand,
    heldCards: [false, false, false, false, false],
    deck: remainingDeck,
    balance: roundZec(state.balance - totalBet),
    baseBet,
    betMultiplier,
    totalBet,
    serverSeedHash,
    clientSeed,
    nonce,
    handRank: null,
    multiplier: null,
    lastPayout: 0,
    message: 'Select cards to hold, then draw',
  }
}

export function holdAndDraw(
  state: VideoPokerGameState,
  heldIndices: number[]
): VideoPokerGameState {
  if (state.phase !== 'hold') {
    return { ...state, message: 'Cannot draw now' }
  }

  // Build held array from indices
  const heldCards: boolean[] = [false, false, false, false, false]
  for (const idx of heldIndices) {
    if (idx >= 0 && idx < HAND_SIZE) {
      heldCards[idx] = true
    }
  }

  // Replace non-held cards from deck
  const finalHand = [...state.hand]
  let deckIndex = 0
  for (let i = 0; i < HAND_SIZE; i++) {
    if (!heldCards[i]) {
      finalHand[i] = { ...state.deck[deckIndex], faceUp: true }
      deckIndex++
    }
  }

  // Evaluate final hand
  const evaluation = evaluateHand(finalHand, state.variant)
  const multiplier = getPayoutMultiplier(state.variant, evaluation.rank, state.betMultiplier)
  const payout = roundZec(state.baseBet * multiplier)

  const message = payout > 0
    ? `${evaluation.description}! You won ${payout.toFixed(4)} ZEC`
    : `${evaluation.description} — no win`

  return {
    ...state,
    phase: 'complete',
    hand: finalHand,
    heldCards,
    deck: state.deck.slice(deckIndex),
    balance: roundZec(state.balance + payout),
    handRank: evaluation.rank,
    multiplier,
    lastPayout: payout,
    message,
  }
}

/**
 * Strip server-only data from state before sending to client
 */
export function sanitizeStateForClient(state: VideoPokerGameState): Omit<VideoPokerGameState, 'deck'> {
  const { deck: _deck, ...clientState } = state
  return clientState
}

/**
 * Get hand rank display names for paytable
 */
export function getHandRankDisplayNames(variant: VideoPokerVariant): { rank: string; display: string }[] {
  if (variant === 'jacks_or_better') {
    return [
      { rank: 'royal_flush', display: 'Royal Flush' },
      { rank: 'straight_flush', display: 'Straight Flush' },
      { rank: 'four_of_a_kind', display: 'Four of a Kind' },
      { rank: 'full_house', display: 'Full House' },
      { rank: 'flush', display: 'Flush' },
      { rank: 'straight', display: 'Straight' },
      { rank: 'three_of_a_kind', display: 'Three of a Kind' },
      { rank: 'two_pair', display: 'Two Pair' },
      { rank: 'jacks_or_better', display: 'Jacks or Better' },
    ]
  }

  return [
    { rank: 'natural_royal_flush', display: 'Natural Royal Flush' },
    { rank: 'four_deuces', display: 'Four Deuces' },
    { rank: 'wild_royal_flush', display: 'Wild Royal Flush' },
    { rank: 'five_of_a_kind', display: 'Five of a Kind' },
    { rank: 'straight_flush', display: 'Straight Flush' },
    { rank: 'four_of_a_kind', display: 'Four of a Kind' },
    { rank: 'full_house', display: 'Full House' },
    { rank: 'flush', display: 'Flush' },
    { rank: 'straight', display: 'Straight' },
    { rank: 'three_of_a_kind', display: 'Three of a Kind' },
  ]
}
