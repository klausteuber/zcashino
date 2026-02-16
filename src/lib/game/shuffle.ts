import { createHmac } from 'node:crypto'
import type { Card, FairnessVersion } from '@/types'

export const LEGACY_FAIRNESS_VERSION: FairnessVersion = 'legacy_mulberry_v1'
export const HMAC_FAIRNESS_VERSION: FairnessVersion = 'hmac_sha256_v1'

export function normalizeFairnessVersion(
  value: string | null | undefined,
  fallback: FairnessVersion = LEGACY_FAIRNESS_VERSION
): FairnessVersion {
  if (value === HMAC_FAIRNESS_VERSION || value === LEGACY_FAIRNESS_VERSION) {
    return value
  }
  return fallback
}

export function getDefaultFairnessVersion(): FairnessVersion {
  return normalizeFairnessVersion(process.env.FAIRNESS_DEFAULT_VERSION, LEGACY_FAIRNESS_VERSION)
}

export function shuffleDeck(
  deck: Card[],
  seed: string,
  fairnessVersion: FairnessVersion
): Card[] {
  const order = generateShuffleOrder(deck.length, seed, fairnessVersion)
  return order.map((index) => deck[index])
}

export function generateShuffleOrder(
  deckSize: number,
  seed: string,
  fairnessVersion: FairnessVersion
): number[] {
  const indices = Array.from({ length: deckSize }, (_, i) => i)

  const drawInt = fairnessVersion === HMAC_FAIRNESS_VERSION
    ? createHmacIntGenerator(seed)
    : createLegacyIntGenerator(seed)

  for (let i = indices.length - 1; i > 0; i--) {
    const j = drawInt(i + 1)
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  return indices
}

function createLegacyIntGenerator(seed: string): (maxExclusive: number) => number {
  const random = legacySeededRandom(seed)
  return (maxExclusive: number) => Math.floor(random() * maxExclusive)
}

function legacySeededRandom(seed: string): () => number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }

  return function random() {
    let t = hash += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function createHmacIntGenerator(seed: string): (maxExclusive: number) => number {
  let counter = 0
  let buffer = Buffer.alloc(0)
  let offset = 0

  const nextByte = () => {
    if (offset >= buffer.length) {
      buffer = createHmac('sha256', seed).update(String(counter++)).digest()
      offset = 0
    }
    const value = buffer[offset]
    offset += 1
    return value
  }

  const nextUint32 = () => {
    const b0 = nextByte()
    const b1 = nextByte()
    const b2 = nextByte()
    const b3 = nextByte()
    return (((b0 << 24) >>> 0) + ((b1 << 16) >>> 0) + ((b2 << 8) >>> 0) + b3) >>> 0
  }

  return (maxExclusive: number) => {
    const range = maxExclusive >>> 0
    if (range === 0) return 0

    const limit = Math.floor(0x100000000 / range) * range
    let value = nextUint32()
    while (value >= limit) {
      value = nextUint32()
    }
    return value % range
  }
}
