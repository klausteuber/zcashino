// Test-only solver using the public Cap format-1 wire protocol. No secret or bypass.
import { createHash } from 'node:crypto'
export function solveSecurityChallenge(challenge: { token: string; challenge: { c: number; s: number; d: number } }) {
  const prng = (seed: string, length: number) => {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24) }
    let result = ''
    while (result.length < length) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; result += h.toString(16).padStart(8, '0') }
    return result.slice(0, length)
  }
  const solutions = Array.from({ length: challenge.challenge.c }, (_, i) => {
    const salt = prng(`${challenge.token}${i + 1}`, challenge.challenge.s), target = prng(`${challenge.token}${i + 1}d`, challenge.challenge.d)
    for (let n = 0; n < 50_000_000; n++) if (createHash('sha256').update(salt + n).digest('hex').startsWith(target)) return n
    throw new Error('Test solver exceeded bound')
  })
  return JSON.stringify({ token: challenge.token, solutions })
}
