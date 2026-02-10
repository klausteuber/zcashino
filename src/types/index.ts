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
}

// Game state types
export type GamePhase =
  | 'betting'      // Player placing bets
  | 'dealing'      // Cards being dealt
  | 'playerTurn'   // Player making decisions
  | 'dealerTurn'   // Dealer revealing and hitting
  | 'payout'       // Game resolving and paying out
  | 'complete'     // Round finished

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
  serverSeedHash: string  // Committed before round
  clientSeed: string
  nonce: number
  lastPayout: number
  message: string
  // Perfect Pairs result (evaluated immediately on deal)
  perfectPairsResult?: {
    outcome: PerfectPairsOutcome
    payout: number
  }
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

  // Blockchain proof
  commitment?: BlockchainCommitment

  // Game details
  gameType: 'blackjack'
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
  outcome: 'win' | 'lose' | 'push' | 'blackjack'
  mainBet: number
  payout: number
  createdAt: string | Date
}

// Wallet balance types
export interface WalletBalance {
  confirmed: number           // Confirmed balance (3+ confirmations)
  pending: number             // Pending deposits (< 3 confirmations)
  total: number               // confirmed + pending
}
