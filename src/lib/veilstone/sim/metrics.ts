import {
  DEFAULT_VEILSTONE_BALANCE_CONFIG,
  parseZats,
  type VeilstoneBalanceConfig,
  type VeilstoneEngineEvent,
  type VeilstoneResource,
  type VeilstoneState,
} from '../engine'
import type { VeilstoneBotArchetype } from './bots'

export interface PlayerScore {
  sessionId: string
  seatIndex: number
  botType: VeilstoneBotArchetype
  scoreZats: string
  rank: number
}

export interface MatchActionMetrics {
  publicActions: number
  shieldedActions: number
  sealedCommitments: number
  contractsCompleted: number
  contractsFailed: number
  dataSpentForecasting: number
  dataSpentShielding: number
  dataSpentAudits: number
  invalidActionCount: number
  stuckPhaseCount: number
}

export interface VeilstoneMatchMetrics {
  matchId: string
  seed: number
  lineup: VeilstoneBotArchetype[]
  steps: number
  actionsAccepted: number
  finalPayouts: Array<{
    sessionId: string
    seatIndex: number
    botType: VeilstoneBotArchetype
    payoutZats: string
    trust: number
    prestige: number
  }>
  winnerSeat: number
  winnerBotType: VeilstoneBotArchetype
  finalPayoutSumZats: string
  negativeBalanceCount: number
  ledgerConserved: boolean
  invariantFailures: string[]
  actions: MatchActionMetrics
  crisisFrequency: Record<string, number>
  leaderByEpoch: Record<string, PlayerScore | null>
  rankingsByEpoch: Record<string, PlayerScore[]>
  comebackFromThirdOrFourthAfterEpoch2: boolean
  winnerMarginZats: string
  giniFinalPayouts: number
  terminalTrustPrestigeCorrelation: number
}

export interface SimulationAggregateMetrics {
  matches: number
  invariantFailureCount: number
  winRateByBot: Record<string, number>
  winRateBySeat: Record<string, number>
  averageRoiByBot: Record<string, number>
  payoutStandardDeviationZats: number
  medianWinnerMarginZats: number
  averageGiniFinalPayouts: number
  comebackRateFromThirdOrFourthAfterEpoch2: number
  epochLeaderConversionRates: Record<string, number>
  crisisFrequency: Record<string, number>
  averageShieldedActionsPerMatch: number
  averagePublicActionsPerMatch: number
  averageTrustPrestigeCorrelation: number
  suspiciousDominantStrategies: string[]
}

export function calculateGini(values: Array<number | bigint | string>): number {
  if (values.length === 0) return 0
  const sorted = values.map((value) => Number(value)).sort((a, b) => a - b)
  const total = sorted.reduce((sum, value) => sum + value, 0)
  if (total === 0) return 0
  const weighted = sorted.reduce((sum, value, index) => sum + ((index + 1) * value), 0)
  return ((2 * weighted) / (sorted.length * total)) - ((sorted.length + 1) / sorted.length)
}

export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export function pearsonCorrelation(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length < 2) return 0
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length
  let numerator = 0
  let leftVariance = 0
  let rightVariance = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean
    const rightDelta = right[index] - rightMean
    numerator += leftDelta * rightDelta
    leftVariance += leftDelta ** 2
    rightVariance += rightDelta ** 2
  }
  const denominator = Math.sqrt(leftVariance * rightVariance)
  return denominator === 0 ? 0 : numerator / denominator
}

export function calculatePlayerScore(
  state: VeilstoneState,
  sessionId: string,
  botTypes: Record<string, VeilstoneBotArchetype>,
  balanceConfig: VeilstoneBalanceConfig = DEFAULT_VEILSTONE_BALANCE_CONFIG
): PlayerScore {
  const player = state.players[sessionId]
  const liquid = parseZats(player.publicZats) + parseZats(player.shieldedZats) + parseZats(player.lockedZats)
  const resourceValue = (Object.keys(player.resources) as VeilstoneResource[]).reduce((total, resource) => (
    total + (balanceConfig.terminalPricesZats[resource] * BigInt(player.resources[resource]))
  ), 0n)
  const reputationValue = BigInt(player.trust + player.prestige) * balanceConfig.reputationBonusZats
  return {
    sessionId,
    seatIndex: player.seatIndex,
    botType: botTypes[sessionId],
    scoreZats: (liquid + resourceValue + reputationValue).toString(),
    rank: 0,
  }
}

export function rankPlayers(
  state: VeilstoneState,
  botTypes: Record<string, VeilstoneBotArchetype>,
  balanceConfig: VeilstoneBalanceConfig = DEFAULT_VEILSTONE_BALANCE_CONFIG
): PlayerScore[] {
  return Object.keys(state.players)
    .map((sessionId) => calculatePlayerScore(state, sessionId, botTypes, balanceConfig))
    .sort((a, b) => Number(parseZats(b.scoreZats) - parseZats(a.scoreZats)))
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

export function countNegativeAccounts(state: VeilstoneState): number {
  return Object.values(state.accounts).filter((account) => parseZats(account.balanceZats) < 0n).length
}

export function countEventUsage(events: VeilstoneEngineEvent[]): Omit<MatchActionMetrics, 'invalidActionCount' | 'stuckPhaseCount'> {
  return events.reduce(
    (counts, event) => {
      if (event.type === 'PUBLIC_ORDER_PLACED' || event.type === 'CONTRACT_BID_PLACED' || event.type === 'STRUCTURE_BUILT') {
        counts.publicActions += 1
      }
      if (event.type === 'SEALED_BID_COMMITTED') {
        counts.shieldedActions += 1
        counts.sealedCommitments += 1
        const dataSpent = event.payload.publicAmountZats ? 0 : 0
        counts.dataSpentShielding += dataSpent
      }
      if (event.type === 'FINAL_RECKONING_COMPLETE') counts.contractsCompleted += 1
      return counts
    },
    {
      publicActions: 0,
      shieldedActions: 0,
      sealedCommitments: 0,
      contractsCompleted: 0,
      contractsFailed: 0,
      dataSpentForecasting: 0,
      dataSpentShielding: 0,
      dataSpentAudits: 0,
    }
  )
}

export function summarizeMatches(
  matches: VeilstoneMatchMetrics[],
  balanceConfig: VeilstoneBalanceConfig = DEFAULT_VEILSTONE_BALANCE_CONFIG
): SimulationAggregateMetrics {
  const winCountsByBot: Record<string, number> = {}
  const winCountsBySeat: Record<string, number> = {}
  const payoutsByBot: Record<string, bigint[]> = {}
  const crisisFrequency: Record<string, number> = {}
  const epochLeaderWins: Record<string, number> = {}
  const epochLeaderTotals: Record<string, number> = {}

  for (const match of matches) {
    winCountsByBot[match.winnerBotType] = (winCountsByBot[match.winnerBotType] ?? 0) + 1
    winCountsBySeat[String(match.winnerSeat)] = (winCountsBySeat[String(match.winnerSeat)] ?? 0) + 1
    for (const payout of match.finalPayouts) {
      payoutsByBot[payout.botType] ??= []
      payoutsByBot[payout.botType].push(parseZats(payout.payoutZats))
    }
    for (const [type, count] of Object.entries(match.crisisFrequency)) {
      crisisFrequency[type] = (crisisFrequency[type] ?? 0) + count
    }
    for (const [epoch, leader] of Object.entries(match.leaderByEpoch)) {
      if (!leader) continue
      epochLeaderTotals[epoch] = (epochLeaderTotals[epoch] ?? 0) + 1
      if (leader.seatIndex === match.winnerSeat) {
        epochLeaderWins[epoch] = (epochLeaderWins[epoch] ?? 0) + 1
      }
    }
  }

  const winRateByBot = Object.fromEntries(
    Object.entries(winCountsByBot).map(([bot, count]) => [bot, count / Math.max(1, matches.length)])
  )
  const winRateBySeat = Object.fromEntries(
    Object.entries(winCountsBySeat).map(([seat, count]) => [seat, count / Math.max(1, matches.length)])
  )
  const averageRoiByBot = Object.fromEntries(
    Object.entries(payoutsByBot).map(([bot, payouts]) => {
      const averagePayout = payouts.reduce((sum, payout) => sum + payout, 0n) / BigInt(payouts.length)
      return [bot, Number(averagePayout - balanceConfig.playerBuyInZats) / Number(balanceConfig.playerBuyInZats)]
    })
  )
  const payoutValues = matches.flatMap((match) => match.finalPayouts.map((payout) => Number(payout.payoutZats)))
  const epochLeaderConversionRates = Object.fromEntries(
    Object.entries(epochLeaderTotals).map(([epoch, total]) => [
      epoch,
      (epochLeaderWins[epoch] ?? 0) / total,
    ])
  )
  const dominant = Object.entries(winRateByBot)
    .filter(([, rate]) => rate > 0.5)
    .map(([bot, rate]) => `${bot} won ${(rate * 100).toFixed(1)}% of matches`)

  return {
    matches: matches.length,
    invariantFailureCount: matches.filter((match) => match.invariantFailures.length > 0).length,
    winRateByBot,
    winRateBySeat,
    averageRoiByBot,
    payoutStandardDeviationZats: standardDeviation(payoutValues),
    medianWinnerMarginZats: median(matches.map((match) => Number(match.winnerMarginZats))),
    averageGiniFinalPayouts: matches.reduce((sum, match) => sum + match.giniFinalPayouts, 0) / Math.max(1, matches.length),
    comebackRateFromThirdOrFourthAfterEpoch2: (
      matches.filter((match) => match.comebackFromThirdOrFourthAfterEpoch2).length / Math.max(1, matches.length)
    ),
    epochLeaderConversionRates,
    crisisFrequency,
    averageShieldedActionsPerMatch: matches.reduce((sum, match) => sum + match.actions.shieldedActions, 0) / Math.max(1, matches.length),
    averagePublicActionsPerMatch: matches.reduce((sum, match) => sum + match.actions.publicActions, 0) / Math.max(1, matches.length),
    averageTrustPrestigeCorrelation: matches.reduce((sum, match) => sum + match.terminalTrustPrestigeCorrelation, 0) / Math.max(1, matches.length),
    suspiciousDominantStrategies: dominant,
  }
}
