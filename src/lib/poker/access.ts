import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient, PokerIdentity } from '@prisma/client'
import { PokerError } from './engine'
import type { PokerAccess } from './access-types'

type Db = Prisma.TransactionClient | PrismaClient
export const ENTRY_GRANT_MS = 5 * 60_000
export const HUMAN_CHECK_MS = 2 * 60 * 60_000
export const HUMAN_CHECK_HANDS = 100
export function localHumanTestEnabled() {
  return process.env.POKER_HUMAN_CHECK_MODE === 'local-test' && process.env.NODE_ENV !== 'production' && process.env.ZCASH_NETWORK === 'testnet'
}
export function humanProvider(): Pick<PokerAccess, 'provider' | 'siteKey'> {
  if (localHumanTestEnabled()) return { provider: 'local-test', siteKey: null }
  const siteKey = process.env.TURNSTILE_SITE_KEY, secret = process.env.TURNSTILE_SECRET_KEY
  // Cloudflare's published dummy credentials cannot protect real users.
  const dummy = (s: string) => /^[123]x0{10,}/.test(s)
  return siteKey && secret && !dummy(siteKey) && !dummy(secret) && process.env.TURNSTILE_HOSTNAMES
    ? { provider: 'turnstile', siteKey } : { provider: 'unavailable', siteKey: null }
}
export async function ensureIdentity(db: Db, sessionId: string) {
  const existing = await db.pokerIdentity.findUnique({ where: { sessionId } })
  if (existing) return existing
  return db.pokerIdentity.upsert({ where: { sessionId }, create: { sessionId, nonce: randomUUID() }, update: {} })
}
export function playVerified(identity: PokerIdentity, hands: number, now = Date.now()) {
  return !!identity.humanVerifiedUntil && identity.humanVerifiedUntil.getTime() > now && !identity.recheckRequired && hands - identity.verifiedHands < HUMAN_CHECK_HANDS
}
export async function accessStatus(db: Db, sessionId: string, now = Date.now()): Promise<PokerAccess> {
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { recoveryCredential: true } })
  if (!session) throw new PokerError('Session expired.', 401)
  const identity = await ensureIdentity(db, sessionId)
  const real = !session.walletAddress.startsWith('demo_')
  const recoveryRequired = real && (!session.recoveryCredential || !identity.recoverySavedAt)
  return { identityId: identity.id, nickname: identity.nickname, recoveryRequired,
    setupComplete: !!identity.nickname && !recoveryRequired,
    entryVerified: !!identity.entryVerifiedUntil && identity.entryVerifiedUntil.getTime() > now,
    playVerified: playVerified(identity, session.pokerHandsDealt, now),
    restricted: !!identity.restrictedUntil && identity.restrictedUntil.getTime() > now,
    ...humanProvider(), nonce: identity.nonce }
}
export async function setupIdentity(db: Db, sessionId: string, nickname: string, recoverySaved: boolean) {
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { recoveryCredential: true } })
  if (!session) throw new PokerError('Session expired.', 401)
  const identity = await ensureIdentity(db, sessionId)
  const real = !session.walletAddress.startsWith('demo_')
  if (real && (!session.recoveryCredential || !recoverySaved)) throw new PokerError('Create and save your wallet recovery key before setting up poker.', 403)
  if (identity.nickname && identity.nickname !== nickname) throw new PokerError('Your poker nickname stays the same across tables and brands.', 409)
  const updated = await db.pokerIdentity.updateMany({ where: { id: identity.id, nickname: identity.nickname }, data: { nickname, recoverySavedAt: real ? new Date() : null } })
  if (updated.count !== 1) throw new PokerError('Your identity changed. Refresh and try again.', 409)
}
/** Enforced inside the buy-in/deal transaction, never by the client alone. */
export async function requirePokerAccess(db: Db, sessionId: string, entry: boolean, now = Date.now()) {
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { pokerIdentity: true, recoveryCredential: true } })
  const identity = session?.pokerIdentity
  if (!session || !identity?.nickname) throw new PokerError('Set up your poker identity before taking a seat.', 403)
  if (!session.walletAddress.startsWith('demo_') && (!session.recoveryCredential || !identity.recoverySavedAt)) throw new PokerError('Save your wallet recovery key before playing poker.', 403)
  if (identity.restrictedUntil && identity.restrictedUntil.getTime() > now) throw new PokerError('New poker hands are restricted for this identity. You can still leave and return your stack.', 403)
  if (!playVerified(identity, session.pokerHandsDealt, now)) throw new PokerError('Complete the human check before the next hand.', 403)
  if (entry) {
    const used = await db.pokerIdentity.updateMany({ where: { id: identity.id, entryVerifiedUntil: { gt: new Date(now) } }, data: { entryVerifiedUntil: null } })
    if (used.count !== 1) throw new PokerError('Complete a fresh human check before taking a seat.', 403)
  }
  return identity
}
