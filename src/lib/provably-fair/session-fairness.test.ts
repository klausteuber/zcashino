import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const seedCreatedAt = new Date('2026-02-16T00:00:00Z')
  const assignedAt = new Date('2026-02-16T00:01:00Z')

  const seed = {
    id: 'seed-1',
    seed: 'server-seed-1',
    seedHash: 'seed-hash-1',
    txHash: 'tx-hash-1',
    blockHeight: 123,
    blockTimestamp: new Date('2026-02-16T00:02:00Z'),
    status: 'assigned',
    assignedAt,
    revealedAt: null,
    createdAt: seedCreatedAt,
  }

  let nextNonce = 0

  const buildState = () => ({
    sessionId: 'session-1',
    seedId: seed.id,
    clientSeed: 'client-seed-1',
    nextNonce,
    fairnessVersion: 'hmac_sha256_v1',
    createdAt: new Date('2026-02-16T00:03:00Z'),
    updatedAt: new Date('2026-02-16T00:04:00Z'),
    seed,
  })

  const txClient = {
    sessionFairnessState: {
      findUnique: vi.fn(async () => buildState()),
      update: vi.fn(async () => {
        // Force event-loop interleaving so Promise.all requests overlap.
        await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 3)))
        nextNonce += 1
        return buildState()
      }),
      delete: vi.fn(),
      create: vi.fn(),
    },
    fairnessSeed: {
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  }

  const prismaMock = {
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
  }

  return {
    prismaMock,
    txClient,
    resetNonce: () => {
      nextNonce = 0
    },
    readNonce: () => nextNonce,
  }
})

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

import { allocateNonce } from './session-fairness'

async function startBlackjackHand() {
  return allocateNonce('session-1')
}

async function startVideoPokerHand() {
  return allocateNonce('session-1')
}

describe('session fairness shared nonce concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resetNonce()
  })

  it('allocates unique nonces when blackjack and video poker start in parallel', async () => {
    const [blackjack, videoPoker] = await Promise.all([
      startBlackjackHand(),
      startVideoPokerHand(),
    ])

    const sortedNonces = [blackjack.nonce, videoPoker.nonce].sort((a, b) => a - b)

    expect(sortedNonces).toEqual([0, 1])
    expect(blackjack.seedId).toBe(videoPoker.seedId)
    expect(mocks.readNonce()).toBe(2)
  })

  it('keeps a gap-free nonce sequence under parallel mixed-game load', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) => (
        index % 2 === 0 ? startBlackjackHand() : startVideoPokerHand()
      ))
    )

    const nonces = results.map((result) => result.nonce).sort((a, b) => a - b)

    expect(nonces).toEqual(Array.from({ length: 20 }, (_, index) => index))
    expect(results.every((result) => result.fairnessVersion === 'hmac_sha256_v1')).toBe(true)
    expect(mocks.readNonce()).toBe(20)
  })
})
