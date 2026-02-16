import { describe, expect, it } from 'vitest'
import { createDeck } from './deck'
import {
  generateShuffleOrder,
  HMAC_FAIRNESS_VERSION,
  LEGACY_FAIRNESS_VERSION,
  normalizeFairnessVersion,
  shuffleDeck,
} from './shuffle'

describe('shuffle versioning', () => {
  it('normalizes known versions and falls back for unknown input', () => {
    expect(normalizeFairnessVersion(HMAC_FAIRNESS_VERSION)).toBe(HMAC_FAIRNESS_VERSION)
    expect(normalizeFairnessVersion(LEGACY_FAIRNESS_VERSION)).toBe(LEGACY_FAIRNESS_VERSION)
    expect(normalizeFairnessVersion('unknown-version')).toBe(LEGACY_FAIRNESS_VERSION)
  })
})

describe('generateShuffleOrder', () => {
  it('matches deterministic vector for hmac_sha256_v1', () => {
    const seed = 'server:client:42'
    const order = generateShuffleOrder(52, seed, HMAC_FAIRNESS_VERSION)
    expect(order.slice(0, 20)).toEqual([
      51, 3, 8, 46, 35, 50, 0, 14, 28, 17,
      18, 43, 26, 9, 48, 20, 44, 42, 11, 38,
    ])
  })

  it('matches deterministic vector for legacy_mulberry_v1', () => {
    const seed = 'server:client:42'
    const order = generateShuffleOrder(52, seed, LEGACY_FAIRNESS_VERSION)
    expect(order.slice(0, 20)).toEqual([
      16, 43, 13, 10, 35, 24, 36, 33, 42, 49,
      28, 50, 19, 2, 23, 17, 34, 1, 45, 31,
    ])
  })

  it('produces valid permutations and different orders between versions', () => {
    const seed = 'server:client:42'
    const hmacOrder = generateShuffleOrder(52, seed, HMAC_FAIRNESS_VERSION)
    const legacyOrder = generateShuffleOrder(52, seed, LEGACY_FAIRNESS_VERSION)

    expect([...hmacOrder].sort((a, b) => a - b)).toEqual([...Array(52).keys()])
    expect([...legacyOrder].sort((a, b) => a - b)).toEqual([...Array(52).keys()])
    expect(hmacOrder).not.toEqual(legacyOrder)
  })
})

describe('shuffleDeck', () => {
  it('is deterministic and non-mutating for each fairness version', () => {
    const deck = createDeck()
    const seed = 'server:client:7'
    const hmacA = shuffleDeck(deck, seed, HMAC_FAIRNESS_VERSION)
    const hmacB = shuffleDeck(deck, seed, HMAC_FAIRNESS_VERSION)
    const legacyA = shuffleDeck(deck, seed, LEGACY_FAIRNESS_VERSION)
    const legacyB = shuffleDeck(deck, seed, LEGACY_FAIRNESS_VERSION)

    expect(hmacA).toEqual(hmacB)
    expect(legacyA).toEqual(legacyB)
    expect(deck).toEqual(createDeck())
  })
})
