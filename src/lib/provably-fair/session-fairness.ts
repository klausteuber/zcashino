import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { HMAC_FAIRNESS_VERSION, normalizeFairnessVersion } from '@/lib/game/shuffle'
import { commitServerSeedHash } from '@/lib/provably-fair/blockchain'
import { generateClientSeed, generateServerSeed, hashServerSeed } from '@/lib/provably-fair'
import { DEFAULT_NETWORK } from '@/lib/wallet'
import type { ZcashNetwork } from '@/types'
import { SESSION_NONCE_MODE } from '@/lib/provably-fair/mode'

const FAIRNESS_SEED_STATUS = {
  AVAILABLE: 'available',
  ASSIGNED: 'assigned',
  REVEALED: 'revealed',
  EXPIRED: 'expired',
} as const

const ON_DEMAND_SEED_CREATE_DEFAULT = true

type TransactionClient = Prisma.TransactionClient

type SeedWithState = {
  id: string
  seed: string
  seedHash: string
  txHash: string
  blockHeight: number | null
  blockTimestamp: Date | null
  status: string
  assignedAt: Date | null
  revealedAt: Date | null
  createdAt: Date
}

type SessionFairnessStateWithSeed = {
  sessionId: string
  seedId: string
  clientSeed: string
  nextNonce: number
  fairnessVersion: string
  createdAt: Date
  updatedAt: Date
  seed: SeedWithState
}

export class ClientSeedLockedError extends Error {
  constructor() {
    super('Client seed is locked after the first hand in a seed stream.')
    this.name = 'ClientSeedLockedError'
  }
}

export class SessionFairnessUnavailableError extends Error {
  constructor(message: string = 'No fairness seed is available for this session.') {
    super(message)
    this.name = 'SessionFairnessUnavailableError'
  }
}

export interface ActiveSessionFairnessState {
  sessionId: string
  seedId: string
  serverSeed: string
  serverSeedHash: string
  commitmentTxHash: string
  commitmentBlock: number | null
  commitmentTimestamp: Date | null
  clientSeed: string
  nextNonce: number
  fairnessVersion: string
}

export interface SessionFairnessPublicState {
  mode: typeof SESSION_NONCE_MODE
  serverSeedHash: string
  commitmentTxHash: string
  commitmentBlock: number | null
  commitmentTimestamp: Date | null
  clientSeed: string
  nextNonce: number
  canEditClientSeed: boolean
  fairnessVersion: string
}

export interface AllocatedNonceResult {
  seedId: string
  serverSeed: string
  serverSeedHash: string
  commitmentTxHash: string
  commitmentBlock: number | null
  commitmentTimestamp: Date | null
  clientSeed: string
  nonce: number
  nextNonce: number
  fairnessVersion: string
}

export interface RotateRevealBundle {
  mode: typeof SESSION_NONCE_MODE
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  lastNonceUsed: number | null
  txHash: string
  blockHeight: number | null
  blockTimestamp: Date | null
}

export interface RotateSeedResult {
  reveal: RotateRevealBundle
  active: SessionFairnessPublicState
}

export interface FairnessSeedRecord {
  id: string
  seed: string
  seedHash: string
  txHash: string
  blockHeight: number | null
  blockTimestamp: Date | null
  status: string
  assignedAt: Date | null
  revealedAt: Date | null
  createdAt: Date
}

export function shouldCreateSessionSeedOnDemand(): boolean {
  const raw = process.env.SESSION_SEED_ON_DEMAND_CREATE
  if (!raw) return ON_DEMAND_SEED_CREATE_DEFAULT
  return raw.toLowerCase() === 'true'
}

function mapState(row: SessionFairnessStateWithSeed): ActiveSessionFairnessState {
  return {
    sessionId: row.sessionId,
    seedId: row.seedId,
    serverSeed: row.seed.seed,
    serverSeedHash: row.seed.seedHash,
    commitmentTxHash: row.seed.txHash,
    commitmentBlock: row.seed.blockHeight,
    commitmentTimestamp: row.seed.blockTimestamp,
    clientSeed: row.clientSeed,
    nextNonce: row.nextNonce,
    fairnessVersion: normalizeFairnessVersion(row.fairnessVersion, HMAC_FAIRNESS_VERSION),
  }
}

function mapPublicState(row: ActiveSessionFairnessState): SessionFairnessPublicState {
  return {
    mode: SESSION_NONCE_MODE,
    serverSeedHash: row.serverSeedHash,
    commitmentTxHash: row.commitmentTxHash,
    commitmentBlock: row.commitmentBlock,
    commitmentTimestamp: row.commitmentTimestamp,
    clientSeed: row.clientSeed,
    nextNonce: row.nextNonce,
    canEditClientSeed: row.nextNonce === 0,
    fairnessVersion: row.fairnessVersion,
  }
}

async function claimOldestAvailableSeed(tx: TransactionClient): Promise<SeedWithState | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = await tx.fairnessSeed.findFirst({
      where: { status: FAIRNESS_SEED_STATUS.AVAILABLE },
      orderBy: { createdAt: 'asc' },
    })

    if (!candidate) {
      return null
    }

    const claim = await tx.fairnessSeed.updateMany({
      where: {
        id: candidate.id,
        status: FAIRNESS_SEED_STATUS.AVAILABLE,
      },
      data: {
        status: FAIRNESS_SEED_STATUS.ASSIGNED,
        assignedAt: new Date(),
      },
    })

    if (claim.count === 1) {
      return {
        ...candidate,
        status: FAIRNESS_SEED_STATUS.ASSIGNED,
        assignedAt: new Date(),
      }
    }
  }

  return null
}

async function loadCurrentState(
  tx: TransactionClient,
  sessionId: string
): Promise<SessionFairnessStateWithSeed | null> {
  return tx.sessionFairnessState.findUnique({
    where: { sessionId },
    include: {
      seed: {
        select: {
          id: true,
          seed: true,
          seedHash: true,
          txHash: true,
          blockHeight: true,
          blockTimestamp: true,
          status: true,
          assignedAt: true,
          revealedAt: true,
          createdAt: true,
        },
      },
    },
  }) as Promise<SessionFairnessStateWithSeed | null>
}

async function ensureActiveStateInTransaction(
  tx: TransactionClient,
  sessionId: string
): Promise<ActiveSessionFairnessState | null> {
  const current = await loadCurrentState(tx, sessionId)

  if (current && current.seed.status === FAIRNESS_SEED_STATUS.ASSIGNED) {
    return mapState(current)
  }

  if (current && current.seed.status !== FAIRNESS_SEED_STATUS.ASSIGNED) {
    await tx.sessionFairnessState.delete({ where: { sessionId } })
  }

  const claimedSeed = await claimOldestAvailableSeed(tx)
  if (!claimedSeed) {
    return null
  }

  const created = await tx.sessionFairnessState.create({
    data: {
      sessionId,
      seedId: claimedSeed.id,
      clientSeed: generateClientSeed(),
      nextNonce: 0,
      fairnessVersion: HMAC_FAIRNESS_VERSION,
    },
    include: {
      seed: {
        select: {
          id: true,
          seed: true,
          seedHash: true,
          txHash: true,
          blockHeight: true,
          blockTimestamp: true,
          status: true,
          assignedAt: true,
          revealedAt: true,
          createdAt: true,
        },
      },
    },
  }) as SessionFairnessStateWithSeed

  return mapState(created)
}

export async function createAnchoredFairnessSeed(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<FairnessSeedRecord | null> {
  const serverSeed = generateServerSeed()
  const serverSeedHash = await hashServerSeed(serverSeed)
  const commitment = await commitServerSeedHash(serverSeedHash, network)

  if (!commitment.success || !commitment.txHash) {
    console.error('[SessionFairness] Failed to create anchored seed commitment:', {
      network,
      seedHashPrefix: serverSeedHash.slice(0, 12),
      error: commitment.error || 'unknown',
    })
    return null
  }

  try {
    const created = await prisma.fairnessSeed.create({
      data: {
        seed: serverSeed,
        seedHash: serverSeedHash,
        txHash: commitment.txHash,
        blockHeight: commitment.blockHeight ?? null,
        blockTimestamp: commitment.blockTimestamp ?? null,
        status: FAIRNESS_SEED_STATUS.AVAILABLE,
      },
    })

    return created
  } catch (error) {
    console.error('[SessionFairness] Failed to persist anchored seed:', error)
    return null
  }
}

export async function ensureActiveFairnessState(
  sessionId: string,
  tx?: TransactionClient,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<ActiveSessionFairnessState> {
  if (tx) {
    const inTx = await ensureActiveStateInTransaction(tx, sessionId)
    if (!inTx) {
      throw new SessionFairnessUnavailableError()
    }
    return inTx
  }

  const tryAssign = async () => prisma.$transaction((txClient) => ensureActiveStateInTransaction(txClient, sessionId))

  let assigned = await tryAssign()
  if (!assigned && shouldCreateSessionSeedOnDemand()) {
    await createAnchoredFairnessSeed(network)
    assigned = await tryAssign()
  }

  if (!assigned) {
    throw new SessionFairnessUnavailableError()
  }

  return assigned
}

export async function getPublicFairnessState(
  sessionId: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<SessionFairnessPublicState> {
  const active = await ensureActiveFairnessState(sessionId, undefined, network)
  return mapPublicState(active)
}

export async function allocateNonce(
  sessionId: string,
  tx?: TransactionClient,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<AllocatedNonceResult> {
  const run = async (client: TransactionClient) => {
    await ensureActiveFairnessState(sessionId, client, network)

    const updated = await client.sessionFairnessState.update({
      where: { sessionId },
      data: {
        nextNonce: { increment: 1 },
      },
      include: {
        seed: {
          select: {
            id: true,
            seed: true,
            seedHash: true,
            txHash: true,
            blockHeight: true,
            blockTimestamp: true,
            status: true,
            assignedAt: true,
            revealedAt: true,
            createdAt: true,
          },
        },
      },
    }) as SessionFairnessStateWithSeed

    const active = mapState(updated)
    return {
      seedId: active.seedId,
      serverSeed: active.serverSeed,
      serverSeedHash: active.serverSeedHash,
      commitmentTxHash: active.commitmentTxHash,
      commitmentBlock: active.commitmentBlock,
      commitmentTimestamp: active.commitmentTimestamp,
      clientSeed: active.clientSeed,
      nonce: Math.max(0, active.nextNonce - 1),
      nextNonce: active.nextNonce,
      fairnessVersion: active.fairnessVersion,
    }
  }

  if (tx) {
    return run(tx)
  }

  return prisma.$transaction(run)
}

export async function setClientSeed(
  sessionId: string,
  clientSeed: string,
  tx?: TransactionClient,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<SessionFairnessPublicState> {
  const normalized = clientSeed.trim()
  if (!normalized || normalized.length > 128) {
    throw new Error('Client seed must be 1-128 characters long.')
  }

  const run = async (client: TransactionClient) => {
    await ensureActiveFairnessState(sessionId, client, network)

    const updated = await client.sessionFairnessState.updateMany({
      where: {
        sessionId,
        nextNonce: 0,
      },
      data: {
        clientSeed: normalized,
      },
    })

    if (updated.count === 0) {
      throw new ClientSeedLockedError()
    }

    const latest = await loadCurrentState(client, sessionId)
    if (!latest) {
      throw new SessionFairnessUnavailableError('Fairness state vanished while setting client seed.')
    }

    return mapPublicState(mapState(latest))
  }

  if (tx) {
    return run(tx)
  }

  return prisma.$transaction(run)
}

async function rotateInTransaction(
  tx: TransactionClient,
  sessionId: string,
  nextClientSeed?: string
): Promise<RotateSeedResult | null> {
  const current = await loadCurrentState(tx, sessionId)
  if (!current) {
    return null
  }

  const replacement = await claimOldestAvailableSeed(tx)
  if (!replacement) {
    return null
  }

  const now = new Date()

  await tx.fairnessSeed.updateMany({
    where: {
      id: current.seedId,
      status: FAIRNESS_SEED_STATUS.ASSIGNED,
    },
    data: {
      status: FAIRNESS_SEED_STATUS.REVEALED,
      revealedAt: now,
    },
  })

  const normalizedNextClientSeed = nextClientSeed?.trim()

  const updatedState = await tx.sessionFairnessState.update({
    where: { sessionId },
    data: {
      seedId: replacement.id,
      clientSeed: normalizedNextClientSeed && normalizedNextClientSeed.length > 0
        ? normalizedNextClientSeed.slice(0, 128)
        : current.clientSeed,
      nextNonce: 0,
      fairnessVersion: HMAC_FAIRNESS_VERSION,
    },
    include: {
      seed: {
        select: {
          id: true,
          seed: true,
          seedHash: true,
          txHash: true,
          blockHeight: true,
          blockTimestamp: true,
          status: true,
          assignedAt: true,
          revealedAt: true,
          createdAt: true,
        },
      },
    },
  }) as SessionFairnessStateWithSeed

  return {
    reveal: {
      mode: SESSION_NONCE_MODE,
      serverSeed: current.seed.seed,
      serverSeedHash: current.seed.seedHash,
      clientSeed: current.clientSeed,
      lastNonceUsed: current.nextNonce > 0 ? current.nextNonce - 1 : null,
      txHash: current.seed.txHash,
      blockHeight: current.seed.blockHeight,
      blockTimestamp: current.seed.blockTimestamp,
    },
    active: mapPublicState(mapState(updatedState)),
  }
}

export async function rotateSeed(
  sessionId: string,
  nextClientSeed?: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<RotateSeedResult> {
  await ensureActiveFairnessState(sessionId, undefined, network)

  const tryRotate = async () => prisma.$transaction((tx) => rotateInTransaction(tx, sessionId, nextClientSeed))

  let rotated = await tryRotate()
  if (!rotated && shouldCreateSessionSeedOnDemand()) {
    await createAnchoredFairnessSeed(network)
    rotated = await tryRotate()
  }

  if (!rotated) {
    throw new SessionFairnessUnavailableError('Unable to rotate seed because no replacement seed is available.')
  }

  return rotated
}

export async function getFairnessSeedById(seedId: string): Promise<FairnessSeedRecord | null> {
  return prisma.fairnessSeed.findUnique({
    where: { id: seedId },
  })
}

export async function getRevealableServerSeed(
  fairnessSeedId: string | null,
  fallbackServerSeed: string | null
): Promise<{ serverSeed: string | null; isRevealed: boolean }> {
  if (!fairnessSeedId) {
    return { serverSeed: fallbackServerSeed, isRevealed: fallbackServerSeed !== null }
  }

  const seed = await prisma.fairnessSeed.findUnique({
    where: { id: fairnessSeedId },
    select: {
      seed: true,
      status: true,
    },
  })

  if (!seed) {
    return { serverSeed: null, isRevealed: false }
  }

  const isRevealed = seed.status === FAIRNESS_SEED_STATUS.REVEALED
  return {
    serverSeed: isRevealed ? seed.seed : null,
    isRevealed,
  }
}
