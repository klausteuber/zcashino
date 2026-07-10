export type ZatsString = string

export type VeilstoneResource = 'energy' | 'compute' | 'data' | 'materials' | 'talent'
export type VeilstoneStructureType = 'ENERGY_GRID' | 'DATA_TRUST' | 'MARKET_EXCHANGE'

export type VeilstonePhase =
  | 'TABLE_WAITING'
  | 'TABLE_READY_CHECK'
  | 'MATCH_INITIALIZING'
  | `EPOCH_${1 | 2 | 3 | 4}_FORECAST`
  | `EPOCH_${1 | 2 | 3 | 4}_PRODUCTION`
  | `EPOCH_${1 | 2 | 3 | 4}_MARKET`
  | `EPOCH_${1 | 2 | 3 | 4}_CONTRACTS`
  | `EPOCH_${1 | 2 | 3 | 4}_BUILD`
  | `EPOCH_${1 | 2 | 3 | 4}_RESOLUTION`
  | 'FINAL_RECKONING'
  | 'MATCH_COMPLETE'

export type VeilstoneActionType =
  | 'ADVANCE_PHASE'
  | 'PRODUCE'
  | 'PLACE_PUBLIC_ORDER'
  | 'SEALED_BID_COMMIT'
  | 'BID_CONTRACT'
  | 'BUILD_STRUCTURE'
  | 'FINALIZE_MATCH'

export type VeilstoneEventType =
  | 'MATCH_STARTED'
  | 'PHASE_ADVANCED'
  | 'PRODUCTION_APPLIED'
  | 'PUBLIC_ORDER_PLACED'
  | 'SEALED_BID_COMMITTED'
  | 'CONTRACT_BID_PLACED'
  | 'STRUCTURE_BUILT'
  | 'CRISIS_RESOLVED'
  | 'FINAL_RECKONING_COMPLETE'

export type VeilstoneVisibility = 'public' | 'private' | 'admin'

export interface PhaseConfig {
  phase: VeilstonePhase
  durationMs: number
  allowedActions: VeilstoneActionType[]
  autoAdvance: boolean
}

export interface VeilstoneHouseDefinition {
  id: string
  name: string
  lore: string
  cosmeticOnly: boolean
  futureAbility?: string
}

export interface VeilstoneResources {
  energy: number
  compute: number
  data: number
  materials: number
  talent: number
}

export interface VeilstonePlayerState {
  sessionId: string
  seatId: string
  seatIndex: number
  displayName: string
  houseId: string
  isBot: boolean
  publicZats: ZatsString
  shieldedZats: ZatsString
  lockedZats: ZatsString
  payoutZats?: ZatsString
  resources: VeilstoneResources
  trust: number
  prestige: number
  producedEpochs: number[]
  builtStructures: string[]
  commitmentIds: string[]
}

export interface VeilstoneAccountState {
  id: string
  ownerType: 'player' | 'reserve' | 'dividend' | 'market' | 'contract'
  ownerId: string
  accountType:
    | 'PLAYER_PUBLIC'
    | 'PLAYER_SHIELDED'
    | 'PLAYER_LOCKED'
    | 'FRONTIER_RESERVE'
    | 'CIVIC_DIVIDEND'
    | 'MARKET_ESCROW'
    | 'CONTRACT_ESCROW'
  balanceZats: ZatsString
}

export interface VeilstoneMapNode {
  id: string
  resource: VeilstoneResource | 'freeport' | 'vault' | 'audit'
  ownerSessionId?: string
  adjacent: string[]
}

export interface VeilstoneOrderState {
  id: string
  playerSessionId: string
  resource: VeilstoneResource
  side: 'buy' | 'sell'
  quantity: number
  priceZats: ZatsString
  status: 'open' | 'filled' | 'cancelled'
}

export interface VeilstoneContractState {
  id: string
  epoch: number
  type: 'OPEN_MODEL_COMMONS'
  status: 'open' | 'resolved'
  publicStakeZats: ZatsString
  shieldedStakeZats: ZatsString
  winningSessionId?: string
}

export interface VeilstoneCommitmentState {
  id: string
  playerSessionId: string
  contractId?: string
  commitmentHash: string
  actionType: 'SEALED_BID_COMMIT'
  status: 'committed' | 'revealed'
  publicAmountZats: ZatsString
  reveal?: {
    amountZats: ZatsString
    dataSpent: number
  }
}

export interface VeilstoneCrisisState {
  epoch: number
  type: 'ENERGY_SHOCK' | 'COMPUTE_SQUEEZE' | 'DATA_SCANDAL' | 'CAPITAL_FREEZE'
  description: string
}

export interface VeilstoneState {
  engineVersion: 'veilstone_mvp_zero_v1'
  matchId: string
  tableId: string
  epoch: number
  phase: VeilstonePhase
  stateVersion: ZatsString
  phaseEndsAt: string
  players: Record<string, VeilstonePlayerState>
  accounts: Record<string, VeilstoneAccountState>
  map: VeilstoneMapNode[]
  orders: VeilstoneOrderState[]
  contracts: VeilstoneContractState[]
  commitments: VeilstoneCommitmentState[]
  crises: VeilstoneCrisisState[]
  finalLedgerHash?: string
}

export interface VeilstoneLedgerMove {
  debitAccountId: string
  creditAccountId: string
  amountZats: ZatsString
  reason: string
  visibility: VeilstoneVisibility
}

export interface VeilstoneEngineEvent {
  type: VeilstoneEventType
  visibility: VeilstoneVisibility
  actorSessionId?: string
  payload: Record<string, unknown>
  ledgerMoves?: VeilstoneLedgerMove[]
}

export type VeilstoneAction =
  | { type: 'ADVANCE_PHASE'; payload?: Record<string, never> }
  | { type: 'PRODUCE'; payload?: Record<string, never> }
  | {
      type: 'PLACE_PUBLIC_ORDER'
      payload: {
        resource: VeilstoneResource
        side: 'buy' | 'sell'
        quantity: number
        priceZats: ZatsString
      }
    }
  | {
      type: 'SEALED_BID_COMMIT'
      payload: {
        contractId: string
        amountZats: ZatsString
        dataSpent?: number
        nonce?: string
      }
    }
  | {
      type: 'BID_CONTRACT'
      payload: {
        contractId: string
        amountZats: ZatsString
      }
    }
  | {
      type: 'BUILD_STRUCTURE'
      payload: {
        structureType: VeilstoneStructureType
      }
    }
  | { type: 'FINALIZE_MATCH'; payload?: Record<string, never> }

export interface ApplyActionInput {
  state: VeilstoneState
  actorSessionId: string
  action: VeilstoneAction
  now: Date
  balanceConfig?: VeilstoneBalanceConfig
}

export interface ApplyActionResult {
  state: VeilstoneState
  events: VeilstoneEngineEvent[]
}

export interface StartMatchSeat {
  seatId: string
  sessionId: string
  seatIndex: number
  houseId: string
  displayName: string
  isBot: boolean
  publicStartZats: ZatsString
  shieldedStartZats: ZatsString
}

export interface VeilstoneBalanceConfig {
  playerBuyInZats: bigint
  playerCount: number
  totalPoolZats: bigint
  workingCapitalPoolZats: bigint
  frontierReserveZats: bigint
  civicDividendZats: bigint
  playerWorkingCapitalZats: bigint
  minPublicStartZats: bigint
  maxPublicStartZats: bigint
  terminalPricesZats: Record<VeilstoneResource, bigint>
  buildCostsZats: Record<VeilstoneStructureType, bigint>
  phaseConfigs: PhaseConfig[]
  sealedBidDataCost: number
  reputationBonusZats: bigint
  crisisIntensity: number
  publicOrderPrestigeReward: number
  publicContractTrustReward: number
  buildTrustRewards: Record<VeilstoneStructureType, number>
  buildPrestigeRewards: Record<VeilstoneStructureType, number>
}

export type VeilstoneBalanceConfigOverride = Partial<Omit<
  VeilstoneBalanceConfig,
  'terminalPricesZats' | 'buildCostsZats' | 'buildTrustRewards' | 'buildPrestigeRewards' | 'phaseConfigs'
>> & {
  terminalPricesZats?: Partial<Record<VeilstoneResource, bigint>>
  buildCostsZats?: Partial<Record<VeilstoneStructureType, bigint>>
  buildTrustRewards?: Partial<Record<VeilstoneStructureType, number>>
  buildPrestigeRewards?: Partial<Record<VeilstoneStructureType, number>>
  phaseConfigs?: PhaseConfig[]
}
