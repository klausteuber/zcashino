import {
  DEFAULT_VEILSTONE_BALANCE_CONFIG,
} from './constants'
import { makeCommitmentHash, sha256Hex, stableStringify } from './hash'
import { assertActionAllowed, calculatePhaseEndsAt, getEpochForPhase, getNextPhase } from './phase'
import { createAccountId } from './setup'
import type {
  ApplyActionInput,
  ApplyActionResult,
  VeilstoneAccountState,
  VeilstoneAction,
  VeilstoneBalanceConfig,
  VeilstoneCrisisState,
  VeilstoneEngineEvent,
  VeilstoneLedgerMove,
  VeilstonePlayerState,
  VeilstoneResource,
  VeilstoneState,
} from './types'
import { addZats, compareZats, parseZats, subtractZats, toZatsString } from './zats'

function cloneState(state: VeilstoneState): VeilstoneState {
  return JSON.parse(JSON.stringify(state)) as VeilstoneState
}

function getPlayer(state: VeilstoneState, sessionId: string): VeilstonePlayerState {
  const player = state.players[sessionId]
  if (!player) throw new Error('Player is not seated in this match')
  return player
}

function getAccount(state: VeilstoneState, accountId: string): VeilstoneAccountState {
  const account = state.accounts[accountId]
  if (!account) throw new Error(`Missing Veilstone account ${accountId}`)
  return account
}

function syncPlayerBalancesFromAccounts(state: VeilstoneState, sessionId: string): void {
  const player = getPlayer(state, sessionId)
  player.publicZats = getAccount(state, createAccountId(state.matchId, sessionId, 'PLAYER_PUBLIC')).balanceZats
  player.shieldedZats = getAccount(state, createAccountId(state.matchId, sessionId, 'PLAYER_SHIELDED')).balanceZats
  player.lockedZats = getAccount(state, createAccountId(state.matchId, sessionId, 'PLAYER_LOCKED')).balanceZats
}

function moveZats(
  state: VeilstoneState,
  input: {
    debitAccountId: string
    creditAccountId: string
    amountZats: string
    reason: string
    visibility?: 'public' | 'private'
  }
): VeilstoneLedgerMove {
  const debit = getAccount(state, input.debitAccountId)
  const credit = getAccount(state, input.creditAccountId)
  if (compareZats(debit.balanceZats, input.amountZats) < 0) {
    throw new Error(`Insufficient ${debit.accountType} balance`)
  }

  debit.balanceZats = subtractZats(debit.balanceZats, input.amountZats)
  credit.balanceZats = addZats(credit.balanceZats, input.amountZats)

  if (debit.ownerType === 'player') syncPlayerBalancesFromAccounts(state, debit.ownerId)
  if (credit.ownerType === 'player') syncPlayerBalancesFromAccounts(state, credit.ownerId)

  return {
    debitAccountId: input.debitAccountId,
    creditAccountId: input.creditAccountId,
    amountZats: input.amountZats,
    reason: input.reason,
    visibility: input.visibility ?? 'public',
  }
}

function incrementVersion(state: VeilstoneState): void {
  state.stateVersion = (parseZats(state.stateVersion) + 1n).toString()
}

function applyProduction(state: VeilstoneState, actorSessionId: string): VeilstoneEngineEvent {
  const player = getPlayer(state, actorSessionId)
  if (player.producedEpochs.includes(state.epoch)) {
    throw new Error('Player has already produced this epoch')
  }

  const ownedNodes = state.map.filter((node) => node.ownerSessionId === actorSessionId)
  const yields: Record<VeilstoneResource, number> = {
    energy: 0,
    compute: 0,
    data: 0,
    materials: 0,
    talent: 0,
  }

  for (const node of ownedNodes) {
    if (node.resource === 'freeport' || node.resource === 'vault' || node.resource === 'audit') continue
    yields[node.resource] += 1
  }

  for (const resource of Object.keys(yields) as VeilstoneResource[]) {
    player.resources[resource] += yields[resource]
  }
  player.producedEpochs.push(state.epoch)

  return {
    type: 'PRODUCTION_APPLIED',
    visibility: 'public',
    actorSessionId,
    payload: {
      epoch: state.epoch,
      yields,
    },
  }
}

function applyPublicOrder(
  state: VeilstoneState,
  actorSessionId: string,
  action: Extract<VeilstoneAction, { type: 'PLACE_PUBLIC_ORDER' }>,
  balanceConfig: VeilstoneBalanceConfig
): VeilstoneEngineEvent {
  const player = getPlayer(state, actorSessionId)
  const { resource, side, quantity, priceZats } = action.payload
  if (quantity <= 0) throw new Error('Order quantity must be positive')
  if (parseZats(priceZats) <= 0n) throw new Error('Order price must be positive')

  const orderId = `${state.matchId}:order:${state.orders.length + 1}`
  const orderValue = (parseZats(priceZats) * BigInt(quantity)).toString()
  const ledgerMoves: VeilstoneLedgerMove[] = []

  if (side === 'buy') {
    const playerPublic = createAccountId(state.matchId, actorSessionId, 'PLAYER_PUBLIC')
    const marketEscrow = createAccountId(state.matchId, 'market', 'MARKET_ESCROW')
    const playerLocked = createAccountId(state.matchId, actorSessionId, 'PLAYER_LOCKED')
    ledgerMoves.push(moveZats(state, {
      debitAccountId: playerPublic,
      creditAccountId: marketEscrow,
      amountZats: orderValue,
      reason: 'PUBLIC_MARKET_BUY_LOCK',
    }))
    ledgerMoves.push(moveZats(state, {
      debitAccountId: marketEscrow,
      creditAccountId: playerLocked,
      amountZats: orderValue,
      reason: 'PLAYER_LOCKED_MARKET_VALUE',
    }))
  } else {
    if (player.resources[resource] < quantity) throw new Error(`Insufficient ${resource}`)
    player.resources[resource] -= quantity
  }

  player.prestige += balanceConfig.publicOrderPrestigeReward
  state.orders.push({
    id: orderId,
    playerSessionId: actorSessionId,
    resource,
    side,
    quantity,
    priceZats,
    status: 'open',
  })

  return {
    type: 'PUBLIC_ORDER_PLACED',
    visibility: 'public',
    actorSessionId,
    payload: {
      orderId,
      resource,
      side,
      quantity,
      priceZats,
    },
    ledgerMoves,
  }
}

function applySealedBid(
  state: VeilstoneState,
  actorSessionId: string,
  action: Extract<VeilstoneAction, { type: 'SEALED_BID_COMMIT' }>,
  balanceConfig: VeilstoneBalanceConfig
): VeilstoneEngineEvent {
  const player = getPlayer(state, actorSessionId)
  const contract = state.contracts.find((entry) => entry.id === action.payload.contractId)
  if (!contract || contract.status !== 'open') throw new Error('Contract is not open')

  const amountZats = toZatsString(action.payload.amountZats)
  const dataSpent = action.payload.dataSpent ?? balanceConfig.sealedBidDataCost
  if (dataSpent < 0 || player.resources.data < dataSpent) throw new Error('Insufficient Data for shielded bid')
  if (parseZats(amountZats) <= 0n) throw new Error('Bid amount must be positive')

  const nonce = action.payload.nonce ?? `${state.stateVersion}:${state.commitments.length}`
  const commitmentHash = makeCommitmentHash({
    matchId: state.matchId,
    playerSessionId: actorSessionId,
    contractId: contract.id,
    amountZats,
    dataSpent,
    nonce,
  })
  const commitmentId = `${state.matchId}:commitment:${state.commitments.length + 1}`
  const shieldedAccount = createAccountId(state.matchId, actorSessionId, 'PLAYER_SHIELDED')
  const contractEscrow = createAccountId(state.matchId, 'contract', 'CONTRACT_ESCROW')
  const playerLocked = createAccountId(state.matchId, actorSessionId, 'PLAYER_LOCKED')
  const ledgerMoves = [
    moveZats(state, {
      debitAccountId: shieldedAccount,
      creditAccountId: contractEscrow,
      amountZats,
      reason: 'SEALED_BID_SHIELDED_LOCK',
      visibility: 'private',
    }),
    moveZats(state, {
      debitAccountId: contractEscrow,
      creditAccountId: playerLocked,
      amountZats,
      reason: 'PLAYER_LOCKED_CONTRACT_VALUE',
      visibility: 'private',
    }),
  ]

  player.resources.data -= dataSpent
  player.commitmentIds.push(commitmentId)
  contract.shieldedStakeZats = addZats(contract.shieldedStakeZats, amountZats)
  state.commitments.push({
    id: commitmentId,
    playerSessionId: actorSessionId,
    contractId: contract.id,
    commitmentHash,
    actionType: 'SEALED_BID_COMMIT',
    status: 'committed',
    publicAmountZats: amountZats,
    reveal: {
      amountZats,
      dataSpent,
    },
  })

  return {
    type: 'SEALED_BID_COMMITTED',
    visibility: 'private',
    actorSessionId,
    payload: {
      commitmentId,
      contractId: contract.id,
      commitmentHash,
      publicAmountZats: amountZats,
    },
    ledgerMoves,
  }
}

function applyContractBid(
  state: VeilstoneState,
  actorSessionId: string,
  action: Extract<VeilstoneAction, { type: 'BID_CONTRACT' }>,
  balanceConfig: VeilstoneBalanceConfig
): VeilstoneEngineEvent {
  const contract = state.contracts.find((entry) => entry.id === action.payload.contractId)
  if (!contract || contract.status !== 'open') throw new Error('Contract is not open')
  const amountZats = toZatsString(action.payload.amountZats)
  if (parseZats(amountZats) <= 0n) throw new Error('Contract bid amount must be positive')

  const publicAccount = createAccountId(state.matchId, actorSessionId, 'PLAYER_PUBLIC')
  const contractEscrow = createAccountId(state.matchId, 'contract', 'CONTRACT_ESCROW')
  const playerLocked = createAccountId(state.matchId, actorSessionId, 'PLAYER_LOCKED')
  const ledgerMoves = [
    moveZats(state, {
      debitAccountId: publicAccount,
      creditAccountId: contractEscrow,
      amountZats,
      reason: 'PUBLIC_CONTRACT_STAKE',
    }),
    moveZats(state, {
      debitAccountId: contractEscrow,
      creditAccountId: playerLocked,
      amountZats,
      reason: 'PLAYER_LOCKED_CONTRACT_VALUE',
    }),
  ]

  const player = getPlayer(state, actorSessionId)
  player.trust += balanceConfig.publicContractTrustReward
  contract.publicStakeZats = addZats(contract.publicStakeZats, amountZats)

  return {
    type: 'CONTRACT_BID_PLACED',
    visibility: 'public',
    actorSessionId,
    payload: {
      contractId: contract.id,
      amountZats,
    },
    ledgerMoves,
  }
}

function applyBuild(
  state: VeilstoneState,
  actorSessionId: string,
  action: Extract<VeilstoneAction, { type: 'BUILD_STRUCTURE' }>,
  balanceConfig: VeilstoneBalanceConfig
): VeilstoneEngineEvent {
  const player = getPlayer(state, actorSessionId)
  const cost = balanceConfig.buildCostsZats[action.payload.structureType]
  if (player.builtStructures.includes(action.payload.structureType)) {
    throw new Error('Structure already built')
  }
  if (player.resources.materials < 1 || player.resources.talent < 1) {
    throw new Error('Building requires 1 Materials and 1 Talent')
  }

  const publicAccount = createAccountId(state.matchId, actorSessionId, 'PLAYER_PUBLIC')
  const reserveAccount = createAccountId(state.matchId, 'frontier-reserve', 'FRONTIER_RESERVE')
  const ledgerMoves = [
    moveZats(state, {
      debitAccountId: publicAccount,
      creditAccountId: reserveAccount,
      amountZats: cost.toString(),
      reason: `BUILD_${action.payload.structureType}`,
    }),
  ]

  player.resources.materials -= 1
  player.resources.talent -= 1
  player.trust += balanceConfig.buildTrustRewards[action.payload.structureType]
  player.prestige += balanceConfig.buildPrestigeRewards[action.payload.structureType]
  player.builtStructures.push(action.payload.structureType)

  return {
    type: 'STRUCTURE_BUILT',
    visibility: 'public',
    actorSessionId,
    payload: {
      structureType: action.payload.structureType,
      costZats: cost.toString(),
    },
    ledgerMoves,
  }
}

function resolveCrisis(state: VeilstoneState, balanceConfig: VeilstoneBalanceConfig): VeilstoneEngineEvent | null {
  if (!state.phase.endsWith('_RESOLUTION')) return null
  if (state.crises.some((crisis) => crisis.epoch === state.epoch)) return null

  const crisisByEpoch: Record<number, VeilstoneCrisisState['type']> = {
    1: 'ENERGY_SHOCK',
    2: 'COMPUTE_SQUEEZE',
    3: 'DATA_SCANDAL',
    4: 'CAPITAL_FREEZE',
  }
  const type = crisisByEpoch[state.epoch]
  const crisis: VeilstoneCrisisState = {
    epoch: state.epoch,
    type,
    description: {
      ENERGY_SHOCK: 'Energy pressure rises; compute-heavy Houses lose one Compute unless they built an Energy Grid.',
      COMPUTE_SQUEEZE: 'Compute scarcity increases the value of model contracts.',
      DATA_SCANDAL: 'Unaudited Houses lose Trust unless they built a Data Trust.',
      CAPITAL_FREEZE: 'Low-Trust shielded-heavy Houses lose Prestige.',
    }[type],
  }

  for (const player of Object.values(state.players)) {
    if (type === 'ENERGY_SHOCK' && !player.builtStructures.includes('ENERGY_GRID')) {
      player.resources.compute = Math.max(0, player.resources.compute - balanceConfig.crisisIntensity)
    }
    if (type === 'DATA_SCANDAL' && !player.builtStructures.includes('DATA_TRUST')) {
      player.trust = Math.max(0, player.trust - balanceConfig.crisisIntensity)
    }
    if (type === 'CAPITAL_FREEZE' && player.trust < 6 && compareZats(player.shieldedZats, player.publicZats) > 0) {
      player.prestige = Math.max(0, player.prestige - balanceConfig.crisisIntensity)
    }
  }

  state.crises.push(crisis)
  return {
    type: 'CRISIS_RESOLVED',
    visibility: 'public',
    payload: { ...crisis },
  }
}

function advancePhase(state: VeilstoneState, now: Date, balanceConfig: VeilstoneBalanceConfig): VeilstoneEngineEvent[] {
  const events: VeilstoneEngineEvent[] = []
  const crisis = resolveCrisis(state, balanceConfig)
  if (crisis) events.push(crisis)

  const nextPhase = getNextPhase(state.phase)
  state.phase = nextPhase
  state.epoch = getEpochForPhase(nextPhase)
  state.phaseEndsAt = calculatePhaseEndsAt(nextPhase, now, balanceConfig)

  events.push({
    type: 'PHASE_ADVANCED',
    visibility: 'public',
    payload: {
      phase: nextPhase,
      epoch: state.epoch,
      phaseEndsAt: state.phaseEndsAt,
    },
  })

  return events
}

function calculatePlayerNetWorth(player: VeilstonePlayerState, balanceConfig: VeilstoneBalanceConfig): bigint {
  const liquid = parseZats(player.publicZats) + parseZats(player.shieldedZats) + parseZats(player.lockedZats)
  const resourceValue = (Object.keys(player.resources) as VeilstoneResource[])
    .reduce((total, resource) => (
      total + (balanceConfig.terminalPricesZats[resource] * BigInt(player.resources[resource]))
    ), 0n)
  const reputationBonus = BigInt(Math.max(0, player.trust + player.prestige)) * balanceConfig.reputationBonusZats
  return liquid + resourceValue + reputationBonus
}

function finalizeMatch(state: VeilstoneState, balanceConfig: VeilstoneBalanceConfig): VeilstoneEngineEvent {
  const players = Object.values(state.players)
  const totalNetWorth = players.reduce((total, player) => total + calculatePlayerNetWorth(player, balanceConfig), 0n)
  let allocated = 0n

  const payouts = players
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((player, index) => {
      const netWorth = calculatePlayerNetWorth(player, balanceConfig)
      const payout = index === players.length - 1
        ? balanceConfig.totalPoolZats - allocated
        : (balanceConfig.totalPoolZats * netWorth) / totalNetWorth
      allocated += payout
      player.payoutZats = payout.toString()
      return {
        sessionId: player.sessionId,
        displayName: player.displayName,
        netWorthZats: netWorth.toString(),
        payoutZats: payout.toString(),
      }
    })

  state.phase = 'MATCH_COMPLETE'
  state.phaseEndsAt = new Date(0).toISOString()
  for (const contract of state.contracts) {
    contract.status = 'resolved'
  }
  for (const commitment of state.commitments) {
    commitment.status = 'revealed'
  }
  state.finalLedgerHash = sha256Hex(stableStringify({
    matchId: state.matchId,
    payouts,
    civicDividendZats: balanceConfig.civicDividendZats.toString(),
    version: state.stateVersion,
  }))

  return {
    type: 'FINAL_RECKONING_COMPLETE',
    visibility: 'public',
    payload: {
      payouts,
      finalLedgerHash: state.finalLedgerHash,
      totalPayoutZats: balanceConfig.totalPoolZats.toString(),
    },
  }
}

export function applyVeilstoneAction(input: ApplyActionInput): ApplyActionResult {
  const balanceConfig = input.balanceConfig ?? DEFAULT_VEILSTONE_BALANCE_CONFIG
  const state = cloneState(input.state)
  assertActionAllowed(state.phase, input.action.type, balanceConfig)

  const events: VeilstoneEngineEvent[] = []
  switch (input.action.type) {
    case 'ADVANCE_PHASE':
      if (state.phase === 'FINAL_RECKONING') {
        events.push(finalizeMatch(state, balanceConfig))
      } else {
        events.push(...advancePhase(state, input.now, balanceConfig))
      }
      break
    case 'PRODUCE':
      events.push(applyProduction(state, input.actorSessionId))
      break
    case 'PLACE_PUBLIC_ORDER':
      events.push(applyPublicOrder(state, input.actorSessionId, input.action, balanceConfig))
      break
    case 'SEALED_BID_COMMIT':
      events.push(applySealedBid(state, input.actorSessionId, input.action, balanceConfig))
      break
    case 'BID_CONTRACT':
      events.push(applyContractBid(state, input.actorSessionId, input.action, balanceConfig))
      break
    case 'BUILD_STRUCTURE':
      events.push(applyBuild(state, input.actorSessionId, input.action, balanceConfig))
      break
    case 'FINALIZE_MATCH':
      if (state.phase !== 'FINAL_RECKONING') throw new Error('Final reckoning is not open')
      events.push(finalizeMatch(state, balanceConfig))
      break
    default:
      input.action satisfies never
  }

  incrementVersion(state)
  if (events.length === 0) throw new Error('Action generated no events')
  return { state, events }
}
