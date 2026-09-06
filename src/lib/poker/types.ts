/** All money inside the poker engine is integer zatoshis (1 ZEC = 100,000,000). */
export const ZATS_PER_ZEC = 100_000_000
export const MAX_SEATS = 6
export const TURN_MS = 30_000
export const BETWEEN_HANDS_MS = 8_000
export const TIME_BANK_MAX_MS = 30_000
export const TIME_BANK_REFILL_MS = 5_000
export const TIME_BANK_REFILL_HANDS = 10
export const POKER_VARIANTS = ['holdem', 'omaha', 'stud'] as const
export type PokerVariant = typeof POKER_VARIANTS[number]
export const VARIANT_NAMES: Record<PokerVariant, string> = { holdem: 'No-limit Hold’em', omaha: 'Pot-limit Omaha', stud: 'Seven-card stud' }
export type PokerMode = 'real' | 'practice'
export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'third' | 'fourth' | 'fifth' | 'sixth' | 'seventh' | 'complete'
export type PokerAction = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'bring-in' } | { type: 'raise'; to: number }
export interface PokerSeat {
  playerId: string
  name: string
  stack: number
  ready: boolean
  leaving: boolean
  needsEntryBlind: boolean
  inHand: boolean
  folded: boolean
  cards: number[]
  streetBet: number
  contribution: number
  actedAtBet: number | null
  lastAction: string
  timeBankMs: number
  handsDealt: number
}
export interface Award { seat: number; amount: number; label: string; refund: boolean }
export interface PokerState {
  variant: PokerVariant
  seats: (PokerSeat | null)[]
  phase: Phase
  handNumber: number
  dealer: number
  smallBlind: number
  bigBlind: number
  deck: number[]
  board: number[]
  currentBet: number
  lastFullRaise: number
  pending: number[]
  actor: number | null
  deadline: number | null
  nextHandAt: number | null
  timeBankStartsAt: number | null
  bringInSeat: number | null
  limitUnit: number
  limitFullBet: number
  limitBets: number
  settlement: { playerId: string; wagered: number; returned: number; stack: number }[]
  awards: Award[]
  log: string[]
}
export interface LegalActions {
  canCheck: boolean
  call: number
  minRaiseTo: number
  maxRaiseTo: number
  canRaise: boolean
  bringIn: number | null
  raiseOptions: number[] | null
}
export interface PublicSeat extends Omit<PokerSeat, 'playerId' | 'cards' | 'actedAtBet'> {
  cards: (number | null)[]
  exposed: boolean[]
}
export interface PublicTable {
  access: import('./access-types').PokerAccess
  id: string
  name: string
  mode: PokerMode
  version: number
  buyInMin: number
  buyInMax: number
  state: Omit<PokerState, 'seats' | 'deck' | 'pending' | 'settlement'> & { seats: (PublicSeat | null)[] }
  viewerSeat: number | null
  legal: LegalActions | null
  balanceZats: number
  serverTime: number
  realMoneyEnabled: boolean
}
export interface LobbyTable {
  variant: PokerVariant
  id: string
  name: string
  mode: PokerMode
  smallBlind: number
  bigBlind: number
  players: number
  phase: Phase
  myTable: boolean
}
export function studAnte(unit: number) { return Math.max(1, Math.floor(unit / 10)) }
export function studBringIn(unit: number) { return Math.max(1, Math.floor(unit / 2)) }
export function stakesLabel(variant: PokerVariant, unit: number) {
  return variant === 'stud' ? `${formatZec(unit)} / ${formatZec(unit * 2)} limits` : `${formatZec(unit / 2)} / ${formatZec(unit)} blinds`
}
export function formatZec(zats: number): string {
  return (zats / ZATS_PER_ZEC).toFixed(8).replace(/0+$/, '').replace(/\.$/, '') || '0'
}
export function parseZec(text: string): number | null {
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const value = Number(whole) * ZATS_PER_ZEC + Number(fraction.padEnd(8, '0'))
  return Number.isSafeInteger(value) ? value : null
}
