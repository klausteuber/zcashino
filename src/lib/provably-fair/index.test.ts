import { describe, it, expect } from 'vitest'
import {
  generateServerSeed,
  generateClientSeed,
  hashServerSeed,
  combineSeed,
  verifyGame,
  createProvablyFairSession,
  formatVerificationData,
  getVerificationInstructions,
} from './index'

const HEX_64 = /^[0-9a-f]{64}$/
const HEX_32 = /^[0-9a-f]{32}$/

describe('generateServerSeed', () => {
  it('returns 64-character hex string', () => {
    const seed = generateServerSeed()
    expect(seed).toHaveLength(64)
    expect(seed).toMatch(HEX_64)
  })

  it('successive calls return different values', () => {
    const a = generateServerSeed()
    const b = generateServerSeed()
    expect(a).not.toBe(b)
  })
})

describe('generateClientSeed', () => {
  it('returns 32-character hex string', () => {
    const seed = generateClientSeed()
    expect(seed).toHaveLength(32)
    expect(seed).toMatch(HEX_32)
  })

  it('successive calls return different values', () => {
    const a = generateClientSeed()
    const b = generateClientSeed()
    expect(a).not.toBe(b)
  })
})

describe('hashServerSeed', () => {
  it('returns 64-character hex string', async () => {
    const hash = await hashServerSeed('test-seed')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(HEX_64)
  })

  it('same input produces same hash (deterministic)', async () => {
    const a = await hashServerSeed('deterministic-test')
    const b = await hashServerSeed('deterministic-test')
    expect(a).toBe(b)
  })

  it('different inputs produce different hashes', async () => {
    const a = await hashServerSeed('seed-one')
    const b = await hashServerSeed('seed-two')
    expect(a).not.toBe(b)
  })
})

describe('combineSeed', () => {
  it('format is "server:client:nonce"', () => {
    expect(combineSeed('abc', 'def', 0)).toBe('abc:def:0')
  })

  it('handles larger nonce values', () => {
    expect(combineSeed('s', 'c', 42)).toBe('s:c:42')
  })

  it('handles empty strings', () => {
    expect(combineSeed('', '', 0)).toBe('::0')
  })
})

describe('verifyGame', () => {
  it('valid seeds return valid=true with correct deckOrder length', async () => {
    const serverSeed = 'test-server-seed-abc123'
    const hash = await hashServerSeed(serverSeed)
    const result = await verifyGame(serverSeed, hash, 'client-seed', 0, 312)

    expect(result.valid).toBe(true)
    expect(result.expectedDeckOrder).toHaveLength(312)
    expect(result.message).toContain('successful')
  })

  it('tampered seed returns valid=false', async () => {
    const realHash = await hashServerSeed('real-seed')
    const result = await verifyGame('tampered-seed', realHash, 'client', 0, 52)

    expect(result.valid).toBe(false)
    expect(result.expectedDeckOrder).toEqual([])
    expect(result.message).toContain('does not match')
  })

  it('deck order is deterministic', async () => {
    const serverSeed = 'det-seed'
    const hash = await hashServerSeed(serverSeed)
    const a = await verifyGame(serverSeed, hash, 'client', 5, 52)
    const b = await verifyGame(serverSeed, hash, 'client', 5, 52)
    expect(a.expectedDeckOrder).toEqual(b.expectedDeckOrder)
  })

  it('different nonces produce different deck orders', async () => {
    const serverSeed = 'nonce-test'
    const hash = await hashServerSeed(serverSeed)
    const a = await verifyGame(serverSeed, hash, 'client', 0, 52)
    const b = await verifyGame(serverSeed, hash, 'client', 1, 52)
    expect(a.expectedDeckOrder).not.toEqual(b.expectedDeckOrder)
  })

  it('defaults manual verification to hmac_sha256_v1', async () => {
    const serverSeed = 'default-hmac-seed'
    const hash = await hashServerSeed(serverSeed)
    const result = await verifyGame(serverSeed, hash, 'client', 2, 52)
    expect(result.fairnessVersion).toBe('hmac_sha256_v1')
  })

  it('supports legacy_mulberry_v1 replay compatibility for historical games', async () => {
    const serverSeed = 'server'
    const clientSeed = 'client'
    const nonce = 42
    const hash = await hashServerSeed(serverSeed)

    const legacy = await verifyGame(
      serverSeed,
      hash,
      clientSeed,
      nonce,
      52,
      'legacy_mulberry_v1'
    )
    const modern = await verifyGame(
      serverSeed,
      hash,
      clientSeed,
      nonce,
      52,
      'hmac_sha256_v1'
    )

    expect(legacy.valid).toBe(true)
    expect(legacy.fairnessVersion).toBe('legacy_mulberry_v1')
    expect(legacy.expectedDeckOrder.slice(0, 10)).toEqual([
      16, 43, 13, 10, 35, 24, 36, 33, 42, 49,
    ])
    expect(modern.expectedDeckOrder.slice(0, 10)).toEqual([
      51, 3, 8, 46, 35, 50, 0, 14, 28, 17,
    ])
    expect(legacy.expectedDeckOrder).not.toEqual(modern.expectedDeckOrder)
  })
})

describe('createProvablyFairSession', () => {
  it('returns all required fields', async () => {
    const session = await createProvablyFairSession()
    expect(session.serverSeed).toBeDefined()
    expect(session.serverSeedHash).toBeDefined()
    expect(session.clientSeed).toBeDefined()
    expect(typeof session.nonce).toBe('number')
  })

  it('serverSeed hashes to serverSeedHash', async () => {
    const session = await createProvablyFairSession()
    const computedHash = await hashServerSeed(session.serverSeed)
    expect(computedHash).toBe(session.serverSeedHash)
  })

  it('uses provided clientSeed when given', async () => {
    const session = await createProvablyFairSession('my-custom-seed')
    expect(session.clientSeed).toBe('my-custom-seed')
  })

  it('generates clientSeed when not provided', async () => {
    const session = await createProvablyFairSession()
    expect(session.clientSeed).toMatch(HEX_32)
  })

  it('defaults nonce to 0 when no existingNonce', async () => {
    const session = await createProvablyFairSession()
    expect(session.nonce).toBe(0)
  })

  it('increments nonce from existingNonce', async () => {
    const session = await createProvablyFairSession('seed', 5)
    expect(session.nonce).toBe(6)
  })
})

describe('formatVerificationData', () => {
  it('includes all seed values', () => {
    const output = formatVerificationData({
      serverSeed: 'ss',
      serverSeedHash: 'ssh',
      clientSeed: 'cs',
      nonce: 3,
      deckOrder: [],
    })
    expect(output).toContain('ss')
    expect(output).toContain('ssh')
    expect(output).toContain('cs')
    expect(output).toContain('3')
  })

  it('includes combined seed', () => {
    const output = formatVerificationData({
      serverSeed: 'aa',
      serverSeedHash: 'bb',
      clientSeed: 'cc',
      nonce: 1,
      deckOrder: [],
    })
    expect(output).toContain('aa:cc:1')
  })
})

describe('getVerificationInstructions', () => {
  it('returns non-empty markdown string', () => {
    const instructions = getVerificationInstructions()
    expect(instructions.length).toBeGreaterThan(100)
    expect(instructions).toContain('How to Verify')
  })
})

describe('end-to-end provably fair flow', () => {
  it('create session → verify with revealed seeds → valid', async () => {
    const session = await createProvablyFairSession()
    const result = await verifyGame(
      session.serverSeed,
      session.serverSeedHash,
      session.clientSeed,
      session.nonce,
      312 // 6-deck shoe
    )
    expect(result.valid).toBe(true)
    expect(result.expectedDeckOrder).toHaveLength(312)
  })

  it('tampered server seed fails end-to-end verification', async () => {
    const session = await createProvablyFairSession()
    const result = await verifyGame(
      'i-changed-this-seed',
      session.serverSeedHash,
      session.clientSeed,
      session.nonce,
      312
    )
    expect(result.valid).toBe(false)
  })
})
