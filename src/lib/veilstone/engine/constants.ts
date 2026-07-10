import type {
  PhaseConfig,
  VeilstoneActionType,
  VeilstoneBalanceConfig,
  VeilstoneBalanceConfigOverride,
  VeilstoneHouseDefinition,
  VeilstonePhase,
  VeilstoneResource,
} from './types'

export const VEILSTONE_ENGINE_VERSION = 'veilstone_mvp_zero_v1' as const

export const PLAYER_BUY_IN_ZATS = 100_000_000n
export const PLAYER_COUNT = 4
export const TOTAL_POOL_ZATS = PLAYER_BUY_IN_ZATS * BigInt(PLAYER_COUNT)
export const WORKING_CAPITAL_POOL_ZATS = 280_000_000n
export const FRONTIER_RESERVE_ZATS = 80_000_000n
export const CIVIC_DIVIDEND_ZATS = 40_000_000n
export const PLAYER_WORKING_CAPITAL_ZATS = 70_000_000n
export const MIN_PUBLIC_START_ZATS = 28_000_000n
export const MAX_PUBLIC_START_ZATS = 49_000_000n

export const TERMINAL_PRICES_ZATS: Record<VeilstoneResource, bigint> = {
  energy: 120_000n,
  compute: 150_000n,
  data: 180_000n,
  materials: 100_000n,
  talent: 160_000n,
}

export const BUILD_COSTS_ZATS: VeilstoneBalanceConfig['buildCostsZats'] = {
  ENERGY_GRID: 8_000_000n,
  DATA_TRUST: 7_000_000n,
  MARKET_EXCHANGE: 9_000_000n,
}

export const HOUSE_DEFINITIONS: VeilstoneHouseDefinition[] = [
  {
    id: 'glass-ledger-republic',
    name: 'Glass Ledger Republic',
    lore: 'Radical transparency and public audit courts.',
    cosmeticOnly: true,
    futureAbility: '+1 starting Trust; reduced Shielded Vault capacity.',
  },
  {
    id: 'open-freeport',
    name: 'Open Freeport',
    lore: 'Trade maximalists who turn routes into reputation.',
    cosmeticOnly: true,
    futureAbility: 'Lower public market fee; trade-route bonus.',
  },
  {
    id: 'shielded-sanctuary',
    name: 'Shielded Sanctuary',
    lore: 'Privacy as civil liberty and strategic ambiguity.',
    cosmeticOnly: true,
    futureAbility: 'Higher Shielded Vault capacity; slower Trust growth.',
  },
  {
    id: 'data-compact',
    name: 'Data Compact',
    lore: 'Private data markets and counter-surveillance labs.',
    cosmeticOnly: true,
    futureAbility: '+1 Data production; cheaper counter-surveillance.',
  },
  {
    id: 'mutual-credit-league',
    name: 'Mutual Credit League',
    lore: 'Cooperative finance with hard reputational edges.',
    cosmeticOnly: true,
    futureAbility: 'Better loan terms; weaker sealed-bid ceiling.',
  },
  {
    id: 'night-market-syndicate',
    name: 'Night Market Syndicate',
    lore: 'Dark liquidity, logistics, and plausible deniability.',
    cosmeticOnly: true,
    futureAbility: 'Higher private-contract throughput.',
  },
]

const epochPhaseDurationMs = 90_000
const actions = (...entries: VeilstoneActionType[]) => entries

function makeDefaultPhaseConfigs(): PhaseConfig[] {
  return [
    { phase: 'TABLE_WAITING', durationMs: 0, allowedActions: actions(), autoAdvance: false },
    { phase: 'TABLE_READY_CHECK', durationMs: 0, allowedActions: actions(), autoAdvance: false },
    { phase: 'MATCH_INITIALIZING', durationMs: 0, allowedActions: actions(), autoAdvance: true },
    ...([1, 2, 3, 4] as const).flatMap<PhaseConfig>((epoch) => [
      {
        phase: `EPOCH_${epoch}_FORECAST` as VeilstonePhase,
        durationMs: epochPhaseDurationMs,
        allowedActions: actions('ADVANCE_PHASE'),
        autoAdvance: false,
      },
      {
        phase: `EPOCH_${epoch}_PRODUCTION` as VeilstonePhase,
        durationMs: 45_000,
        allowedActions: actions('PRODUCE', 'ADVANCE_PHASE'),
        autoAdvance: false,
      },
      {
        phase: `EPOCH_${epoch}_MARKET` as VeilstonePhase,
        durationMs: epochPhaseDurationMs,
        allowedActions: actions('PLACE_PUBLIC_ORDER', 'ADVANCE_PHASE'),
        autoAdvance: false,
      },
      {
        phase: `EPOCH_${epoch}_CONTRACTS` as VeilstonePhase,
        durationMs: epochPhaseDurationMs,
        allowedActions: actions('SEALED_BID_COMMIT', 'BID_CONTRACT', 'ADVANCE_PHASE'),
        autoAdvance: false,
      },
      {
        phase: `EPOCH_${epoch}_BUILD` as VeilstonePhase,
        durationMs: epochPhaseDurationMs,
        allowedActions: actions('BUILD_STRUCTURE', 'ADVANCE_PHASE'),
        autoAdvance: false,
      },
      {
        phase: `EPOCH_${epoch}_RESOLUTION` as VeilstonePhase,
        durationMs: 45_000,
        allowedActions: actions('ADVANCE_PHASE'),
        autoAdvance: false,
      },
    ]),
    { phase: 'FINAL_RECKONING', durationMs: 0, allowedActions: actions('FINALIZE_MATCH', 'ADVANCE_PHASE'), autoAdvance: false },
    { phase: 'MATCH_COMPLETE', durationMs: 0, allowedActions: actions(), autoAdvance: false },
  ]
}

export const PHASE_CONFIGS: PhaseConfig[] = makeDefaultPhaseConfigs()

export const DEFAULT_VEILSTONE_BALANCE_CONFIG: VeilstoneBalanceConfig = {
  playerBuyInZats: PLAYER_BUY_IN_ZATS,
  playerCount: PLAYER_COUNT,
  totalPoolZats: TOTAL_POOL_ZATS,
  workingCapitalPoolZats: WORKING_CAPITAL_POOL_ZATS,
  frontierReserveZats: FRONTIER_RESERVE_ZATS,
  civicDividendZats: CIVIC_DIVIDEND_ZATS,
  playerWorkingCapitalZats: PLAYER_WORKING_CAPITAL_ZATS,
  minPublicStartZats: MIN_PUBLIC_START_ZATS,
  maxPublicStartZats: MAX_PUBLIC_START_ZATS,
  terminalPricesZats: TERMINAL_PRICES_ZATS,
  buildCostsZats: BUILD_COSTS_ZATS,
  phaseConfigs: PHASE_CONFIGS,
  sealedBidDataCost: 1,
  reputationBonusZats: 100_000n,
  crisisIntensity: 1,
  publicOrderPrestigeReward: 1,
  publicContractTrustReward: 1,
  buildTrustRewards: {
    ENERGY_GRID: 1,
    DATA_TRUST: 2,
    MARKET_EXCHANGE: 1,
  },
  buildPrestigeRewards: {
    ENERGY_GRID: 1,
    DATA_TRUST: 1,
    MARKET_EXCHANGE: 2,
  },
}

export function createVeilstoneBalanceConfig(
  overrides: VeilstoneBalanceConfigOverride = {}
): VeilstoneBalanceConfig {
  return {
    ...DEFAULT_VEILSTONE_BALANCE_CONFIG,
    ...overrides,
    terminalPricesZats: {
      ...DEFAULT_VEILSTONE_BALANCE_CONFIG.terminalPricesZats,
      ...overrides.terminalPricesZats,
    },
    buildCostsZats: {
      ...DEFAULT_VEILSTONE_BALANCE_CONFIG.buildCostsZats,
      ...overrides.buildCostsZats,
    },
    buildTrustRewards: {
      ...DEFAULT_VEILSTONE_BALANCE_CONFIG.buildTrustRewards,
      ...overrides.buildTrustRewards,
    },
    buildPrestigeRewards: {
      ...DEFAULT_VEILSTONE_BALANCE_CONFIG.buildPrestigeRewards,
      ...overrides.buildPrestigeRewards,
    },
    phaseConfigs: overrides.phaseConfigs ?? DEFAULT_VEILSTONE_BALANCE_CONFIG.phaseConfigs,
  }
}

export function getPhaseConfig(
  phase: VeilstonePhase,
  balanceConfig: VeilstoneBalanceConfig = DEFAULT_VEILSTONE_BALANCE_CONFIG
): PhaseConfig {
  const config = balanceConfig.phaseConfigs.find((entry) => entry.phase === phase)
  if (!config) throw new Error(`Unknown Veilstone phase: ${phase}`)
  return config
}
