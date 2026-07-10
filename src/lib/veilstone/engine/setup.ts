import {
  DEFAULT_VEILSTONE_BALANCE_CONFIG,
  VEILSTONE_ENGINE_VERSION,
} from './constants'
import { calculatePhaseEndsAt } from './phase'
import type {
  StartMatchSeat,
  VeilstoneBalanceConfig,
  VeilstoneAccountState,
  VeilstoneContractState,
  VeilstoneEngineEvent,
  VeilstoneMapNode,
  VeilstoneState,
} from './types'
import { parseZats, toZatsString } from './zats'

function accountId(matchId: string, ownerId: string, accountType: string): string {
  return `${matchId}:${ownerId}:${accountType}`
}

export function createAccountId(matchId: string, ownerId: string, accountType: string): string {
  return accountId(matchId, ownerId, accountType)
}

function makeMap(seats: StartMatchSeat[]): VeilstoneMapNode[] {
  const resources: VeilstoneMapNode['resource'][] = [
    'energy',
    'compute',
    'data',
    'materials',
    'talent',
    'freeport',
    'vault',
    'audit',
  ]

  return Array.from({ length: 16 }).map((_, index) => {
    const row = Math.floor(index / 4)
    const col = index % 4
    const adjacent = [
      row > 0 ? index - 4 : null,
      row < 3 ? index + 4 : null,
      col > 0 ? index - 1 : null,
      col < 3 ? index + 1 : null,
    ]
      .filter((value): value is number => value !== null)
      .map((value) => `node-${value}`)

    return {
      id: `node-${index}`,
      resource: resources[index % resources.length],
      ownerSessionId: seats[index % seats.length]?.sessionId,
      adjacent,
    }
  })
}

export function createInitialVeilstoneState(input: {
  matchId: string
  tableId: string
  seats: StartMatchSeat[]
  now: Date
  balanceConfig?: VeilstoneBalanceConfig
}): { state: VeilstoneState; events: VeilstoneEngineEvent[] } {
  const balanceConfig = input.balanceConfig ?? DEFAULT_VEILSTONE_BALANCE_CONFIG

  if (input.seats.length !== balanceConfig.playerCount) {
    throw new Error(`Veilstone requires exactly ${balanceConfig.playerCount} seats`)
  }

  const players: VeilstoneState['players'] = {}
  const accounts: Record<string, VeilstoneAccountState> = {}

  for (const seat of input.seats) {
    const publicStart = parseZats(seat.publicStartZats)
    const shieldedStart = parseZats(seat.shieldedStartZats)
    if (publicStart + shieldedStart !== balanceConfig.playerWorkingCapitalZats) {
      throw new Error(`Seat ${seat.seatIndex} starting split does not equal working capital`)
    }

    players[seat.sessionId] = {
      sessionId: seat.sessionId,
      seatId: seat.seatId,
      seatIndex: seat.seatIndex,
      displayName: seat.displayName,
      houseId: seat.houseId,
      isBot: seat.isBot,
      publicZats: seat.publicStartZats,
      shieldedZats: seat.shieldedStartZats,
      lockedZats: '0',
      resources: {
        energy: 2 + seat.seatIndex,
        compute: 1,
        data: 2,
        materials: 2,
        talent: 1,
      },
      trust: 5,
      prestige: 1,
      producedEpochs: [],
      builtStructures: [],
      commitmentIds: [],
    }

    accounts[accountId(input.matchId, seat.sessionId, 'PLAYER_PUBLIC')] = {
      id: accountId(input.matchId, seat.sessionId, 'PLAYER_PUBLIC'),
      ownerType: 'player',
      ownerId: seat.sessionId,
      accountType: 'PLAYER_PUBLIC',
      balanceZats: seat.publicStartZats,
    }
    accounts[accountId(input.matchId, seat.sessionId, 'PLAYER_SHIELDED')] = {
      id: accountId(input.matchId, seat.sessionId, 'PLAYER_SHIELDED'),
      ownerType: 'player',
      ownerId: seat.sessionId,
      accountType: 'PLAYER_SHIELDED',
      balanceZats: seat.shieldedStartZats,
    }
    accounts[accountId(input.matchId, seat.sessionId, 'PLAYER_LOCKED')] = {
      id: accountId(input.matchId, seat.sessionId, 'PLAYER_LOCKED'),
      ownerType: 'player',
      ownerId: seat.sessionId,
      accountType: 'PLAYER_LOCKED',
      balanceZats: '0',
    }
  }

  accounts[accountId(input.matchId, 'frontier-reserve', 'FRONTIER_RESERVE')] = {
    id: accountId(input.matchId, 'frontier-reserve', 'FRONTIER_RESERVE'),
    ownerType: 'reserve',
    ownerId: 'frontier-reserve',
    accountType: 'FRONTIER_RESERVE',
    balanceZats: toZatsString(balanceConfig.frontierReserveZats),
  }
  accounts[accountId(input.matchId, 'civic-dividend', 'CIVIC_DIVIDEND')] = {
    id: accountId(input.matchId, 'civic-dividend', 'CIVIC_DIVIDEND'),
    ownerType: 'dividend',
    ownerId: 'civic-dividend',
    accountType: 'CIVIC_DIVIDEND',
    balanceZats: toZatsString(balanceConfig.civicDividendZats),
  }
  accounts[accountId(input.matchId, 'market', 'MARKET_ESCROW')] = {
    id: accountId(input.matchId, 'market', 'MARKET_ESCROW'),
    ownerType: 'market',
    ownerId: 'market',
    accountType: 'MARKET_ESCROW',
    balanceZats: '0',
  }
  accounts[accountId(input.matchId, 'contract', 'CONTRACT_ESCROW')] = {
    id: accountId(input.matchId, 'contract', 'CONTRACT_ESCROW'),
    ownerType: 'contract',
    ownerId: 'contract',
    accountType: 'CONTRACT_ESCROW',
    balanceZats: '0',
  }

  const contracts: VeilstoneContractState[] = [
    {
      id: `${input.matchId}:open-model-commons`,
      epoch: 1,
      type: 'OPEN_MODEL_COMMONS',
      status: 'open',
      publicStakeZats: '0',
      shieldedStakeZats: '0',
    },
  ]

  const phase = 'EPOCH_1_FORECAST'
  const state: VeilstoneState = {
    engineVersion: VEILSTONE_ENGINE_VERSION,
    matchId: input.matchId,
    tableId: input.tableId,
    epoch: 1,
    phase,
    stateVersion: '0',
    phaseEndsAt: calculatePhaseEndsAt(phase, input.now, balanceConfig),
    players,
    accounts,
    map: makeMap(input.seats),
    orders: [],
    contracts,
    commitments: [],
    crises: [],
  }

  return {
    state,
    events: [
      {
        type: 'MATCH_STARTED',
        visibility: 'public',
        payload: {
          tableId: input.tableId,
          playerCount: input.seats.length,
          phase,
        },
      },
    ],
  }
}
