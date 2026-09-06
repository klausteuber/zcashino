import { TIME_BANK_MAX_MS, TIME_BANK_REFILL_HANDS, TIME_BANK_REFILL_MS, type PokerState } from './types'

export function creditDealtHand(s: PokerState, index: number) {
  const player = s.seats[index]!
  player.handsDealt++
  if (player.handsDealt % TIME_BANK_REFILL_HANDS === 0) player.timeBankMs = Math.min(TIME_BANK_MAX_MS, player.timeBankMs + TIME_BANK_REFILL_MS)
}
export function consumeTimeBank(s: PokerState, now: number) {
  if (s.actor !== null && s.timeBankStartsAt !== null) {
    const player = s.seats[s.actor]!
    player.timeBankMs = Math.max(0, player.timeBankMs - Math.max(0, now - s.timeBankStartsAt))
  }
  s.timeBankStartsAt = null
}
