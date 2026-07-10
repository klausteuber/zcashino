import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { MonteCarloResult } from './runner'

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function recordToMarkdownTable(record: Record<string, number>, label: string): string {
  const rows = Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `| ${key} | ${typeof value === 'number' && value <= 1 ? formatPercent(value) : value.toFixed(2)} |`)
  return [`| ${label} | Value |`, '| --- | ---: |', ...rows].join('\n')
}

export function simulationToCsv(result: MonteCarloResult): string {
  const headers = [
    'matchId',
    'seed',
    'winnerSeat',
    'winnerBotType',
    'finalPayoutSumZats',
    'ledgerConserved',
    'negativeBalanceCount',
    'invalidActionCount',
    'publicActions',
    'shieldedActions',
    'sealedCommitments',
    'winnerMarginZats',
    'giniFinalPayouts',
  ]
  const rows = result.matchMetrics.map((match) => [
    match.matchId,
    match.seed,
    match.winnerSeat,
    match.winnerBotType,
    match.finalPayoutSumZats,
    match.ledgerConserved,
    match.negativeBalanceCount,
    match.actions.invalidActionCount,
    match.actions.publicActions,
    match.actions.shieldedActions,
    match.actions.sealedCommitments,
    match.winnerMarginZats,
    match.giniFinalPayouts.toFixed(6),
  ].join(','))
  return [headers.join(','), ...rows].join('\n')
}

export function simulationToMarkdown(result: MonteCarloResult): string {
  const suspicious = result.aggregate.suspiciousDominantStrategies.length
    ? result.aggregate.suspiciousDominantStrategies.map((entry) => `- ${entry}`).join('\n')
    : '- No strategy crossed the 50% mixed-table dominance flag.'

  return [
    '# Veilstone Simulation Report',
    '',
    `Command: \`${result.command}\``,
    `Seed: \`${result.seed}\``,
    `Match count: \`${result.matches}\``,
    `Bot lineup: \`${result.lineup.join(', ')}\``,
    '',
    '## Invariants',
    '',
    `- Invariant failure matches: ${result.aggregate.invariantFailureCount}`,
    `- Average public actions per match: ${result.aggregate.averagePublicActionsPerMatch.toFixed(2)}`,
    `- Average shielded actions per match: ${result.aggregate.averageShieldedActionsPerMatch.toFixed(2)}`,
    `- Average final payout Gini: ${result.aggregate.averageGiniFinalPayouts.toFixed(4)}`,
    '',
    '## Win Rates By Bot',
    '',
    recordToMarkdownTable(result.aggregate.winRateByBot, 'Bot'),
    '',
    '## Win Rates By Seat',
    '',
    recordToMarkdownTable(result.aggregate.winRateBySeat, 'Seat'),
    '',
    '## ROI By Bot',
    '',
    recordToMarkdownTable(result.aggregate.averageRoiByBot, 'Bot'),
    '',
    '## Comebacks And Leaders',
    '',
    `- Comeback rate from 3rd/4th after Epoch 2: ${formatPercent(result.aggregate.comebackRateFromThirdOrFourthAfterEpoch2)}`,
    `- Median winner margin: ${result.aggregate.medianWinnerMarginZats.toFixed(0)} zats`,
    '',
    recordToMarkdownTable(result.aggregate.epochLeaderConversionRates, 'Epoch'),
    '',
    '## Crisis Distribution',
    '',
    recordToMarkdownTable(result.aggregate.crisisFrequency, 'Crisis'),
    '',
    '## Suspicious Dominance',
    '',
    suspicious,
    '',
    '## Recommended Follow-Ups',
    '',
    '- Treat the top-ranked configs as candidates, not final balance.',
    '- Compare bot red flags against human playtest notes before changing defaults.',
    '- Add richer contract-resolution rules before tuning contract payout multipliers.',
    '',
  ].join('\n')
}

export async function writeSimulationArtifacts(result: MonteCarloResult, outBase: string): Promise<void> {
  const directory = path.dirname(outBase)
  await mkdir(directory, { recursive: true })
  await Promise.all([
    writeFile(`${outBase}.json`, JSON.stringify(result, null, 2)),
    writeFile(`${outBase}.csv`, simulationToCsv(result)),
    writeFile(`${outBase}.md`, simulationToMarkdown(result)),
  ])
}
