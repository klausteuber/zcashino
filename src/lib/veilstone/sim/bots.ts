import {
  getPhaseConfig,
  parseZats,
  type VeilstoneAction,
  type VeilstoneActionType,
  type VeilstoneBalanceConfig,
  type VeilstonePlayerState,
  type VeilstoneResource,
  type VeilstoneState,
  type VeilstoneStructureType,
} from '../engine'
import type { SeededRng } from './random'

export type VeilstoneBotArchetype =
  | 'randomLegal'
  | 'greedyRoi'
  | 'trustBanker'
  | 'shieldedShark'
  | 'dataForecaster'
  | 'computeBaron'
  | 'contractSniper'
  | 'marketMaker'
  | 'hoarder'
  | 'crisisExploit'

export const VEILSTONE_BOT_ARCHETYPES: VeilstoneBotArchetype[] = [
  'randomLegal',
  'greedyRoi',
  'trustBanker',
  'shieldedShark',
  'dataForecaster',
  'computeBaron',
  'contractSniper',
  'marketMaker',
  'hoarder',
  'crisisExploit',
]

export const VEILSTONE_LINEUPS: Record<string, VeilstoneBotArchetype[]> = {
  mixed: ['trustBanker', 'shieldedShark', 'dataForecaster', 'greedyRoi'],
  equalRandom: ['randomLegal', 'randomLegal', 'randomLegal', 'randomLegal'],
  sharkTank: ['shieldedShark', 'shieldedShark', 'trustBanker', 'contractSniper'],
  infrastructure: ['computeBaron', 'dataForecaster', 'marketMaker', 'greedyRoi'],
  stress: ['hoarder', 'crisisExploit', 'contractSniper', 'marketMaker'],
}

const resources: VeilstoneResource[] = ['energy', 'compute', 'data', 'materials', 'talent']

function firstOpenContractId(state: VeilstoneState): string | null {
  return state.contracts.find((contract) => contract.status === 'open')?.id ?? null
}

function canAfford(player: VeilstonePlayerState, amountZats: string, wallet: 'publicZats' | 'shieldedZats') {
  return parseZats(player[wallet]) >= parseZats(amountZats)
}

function bidAmountFor(player: VeilstonePlayerState, wallet: 'publicZats' | 'shieldedZats', target: bigint): string | null {
  const balance = parseZats(player[wallet])
  if (balance <= 0n) return null
  const amount = balance < target ? balance / 2n : target
  return amount > 0n ? amount.toString() : null
}

function publicOrder(
  player: VeilstonePlayerState,
  resource: VeilstoneResource,
  side: 'buy' | 'sell',
  priceZats: string
): VeilstoneAction | null {
  if (side === 'sell' && player.resources[resource] < 1) return null
  if (side === 'buy' && !canAfford(player, priceZats, 'publicZats')) return null
  return {
    type: 'PLACE_PUBLIC_ORDER',
    payload: { resource, side, quantity: 1, priceZats },
  }
}

function firstBuildable(player: VeilstonePlayerState, order: VeilstoneStructureType[]): VeilstoneStructureType | null {
  if (player.resources.materials < 1 || player.resources.talent < 1) return null
  return order.find((structure) => !player.builtStructures.includes(structure)) ?? null
}

function buildAction(player: VeilstonePlayerState, order: VeilstoneStructureType[]): VeilstoneAction | null {
  const structureType = firstBuildable(player, order)
  return structureType ? { type: 'BUILD_STRUCTURE', payload: { structureType } } : null
}

function publicContractAction(
  state: VeilstoneState,
  player: VeilstonePlayerState,
  targetZats: bigint
): VeilstoneAction | null {
  const contractId = firstOpenContractId(state)
  const amountZats = bidAmountFor(player, 'publicZats', targetZats)
  if (!contractId || !amountZats) return null
  return { type: 'BID_CONTRACT', payload: { contractId, amountZats } }
}

function shieldedContractAction(
  state: VeilstoneState,
  player: VeilstonePlayerState,
  targetZats: bigint,
  dataSpent: number
): VeilstoneAction | null {
  const contractId = firstOpenContractId(state)
  const amountZats = bidAmountFor(player, 'shieldedZats', targetZats)
  if (!contractId || !amountZats || player.resources.data < dataSpent) return null
  return {
    type: 'SEALED_BID_COMMIT',
    payload: {
      contractId,
      amountZats,
      dataSpent,
      nonce: `sim-${state.stateVersion}-${player.seatIndex}-${player.commitmentIds.length}`,
    },
  }
}

function randomLegalAction(
  state: VeilstoneState,
  player: VeilstonePlayerState,
  allowed: Set<VeilstoneActionType>,
  rng: SeededRng,
  balanceConfig: VeilstoneBalanceConfig
): VeilstoneAction | null {
  const candidates: Array<VeilstoneAction | null> = []
  if (allowed.has('PRODUCE') && !player.producedEpochs.includes(state.epoch)) {
    candidates.push({ type: 'PRODUCE', payload: {} })
  }
  if (allowed.has('PLACE_PUBLIC_ORDER')) {
    const resource = rng.pick(resources)
    candidates.push(publicOrder(player, resource, player.resources[resource] > 1 ? 'sell' : 'buy', '500000'))
  }
  if (allowed.has('BID_CONTRACT')) {
    candidates.push(publicContractAction(state, player, 500_000n))
  }
  if (allowed.has('SEALED_BID_COMMIT')) {
    candidates.push(shieldedContractAction(state, player, 500_000n, balanceConfig.sealedBidDataCost))
  }
  if (allowed.has('BUILD_STRUCTURE')) {
    candidates.push(buildAction(player, ['ENERGY_GRID', 'DATA_TRUST', 'MARKET_EXCHANGE']))
  }
  const legal = candidates.filter((entry): entry is VeilstoneAction => entry !== null)
  return legal.length ? rng.pick(legal) : null
}

export function chooseVeilstoneBotAction(input: {
  state: VeilstoneState
  player: VeilstonePlayerState
  archetype: VeilstoneBotArchetype
  rng: SeededRng
  balanceConfig: VeilstoneBalanceConfig
}): VeilstoneAction | null {
  const { state, player, archetype, rng, balanceConfig } = input
  const allowed = new Set<VeilstoneActionType>(getPhaseConfig(state.phase, balanceConfig).allowedActions)

  if (allowed.has('PRODUCE') && archetype !== 'hoarder') {
    return player.producedEpochs.includes(state.epoch) ? null : { type: 'PRODUCE', payload: {} }
  }

  if (archetype === 'randomLegal') {
    return randomLegalAction(state, player, allowed, rng, balanceConfig)
  }

  if (allowed.has('PLACE_PUBLIC_ORDER')) {
    if (archetype === 'trustBanker') return publicOrder(player, 'data', 'sell', '700000')
    if (archetype === 'marketMaker') return publicOrder(player, rng.pick(resources), rng.chance(0.55) ? 'sell' : 'buy', '450000')
    if (archetype === 'computeBaron') return publicOrder(player, rng.chance(0.65) ? 'compute' : 'energy', 'buy', '600000')
    if (archetype === 'dataForecaster') return publicOrder(player, 'data', 'buy', '650000')
    if (archetype === 'greedyRoi') {
      const sellResource = resources.find((resource) => player.resources[resource] > 2)
      return sellResource ? publicOrder(player, sellResource, 'sell', '800000') : publicOrder(player, 'compute', 'buy', '500000')
    }
    if (archetype === 'crisisExploit') {
      return state.epoch >= 3
        ? publicOrder(player, 'data', 'buy', '550000')
        : publicOrder(player, 'energy', 'sell', '750000')
    }
    if (archetype === 'contractSniper' && rng.chance(0.25)) return publicOrder(player, 'talent', 'buy', '700000')
  }

  if (allowed.has('BID_CONTRACT') || allowed.has('SEALED_BID_COMMIT')) {
    if (archetype === 'trustBanker' && allowed.has('BID_CONTRACT')) {
      return publicContractAction(state, player, 1_200_000n)
    }
    if (archetype === 'shieldedShark' && allowed.has('SEALED_BID_COMMIT')) {
      return shieldedContractAction(state, player, 1_500_000n, balanceConfig.sealedBidDataCost)
    }
    if (archetype === 'dataForecaster' && allowed.has('SEALED_BID_COMMIT')) {
      return shieldedContractAction(state, player, 900_000n, Math.max(1, balanceConfig.sealedBidDataCost))
    }
    if (archetype === 'contractSniper') {
      return allowed.has('SEALED_BID_COMMIT') && player.resources.data > balanceConfig.sealedBidDataCost
        ? shieldedContractAction(state, player, 2_000_000n, balanceConfig.sealedBidDataCost)
        : publicContractAction(state, player, 1_500_000n)
    }
    if (archetype === 'greedyRoi') {
      return parseZats(player.publicZats) > parseZats(player.shieldedZats)
        ? publicContractAction(state, player, 1_000_000n)
        : shieldedContractAction(state, player, 1_000_000n, balanceConfig.sealedBidDataCost)
    }
    if (archetype === 'crisisExploit' && state.epoch >= 3) {
      return shieldedContractAction(state, player, 1_250_000n, balanceConfig.sealedBidDataCost)
    }
  }

  if (allowed.has('BUILD_STRUCTURE') && archetype !== 'hoarder') {
    if (archetype === 'trustBanker') return buildAction(player, ['DATA_TRUST', 'MARKET_EXCHANGE', 'ENERGY_GRID'])
    if (archetype === 'shieldedShark') return buildAction(player, ['DATA_TRUST', 'ENERGY_GRID', 'MARKET_EXCHANGE'])
    if (archetype === 'dataForecaster') return buildAction(player, ['DATA_TRUST', 'MARKET_EXCHANGE', 'ENERGY_GRID'])
    if (archetype === 'computeBaron') return buildAction(player, ['ENERGY_GRID', 'MARKET_EXCHANGE', 'DATA_TRUST'])
    if (archetype === 'marketMaker') return buildAction(player, ['MARKET_EXCHANGE', 'ENERGY_GRID', 'DATA_TRUST'])
    if (archetype === 'crisisExploit') return buildAction(player, ['ENERGY_GRID', 'DATA_TRUST', 'MARKET_EXCHANGE'])
    return buildAction(player, ['ENERGY_GRID', 'DATA_TRUST', 'MARKET_EXCHANGE'])
  }

  return null
}
