import prisma from '@/lib/db'
import { parseZats, type VeilstoneState } from '@/lib/veilstone/engine'

export const VEILSTONE_PLAYTEST_EVENT_NAMES = [
  'playtest_mode_opened',
  'phase_changed',
  'first_meaningful_action',
  'action_submitted',
  'action_succeeded',
  'action_failed',
  'invalid_action_attempted',
  'feedback_opened',
  'feedback_submitted',
  'replay_opened',
  'rematch_clicked',
] as const

export type VeilstonePlaytestEventName = (typeof VEILSTONE_PLAYTEST_EVENT_NAMES)[number]

export interface VeilstonePlaytestEventInput {
  matchId: string
  sessionId?: string
  seatIndex?: number
  eventName: VeilstonePlaytestEventName
  phase?: string
  stateVersion?: string
  metadata?: Record<string, unknown>
  occurredAt?: Date
}

export interface VeilstonePlaytestFeedbackInput {
  matchId: string
  sessionId: string
  seatIndex?: number
  understoodGoal: number
  decisionsMattered: number
  understoodOutcome: number
  shieldedFeltFair: number
  trustPrestigeMattered: number
  feltSkillful: number
  wouldPlayAgain: number
  mostExcitingMoment?: string
  mostConfusingMoment?: string
  oneThingToChange?: string
}

function serializeBigInts<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => (
    typeof entry === 'bigint' ? entry.toString() : entry
  ))) as T
}

function parseStateJson(stateJson: string): VeilstoneState {
  return JSON.parse(stateJson) as VeilstoneState
}

function countBy<T extends string>(entries: T[]): Record<T, number> {
  return entries.reduce<Record<T, number>>((counts, entry) => {
    counts[entry] = (counts[entry] ?? 0) + 1
    return counts
  }, {} as Record<T, number>)
}

export async function logVeilstonePlaytestEvent(input: VeilstonePlaytestEventInput) {
  const event = await prisma.veilstonePlaytestEvent.create({
    data: {
      matchId: input.matchId,
      sessionId: input.sessionId,
      seatIndex: input.seatIndex,
      eventName: input.eventName,
      phase: input.phase,
      stateVersion: input.stateVersion ? parseZats(input.stateVersion) : null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      occurredAt: input.occurredAt ?? new Date(),
    },
  })
  return serializeBigInts(event)
}

export async function upsertVeilstonePlaytestFeedback(input: VeilstonePlaytestFeedbackInput) {
  const feedback = await prisma.veilstonePlaytestFeedback.upsert({
    where: {
      matchId_sessionId: {
        matchId: input.matchId,
        sessionId: input.sessionId,
      },
    },
    create: input,
    update: {
      seatIndex: input.seatIndex,
      understoodGoal: input.understoodGoal,
      decisionsMattered: input.decisionsMattered,
      understoodOutcome: input.understoodOutcome,
      shieldedFeltFair: input.shieldedFeltFair,
      trustPrestigeMattered: input.trustPrestigeMattered,
      feltSkillful: input.feltSkillful,
      wouldPlayAgain: input.wouldPlayAgain,
      mostExcitingMoment: input.mostExcitingMoment,
      mostConfusingMoment: input.mostConfusingMoment,
      oneThingToChange: input.oneThingToChange,
    },
  })
  return serializeBigInts(feedback)
}

export async function getVeilstonePlaytestExport(matchId: string) {
  const [match, engineEvents, playtestEvents, feedback] = await Promise.all([
    prisma.veilstoneMatch.findUnique({
      where: { id: matchId },
      include: {
        table: {
          include: { seats: { orderBy: { seatIndex: 'asc' } } },
        },
      },
    }),
    prisma.veilstoneEvent.findMany({
      where: { matchId },
      orderBy: { sequence: 'asc' },
    }),
    prisma.veilstonePlaytestEvent.findMany({
      where: { matchId },
      orderBy: { occurredAt: 'asc' },
    }),
    prisma.veilstonePlaytestFeedback.findMany({
      where: { matchId },
      orderBy: { seatIndex: 'asc' },
    }),
  ])

  if (!match) throw new Error('Match not found')

  const state = parseStateJson(match.stateJson)
  const finalPayouts = Object.values(state.players)
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((player) => ({
      sessionId: player.sessionId,
      seatIndex: player.seatIndex,
      displayName: player.displayName,
      payoutZats: player.payoutZats ?? '0',
      trust: player.trust,
      prestige: player.prestige,
    }))

  const actionTimeline = engineEvents.map((event) => ({
    eventId: event.id,
    sequence: event.sequence.toString(),
    stateVersion: event.stateVersion.toString(),
    type: event.type,
    visibility: event.visibility,
    actorSessionId: event.actorSessionId,
    payload: JSON.parse(event.payloadJson),
    createdAt: event.createdAt.toISOString(),
  }))
  const playtestTimeline = playtestEvents.map((event) => ({
    id: event.id,
    eventName: event.eventName,
    sessionId: event.sessionId,
    seatIndex: event.seatIndex,
    phase: event.phase,
    stateVersion: event.stateVersion?.toString() ?? null,
    metadata: event.metadataJson ? JSON.parse(event.metadataJson) : null,
    occurredAt: event.occurredAt.toISOString(),
  }))
  const feedbackResponses = feedback.map((entry) => ({
    id: entry.id,
    sessionId: entry.sessionId,
    seatIndex: entry.seatIndex,
    ratings: {
      understoodGoal: entry.understoodGoal,
      decisionsMattered: entry.decisionsMattered,
      understoodOutcome: entry.understoodOutcome,
      shieldedFeltFair: entry.shieldedFeltFair,
      trustPrestigeMattered: entry.trustPrestigeMattered,
      feltSkillful: entry.feltSkillful,
      wouldPlayAgain: entry.wouldPlayAgain,
    },
    text: {
      mostExcitingMoment: entry.mostExcitingMoment,
      mostConfusingMoment: entry.mostConfusingMoment,
      oneThingToChange: entry.oneThingToChange,
    },
    updatedAt: entry.updatedAt.toISOString(),
  }))

  const publicActionTypes = new Set(['PUBLIC_ORDER_PLACED', 'CONTRACT_BID_PLACED', 'STRUCTURE_BUILT'])
  const telemetrySummary = {
    playtestEventCounts: countBy(playtestEvents.map((event) => event.eventName)),
    engineEventCounts: countBy(engineEvents.map((event) => event.type)),
    invalidActionAttempts: playtestEvents.filter((event) => event.eventName === 'invalid_action_attempted').length,
    publicActions: engineEvents.filter((event) => publicActionTypes.has(event.type)).length,
    shieldedActions: engineEvents.filter((event) => event.type === 'SEALED_BID_COMMITTED').length,
    contractInteractions: engineEvents.filter((event) => event.type === 'CONTRACT_BID_PLACED' || event.type === 'SEALED_BID_COMMITTED').length,
    marketInteractions: engineEvents.filter((event) => event.type === 'PUBLIC_ORDER_PLACED').length,
    feedbackCount: feedbackResponses.length,
  }

  return {
    match: {
      id: match.id,
      tableId: match.tableId,
      status: match.status,
      phase: match.phase,
      epoch: match.epoch,
      stateVersion: match.stateVersion.toString(),
      startedAt: match.startedAt?.toISOString() ?? null,
      completedAt: match.completedAt?.toISOString() ?? null,
      finalHash: match.finalHash,
      replayPath: `/veilstone/replay/${match.id}`,
    },
    seats: match.table.seats.map((seat) => ({
      seatIndex: seat.seatIndex,
      sessionId: seat.sessionId,
      displayName: seat.displayName,
      isBot: seat.isBot,
      status: seat.status,
    })),
    finalPayouts,
    actionTimeline,
    playtestTimeline,
    feedbackResponses,
    replayHash: match.finalHash,
    telemetrySummary,
    recommendedFollowUps: buildRecommendedFollowUps(telemetrySummary, feedbackResponses),
  }
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function buildRecommendedFollowUps(
  telemetrySummary: { invalidActionAttempts: number; feedbackCount: number; shieldedActions: number },
  feedbackResponses: Array<{ ratings: { wouldPlayAgain: number; shieldedFeltFair: number; understoodOutcome: number } }>
): string[] {
  const followUps: string[] = []
  if (telemetrySummary.invalidActionAttempts > 4) followUps.push('Review action affordances and phase-specific disabled states.')
  if (telemetrySummary.shieldedActions === 0) followUps.push('Investigate whether shielded actions are too hidden, too costly, or poorly explained.')
  if (feedbackResponses.length === 0) followUps.push('Collect post-match survey responses before making balance decisions.')
  if (average(feedbackResponses.map((entry) => entry.ratings.wouldPlayAgain)) < 5.5) {
    followUps.push('Prioritize replay desire: inspect losing-player comments and dead-air moments.')
  }
  if (average(feedbackResponses.map((entry) => entry.ratings.shieldedFeltFair)) < 5) {
    followUps.push('Tune shielded-action visibility so suspense does not feel arbitrary.')
  }
  if (average(feedbackResponses.map((entry) => entry.ratings.understoodOutcome)) < 5) {
    followUps.push('Improve final reckoning explanation and replay payout trail.')
  }
  return followUps.length ? followUps : ['No obvious playtest telemetry red flags; compare against observer notes.']
}

export function formatVeilstonePlaytestMarkdown(report: Awaited<ReturnType<typeof getVeilstonePlaytestExport>>): string {
  return [
    '# Veilstone Playtest Export',
    '',
    `Match: \`${report.match.id}\``,
    `Table: \`${report.match.tableId}\``,
    `Status: \`${report.match.status}\``,
    `Replay hash: \`${report.replayHash ?? 'pending'}\``,
    '',
    '## Final Payouts',
    '',
    '| Seat | Player | Payout | Trust | Prestige |',
    '| ---: | --- | ---: | ---: | ---: |',
    ...report.finalPayouts.map((player) => (
      `| ${player.seatIndex + 1} | ${player.displayName} | ${player.payoutZats} | ${player.trust} | ${player.prestige} |`
    )),
    '',
    '## Telemetry Summary',
    '',
    `- Public actions: ${report.telemetrySummary.publicActions}`,
    `- Shielded actions: ${report.telemetrySummary.shieldedActions}`,
    `- Invalid action attempts: ${report.telemetrySummary.invalidActionAttempts}`,
    `- Feedback responses: ${report.telemetrySummary.feedbackCount}`,
    '',
    '## Feedback',
    '',
    report.feedbackResponses.length
      ? report.feedbackResponses.map((entry) => (
        `- Seat ${(entry.seatIndex ?? 0) + 1}: play again ${entry.ratings.wouldPlayAgain}/7; exciting: ${entry.text.mostExcitingMoment ?? 'n/a'}`
      )).join('\n')
      : '- No feedback responses recorded.',
    '',
    '## Recommended Follow-Ups',
    '',
    ...report.recommendedFollowUps.map((entry) => `- ${entry}`),
    '',
  ].join('\n')
}
