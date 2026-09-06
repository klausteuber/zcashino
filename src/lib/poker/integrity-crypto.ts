import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { PokerError } from './engine'

export const INTEGRITY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
function key() {
  const secret = process.env.POKER_INTEGRITY_SECRET || process.env.PLAYER_SESSION_SECRET
  if (!secret || secret.length < 32) throw new PokerError('Poker integrity storage is not configured. New hands are paused.', 503)
  return createHmac('sha256', secret).update('poker-integrity-v1').digest()
}
export function integrityDigest(purpose: string, value: string) { return createHmac('sha256', key()).update(`${purpose}:${value}`).digest('hex') }
export function seal(value: unknown, context: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(context))
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}
export function unseal<T>(value: string, context: string): T {
  const [version, iv, tag, data] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid integrity record')
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString()) as T
}
