import { generateChallenge, validateChallenge } from 'capjs-core'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { PokerError } from './engine'
import { integrityDigest } from './integrity-crypto'

export const SECURITY_CHECK_MS = 5 * 60_000
export const SECURITY_CHALLENGE_COUNT = 20
const proofSchema = z.object({
  token: z.string().min(1).max(8192),
  solutions: z.array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)).length(SECURITY_CHALLENGE_COUNT),
}).strict()
function scope(identityId: string, nonce: string, marker: string, request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase()
  const allowed = ['21z.cash', 'www.21z.cash', 'cypherjester.com', 'www.cypherjester.com']
  const local = process.env.NODE_ENV !== 'production' && process.env.ZCASH_NETWORK === 'testnet' && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host || '')
  if (!host || (!allowed.includes(host) && !local)) throw new PokerError('Security verification is unavailable on this hostname.', 403)
  if (!identityId || !marker) throw new PokerError('Reload your poker identity before checking entry.', 403)
  return integrityDigest('cap-poker-entry-v1', JSON.stringify([identityId, nonce, marker, host]))
}
const secret = () => integrityDigest('cap-signing-key', 'v1')
export function createSecurityChallenge(identityId: string, nonce: string, marker: string, request: NextRequest) {
  return generateChallenge(secret(), {
    scope: scope(identityId, nonce, marker, request), expiresMs: SECURITY_CHECK_MS,
    challengeCount: SECURITY_CHALLENGE_COUNT, challengeSize: 32, challengeDifficulty: 4,
  })
}
export async function validateSecurityProof(token: string, identityId: string, nonce: string, marker: string, request: NextRequest) {
  let value: unknown
  try { value = JSON.parse(token) } catch { throw new PokerError('Security check expired or invalid. Please try a new check.', 403) }
  const parsed = proofSchema.safeParse(value)
  if (!parsed.success) throw new PokerError('Security check expired or invalid. Please try a new check.', 403)
  const result = await validateChallenge(secret(), parsed.data, { scope: scope(identityId, nonce, marker, request) })
  if (!result.success) throw new PokerError('Security check expired or invalid. Please try a new check.', 403)
  // Cap validation is stateless. verifyHuman atomically rotates the scoped identity
  // nonce with the entry grant, providing durable replay protection across workers.
}
