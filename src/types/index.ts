// Card types
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  suit: Suit
  rank: Rank
  faceUp: boolean
}

// Hand types
export interface Hand {
  cards: Card[]
  bet: number
  isDoubled: boolean
  isSplit: boolean
  isStood: boolean
  isBusted: boolean
  isBlackjack: boolean
  isSurrendered: boolean
}

// Game state types
export type GamePhase =
  | 'betting'      // Player placing bets
  | 'dealing'      // Cards being dealt
  | 'playerTurn'   // Player making decisions
  | 'payout'       // Game resolving and paying out
  | 'complete'     // Round finished

export type FairnessVersion = 'legacy_mulberry_v1' | 'hmac_sha256_v1'
export type ProvablyFairMode = 'legacy_per_game_v1' | 'session_nonce_v1'
export type FairnessVerificationStatus = 'ready' | 'pending_reveal'

export interface BlackjackSettlement {
  totalStake: number
  totalPayout: number
  net: number
  mainHandsPayout: number
  insurancePayout: number
  perfectPairsPayout: number
}

export interface BlackjackGameRules {
  deckCount: number
  dealerStandsOn: number
  blackjackPayout: number
  allowSurrender: boolean
  allowPerfectPairs: boolean
}

export interface BlackjackGameState {
  phase: GamePhase
  playerHands: Hand[]
  dealerHand: Hand
  currentHandIndex: number
  deck: Card[]
  balance: number
  currentBet: number
  perfectPairsBet: number
  insuranceBet: number
  dealerPeeked: boolean
  serverSeedHash: string  // Committed before round
  clientSeed: string
  nonce: number
  lastPayout: number
  message: string
  gameRules?: BlackjackGameRules
  // Perfect Pairs result (evaluated immediately on deal)
  perfectPairsResult?: {
    outcome: PerfectPairsOutcome
    payout: number
  }
  settlement?: BlackjackSettlement
}

// Action types
export type BlackjackAction =
  | 'hit'
  | 'stand'
  | 'double'
  | 'split'
  | 'insurance'
  | 'surrender'

// Payout types
export interface PayoutResult {
  handIndex: number
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender'
  payout: number
  reason: string
}

// Perfect Pairs outcomes
export type PerfectPairsOutcome =
  | 'none'           // No pair
  | 'mixed'          // Same rank, different color
  | 'colored'        // Same rank, same color, different suit
  | 'perfect'        // Same rank, same suit

// Provably fair types
export interface ProvablyFairData {
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  deckOrder: number[]
  fairnessVersion?: FairnessVersion
}

// Blockchain commitment types (provably fair on-chain)
export interface BlockchainCommitment {
  txHash: string
  blockHeight: number
  blockTimestamp: Date | string
  explorerUrl?: string
}

export interface GameVerificationData {
  gameId: string
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  fairnessVersion?: FairnessVersion
  mode?: ProvablyFairMode
  verificationStatus?: FairnessVerificationStatus

  // Blockchain proof
  commitment?: BlockchainCommitment

  // Game details
  gameType: 'blackjack' | 'video_poker'
  outcome?: string
  payout?: number
  createdAt: Date | string
  completedAt?: Date | string
}

export interface VerificationSteps {
  hashMatches: boolean        // SHA256(serverSeed) === serverSeedHash
  onChainConfirmed: boolean   // txHash exists on blockchain
  timestampValid: boolean     // Commitment was before game start
  outcomeValid: boolean       // Replay produces same result
}

export interface FullVerificationResult {
  valid: boolean
  data: GameVerificationData
  steps: VerificationSteps
  errors: string[]
}

export interface SessionFairnessSummary {
  mode: ProvablyFairMode
  serverSeedHash: string | null
  commitmentTxHash: string | null
  commitmentBlock: number | null
  commitmentTimestamp: Date | string | null
  clientSeed: string | null
  nextNonce: number | null
  canEditClientSeed: boolean
  fairnessVersion?: FairnessVersion
}

// Session types (wallet-based)
export interface PlayerSession {
  walletAddress: string
  balance: number
  depositLimit?: number
  lossLimit?: number
  sessionTimeLimit?: number
  sessionStartTime: number
  totalWagered: number
  totalWon: number
  gamesPlayed: number
}

// API response types
export interface GameActionResponse {
  success: boolean
  gameState: BlackjackGameState
  error?: string
}

export interface VerificationResult {
  valid: boolean
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  expectedDeckOrder: number[]
  message: string
  fairnessVersion?: FairnessVersion
}

// Zcash Wallet Types
export type ZcashNetwork = 'mainnet' | 'testnet'

export type AddressType =
  | 'transparent'  // t-address (public, like Bitcoin)
  | 'sapling'      // z-address (shielded, older)
  | 'unified'      // u-address (combines multiple types)

export interface ZcashAddress {
  type: AddressType
  address: string
  network: ZcashNetwork
}

export interface WalletInfo {
  id: string
  sessionId: string
  depositAddress: string      // Unified address for deposits
  depositAddressType: 'unified' | 'transparent'
  transparentAddress: string  // Backup t-address
  network: ZcashNetwork
  accountIndex: number
  createdAt: Date
}

export interface DepositInfo {
  address: string
  addressType: AddressType
  network: ZcashNetwork
  minimumDeposit: number      // In ZEC
  confirmationsRequired: number
  qrCodeData?: string
}

export interface WithdrawalRequest {
  sessionId: string
  destinationAddress: string
  amount: number              // In ZEC
  memo?: string               // For shielded transactions
}

export interface WithdrawalResult {
  success: boolean
  transactionId?: string
  txHash?: string
  fee: number
  error?: string
}

export interface TransactionInfo {
  id: string
  type: 'deposit' | 'withdrawal'
  amount: number
  fee: number
  txHash?: string
  address: string
  confirmations: number
  status: 'pending' | 'confirmed' | 'failed'
  isShielded: boolean
  memo?: string
  createdAt: Date
  confirmedAt?: Date
}

// Hand history entry for UI display
export interface HandHistoryEntry {
  id: string
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender'
  mainBet: number
  payout: number
  createdAt: string | Date
}

// Video Poker types
export type VideoPokerVariant = 'jacks_or_better' | 'deuces_wild'
export type VideoPokerPhase = 'betting' | 'deal' | 'hold' | 'complete'

export type JacksOrBetterHandRank =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'jacks_or_better'
  | 'nothing'

export type DeucesWildHandRank =
  | 'natural_royal_flush'
  | 'four_deuces'
  | 'wild_royal_flush'
  | 'five_of_a_kind'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'nothing'

export type VideoPokerHandRank = JacksOrBetterHandRank | DeucesWildHandRank

export interface VideoPokerGameState {
  phase: VideoPokerPhase
  variant: VideoPokerVariant
  hand: Card[]
  heldCards: boolean[]
  deck: Card[]
  balance: number
  baseBet: number
  betMultiplier: number
  totalBet: number
  serverSeedHash: string
  clientSeed: string
  nonce: number
  handRank: VideoPokerHandRank | null
  multiplier: number | null
  lastPayout: number
  message: string
  paytableKey?: string
}

export interface VideoPokerHandHistoryEntry {
  id: string
  variant: VideoPokerVariant
  handRank: VideoPokerHandRank | null
  totalBet: number
  payout: number
  createdAt: string | Date
}

// Wallet balance types
export interface WalletBalance {
  confirmed: number           // Confirmed balance (3+ confirmations)
  pending: number             // Pending deposits (< 3 confirmations)
  total: number               // confirmed + pending
  pools?: {                   // Per-pool breakdown (from z_getbalanceforaccount)
    transparent: number
    sapling: number
    orchard: number
  }
}
