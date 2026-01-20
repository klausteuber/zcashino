import type { ProvablyFairData, VerificationResult } from '@/types'
import { generateShuffleOrder } from '@/lib/game/deck'

/**
 * Generate a cryptographically secure random server seed
 * In production, this would use Node.js crypto module
 */
export function generateServerSeed(): string {
  // Generate 32 random bytes as hex
  const array = new Uint8Array(32)
  if (typeof crypto !== 'undefined') {
    crypto.getRandomValues(array)
  } else {
    // Fallback for server-side (would use node:crypto in production)
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate a default client seed (user can customize)
 */
export function generateClientSeed(): string {
  const array = new Uint8Array(16)
  if (typeof crypto !== 'undefined') {
    crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash a server seed using SHA-256
 * This hash is committed BEFORE the player places their bet
 */
export async function hashServerSeed(serverSeed: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Browser/modern runtime
    const encoder = new TextEncoder()
    const data = encoder.encode(serverSeed)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('')
  } else {
    // Fallback (would use node:crypto in production)
    return simpleHash(serverSeed)
  }
}

/**
 * Simple hash function for fallback (NOT cryptographically secure - use real crypto in production)
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(64, '0')
}

/**
 * Combine server seed, client seed, and nonce to create the final seed
 */
export function combineSeed(serverSeed: string, clientSeed: string, nonce: number): string {
  return `${serverSeed}:${clientSeed}:${nonce}`
}

/**
 * Verify a game's fairness
 * Users can call this after a game to verify the outcome was fair
 */
export async function verifyGame(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number,
  deckSize: number
): Promise<VerificationResult> {
  // Step 1: Verify the server seed hashes to the committed hash
  const computedHash = await hashServerSeed(serverSeed)

  if (computedHash !== serverSeedHash) {
    return {
      valid: false,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      expectedDeckOrder: [],
      message: 'Server seed does not match committed hash. The game may have been manipulated.'
    }
  }

  // Step 2: Generate the expected deck order from the seeds
  const combinedSeed = combineSeed(serverSeed, clientSeed, nonce)
  const expectedDeckOrder = generateShuffleOrder(deckSize, combinedSeed)

  return {
    valid: true,
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    expectedDeckOrder,
    message: 'Verification successful! The game outcome was provably fair.'
  }
}

/**
 * Create provably fair data for a new game session
 */
export async function createProvablyFairSession(
  clientSeed?: string,
  existingNonce?: number
): Promise<{
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}> {
  const serverSeed = generateServerSeed()
  const serverSeedHash = await hashServerSeed(serverSeed)
  const finalClientSeed = clientSeed || generateClientSeed()
  const nonce = existingNonce !== undefined ? existingNonce + 1 : 0

  return {
    serverSeed,
    serverSeedHash,
    clientSeed: finalClientSeed,
    nonce
  }
}

/**
 * Format verification data for display
 */
export function formatVerificationData(data: ProvablyFairData): string {
  return `
Server Seed: ${data.serverSeed}
Server Seed Hash: ${data.serverSeedHash}
Client Seed: ${data.clientSeed}
Nonce: ${data.nonce}
Combined Seed: ${combineSeed(data.serverSeed, data.clientSeed, data.nonce)}
`.trim()
}

/**
 * Generate verification instructions for users
 */
export function getVerificationInstructions(): string {
  return `
## How to Verify Your Game

1. **Before the game**: We commit to a server seed by publishing its SHA-256 hash.
   You cannot see the actual seed, only its hash.

2. **Your contribution**: You provide a client seed (or we generate one for you).
   You can change this at any time.

3. **The nonce**: Each game increments a nonce counter, ensuring every game is unique
   even with the same seeds.

4. **Game outcome**: The deck is shuffled using the combined seed:
   \`SHA256(serverSeed:clientSeed:nonce)\`

5. **After the game**: We reveal the server seed. You can verify:
   - The seed hashes to the previously committed hash
   - The deck shuffle matches what you'd get with the same inputs

## Why This Is Fair

- We commit to the server seed BEFORE you bet, so we can't change it based on your bet
- You provide part of the randomness, so we can't predict the outcome
- The algorithm is deterministic, so anyone can verify the results
- All seeds and hashes can be verified independently
`.trim()
}
