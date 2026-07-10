import {
  PLAYER_WORKING_CAPITAL_ZATS,
  TOTAL_POOL_ZATS,
  applyVeilstoneAction,
  assertLedgerMovesBalanced,
  assertMatchPoolConserved,
  assertNoNegativeAccounts,
  createInitialVeilstoneState,
  getPhaseConfig,
  parseZats,
  type VeilstoneAction,
  type VeilstoneActionType,
  type VeilstonePlayerState,
  type VeilstoneState,
} from '@/lib/veilstone/engine'

export type VeilstoneBotStrategy =
  | 'random-legal'
  | 'public-market'
  | 'shielded-bid'
  | 'hoarder'
  | 'contract-only'
  | 'passive'

export interface VeilstoneSimulationResult {
  state: VeilstoneState
  steps: number
  actionsAccepted: number
  strategies: Record<string, VeilstoneBotStrategy>
}

function makeRng(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function makeSimulationState(seed: number) {
  const publicStarts = [28_000_000n, 35_000_000n, 42_000_000n, 49_000_000n]
  return createInitialVeilstoneState({
    matchId: `sim-match-${seed}`,
    tableId: `sim-table-${seed}`,
    now: new Date('2026-05-16T12:00:00.000Z'),
    seats: [0, 1, 2, 3].map((seatIndex) => {
      const publicStart = publicStarts[seatIndex]
      return {
        seatId: `sim-seat-${seed}-${seatIndex}`,
        sessionId: `sim-player-${seatIndex}`,
        seatIndex,
        displayName: `Sim Player ${seatIndex + 1}`,
        houseId: 'glass-ledger-republic',
        isBot: true,
        publicStartZats: publicStart.toString(),
        shieldedStartZats: (PLAYER_WORKING_CAPITAL_ZATS - publicStart).toString(),
      }
    }),
  }).state
}

function firstOpenContractId(state: VeilstoneState): string | null {
  return state.contracts.find((contract) => contract.status === 'open')?.id ?? null
}

function canAfford(player: VeilstonePlayerState, amountZats: string, wallet: 'publicZats' | 'shieldedZats') {
  return parseZats(player[wallet]) >= parseZats(amountZats)
}

function buildActionForPlayer(
  state: VeilstoneState,
  player: VeilstonePlayerState,
  strategy: VeilstoneBotStrategy,
  random: () => number
): VeilstoneAction | null {
  const allowed = new Set<VeilstoneActionType>(getPhaseConfig(state.phase).allowedActions)

  if (allowed.has('PRODUCE') && strategy !== 'passive') {
    return player.producedEpochs.includes(state.epoch) ? null : { type: 'PRODUCE', payload: {} }
  }

  if (allowed.has('PLACE_PUBLIC_ORDER')) {
    if (strategy === 'passive' || strategy === 'hoarder' || strategy === 'contract-only') return null
    if (strategy === 'public-market' || strategy === 'random-legal') {
      const sell = player.resources.energy > 0 && random() > 0.45
      return {
        type: 'PLACE_PUBLIC_ORDER',
        payload: {
          resource: 'energy',
          side: sell ? 'sell' : 'buy',
          quantity: 1,
          priceZats: '250000',
        },
      }
    }
  }

  if (allowed.has('SEALED_BID_COMMIT') || allowed.has('BID_CONTRACT')) {
    if (strategy === 'passive' || strategy === 'hoarder') return null
    const contractId = firstOpenContractId(state)
    if (!contractId) return null

    if (
      allowed.has('SEALED_BID_COMMIT')
      && (strategy === 'shielded-bid' || (strategy === 'random-legal' && random() > 0.5))
      && player.resources.data > 0
      && canAfford(player, '500000', 'shieldedZats')
    ) {
      return {
        type: 'SEALED_BID_COMMIT',
        payload: {
          contractId,
          amountZats: '500000',
          dataSpent: 1,
          nonce: `sim-${state.stateVersion}-${player.seatIndex}`,
        },
      }
    }

    if (
      allowed.has('BID_CONTRACT')
      && (strategy === 'contract-only' || strategy === 'public-market' || strategy === 'random-legal')
      && canAfford(player, '500000', 'publicZats')
    ) {
      return {
        type: 'BID_CONTRACT',
        payload: {
          contractId,
          amountZats: '500000',
        },
      }
    }
  }

  if (allowed.has('BUILD_STRUCTURE')) {
    if (strategy === 'passive' || player.resources.materials < 1 || player.resources.talent < 1) return null
    const buildOrder = strategy === 'public-market'
      ? ['MARKET_EXCHANGE', 'ENERGY_GRID', 'DATA_TRUST'] as const
      : strategy === 'shielded-bid'
        ? ['DATA_TRUST', 'ENERGY_GRID', 'MARKET_EXCHANGE'] as const
        : ['ENERGY_GRID', 'DATA_TRUST', 'MARKET_EXCHANGE'] as const
    const structureType = buildOrder.find((entry) => !player.builtStructures.includes(entry))
    if (!structureType) return null
    return { type: 'BUILD_STRUCTURE', payload: { structureType } }
  }

  return null
}

function assertSimulationInvariants(state: VeilstoneState) {
  assertMatchPoolConserved(state)
  assertNoNegativeAccounts(state)
}

export function simulateVeilstoneMatch(input: {
  seed?: number
  strategies?: VeilstoneBotStrategy[]
  maxSteps?: number
} = {}): VeilstoneSimulationResult {
  const seed = input.seed ?? 1
  const random = makeRng(seed)
  const strategyList = input.strategies ?? [
    'random-legal',
    'public-market',
    'shielded-bid',
    'contract-only',
  ]
  const strategies: Record<string, VeilstoneBotStrategy> = {}
  let state = makeSimulationState(seed)
  let steps = 0
  let actionsAccepted = 0
  const maxSteps = input.maxSteps ?? 240

  for (const player of Object.values(state.players)) {
    strategies[player.sessionId] = strategyList[player.seatIndex % strategyList.length] ?? 'passive'
  }

  assertSimulationInvariants(state)

  while (state.phase !== 'MATCH_COMPLETE' && steps < maxSteps) {
    steps += 1
    const phaseBeforePlayerActions = state.phase
    const players = Object.values(state.players).sort((a, b) => a.seatIndex - b.seatIndex)

    for (const player of players) {
      const action = buildActionForPlayer(state, player, strategies[player.sessionId], random)
      if (!action) continue
      try {
        const result = applyVeilstoneAction({
          state,
          actorSessionId: player.sessionId,
          action,
          now: new Date(Date.UTC(2026, 4, 16, 12, 0, steps)),
        })
        for (const event of result.events) {
          assertLedgerMovesBalanced(event.ledgerMoves ?? [])
        }
        state = result.state
        actionsAccepted += 1
        assertSimulationInvariants(state)
      } catch {
        // Bot simulations intentionally try edge-adjacent legal intents. A
        // rejected intent is fine as long as the state invariants still hold.
        assertSimulationInvariants(state)
      }
    }

    const allowed = getPhaseConfig(state.phase).allowedActions
    if (state.phase === phaseBeforePlayerActions && allowed.includes('ADVANCE_PHASE')) {
      const result = applyVeilstoneAction({
        state,
        actorSessionId: players[0].sessionId,
        action: { type: 'ADVANCE_PHASE', payload: {} },
        now: new Date(Date.UTC(2026, 4, 16, 12, 0, steps + 1)),
      })
      for (const event of result.events) {
        assertLedgerMovesBalanced(event.ledgerMoves ?? [])
      }
      state = result.state
      actionsAccepted += 1
      assertSimulationInvariants(state)
    }
  }

  if (state.phase !== 'MATCH_COMPLETE') {
    throw new Error(`Simulation did not complete within ${maxSteps} steps; stopped at ${state.phase}`)
  }

  const payoutTotal = Object.values(state.players).reduce(
    (sum, player) => sum + parseZats(player.payoutZats ?? '0'),
    0n
  )
  if (payoutTotal !== TOTAL_POOL_ZATS) {
    throw new Error(`Final payout invariant failed: ${payoutTotal} !== ${TOTAL_POOL_ZATS}`)
  }

  return {
    state,
    steps,
    actionsAccepted,
    strategies,
  }
}
