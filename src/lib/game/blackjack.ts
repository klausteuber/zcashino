import type {
  BlackjackGameState,
  BlackjackGameRules,
  BlackjackAction,
  Hand,
  Card,
  GamePhase,
  PayoutResult,
  FairnessVersion,
  BlackjackSettlement,
} from '@/types'
import {
  createShoe,
  calculateHandValue,
  isBlackjack,
  canSplit,
  canDouble,
  getPerfectPairsOutcome
} from './deck'
import { roundZec } from '@/lib/wallet'
import { LEGACY_FAIRNESS_VERSION, shuffleDeck } from './shuffle'

// Game constants - Vegas Strip Rules
export const BLACKJACK_PAYOUT = 1.5  // 3:2 for blackjack
export const INSURANCE_PAYOUT = 2    // 2:1 for insurance
export const DEALER_STANDS_ON = 17   // Dealer stands on S17
export const NUM_DECKS = 6
export const MIN_BET = 0.01          // 0.01 ZEC
export const MAX_BET = 1             // 1 ZEC

/**
 * Create initial game state
 */
export function createInitialState(balance: number): BlackjackGameState {
  return {
    phase: 'betting',
    playerHands: [],
    dealerHand: {
      cards: [],
      bet: 0,
      isDoubled: false,
      isSplit: false,
      isStood: false,
      isBusted: false,
      isBlackjack: false,
      isSurrendered: false,
    },
    currentHandIndex: 0,
    deck: [],
    balance,
    currentBet: 0,
    perfectPairsBet: 0,
    insuranceBet: 0,
    dealerPeeked: false,
    serverSeedHash: '',
    clientSeed: '',
    nonce: 0,
    lastPayout: 0,
    message: 'Place your bet to begin'
  }
}

/**
 * Start a new round with bets placed
 */
export function startRound(
  state: BlackjackGameState,
  mainBet: number,
  perfectPairsBet: number,
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number,
  fairnessVersion: FairnessVersion = LEGACY_FAIRNESS_VERSION,
  betLimits?: { minBet?: number; maxBet?: number },
  gameRules?: BlackjackGameRules
): BlackjackGameState {
  const minBet = betLimits?.minBet ?? MIN_BET
  const maxBet = betLimits?.maxBet ?? MAX_BET
  const deckCount = gameRules?.deckCount ?? NUM_DECKS

  // Validate bets
  if (mainBet < minBet || mainBet > maxBet) {
    return {
      ...state,
      message: `Bet must be between ${minBet} and ${maxBet} ZEC`
    }
  }

  const totalBet = roundZec(mainBet + perfectPairsBet)
  if (totalBet > state.balance) {
    return {
      ...state,
      message: 'Insufficient balance'
    }
  }

  // Create and shuffle deck using combined seed
  const combinedSeed = `${serverSeed}:${clientSeed}:${nonce}`
  const shoe = createShoe(deckCount)
  const shuffledDeck = shuffleDeck(shoe, combinedSeed, fairnessVersion)

  // Deal initial cards
  const playerCards: Card[] = [shuffledDeck[0], shuffledDeck[2]]
  const dealerCards: Card[] = [
    { ...shuffledDeck[1], faceUp: true },
    { ...shuffledDeck[3], faceUp: false }  // Hole card face down
  ]

  const playerHand: Hand = {
    cards: playerCards,
    bet: mainBet,
    isDoubled: false,
    isSplit: false,
    isStood: false,
    isBusted: false,
    isBlackjack: isBlackjack(playerCards),
    isSurrendered: false,
  }

  const dealerHand: Hand = {
    cards: dealerCards,
    bet: 0,
    isDoubled: false,
    isSplit: false,
    isStood: false,
    isBusted: false,
    isBlackjack: isBlackjack(dealerCards),
    isSurrendered: false,
  }

  // Remove dealt cards from deck
  const remainingDeck = shuffledDeck.slice(4)

  // Calculate perfect pairs result immediately (settled at end of round)
  let perfectPairsResult: BlackjackGameState['perfectPairsResult'] = undefined
  if (perfectPairsBet > 0) {
    const ppResult = getPerfectPairsOutcome(playerCards)
    perfectPairsResult = {
      outcome: ppResult.outcome,
      payout: roundZec(perfectPairsBet * ppResult.multiplier)
    }
  }

  // Determine initial phase
  let phase: GamePhase = 'playerTurn'
  let message = 'Your turn - hit, stand, double, or split'

  const shouldOfferInsurance = dealerCards[0].rank === 'A' && !playerHand.isBlackjack

  // Check for immediate blackjack scenarios
  if (playerHand.isBlackjack && dealerHand.isBlackjack) {
    phase = 'payout'
    message = 'Both have Blackjack - Push!'
  } else if (dealerHand.isBlackjack && !shouldOfferInsurance) {
    // Dealer has blackjack, player doesn't - dealer wins immediately
    phase = 'payout'
    message = 'Dealer has Blackjack!'
  } else if (playerHand.isBlackjack) {
    phase = 'payout'
    message = 'Blackjack! You win 3:2'
  } else if (shouldOfferInsurance) {
    // Dealer showing Ace - offer insurance before revealing blackjack peek result
    message = 'Dealer showing Ace. Insurance?'
  }

  const newState: BlackjackGameState = {
    ...state,
    phase,
    playerHands: [playerHand],
    dealerHand,
    currentHandIndex: 0,
    deck: remainingDeck,
    balance: roundZec(state.balance - totalBet),
    currentBet: mainBet,
    perfectPairsBet,
    insuranceBet: 0,
    dealerPeeked: !shouldOfferInsurance,
    serverSeedHash,
    clientSeed,
    nonce,
    lastPayout: 0,
    message,
    perfectPairsResult,
    gameRules,
  }

  // If immediate blackjack, resolve the round to calculate payout
  if (phase === 'payout') {
    // Reveal dealer's hole card for display
    const revealedDealerHand: Hand = {
      ...dealerHand,
      cards: dealerHand.cards.map(c => ({ ...c, faceUp: true }))
    }
    return resolveRound({
      ...newState,
      dealerHand: revealedDealerHand
    })
  }

  return newState
}

/**
 * Player takes insurance bet
 */
export function takeInsurance(
  state: BlackjackGameState,
  amount: number
): BlackjackGameState {
  if (state.phase !== 'playerTurn') {
    return { ...state, message: 'Cannot take insurance now' }
  }

  if (state.dealerHand.cards[0]?.rank !== 'A' || state.dealerPeeked) {
    return { ...state, message: 'Insurance not available' }
  }

  const maxInsurance = state.currentBet / 2
  if (amount <= 0 || amount > maxInsurance || amount > state.balance) {
    return { ...state, message: 'Invalid insurance amount' }
  }

  const withInsurance: BlackjackGameState = {
    ...state,
    balance: roundZec(state.balance - amount),
    insuranceBet: amount,
    dealerPeeked: true,
    message: 'Insurance taken. Your turn.'
  }

  if (!state.dealerHand.isBlackjack) {
    return withInsurance
  }

  return resolveRound({
    ...withInsurance,
    phase: 'payout',
    dealerHand: {
      ...state.dealerHand,
      cards: state.dealerHand.cards.map(c => ({ ...c, faceUp: true }))
    },
    message: 'Dealer has Blackjack!'
  })
}

/**
 * Player declines insurance — triggers dealer blackjack peek
 */
export function declineInsurance(state: BlackjackGameState): BlackjackGameState {
  if (state.phase !== 'playerTurn') {
    return { ...state, message: 'Cannot decline insurance now' }
  }

  if (state.dealerHand.cards[0]?.rank !== 'A' || state.dealerPeeked) {
    return { ...state, message: 'No insurance to decline' }
  }

  // Peek for dealer blackjack
  if (!state.dealerHand.isBlackjack) {
    return {
      ...state,
      dealerPeeked: true,
      message: 'No Blackjack. Your turn.'
    }
  }

  // Dealer has blackjack — reveal and resolve
  return resolveRound({
    ...state,
    dealerPeeked: true,
    phase: 'payout',
    dealerHand: {
      ...state.dealerHand,
      cards: state.dealerHand.cards.map(c => ({ ...c, faceUp: true }))
    },
    message: 'Dealer has Blackjack!'
  })
}

/**
 * Execute player action
 */
export function executeAction(
  state: BlackjackGameState,
  action: BlackjackAction
): BlackjackGameState {
  if (state.phase !== 'playerTurn') {
    return { ...state, message: 'Not your turn' }
  }

  let currentState = state
  if (shouldPeekDealerForBlackjack(currentState)) {
    currentState = peekDealerForBlackjack(currentState)
    if (currentState.phase === 'complete') {
      return currentState
    }
  }

  const currentHand = currentState.playerHands[currentState.currentHandIndex]
  if (!currentHand || currentHand.isStood || currentHand.isBusted) {
    return advanceToNextHand(currentState)
  }

  switch (action) {
    case 'hit':
      return executeHit(currentState)
    case 'stand':
      return executeStand(currentState)
    case 'double':
      return executeDouble(currentState)
    case 'split':
      return executeSplit(currentState)
    case 'surrender':
      return executeSurrender(currentState)
    default:
      return { ...currentState, message: 'Invalid action' }
  }
}

function shouldPeekDealerForBlackjack(state: BlackjackGameState): boolean {
  return state.phase === 'playerTurn'
    && !state.dealerPeeked
    && state.dealerHand.cards[0]?.rank === 'A'
}

function peekDealerForBlackjack(state: BlackjackGameState): BlackjackGameState {
  if (!state.dealerHand.isBlackjack) {
    return {
      ...state,
      dealerPeeked: true,
      message: 'Dealer does not have Blackjack. Your turn.'
    }
  }

  return resolveRound({
    ...state,
    dealerPeeked: true,
    phase: 'payout',
    dealerHand: {
      ...state.dealerHand,
      cards: state.dealerHand.cards.map(c => ({ ...c, faceUp: true }))
    },
    message: 'Dealer has Blackjack!'
  })
}

/**
 * Player hits (takes another card)
 */
function executeHit(state: BlackjackGameState): BlackjackGameState {
  const currentHand = state.playerHands[state.currentHandIndex]
  const newCard = state.deck[0]
  const remainingDeck = state.deck.slice(1)

  const newCards = [...currentHand.cards, newCard]
  const handValue = calculateHandValue(newCards)
  const busted = handValue > 21
  const got21 = handValue === 21

  const updatedHand: Hand = {
    ...currentHand,
    cards: newCards,
    isBusted: busted,
    isStood: busted || got21  // Auto-stand if busted or 21
  }

  const updatedHands = [...state.playerHands]
  updatedHands[state.currentHandIndex] = updatedHand

  let newState: BlackjackGameState = {
    ...state,
    playerHands: updatedHands,
    deck: remainingDeck,
    message: busted
      ? `Bust! Hand value: ${handValue}`
      : got21
        ? `21! Standing automatically.`
        : `Hand value: ${handValue}. Hit or stand?`
  }

  // If busted or hit 21, move to next hand or dealer turn
  if (busted || got21) {
    newState = advanceToNextHand(newState)
  }

  return newState
}

/**
 * Player stands (keeps current hand)
 */
function executeStand(state: BlackjackGameState): BlackjackGameState {
  const updatedHands = [...state.playerHands]
  updatedHands[state.currentHandIndex] = {
    ...updatedHands[state.currentHandIndex],
    isStood: true
  }

  return advanceToNextHand({
    ...state,
    playerHands: updatedHands
  })
}

/**
 * Player doubles down
 */
function executeDouble(state: BlackjackGameState): BlackjackGameState {
  const currentHand = state.playerHands[state.currentHandIndex]

  if (!canDouble(currentHand.cards)) {
    return { ...state, message: 'Cannot double on this hand' }
  }

  if (currentHand.bet > state.balance) {
    return { ...state, message: 'Insufficient balance to double' }
  }

  // Take one more card
  const newCard = state.deck[0]
  const remainingDeck = state.deck.slice(1)
  const newCards = [...currentHand.cards, newCard]
  const handValue = calculateHandValue(newCards)
  const busted = handValue > 21

  const updatedHand: Hand = {
    ...currentHand,
    cards: newCards,
    bet: currentHand.bet * 2,
    isDoubled: true,
    isBusted: busted,
    isStood: true  // Auto-stand after double
  }

  const updatedHands = [...state.playerHands]
  updatedHands[state.currentHandIndex] = updatedHand

  return advanceToNextHand({
    ...state,
    playerHands: updatedHands,
    deck: remainingDeck,
    balance: state.balance - currentHand.bet,
    message: busted
      ? `Doubled and busted with ${handValue}`
      : `Doubled down. Hand value: ${handValue}`
  })
}

/**
 * Player splits pair
 */
function executeSplit(state: BlackjackGameState): BlackjackGameState {
  const currentHand = state.playerHands[state.currentHandIndex]

  if (!canSplit(currentHand.cards)) {
    return { ...state, message: 'Cannot split - need a pair' }
  }

  if (currentHand.bet > state.balance) {
    return { ...state, message: 'Insufficient balance to split' }
  }

  // Deal one card to each split hand
  const card1 = state.deck[0]
  const card2 = state.deck[1]
  const remainingDeck = state.deck.slice(2)

  const hand1: Hand = {
    cards: [currentHand.cards[0], card1],
    bet: currentHand.bet,
    isDoubled: false,
    isSplit: true,
    isStood: false,
    isBusted: false,
    isBlackjack: false,  // Split hands can't be blackjack
    isSurrendered: false,
  }

  const hand2: Hand = {
    cards: [currentHand.cards[1], card2],
    bet: currentHand.bet,
    isDoubled: false,
    isSplit: true,
    isStood: false,
    isBusted: false,
    isBlackjack: false,
    isSurrendered: false,
  }

  // Replace current hand with two split hands
  const updatedHands = [...state.playerHands]
  updatedHands.splice(state.currentHandIndex, 1, hand1, hand2)

  // Start from rightmost hand (play right-to-left, standard casino order)
  const lastHandIndex = updatedHands.length - 1

  return {
    ...state,
    playerHands: updatedHands,
    currentHandIndex: lastHandIndex,
    deck: remainingDeck,
    balance: state.balance - currentHand.bet,
    message: `Split! Playing hand ${lastHandIndex + 1} of ${updatedHands.length}`
  }
}

/**
 * Late surrender: returns 50% of bet. Only available on initial two cards,
 * unsplit hand, not doubled. Gated by gameRules.allowSurrender in getAvailableActions().
 */
function executeSurrender(state: BlackjackGameState): BlackjackGameState {
  const currentHand = state.playerHands[state.currentHandIndex]

  const canSurrender = state.playerHands.length === 1
    && !currentHand.isSplit
    && !currentHand.isDoubled
    && currentHand.cards.length === 2

  if (!canSurrender) {
    return { ...state, message: 'Cannot surrender on this hand' }
  }

  const updatedHands = [...state.playerHands]
  updatedHands[state.currentHandIndex] = {
    ...currentHand,
    isSurrendered: true,
    isStood: true,
  }

  return resolveRound({
    ...state,
    phase: 'payout',
    dealerPeeked: true,
    playerHands: updatedHands,
    dealerHand: {
      ...state.dealerHand,
      cards: state.dealerHand.cards.map(c => ({ ...c, faceUp: true })),
    },
    message: 'Player surrendered',
  })
}

/**
 * Move to next hand or dealer turn
 * After split, hands are played right-to-left (decrementing index)
 */
function advanceToNextHand(state: BlackjackGameState): BlackjackGameState {
  // Search for next unplayed hand moving right-to-left
  for (let i = state.currentHandIndex - 1; i >= 0; i--) {
    const nextHand = state.playerHands[i]
    if (!nextHand.isStood && !nextHand.isBusted) {
      return {
        ...state,
        currentHandIndex: i,
        message: `Playing hand ${i + 1} of ${state.playerHands.length}`
      }
    }
  }

  // All player hands complete - move to dealer turn
  return playDealerHand(state)
}

/**
 * Play out dealer's hand according to rules
 */
function playDealerHand(state: BlackjackGameState): BlackjackGameState {
  // Check if all player hands busted
  const allBusted = state.playerHands.every(h => h.isBusted)
  if (allBusted) {
    return resolveRound({
      ...state,
      phase: 'payout',
      dealerPeeked: true,
      dealerHand: {
        ...state.dealerHand,
        cards: state.dealerHand.cards.map(c => ({ ...c, faceUp: true }))
      }
    })
  }

  // Reveal dealer's hole card
  let dealerCards = state.dealerHand.cards.map(c => ({ ...c, faceUp: true }))
  let deck = [...state.deck]

  // Dealer hits until stand threshold or higher
  const dealerStandsOn = state.gameRules?.dealerStandsOn ?? DEALER_STANDS_ON
  while (calculateHandValue(dealerCards) < dealerStandsOn) {
    dealerCards = [...dealerCards, deck[0]]
    deck = deck.slice(1)
  }

  const dealerValue = calculateHandValue(dealerCards)
  const dealerBusted = dealerValue > 21

  const updatedDealerHand: Hand = {
    ...state.dealerHand,
    cards: dealerCards,
    isStood: true,
    isBusted: dealerBusted,
    isBlackjack: isBlackjack(state.dealerHand.cards)
  }

  return resolveRound({
    ...state,
    phase: 'payout',
    dealerPeeked: true,
    dealerHand: updatedDealerHand,
    deck
  })
}

/**
 * Resolve round and calculate payouts
 */
function resolveRound(state: BlackjackGameState): BlackjackGameState {
  const blackjackPayout = state.gameRules?.blackjackPayout ?? BLACKJACK_PAYOUT
  const dealerValue = calculateHandValue(state.dealerHand.cards)
  const dealerBlackjack = state.dealerHand.isBlackjack
  const dealerBusted = state.dealerHand.isBusted

  const perfectPairsPayout = roundZec(state.perfectPairsResult?.payout ?? 0)
  let mainHandsPayout = 0
  let insurancePayout = 0
  const results: PayoutResult[] = []

  // Process insurance bet
  if (state.insuranceBet > 0 && dealerBlackjack) {
    insurancePayout = roundZec(state.insuranceBet * (1 + INSURANCE_PAYOUT))
  }

  // Process each player hand
  for (let i = 0; i < state.playerHands.length; i++) {
    const hand = state.playerHands[i]
    const playerValue = calculateHandValue(hand.cards)

    let outcome: PayoutResult['outcome']
    let payout = 0
    let reason = ''

    if (hand.isSurrendered) {
      outcome = 'surrender'
      payout = roundZec(hand.bet / 2)
      reason = 'Surrender - half bet returned'
    } else if (hand.isBusted) {
      outcome = 'lose'
      reason = 'Player busted'
    } else if (hand.isBlackjack && !hand.isSplit) {
      if (dealerBlackjack) {
        outcome = 'push'
        payout = hand.bet
        reason = 'Both blackjack - push'
      } else {
        outcome = 'blackjack'
        payout = roundZec(hand.bet * (1 + blackjackPayout))
        reason = blackjackPayout === 1.5 ? 'Blackjack pays 3:2' : `Blackjack pays ${blackjackPayout}:1`
      }
    } else if (dealerBusted) {
      outcome = 'win'
      payout = roundZec(hand.bet * 2)
      reason = 'Dealer busted'
    } else if (playerValue > dealerValue) {
      outcome = 'win'
      payout = roundZec(hand.bet * 2)
      reason = `Player ${playerValue} beats dealer ${dealerValue}`
    } else if (playerValue < dealerValue) {
      outcome = 'lose'
      reason = `Dealer ${dealerValue} beats player ${playerValue}`
    } else {
      outcome = 'push'
      payout = hand.bet
      reason = 'Push - tie'
    }

    mainHandsPayout += payout
    results.push({
      handIndex: i,
      outcome,
      payout,
      reason
    })
  }

  const totalPayout = roundZec(mainHandsPayout + insurancePayout + perfectPairsPayout)
  const totalStake = roundZec(
    state.playerHands.reduce((sum, hand) => sum + hand.bet, 0)
    + state.insuranceBet
    + state.perfectPairsBet
  )
  const settlement: BlackjackSettlement = {
    totalStake,
    totalPayout,
    net: roundZec(totalPayout - totalStake),
    mainHandsPayout: roundZec(mainHandsPayout),
    insurancePayout,
    perfectPairsPayout
  }

  // Build result message
  // Note: `totalPayout` includes returning stake (e.g. push), so use `settlement.net`
  // when deciding whether the player actually won.
  const allSurrendered = results.length > 0
    && results.every(r => r.outcome === 'surrender')
    && insurancePayout === 0
    && perfectPairsPayout === 0
  const onlyPushes = results.length > 0
    && results.every(r => r.outcome === 'push')
    && insurancePayout === 0
    && perfectPairsPayout === 0

  const message = allSurrendered
    ? 'Surrender - half bet returned'
    : onlyPushes || settlement.net === 0
      ? 'Push - bet returned'
      : settlement.net > 0
        ? `You won ${settlement.net.toFixed(4)} ZEC!`
        : 'Dealer wins'

  return {
    ...state,
    phase: 'complete',
    dealerPeeked: true,
    balance: roundZec(state.balance + totalPayout),
    lastPayout: roundZec(totalPayout),
    settlement,
    message,
  }
}

/**
 * Get available actions for current hand
 */
export function getAvailableActions(state: BlackjackGameState): BlackjackAction[] {
  if (state.phase !== 'playerTurn') {
    return []
  }

  const currentHand = state.playerHands[state.currentHandIndex]
  if (!currentHand || currentHand.isStood || currentHand.isBusted) {
    return []
  }

  const actions: BlackjackAction[] = ['hit', 'stand']

  if (canDouble(currentHand.cards) && currentHand.bet <= state.balance) {
    actions.push('double')
  }

  const isPairOfAces = currentHand.cards.length === 2
    && currentHand.cards[0].rank === 'A'
    && currentHand.cards[1].rank === 'A'
  const isResplitAcesAttempt = currentHand.isSplit && isPairOfAces

  if (
    canSplit(currentHand.cards)
    && currentHand.bet <= state.balance
    && state.playerHands.length < 4
    && !isResplitAcesAttempt
  ) {
    actions.push('split')
  }

  // Surrender: only on first two cards, unsplit hand, when enabled by game rules
  if (
    state.gameRules?.allowSurrender
    && currentHand.cards.length === 2
    && state.playerHands.length === 1
    && !currentHand.isSplit
    && !currentHand.isDoubled
  ) {
    actions.push('surrender')
  }

  return actions
}
