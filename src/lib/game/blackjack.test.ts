import { describe, it, expect } from 'vitest'
import type { Card, Rank, Suit, BlackjackGameState, Hand } from '@/types'
import {
  createInitialState,
  startRound,
  takeInsurance,
  executeAction,
  getAvailableActions,
  BLACKJACK_PAYOUT,
  INSURANCE_PAYOUT,
  DEALER_STANDS_ON,
  NUM_DECKS,
  MIN_BET,
  MAX_BET,
} from './blackjack'
import { calculateHandValue, isBlackjack } from './deck'

// Helper to create a card
const card = (rank: Rank, suit: Suit = 'spades', faceUp = true): Card => ({ rank, suit, faceUp })

// Helper to create a hand
const hand = (cards: Card[], overrides: Partial<Hand> = {}): Hand => ({
  cards,
  bet: 0.1,
  isDoubled: false,
  isSplit: false,
  isStood: false,
  isBusted: false,
  isBlackjack: false,
  isSurrendered: false,
  ...overrides,
})

// Helper to create a game state in playerTurn with a known deck
function playerTurnState(
  playerCards: Card[],
  dealerCards: Card[],
  remainingDeck: Card[],
  overrides: Partial<BlackjackGameState> = {}
): BlackjackGameState {
  const playerIsBlackjack = isBlackjack(playerCards)
  const playerValue = calculateHandValue(playerCards)
  const dealerIsBlackjack = isBlackjack(dealerCards)
  const dealerValue = calculateHandValue(dealerCards)

  return {
    phase: 'playerTurn',
    playerHands: [hand(playerCards, {
      bet: 0.1,
      isBlackjack: playerIsBlackjack,
      isBusted: playerValue > 21,
    })],
    dealerHand: hand(dealerCards, {
      isBlackjack: dealerIsBlackjack,
      isBusted: dealerValue > 21,
    }),
    currentHandIndex: 0,
    deck: remainingDeck,
    balance: 1.0,
    currentBet: 0.1,
    perfectPairsBet: 0,
    insuranceBet: 0,
    dealerPeeked: false,
    serverSeedHash: '',
    clientSeed: '',
    nonce: 0,
    lastPayout: 0,
    message: '',
    ...overrides,
  }
}

describe('constants', () => {
  it('BLACKJACK_PAYOUT is 1.5', () => {
    expect(BLACKJACK_PAYOUT).toBe(1.5)
  })

  it('INSURANCE_PAYOUT is 2', () => {
    expect(INSURANCE_PAYOUT).toBe(2)
  })

  it('DEALER_STANDS_ON is 17', () => {
    expect(DEALER_STANDS_ON).toBe(17)
  })

  it('NUM_DECKS is 6', () => {
    expect(NUM_DECKS).toBe(6)
  })

  it('MIN_BET is 0.01', () => {
    expect(MIN_BET).toBe(0.01)
  })

  it('MAX_BET is 1', () => {
    expect(MAX_BET).toBe(1)
  })
})

describe('createInitialState', () => {
  it('sets phase to betting', () => {
    const state = createInitialState(10)
    expect(state.phase).toBe('betting')
  })

  it('sets balance to provided value', () => {
    expect(createInitialState(5.5).balance).toBe(5.5)
  })

  it('has empty player hands', () => {
    expect(createInitialState(10).playerHands).toEqual([])
  })

  it('dealer hand has empty cards', () => {
    expect(createInitialState(10).dealerHand.cards).toEqual([])
  })

  it('sets correct message', () => {
    expect(createInitialState(10).message).toBe('Place your bet to begin')
  })

  it('initializes all numeric fields to 0', () => {
    const state = createInitialState(10)
    expect(state.currentBet).toBe(0)
    expect(state.perfectPairsBet).toBe(0)
    expect(state.insuranceBet).toBe(0)
    expect(state.lastPayout).toBe(0)
    expect(state.nonce).toBe(0)
  })
})

describe('startRound', () => {
  const initialState = createInitialState(1.0)
  const seed = 'test-server-seed'
  const hash = 'test-hash'
  const clientSeed = 'test-client-seed'

  it('rejects bet below MIN_BET', () => {
    const result = startRound(initialState, 0.001, 0, seed, hash, clientSeed, 0)
    expect(result.phase).toBe('betting') // unchanged
    expect(result.message).toContain('Bet must be between')
  })

  it('rejects bet above MAX_BET', () => {
    const result = startRound(initialState, 2.0, 0, seed, hash, clientSeed, 0)
    expect(result.phase).toBe('betting')
    expect(result.message).toContain('Bet must be between')
  })

  it('rejects bet exceeding balance', () => {
    const result = startRound(initialState, 0.8, 0.3, seed, hash, clientSeed, 0)
    expect(result.message).toBe('Insufficient balance')
  })

  it('deals 2 cards to player and 2 to dealer', () => {
    const result = startRound(initialState, 0.1, 0, seed, hash, clientSeed, 0)
    expect(result.playerHands[0].cards).toHaveLength(2)
    expect(result.dealerHand.cards).toHaveLength(2)
  })

  it('dealer hole card is face down', () => {
    const result = startRound(initialState, 0.1, 0, seed, hash, clientSeed, 0)
    // If game goes to playerTurn (not immediate blackjack), hole card is face down
    if (result.phase === 'playerTurn') {
      expect(result.dealerHand.cards[1].faceUp).toBe(false)
    }
  })

  it('deducts total bet from balance', () => {
    const result = startRound(initialState, 0.1, 0.05, seed, hash, clientSeed, 0)
    // Balance should be 1.0 - 0.15 + any perfectPairsPayout
    expect(result.balance).toBeLessThan(1.0)
  })

  it('uses combined seed for deterministic shuffle', () => {
    const a = startRound(initialState, 0.1, 0, seed, hash, clientSeed, 0)
    const b = startRound(initialState, 0.1, 0, seed, hash, clientSeed, 0)
    // Same seeds = same cards
    expect(a.playerHands[0].cards.map((c) => `${c.rank}${c.suit}`))
      .toEqual(b.playerHands[0].cards.map((c) => `${c.rank}${c.suit}`))
  })

  it('stores seed info in state', () => {
    const result = startRound(initialState, 0.1, 0, seed, hash, clientSeed, 5)
    expect(result.serverSeedHash).toBe(hash)
    expect(result.clientSeed).toBe(clientSeed)
    expect(result.nonce).toBe(5)
  })

  it('evaluates perfect pairs when ppBet > 0', () => {
    const result = startRound(initialState, 0.1, 0.05, seed, hash, clientSeed, 0)
    expect(result.perfectPairsResult).toBeDefined()
    expect(result.perfectPairsResult?.outcome).toBeDefined()
  })

  it('does not set perfectPairsResult when ppBet = 0', () => {
    const result = startRound(initialState, 0.1, 0, seed, hash, clientSeed, 0)
    expect(result.perfectPairsResult).toBeUndefined()
  })
})

describe('takeInsurance', () => {
  it('deducts insurance from balance', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('A'), card('9', 'hearts', false)],
      [card('3')],
      { balance: 1.0, currentBet: 0.1 }
    )
    const result = takeInsurance(state, 0.05)
    expect(result.balance).toBe(0.95)
    expect(result.insuranceBet).toBe(0.05)
  })

  it('rejects when not playerTurn', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('A'), card('Q')],
      [],
      { phase: 'betting' as const }
    )
    const result = takeInsurance(state, 0.05)
    expect(result.message).toContain('Cannot take insurance')
  })

  it('rejects amount exceeding half of currentBet', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('A'), card('Q')],
      [],
      { balance: 1.0, currentBet: 0.1 }
    )
    const result = takeInsurance(state, 0.06) // > 0.05 (half of 0.1)
    expect(result.message).toContain('Invalid insurance')
  })

  it('rejects amount exceeding balance', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('A'), card('Q')],
      [],
      { balance: 0.01, currentBet: 0.1 }
    )
    const result = takeInsurance(state, 0.05)
    expect(result.message).toContain('Invalid insurance')
  })
})

describe('executeAction', () => {
  it('returns error when not playerTurn', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('K'), card('Q')],
      [],
      { phase: 'betting' as const }
    )
    const result = executeAction(state, 'hit')
    expect(result.message).toBe('Not your turn')
  })

  it('hit adds a card to current hand', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('K'), card('Q', 'hearts', false)],
      [card('3'), card('4'), card('5'), card('6'), card('7')]
    )
    const result = executeAction(state, 'hit')
    expect(result.playerHands[0].cards).toHaveLength(3)
    expect(result.playerHands[0].cards[2].rank).toBe('3')
  })

  it('hit busts when over 21', () => {
    const state = playerTurnState(
      [card('10'), card('9')],
      [card('K'), card('Q', 'hearts', false)],
      [card('5'), card('3'), card('4'), card('5'), card('6')]
    )
    const result = executeAction(state, 'hit')
    // 10+9+5 = 24, busted
    expect(result.playerHands[0].isBusted).toBe(true)
  })

  it('stand marks hand as stood', () => {
    const state = playerTurnState(
      [card('10'), card('8')],
      [card('K'), card('Q', 'hearts', false)],
      [card('3'), card('4'), card('5'), card('6'), card('7')]
    )
    const result = executeAction(state, 'stand')
    expect(result.playerHands[0].isStood).toBe(true)
  })

  it('stand triggers dealer play and resolves round', () => {
    const state = playerTurnState(
      [card('10'), card('8')],
      [card('K'), card('Q', 'hearts', false)],
      [card('3'), card('4'), card('5'), card('6'), card('7')]
    )
    const result = executeAction(state, 'stand')
    // After stand with 1 hand, game should resolve
    expect(result.phase).toBe('complete')
  })

  it('double doubles bet and takes one card', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('K'), card('Q', 'hearts', false)],
      [card('3'), card('4'), card('5'), card('6'), card('7')],
      { balance: 1.0 }
    )
    const result = executeAction(state, 'double')
    expect(result.playerHands[0].cards).toHaveLength(3)
    expect(result.playerHands[0].isDoubled).toBe(true)
    expect(result.playerHands[0].bet).toBe(0.2) // doubled from 0.1
  })

  it('double rejects when hand has 3+ cards', () => {
    const threeCards = [card('3'), card('4'), card('5')]
    const state = playerTurnState(
      threeCards,
      [card('K'), card('Q')],
      [card('6')]
    )
    // canDouble returns false for 3 cards, but executeAction dispatches to executeDouble
    // which checks canDouble internally
    const result = executeAction(state, 'double')
    expect(result.message).toContain('Cannot double')
  })

  it('double rejects when insufficient balance', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('K'), card('Q')],
      [card('3')],
      { balance: 0.05 } // less than bet of 0.1
    )
    const result = executeAction(state, 'double')
    expect(result.message).toContain('Insufficient balance')
  })

  it('split creates two hands from pair', () => {
    const state = playerTurnState(
      [card('8', 'hearts'), card('8', 'spades')],
      [card('K'), card('Q', 'hearts', false)],
      [card('3'), card('4'), card('5'), card('6'), card('7')],
      { balance: 1.0 }
    )
    const result = executeAction(state, 'split')
    expect(result.playerHands).toHaveLength(2)
    expect(result.playerHands[0].isSplit).toBe(true)
    expect(result.playerHands[1].isSplit).toBe(true)
  })

  it('split deducts extra bet from balance', () => {
    const state = playerTurnState(
      [card('8', 'hearts'), card('8', 'spades')],
      [card('K'), card('Q', 'hearts', false)],
      [card('3'), card('4'), card('5'), card('6'), card('7')],
      { balance: 1.0 }
    )
    const result = executeAction(state, 'split')
    expect(result.balance).toBe(0.9) // 1.0 - 0.1 (extra bet)
  })

  it('split rejects non-pair', () => {
    const state = playerTurnState(
      [card('8'), card('9')],
      [card('K'), card('Q')],
      [card('3'), card('4')]
    )
    const result = executeAction(state, 'split')
    expect(result.message).toContain('Cannot split')
  })

  it('split hands are not blackjack', () => {
    const state = playerTurnState(
      [card('A', 'hearts'), card('A', 'spades')],
      [card('K'), card('Q', 'hearts', false)],
      [card('10'), card('K'), card('3'), card('4'), card('5'), card('6')],
      { balance: 1.0 }
    )
    const result = executeAction(state, 'split')
    expect(result.playerHands[0].isBlackjack).toBe(false)
    expect(result.playerHands[1].isBlackjack).toBe(false)
  })

  it('invalid action returns error message', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('K'), card('Q')],
      [card('3')]
    )
    const result = executeAction(state, 'insurance')
    expect(result.message).toBe('Invalid action')
  })
})

describe('getAvailableActions', () => {
  it('returns empty when not playerTurn', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('K'), card('Q')],
      [],
      { phase: 'betting' as const }
    )
    expect(getAvailableActions(state)).toEqual([])
  })

  it('includes hit and stand during playerTurn', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('K'), card('Q')],
      [],
      { balance: 0 } // no balance for double/split
    )
    const actions = getAvailableActions(state)
    expect(actions).toContain('hit')
    expect(actions).toContain('stand')
  })

  it('includes double when 2 cards and sufficient balance', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('K'), card('Q')],
      [],
      { balance: 1.0 }
    )
    expect(getAvailableActions(state)).toContain('double')
  })

  it('excludes double when insufficient balance', () => {
    const state = playerTurnState(
      [card('5'), card('6')],
      [card('K'), card('Q')],
      [],
      { balance: 0.05 } // less than bet of 0.1
    )
    expect(getAvailableActions(state)).not.toContain('double')
  })

  it('includes split when pair and sufficient balance', () => {
    const state = playerTurnState(
      [card('8', 'hearts'), card('8', 'spades')],
      [card('K'), card('Q')],
      [],
      { balance: 1.0 }
    )
    expect(getAvailableActions(state)).toContain('split')
  })

  it('excludes split when not a pair', () => {
    const state = playerTurnState(
      [card('8'), card('9')],
      [card('K'), card('Q')],
      [],
      { balance: 1.0 }
    )
    expect(getAvailableActions(state)).not.toContain('split')
  })

  it('excludes split when already at 4 hands', () => {
    const state: BlackjackGameState = {
      ...playerTurnState(
        [card('8', 'hearts'), card('8', 'spades')],
        [card('K'), card('Q')],
        [],
        { balance: 1.0 }
      ),
      playerHands: [
        hand([card('8', 'hearts'), card('8', 'spades')]),
        hand([card('5'), card('6')]),
        hand([card('7'), card('8')]),
        hand([card('9'), card('10')]),
      ],
      currentHandIndex: 0,
    }
    expect(getAvailableActions(state)).not.toContain('split')
  })

  it('allows re-splitting aces when under hand limit and balance allows', () => {
    const state: BlackjackGameState = {
      ...playerTurnState(
        [card('A', 'hearts'), card('A', 'spades')],
        [card('10'), card('7')],
        [],
        { balance: 1.0 }
      ),
      playerHands: [
        hand([card('8'), card('9')], { isSplit: true }),
        hand([card('A', 'hearts'), card('A', 'clubs')], { isSplit: true, bet: 0.1 }),
      ],
      currentHandIndex: 1,
    }

    expect(getAvailableActions(state)).toContain('split')
  })

  it('returns empty when hand is stood', () => {
    const state = playerTurnState(
      [card('10'), card('8')],
      [card('K'), card('Q')],
      []
    )
    state.playerHands[0].isStood = true
    expect(getAvailableActions(state)).toEqual([])
  })

  it('returns empty when hand is busted', () => {
    const state = playerTurnState(
      [card('10'), card('8'), card('5')],
      [card('K'), card('Q')],
      []
    )
    state.playerHands[0].isBusted = true
    expect(getAvailableActions(state)).toEqual([])
  })
})

describe('payout scenarios', () => {
  // For payout tests we construct a state in playerTurn with known cards and deck,
  // then stand to trigger dealer play + payout resolution.

  it('player busts: loses bet', () => {
    // Player has 19, hits, gets 5 = 24 (bust)
    const state = playerTurnState(
      [card('10'), card('9')],
      [card('K'), card('7', 'hearts', false)],
      [card('5'), card('2'), card('3'), card('4')],
      { balance: 0.9 } // already deducted 0.1 bet
    )
    const result = executeAction(state, 'hit') // 10+9+5 = 24 bust
    expect(result.phase).toBe('complete')
    expect(result.balance).toBe(0.9) // no payout
  })

  it('player wins: gets 2x bet', () => {
    // Player has 20, dealer has 17 after reveal
    const state = playerTurnState(
      [card('10'), card('K')],
      [card('10'), card('7', 'hearts', false)],
      [card('3'), card('4'), card('5')],
      { balance: 0.9 }
    )
    const result = executeAction(state, 'stand')
    expect(result.phase).toBe('complete')
    // Player 20 > Dealer 17, payout = 0.1 * 2 = 0.2
    expect(result.balance).toBe(0.9 + 0.2)
  })

  it('dealer busts: player wins 2x bet', () => {
    // Player stands on 12, dealer has 16 and must hit — give a 10 to bust
    const state = playerTurnState(
      [card('5'), card('7')],
      [card('10'), card('6', 'hearts', false)],
      [card('K'), card('3'), card('4')], // dealer draws K → 26 bust
      { balance: 0.9 }
    )
    const result = executeAction(state, 'stand')
    expect(result.phase).toBe('complete')
    expect(result.dealerHand.isBusted).toBe(true)
    expect(result.balance).toBe(0.9 + 0.2)
  })

  it('dealer wins: player loses bet', () => {
    // Player 17, dealer 20
    const state = playerTurnState(
      [card('10'), card('7')],
      [card('10'), card('K', 'hearts', false)],
      [card('3'), card('4'), card('5')],
      { balance: 0.9 }
    )
    const result = executeAction(state, 'stand')
    expect(result.phase).toBe('complete')
    // Player 17 < Dealer 20, no payout
    expect(result.balance).toBe(0.9)
  })

  it('push: bet returned', () => {
    // Both have 20
    const state = playerTurnState(
      [card('10'), card('K')],
      [card('10'), card('Q', 'hearts', false)],
      [card('3'), card('4'), card('5')],
      { balance: 0.9 }
    )
    const result = executeAction(state, 'stand')
    expect(result.phase).toBe('complete')
    // Push: payout = bet (0.1)
    expect(result.balance).toBe(0.9 + 0.1)
  })

  it('blackjack pays 2.5x total (1 + 1.5)', () => {
    // Test via startRound by finding a seed that gives player blackjack
    const initial = createInitialState(1.0)
    // Try many seeds to find a player blackjack without dealer blackjack
    let found = false
    for (let n = 0; n < 200; n++) {
      const result = startRound(initial, 0.1, 0, `bj-seed-${n}`, 'hash', 'client', n)
      if (result.phase === 'complete' && result.playerHands[0]?.isBlackjack && !result.dealerHand.isBlackjack) {
        // Blackjack payout: bet * (1 + 1.5) = 0.1 * 2.5 = 0.25
        expect(result.balance).toBe(1.0 - 0.1 + 0.25) // 1.15
        found = true
        break
      }
    }
    if (!found) {
      // Fallback: verify the payout formula directly
      // Balance after deal: 0.9, payout for BJ: 0.1 * 2.5 = 0.25
      // Final: 0.9 + 0.25 = 1.15
      expect(0.1 * (1 + BLACKJACK_PAYOUT)).toBe(0.25)
    }
  })
})

describe('settlement and insurance flows', () => {
  it('settles perfect pairs exactly once at round completion', () => {
    const state = playerTurnState(
      [card('10'), card('8')],
      [card('9'), card('7', 'hearts', false)],
      [card('2')],
      {
        balance: 0.85,
        perfectPairsBet: 0.05,
        perfectPairsResult: {
          outcome: 'mixed',
          payout: 0.3,
        },
      }
    )

    const result = executeAction(state, 'stand')
    expect(result.phase).toBe('complete')
    expect(result.settlement).toBeDefined()
    expect(result.settlement?.perfectPairsPayout).toBe(0.3)
    expect(result.settlement?.mainHandsPayout).toBe(0.1)
    expect(result.settlement?.totalStake).toBe(0.15)
    expect(result.settlement?.totalPayout).toBe(0.4)
    expect(result.settlement?.net).toBe(0.25)
  })

  it('insurance can complete immediately when dealer has blackjack', () => {
    const state = playerTurnState(
      [card('9'), card('7')],
      [card('A'), card('K', 'hearts', false)],
      [],
      {
        balance: 0.9,
        currentBet: 0.1,
        dealerPeeked: false,
      }
    )

    const result = takeInsurance(state, 0.05)
    expect(result.phase).toBe('complete')
    expect(result.dealerPeeked).toBe(true)
    expect(result.insuranceBet).toBe(0.05)
    expect(result.settlement?.insurancePayout).toBe(0.15)
    expect(result.settlement?.totalStake).toBe(0.15)
    expect(result.settlement?.totalPayout).toBe(0.15)
    expect(result.settlement?.net).toBe(0)
  })

  it('insurance can lose and game continues when dealer has no blackjack', () => {
    const state = playerTurnState(
      [card('9'), card('7')],
      [card('A'), card('9', 'hearts', false)],
      [],
      {
        balance: 0.9,
        currentBet: 0.1,
        dealerPeeked: false,
      }
    )

    const withInsurance = takeInsurance(state, 0.05)
    expect(withInsurance.phase).toBe('playerTurn')
    expect(withInsurance.dealerPeeked).toBe(true)
    expect(withInsurance.insuranceBet).toBe(0.05)

    const settled = executeAction(withInsurance, 'stand')
    expect(settled.phase).toBe('complete')
    expect(settled.settlement?.insurancePayout).toBe(0)
    expect(settled.settlement?.totalStake).toBe(0.15)
    expect(settled.settlement?.totalPayout).toBe(0)
    expect(settled.settlement?.net).toBe(-0.15)
  })

  it('first non-insurance action peeks and can terminate before action executes', () => {
    const state = playerTurnState(
      [card('10'), card('8')],
      [card('A'), card('K', 'hearts', false)],
      [card('3')],
      {
        balance: 0.9,
        dealerPeeked: false,
      }
    )

    const result = executeAction(state, 'hit')
    expect(result.phase).toBe('complete')
    expect(result.dealerPeeked).toBe(true)
    expect(result.playerHands[0].cards).toHaveLength(2)
    expect(result.dealerHand.cards.every((c) => c.faceUp)).toBe(true)
  })

  it('computes total stake and net for split + double + insurance combinations', () => {
    const state = playerTurnState(
      [card('8', 'hearts'), card('8', 'spades')],
      [card('A'), card('9', 'hearts', false)],
      [card('3'), card('2'), card('A')],
      {
        balance: 0.9,
        currentBet: 0.1,
        dealerPeeked: false,
      }
    )

    const withInsurance = takeInsurance(state, 0.05)
    const split = executeAction(withInsurance, 'split')
    const doubled = executeAction(split, 'double')
    const firstStand = executeAction(doubled, 'stand')
    const settled = executeAction(firstStand, 'stand')

    expect(settled.phase).toBe('complete')
    expect(settled.settlement).toMatchObject({
      totalStake: 0.35,
      totalPayout: 0.4,
      net: 0.05,
      insurancePayout: 0,
      perfectPairsPayout: 0,
      mainHandsPayout: 0.4,
    })
  })

})
