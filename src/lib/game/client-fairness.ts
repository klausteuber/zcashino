export interface FairnessRevealBundle {
  mode: 'session_nonce_v1'
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  lastNonceUsed: number | null
  txHash: string
  blockHeight: number | null
  blockTimestamp: string | Date | null
}

/**
 * Generate a browser-controlled client seed with a cryptographically secure RNG.
 * Failing closed keeps the fairness contribution honest on unsupported browsers.
 */
export function generateClientSeedHex(bytes: number = 16): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random generation is not available in this browser')
  }

  const random = new Uint8Array(bytes)
  cryptoApi.getRandomValues(random)
  return Array.from(random, value => value.toString(16).padStart(2, '0')).join('')
}
