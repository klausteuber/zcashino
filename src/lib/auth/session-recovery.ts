import { createHash, randomBytes } from 'crypto'

const RECOVERY_KEY_PREFIX = 'zrec_'

export function generateRecoveryKey(): string {
  return `${RECOVERY_KEY_PREFIX}${randomBytes(32).toString('hex')}`
}

export function normalizeRecoveryKey(value: string): string {
  return value.trim().toLowerCase()
}

export function hashRecoveryKey(value: string): string {
  return createHash('sha256').update(normalizeRecoveryKey(value)).digest('hex')
}

export function isLikelyRecoveryKey(value: string): boolean {
  return /^zrec_[a-f0-9]{64}$/.test(normalizeRecoveryKey(value))
}
