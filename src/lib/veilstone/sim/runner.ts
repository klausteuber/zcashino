import {
  assertLedgerMovesBalanced,
  assertMatchPoolConserved,
  assertNoNegativeAccounts,
  applyVeilstoneAction,
  createInitialVeilstoneState,
  createVeilstoneBalanceConfig,
  getPhaseConfig,
  parseZats,
  type VeilstoneBalanceConfig,
  type VeilstoneBalanceConfigOverride,
  type VeilstoneEngineEvent,
  type VeilstoneState,
} from '../engine'
import { chooseVeilstoneBotAction, VEILSTONE_LINEUPS, type VeilstoneBotArchetype } from './bots'
import {
  calculateGini,
  countNegativeAccounts,
  pearsonCorrelation,
  rankPlayers,
  summarizeMatches,
  type MatchActionMetrics,
  type PlayerScore,
  type SimulationAggregateMetrics,
  type VeilstoneMatchMetrics,
} from './metrics'
import { createSeededRng } from './random'

export interface MonteCarloInput {
  matches: number
  seed: number
  lineup: string | VeilstoneBotArchetype[]
  balanceConfigOverride?: VeilstoneBalanceConfigOverride
  maxSteps?: number
}

export interface MonteCarloResult {
  command: string
  seed: number
  matches: number
  lineup: VeilstoneBotArchetype[]
  config: Record<string, unknown>
  matchMetrics: VeilstoneMatchMetrics[]
  aggregate: SimulationAggregateMetrics
}

function zatsConfigForOutput(balanceConfig: VeilstoneBalanceConfig): Record<string, unknown> {
  return {
    playerBuyInZats: balanceConfig.playerBuyInZats.toString(),
    totalPoolZats: balanceConfig.totalPoolZats.toString(),
    frontierReserveZats: balanceConfig.frontierReserveZats.toString(),
    civicDividendZats: balanceConfig.civicDividendZats.toString(),
    sealedBidDataCost: balanceConfig.sealedBidDataCost,
    reputationBonusZats: balanceConfig.reputationBonusZats.toString(),
    crisisIntensity: balanceConfig.crisisIntensity,
    terminalPricesZats: Object.fromEntries(
      Object.entries(balanceConfig.terminalPricesZats).map(([resource, value]) => [resource, value.toString()])
    ),
    buildCostsZats: Object.fromEntries(
      Object.entries(balanceConfig.buildCostsZats).map(([structure, value]) => [structure, value.toString()])
    ),
  }
}

function resolveLineup(lineup: string | VeilstoneBotArchetype[]): VeilstoneBotArchetype[] {
  if (Array.isArray(lineup)) return lineup
  const resolved = VEILSTONE_LINEUPS[lineup]
  if (!resolved) {
    throw new Error(`Unknown Veilstone lineup "${lineup}". Known lineups: ${Object.keys(VEILSTONE_LINEUPS).join(', ')}`)
  }
  return resolved
}

function publicStarts(balanceConfig: VeilstoneBalanceConfig): bigint[] {
  const seats = balanceConfig.playerCount
  const min = balanceConfig.minPublicStartZats
  const max = balanceConfig.maxPublicStartZats
  if (seats === 1) return [min]
  return Array.from({ length: seats }, (_entry, index) => (
    min + ((max - min) * BigInt(index)) / BigInt(seats - 1)
  ))
}

function makeSimulationState(input: {
  seed: number
  lineup: VeilstoneBotArchetype[]
  balanceConfig: VeilstoneBalanceConfig
}): VeilstoneState {
  const starts = publicStarts(input.balanceConfig)
  return createInitialVeilstoneState({
    matchId: `sim-match-${input.seed}`,
    tableId: `sim-table-${input.seed}`,
    now: new Date('2026-05-16T12:00:00.000Z'),
    balanceConfig: input.balanceConfig,
    seats: Array.from({ length: input.balanceConfig.playerCount }, (_entry, seatIndex) => {
      const publicStart = starts[seatIndex]
      return {
        seatId: `sim-seat-${input.seed}-${seatIndex}`,
        sessionId: `sim-player-${seatIndex}`,
        seatIndex,
        displayName: `${input.lineup[seatIndex % input.lineup.length]} ${seatIndex + 1}`,
        houseId: 'glass-ledger-republic',
        isBot: true,
        publicStartZats: publicStart.toString(),
        shieldedStartZats: (input.balanceConfig.playerWorkingCapitalZats - publicStart).toString(),
      }
    }),
  }).state
}

function crisisFrequency(state: VeilstoneState): Record<string, number> {
  return state.crises.reduce<Record<string, number>>((counts, crisis) => {
    counts[crisis.type] = (counts[crisis.type] ?? 0) + 1
    return counts
  }, {})
}

function totalPayout(state: VeilstoneState): bigint {
  return Object.values(state.players).reduce((sum, player) => sum + parseZats(player.payoutZats ?? '0'), 0n)
}

function winnerMargin(payouts: Array<{ payoutZats: string }>): string {
  const sorted = [...payouts].sort((a, b) => Number(parseZats(b.payoutZats) - parseZats(a.payoutZats)))
  if (sorted.length < 2) return '0'
  return (parseZats(sorted[0].payoutZats) - parseZats(sorted[1].payoutZats)).toString()
}

function collectActionMetrics(input: {
  events: VeilstoneEngineEvent[]
  state: VeilstoneState
  invalidActionCount: number
  stuckPhaseCount: number
}): MatchActionMetrics {
  const publicActions = input.events.filter((event) => (
    event.type === 'PUBLIC_ORDER_PLACED'
    || event.type === 'CONTRACT_BID_PLACED'
    || event.type === 'STRUCTURE_BUILT'
  )).length
  const shieldedActions = input.events.filter((event) => event.type === 'SEALED_BID_COMMITTED').length
  const dataSpentShielding = input.state.commitments.reduce((sum, commitment) => (
    sum + (commitment.reveal?.dataSpent ?? 0)
  ), 0)

  return {
    publicActions,
    shieldedActions,
    sealedCommitments: input.state.commitments.length,
    contractsCompleted: input.state.contracts.filter((contract) => contract.status === 'resolved').length,
    contractsFailed: input.state.contracts.filter((contract) => contract.status !== 'resolved').length,
    dataSpentForecasting: 0,
    dataSpentShielding,
    dataSpentAudits: 0,
    invalidActionCount: input.invalidActionCount,
    stuckPhaseCount: input.stuckPhaseCount,
  }
}

function recordEpochLeader(input: {
  rankingsByEpoch: Record<string, PlayerScore[]>
  leaderByEpoch: Record<string, PlayerScore | null>
  epoch: number
  state: VeilstoneState
  botTypes: Record<string, VeilstoneBotArchetype>
  balanceConfig: VeilstoneBalanceConfig
}) {
  const epochKey = String(input.epoch)
  if (input.rankingsByEpoch[epochKey]) return
  const rankings = rankPlayers(input.state, input.botTypes, input.balanceConfig)
  input.rankingsByEpoch[epochKey] = rankings
  input.leaderByEpoch[epochKey] = rankings[0] ?? null
}

export function simulateVeilstoneMatchForMetrics(input: {
  seed: number
  lineup: VeilstoneBotArchetype[]
  balanceConfig: VeilstoneBalanceConfig
  maxSteps?: number
}): VeilstoneMatchMetrics {
  const rng = createSeededRng(input.seed)
  const botTypes: Record<string, VeilstoneBotArchetype> = {}
  let state = makeSimulationState(input)
  let steps = 0
  let actionsAccepted = 0
  let invalidActionCount = 0
  let stuckPhaseCount = 0
  const events: VeilstoneEngineEvent[] = []
  const invariantFailures: string[] = []
  const leaderByEpoch: Record<string, PlayerScore | null> = {}
  const rankingsByEpoch: Record<string, PlayerScore[]> = {}
  const maxSteps = input.maxSteps ?? 240

  for (const player of Object.values(state.players)) {
    botTypes[player.sessionId] = input.lineup[player.seatIndex % input.lineup.length]
  }

  try {
    assertMatchPoolConserved(state, input.balanceConfig)
    assertNoNegativeAccounts(state)
  } catch (error) {
    invariantFailures.push(error instanceof Error ? error.message : String(error))
  }

  while (state.phase !== 'MATCH_COMPLETE' && steps < maxSteps) {
    steps += 1
    const phaseBeforePlayerActions = state.phase
    const epochBeforePlayerActions = state.epoch
    const players = Object.values(state.players).sort((a, b) => a.seatIndex - b.seatIndex)

    for (const player of players) {
      const action = chooseVeilstoneBotAction({
        state,
        player,
        archetype: botTypes[player.sessionId],
        rng,
        balanceConfig: input.balanceConfig,
      })
      if (!action) continue
      try {
        const result = applyVeilstoneAction({
          state,
          actorSessionId: player.sessionId,
          action,
          now: new Date(Date.UTC(2026, 4, 16, 12, 0, steps)),
          balanceConfig: input.balanceConfig,
        })
        for (const event of result.events) assertLedgerMovesBalanced(event.ledgerMoves ?? [])
        state = result.state
        events.push(...result.events)
        actionsAccepted += 1
        assertMatchPoolConserved(state, input.balanceConfig)
        assertNoNegativeAccounts(state)
      } catch (error) {
        invalidActionCount += 1
        try {
          assertMatchPoolConserved(state, input.balanceConfig)
          assertNoNegativeAccounts(state)
        } catch (invariantError) {
          invariantFailures.push(invariantError instanceof Error ? invariantError.message : String(invariantError))
        }
      }
    }

    if (phaseBeforePlayerActions.endsWith('_RESOLUTION') && state.phase !== phaseBeforePlayerActions) {
      recordEpochLeader({
        rankingsByEpoch,
        leaderByEpoch,
        epoch: epochBeforePlayerActions,
        state,
        botTypes,
        balanceConfig: input.balanceConfig,
      })
    }

    const allowed = getPhaseConfig(state.phase, input.balanceConfig).allowedActions
    if (state.phase === phaseBeforePlayerActions && allowed.includes('ADVANCE_PHASE')) {
      try {
        const result = applyVeilstoneAction({
          state,
          actorSessionId: players[0].sessionId,
          action: { type: 'ADVANCE_PHASE', payload: {} },
          now: new Date(Date.UTC(2026, 4, 16, 12, 0, steps + 1)),
          balanceConfig: input.balanceConfig,
        })
        for (const event of result.events) assertLedgerMovesBalanced(event.ledgerMoves ?? [])
        state = result.state
        events.push(...result.events)
        actionsAccepted += 1
        assertMatchPoolConserved(state, input.balanceConfig)
        assertNoNegativeAccounts(state)
        if (phaseBeforePlayerActions.endsWith('_RESOLUTION')) {
          recordEpochLeader({
            rankingsByEpoch,
            leaderByEpoch,
            epoch: epochBeforePlayerActions,
            state,
            botTypes,
            balanceConfig: input.balanceConfig,
          })
        }
      } catch (error) {
        invalidActionCount += 1
        invariantFailures.push(error instanceof Error ? error.message : String(error))
      }
    }
  }

  if (state.phase !== 'MATCH_COMPLETE') {
    stuckPhaseCount += 1
    invariantFailures.push(`Simulation did not complete within ${maxSteps} steps; stopped at ${state.phase}`)
  }

  const finalPayouts = Object.values(state.players)
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((player) => ({
      sessionId: player.sessionId,
      seatIndex: player.seatIndex,
      botType: botTypes[player.sessionId],
      payoutZats: player.payoutZats ?? '0',
      trust: player.trust,
      prestige: player.prestige,
    }))
  const winner = [...finalPayouts].sort((a, b) => Number(parseZats(b.payoutZats) - parseZats(a.payoutZats)))[0]
  const payoutSum = totalPayout(state)
  const ledgerConserved = payoutSum === input.balanceConfig.totalPoolZats
  if (!ledgerConserved) {
    invariantFailures.push(`Final payout invariant failed: ${payoutSum} !== ${input.balanceConfig.totalPoolZats}`)
  }
  const epoch2WinnerRank = rankingsByEpoch['2']?.find((entry) => entry.seatIndex === winner.seatIndex)?.rank
  const terminalCorrelation = pearsonCorrelation(
    finalPayouts.map((payout) => payout.trust + payout.prestige),
    finalPayouts.map((payout) => Number(payout.payoutZats))
  )

  return {
    matchId: state.matchId,
    seed: input.seed,
    lineup: input.lineup,
    steps,
    actionsAccepted,
    finalPayouts,
    winnerSeat: winner.seatIndex,
    winnerBotType: winner.botType,
    finalPayoutSumZats: payoutSum.toString(),
    negativeBalanceCount: countNegativeAccounts(state),
    ledgerConserved,
    invariantFailures: [...new Set(invariantFailures)],
    actions: collectActionMetrics({ events, state, invalidActionCount, stuckPhaseCount }),
    crisisFrequency: crisisFrequency(state),
    leaderByEpoch,
    rankingsByEpoch,
    comebackFromThirdOrFourthAfterEpoch2: epoch2WinnerRank !== undefined && epoch2WinnerRank >= 3,
    winnerMarginZats: winnerMargin(finalPayouts),
    giniFinalPayouts: calculateGini(finalPayouts.map((payout) => payout.payoutZats)),
    terminalTrustPrestigeCorrelation: terminalCorrelation,
  }
}

export function runVeilstoneMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const balanceConfig = createVeilstoneBalanceConfig(input.balanceConfigOverride)
  const lineup = resolveLineup(input.lineup)
  const matchMetrics: VeilstoneMatchMetrics[] = []

  for (let index = 0; index < input.matches; index += 1) {
    matchMetrics.push(simulateVeilstoneMatchForMetrics({
      seed: input.seed + index,
      lineup,
      balanceConfig,
      maxSteps: input.maxSteps,
    }))
  }

  return {
    command: `veilstone:sim --matches ${input.matches} --seed ${input.seed}`,
    seed: input.seed,
    matches: input.matches,
    lineup,
    config: zatsConfigForOutput(balanceConfig),
    matchMetrics,
    aggregate: summarizeMatches(matchMetrics, balanceConfig),
  }
}
