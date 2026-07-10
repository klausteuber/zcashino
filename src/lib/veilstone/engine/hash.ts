import { createHash } from 'node:crypto'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)

  return `{${entries.join(',')}}`
}

export function makeEventHash(input: {
  matchId: string
  sequence: string
  type: string
  payload: unknown
  prevEventHash?: string | null
}): string {
  return sha256Hex(stableStringify(input))
}

export function makeCommitmentHash(input: {
  matchId: string
  playerSessionId: string
  contractId: string
  amountZats: string
  dataSpent: number
  nonce: string
}): string {
  return sha256Hex(stableStringify(input))
}
