import type { BlackjackGameState, PublicBlackjackGameState } from '@/types'
import { getAvailableActions } from './blackjack'
import { roundZec } from '@/lib/wallet'

/** Only explicitly public information may cross the game API boundary. */
export function sanitizeGameState(state: BlackjackGameState): PublicBlackjackGameState {
  const concealed = state.dealerHand.cards.some(card => !card.faceUp)
  return {
    phase: state.phase,
    playerHands: state.playerHands,
    dealerHand: {
      ...state.dealerHand,
      cards: state.dealerHand.cards.map(card => card.faceUp
        ? { rank: card.rank, suit: card.suit, faceUp: true }
        : { faceUp: false }),
      // These flags must not reveal the hole card before the dealer's reveal.
      isBlackjack: concealed ? false : state.dealerHand.isBlackjack,
      isBusted: concealed ? false : state.dealerHand.isBusted,
    },
    currentHandIndex: state.currentHandIndex,
    balance: roundZec(state.balance),
    currentBet: state.currentBet,
    perfectPairsBet: state.perfectPairsBet,
    insuranceBet: state.insuranceBet,
    dealerPeeked: state.dealerPeeked,
    serverSeedHash: state.serverSeedHash,
    clientSeed: state.clientSeed,
    nonce: state.nonce,
    lastPayout: state.lastPayout,
    message: state.message,
    perfectPairsResult: state.perfectPairsResult,
    settlement: state.settlement,
    availableActions: getAvailableActions(state),
  }
}
