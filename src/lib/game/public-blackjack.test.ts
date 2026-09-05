import { describe, expect, it } from 'vitest'
import { createInitialState, startRound } from './blackjack'
import { sanitizeGameState } from './public-blackjack'

describe('public blackjack information boundary', () => {
  it('removes hole card identities and hidden blackjack flags on every active deal', () => {
    let insuranceBlackjackChecked = false
    for (let nonce = 0; nonce < 500; nonce++) {
      const state = startRound(createInitialState(10), 0.1, 0, 'test-server', 'hash', 'test-client', nonce, 'hmac_sha256_v1')
      const response = JSON.parse(JSON.stringify(sanitizeGameState(state)))
      expect(response).not.toHaveProperty('deck')
      expect(response).not.toHaveProperty('serverSeed')
      if (state.dealerHand.cards.some(card => !card.faceUp)) {
        expect(response.dealerHand.cards[1]).toEqual({ faceUp: false })
        expect(response.dealerHand.isBlackjack).toBe(false)
        expect(response.dealerHand.isBusted).toBe(false)
        insuranceBlackjackChecked ||= state.dealerHand.isBlackjack
      } else {
        expect(response.dealerHand.cards).toEqual(state.dealerHand.cards)
      }
    }
    expect(insuranceBlackjackChecked).toBe(true)
  })
})
