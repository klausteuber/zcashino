import type { ProvablyFairData, VerificationResult } from '@/types'
import { generateShuffleOrder } from '@/lib/game/deck'
import { randomBytes, createHash } from 'node:crypto'

/**
 * Generate a cryptographically secure random server seed (32 bytes as hex)
 */
export function generateServerSeed(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Generate a default client seed (user can customize)
 */
export function generateClientSeed(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Hash a server seed using SHA-256
 * This hash is committed BEFORE the player places their bet
 */
export async function hashServerSeed(serverSeed: string): Promise<string> {
  return createHash('sha256').update(serverSeed).digest('hex')
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
