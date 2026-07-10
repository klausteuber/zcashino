import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import {
  HOUSE_DEFINITIONS,
  MAX_PUBLIC_START_ZATS,
  MIN_PUBLIC_START_ZATS,
  PLAYER_COUNT,
  PLAYER_WORKING_CAPITAL_ZATS,
  VEILSTONE_ENGINE_VERSION,
  applyVeilstoneAction,
  assertLedgerMovesBalanced,
  assertMatchPoolConserved,
  assertNoNegativeAccounts,
  createInitialVeilstoneState,
  getPlayerSnapshot,
  getPublicSnapshot,
  getReplaySnapshot,
  makeEventHash,
  parseZats,
  toZatsString,
  type StartMatchSeat,
  type VeilstoneAction,
  type VeilstoneEngineEvent,
  type VeilstoneState,
} from '@/lib/veilstone/engine'

export class VeilstoneConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VeilstoneConflictError'
  }
}

export class VeilstoneValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VeilstoneValidationError'
  }
}

export function serializeBigInts<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => (
    typeof entry === 'bigint' ? entry.toString() : entry
  ))) as T
}

function parseState(stateJson: string): VeilstoneState {
  return JSON.parse(stateJson) as VeilstoneState
}

function stringifyState(state: VeilstoneState): string {
  return JSON.stringify(state)
}

function defaultDisplayName(seatIndex: number, isBot: boolean) {
  return isBot ? `AI House ${seatIndex + 1}` : `House ${seatIndex + 1}`
}

function defaultHouseId(seatIndex: number) {
  return HOUSE_DEFINITIONS[seatIndex % HOUSE_DEFINITIONS.length]?.id ?? HOUSE_DEFINITIONS[0].id
}

function normalizeStartingSplit(publicStartZats?: string) {
  const publicStart = publicStartZats ? parseZats(publicStartZats) : 35_000_000n
  if (publicStart < MIN_PUBLIC_START_ZATS || publicStart > MAX_PUBLIC_START_ZATS) {
    throw new VeilstoneValidationError(
      `Public Treasury must start between ${MIN_PUBLIC_START_ZATS} and ${MAX_PUBLIC_START_ZATS} zatoshis`
    )
  }
  return {
    publicStartZats: publicStart.toString(),
    shieldedStartZats: (PLAYER_WORKING_CAPITAL_ZATS - publicStart).toString(),
  }
}

async function appendEngineEvents(
  tx: Prisma.TransactionClient,
  input: {
    matchId: string
    stateVersion: bigint
    actorSessionId?: string
    clientActionId?: string
    events: VeilstoneEngineEvent[]
  }
) {
  const lastEvent = await tx.veilstoneEvent.findFirst({
    where: { matchId: input.matchId },
    orderBy: { sequence: 'desc' },
  })

  let sequence = lastEvent ? BigInt(lastEvent.sequence) + 1n : 1n
  let prevEventHash = lastEvent?.eventHash ?? null

  for (let index = 0; index < input.events.length; index += 1) {
    const engineEvent = input.events[index]
    const payloadJson = JSON.stringify(engineEvent.payload)
    const eventHash = makeEventHash({
      matchId: input.matchId,
      sequence: sequence.toString(),
      type: engineEvent.type,
      payload: engineEvent.payload,
      prevEventHash,
    })

    const event = await tx.veilstoneEvent.create({
      data: {
        matchId: input.matchId,
        sequence,
        stateVersion: input.stateVersion,
        type: engineEvent.type,
        visibility: engineEvent.visibility,
        actorSessionId: engineEvent.actorSessionId ?? input.actorSessionId,
        clientActionId: index === 0 ? input.clientActionId : null,
        payloadJson,
        eventHash,
        prevEventHash,
      },
    })

    const ledgerMoves = engineEvent.ledgerMoves ?? []
    assertLedgerMovesBalanced(ledgerMoves)
    for (const move of ledgerMoves) {
      await tx.veilstoneLedgerEntry.create({
        data: {
          matchId: input.matchId,
          eventId: event.id,
          debitAccountId: move.debitAccountId,
          creditAccountId: move.creditAccountId,
          amountZats: parseZats(move.amountZats),
          reason: move.reason,
          visibility: move.visibility,
        },
      })
    }

    prevEventHash = eventHash
    sequence += 1n
  }
}

async function persistAccounts(tx: Prisma.TransactionClient, state: VeilstoneState) {
  for (const account of Object.values(state.accounts)) {
    await tx.veilstoneAccount.update({
      where: { id: account.id },
      data: { balanceZats: parseZats(account.balanceZats) },
    })
  }
}

export async function listVeilstoneTables() {
  const tables = await prisma.veilstoneTable.findMany({
    where: { status: { in: ['waiting', 'active', 'completed'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      seats: { orderBy: { seatIndex: 'asc' } },
      match: true,
    },
  })

  return serializeBigInts(tables)
}

export async function createVeilstoneTable(createdById: string) {
  const table = await prisma.veilstoneTable.create({
    data: {
      createdById,
    },
    include: { seats: true, match: true },
  })
  return serializeBigInts(table)
}

export async function seatVeilstoneTable(input: {
  tableId: string
  sessionId: string
  seatIndex?: number
  asBot?: boolean
  houseId?: string
  displayName?: string
}) {
  return prisma.$transaction(async (tx) => {
    const table = await tx.veilstoneTable.findUnique({
      where: { id: input.tableId },
      include: { seats: true, match: true },
    })
    if (!table) throw new VeilstoneValidationError('Table not found')
    if (table.status !== 'waiting') throw new VeilstoneValidationError('Table is not accepting seats')

    const occupied = new Set(table.seats.map((seat) => seat.seatIndex))
    const seatIndex = input.seatIndex ?? [0, 1, 2, 3].find((index) => !occupied.has(index))
    if (seatIndex === undefined || seatIndex < 0 || seatIndex >= PLAYER_COUNT) {
      throw new VeilstoneValidationError('No open seat is available')
    }
    if (occupied.has(seatIndex)) throw new VeilstoneValidationError('Seat is already occupied')

    const sessionId = input.asBot ? `bot:${input.tableId}:${seatIndex}:${randomUUID().slice(0, 8)}` : input.sessionId
    const split = normalizeStartingSplit()

    await tx.veilstoneSeat.create({
      data: {
        tableId: input.tableId,
        sessionId,
        seatIndex,
        status: input.asBot ? 'ready' : 'seated',
        houseId: input.houseId ?? defaultHouseId(seatIndex),
        displayName: input.displayName ?? defaultDisplayName(seatIndex, !!input.asBot),
        isBot: !!input.asBot,
        publicStartZats: parseZats(split.publicStartZats),
        shieldedStartZats: parseZats(split.shieldedStartZats),
        readyAt: input.asBot ? new Date() : null,
      },
    })

    return serializeBigInts(await tx.veilstoneTable.findUnique({
      where: { id: input.tableId },
      include: { seats: { orderBy: { seatIndex: 'asc' } }, match: true },
    }))
  })
}

async function startMatchIfReady(tx: Prisma.TransactionClient, tableId: string) {
  const table = await tx.veilstoneTable.findUnique({
    where: { id: tableId },
    include: {
      seats: { orderBy: { seatIndex: 'asc' } },
      match: true,
    },
  })
  if (!table) throw new VeilstoneValidationError('Table not found')
  if (table.match) return table.match
  if (table.seats.length !== PLAYER_COUNT || table.seats.some((seat) => seat.status !== 'ready')) {
    return null
  }

  const matchId = randomUUID()
  const now = new Date()
  const seats: StartMatchSeat[] = table.seats.map((seat) => ({
    seatId: seat.id,
    sessionId: seat.sessionId,
    seatIndex: seat.seatIndex,
    displayName: seat.displayName ?? defaultDisplayName(seat.seatIndex, seat.isBot),
    houseId: seat.houseId ?? defaultHouseId(seat.seatIndex),
    isBot: seat.isBot,
    publicStartZats: toZatsString(seat.publicStartZats?.toString() ?? '35000000'),
    shieldedStartZats: toZatsString(seat.shieldedStartZats?.toString() ?? '35000000'),
  }))

  const { state, events } = createInitialVeilstoneState({
    matchId,
    tableId,
    seats,
    now,
  })
  assertMatchPoolConserved(state)
  assertNoNegativeAccounts(state)

  const match = await tx.veilstoneMatch.create({
    data: {
      id: matchId,
      tableId,
      status: 'active',
      epoch: state.epoch,
      phase: state.phase,
      stateVersion: parseZats(state.stateVersion),
      stateJson: stringifyState(state),
      engineVersion: VEILSTONE_ENGINE_VERSION,
      startedAt: now,
    },
  })

  await tx.veilstoneAccount.createMany({
    data: Object.values(state.accounts).map((account) => ({
      id: account.id,
      matchId,
      ownerType: account.ownerType,
      ownerId: account.ownerId,
      accountType: account.accountType,
      balanceZats: parseZats(account.balanceZats),
    })),
  })

  await tx.veilstoneContract.createMany({
    data: state.contracts.map((contract) => ({
      id: contract.id,
      matchId,
      epoch: contract.epoch,
      type: contract.type,
      status: contract.status,
      requirementsJson: JSON.stringify({ resources: ['data', 'talent'], minTrust: 0 }),
      payoutRuleJson: JSON.stringify({ type: 'fixed_terminal_mvp_zero' }),
    })),
  })

  await appendEngineEvents(tx, {
    matchId,
    stateVersion: 0n,
    events,
  })

  await tx.veilstoneTable.update({
    where: { id: tableId },
    data: { status: 'active' },
  })

  return match
}

export async function readyVeilstoneSeat(input: {
  tableId: string
  sessionId: string
  publicStartZats?: string
  houseId?: string
}) {
  return prisma.$transaction(async (tx) => {
    const split = normalizeStartingSplit(input.publicStartZats)
    const seat = await tx.veilstoneSeat.findFirst({
      where: { tableId: input.tableId, sessionId: input.sessionId },
    })
    if (!seat) throw new VeilstoneValidationError('Seat not found')

    await tx.veilstoneSeat.update({
      where: { id: seat.id },
      data: {
        status: 'ready',
        houseId: input.houseId ?? seat.houseId,
        publicStartZats: parseZats(split.publicStartZats),
        shieldedStartZats: parseZats(split.shieldedStartZats),
        readyAt: new Date(),
      },
    })

    const match = await startMatchIfReady(tx, input.tableId)
    const table = await tx.veilstoneTable.findUnique({
      where: { id: input.tableId },
      include: { seats: { orderBy: { seatIndex: 'asc' } }, match: true },
    })

    return serializeBigInts({ table, match })
  })
}

export async function getVeilstoneTable(tableId: string) {
  const table = await prisma.veilstoneTable.findUnique({
    where: { id: tableId },
    include: { seats: { orderBy: { seatIndex: 'asc' } }, match: true },
  })
  if (!table) throw new VeilstoneValidationError('Table not found')
  return serializeBigInts(table)
}

export async function getVeilstoneSnapshot(matchId: string, viewerSessionId?: string) {
  const match = await prisma.veilstoneMatch.findUnique({ where: { id: matchId } })
  if (!match) throw new VeilstoneValidationError('Match not found')
  const state = parseState(match.stateJson)
  return {
    matchId,
    stateVersion: match.stateVersion.toString(),
    epoch: match.epoch,
    phase: match.phase,
    serverTime: new Date().toISOString(),
    phaseEndsAt: state.phaseEndsAt,
    playerView: viewerSessionId ? getPlayerSnapshot(state, viewerSessionId) : getPublicSnapshot(state),
  }
}

export async function applyVeilstoneMatchAction(input: {
  matchId: string
  actorSessionId: string
  clientActionId: string
  expectedStateVersion: string
  action: VeilstoneAction
}) {
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.veilstoneEvent.findUnique({
      where: {
        matchId_clientActionId: {
          matchId: input.matchId,
          clientActionId: input.clientActionId,
        },
      },
    })
    if (duplicate) {
      const duplicateMatch = await tx.veilstoneMatch.findUnique({ where: { id: input.matchId } })
      if (!duplicateMatch) throw new VeilstoneValidationError('Match not found')
      const duplicateState = parseState(duplicateMatch.stateJson)
      return {
        duplicate: true,
        snapshot: {
          matchId: input.matchId,
          stateVersion: duplicateMatch.stateVersion.toString(),
          epoch: duplicateMatch.epoch,
          phase: duplicateMatch.phase,
          serverTime: new Date().toISOString(),
          phaseEndsAt: duplicateState.phaseEndsAt,
          playerView: getPlayerSnapshot(duplicateState, input.actorSessionId),
        },
      }
    }

    const match = await tx.veilstoneMatch.findUnique({ where: { id: input.matchId } })
    if (!match) throw new VeilstoneValidationError('Match not found')
    if (match.status !== 'active') throw new VeilstoneValidationError('Match is not active')
    if (match.stateVersion.toString() !== input.expectedStateVersion) {
      throw new VeilstoneConflictError('State version is stale. Refresh the match snapshot and retry.')
    }

    const state = parseState(match.stateJson)
    const result = applyVeilstoneAction({
      state,
      actorSessionId: input.actorSessionId,
      action: input.action,
      now: new Date(),
    })
    assertMatchPoolConserved(result.state)
    assertNoNegativeAccounts(result.state)

    const updated = await tx.veilstoneMatch.updateMany({
      where: {
        id: input.matchId,
        stateVersion: parseZats(input.expectedStateVersion),
      },
      data: {
        status: result.state.phase === 'MATCH_COMPLETE' ? 'complete' : 'active',
        epoch: result.state.epoch,
        phase: result.state.phase,
        stateVersion: parseZats(result.state.stateVersion),
        stateJson: stringifyState(result.state),
        finalHash: result.state.finalLedgerHash,
        completedAt: result.state.phase === 'MATCH_COMPLETE' ? new Date() : null,
      },
    })
    if (updated.count !== 1) {
      throw new VeilstoneConflictError('Match state changed while applying action.')
    }

    await persistAccounts(tx, result.state)
    await appendEngineEvents(tx, {
      matchId: input.matchId,
      stateVersion: parseZats(result.state.stateVersion),
      actorSessionId: input.actorSessionId,
      clientActionId: input.clientActionId,
      events: result.events,
    })

    return {
      duplicate: false,
      snapshot: {
        matchId: input.matchId,
        stateVersion: result.state.stateVersion,
        epoch: result.state.epoch,
        phase: result.state.phase,
        serverTime: new Date().toISOString(),
        phaseEndsAt: result.state.phaseEndsAt,
        playerView: getPlayerSnapshot(result.state, input.actorSessionId),
      },
      events: result.events,
    }
  })
}

export async function getVeilstoneEvents(matchId: string, afterEventId?: string | null) {
  const after = afterEventId
    ? await prisma.veilstoneEvent.findUnique({ where: { id: afterEventId } })
    : null
  const events = await prisma.veilstoneEvent.findMany({
    where: {
      matchId,
      ...(after ? { sequence: { gt: after.sequence } } : {}),
    },
    orderBy: { sequence: 'asc' },
    take: 100,
  })

  return serializeBigInts(events.map((event) => ({
    eventId: event.id,
    stateVersion: event.stateVersion,
    type: event.type,
    visibility: event.visibility,
    actorSessionId: event.actorSessionId,
    payload: JSON.parse(event.payloadJson),
    createdAt: event.createdAt,
  })))
}

export async function getVeilstoneReplay(matchId: string) {
  const match = await prisma.veilstoneMatch.findUnique({ where: { id: matchId } })
  if (!match) throw new VeilstoneValidationError('Match not found')
  const state = parseState(match.stateJson)
  const events = await getVeilstoneEvents(matchId)

  return {
    matchId,
    stateVersion: match.stateVersion.toString(),
    finalHash: match.finalHash,
    replay: getReplaySnapshot(state),
    events,
  }
}
