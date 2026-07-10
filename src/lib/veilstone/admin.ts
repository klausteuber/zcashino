import prisma from '@/lib/db'
import {
  TOTAL_POOL_ZATS,
  VEILSTONE_ENGINE_VERSION,
  parseZats,
  type VeilstoneState,
} from '@/lib/veilstone/engine'

const STUCK_PHASE_GRACE_MS = 5 * 60 * 1000

function parseStateJson(stateJson: string): VeilstoneState | null {
  try {
    return JSON.parse(stateJson) as VeilstoneState
  } catch {
    return null
  }
}

export async function getVeilstoneOperationalSummary(now = new Date()) {
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const [
    waitingTables,
    activeTables,
    activeMatches,
    completedMatches24h,
    recentEvent,
    activeMatchesWithAccounts,
  ] = await Promise.all([
    prisma.veilstoneTable.count({ where: { status: 'waiting' } }),
    prisma.veilstoneTable.count({ where: { status: 'active' } }),
    prisma.veilstoneMatch.count({ where: { status: 'active' } }),
    prisma.veilstoneMatch.count({ where: { status: 'complete', completedAt: { gte: since24h } } }),
    prisma.veilstoneEvent.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        matchId: true,
        sequence: true,
        stateVersion: true,
        type: true,
        visibility: true,
        createdAt: true,
      },
    }),
    prisma.veilstoneMatch.findMany({
      where: { status: 'active' },
      take: 50,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        tableId: true,
        phase: true,
        stateVersion: true,
        stateJson: true,
        updatedAt: true,
        accounts: {
          select: {
            balanceZats: true,
          },
        },
      },
    }),
  ])

  const stuckMatches = activeMatchesWithAccounts
    .map((match) => ({ match, state: parseStateJson(match.stateJson) }))
    .filter(({ state }) => {
      if (!state || state.phase === 'MATCH_COMPLETE') return false
      const phaseEndsAt = Date.parse(state.phaseEndsAt)
      return Number.isFinite(phaseEndsAt) && phaseEndsAt + STUCK_PHASE_GRACE_MS < now.getTime()
    })
    .map(({ match, state }) => ({
      id: match.id,
      tableId: match.tableId,
      phase: match.phase,
      stateVersion: match.stateVersion.toString(),
      phaseEndsAt: state?.phaseEndsAt ?? null,
      updatedAt: match.updatedAt.toISOString(),
    }))

  const ledgerInvariantFailures = activeMatchesWithAccounts
    .map((match) => {
      const total = match.accounts.reduce(
        (sum, account) => sum + parseZats(account.balanceZats.toString()),
        0n
      )
      return {
        id: match.id,
        tableId: match.tableId,
        phase: match.phase,
        stateVersion: match.stateVersion.toString(),
        totalZats: total.toString(),
        expectedZats: TOTAL_POOL_ZATS.toString(),
      }
    })
    .filter((entry) => entry.totalZats !== entry.expectedZats)

  return {
    engineVersion: VEILSTONE_ENGINE_VERSION,
    waitingTables,
    activeTables,
    activeMatches,
    completedMatches24h,
    stuckMatchCount: stuckMatches.length,
    stuckMatches,
    ledgerInvariantStatus: ledgerInvariantFailures.length === 0 ? 'ok' : 'failed',
    ledgerInvariantFailures,
    recentEvent: recentEvent ? {
      eventId: recentEvent.id,
      matchId: recentEvent.matchId,
      sequence: recentEvent.sequence.toString(),
      stateVersion: recentEvent.stateVersion.toString(),
      type: recentEvent.type,
      visibility: recentEvent.visibility,
      createdAt: recentEvent.createdAt.toISOString(),
    } : null,
  }
}
