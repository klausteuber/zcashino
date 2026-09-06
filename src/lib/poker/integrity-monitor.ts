import type { PrismaClient } from '@prisma/client'
import prisma from '@/lib/db'
import type { PokerState } from './types'
import { activeHand } from './engine'
import { INTEGRITY_RETENTION_MS, integrityDigest, seal, unseal } from './integrity-crypto'
import { concessionEvidence, passivityEvidence, timingEvidence, type DecisionSample, type PairHand } from './integrity-rules'
import type { DecisionContext } from './history'

async function signal(db: PrismaClient, kind: string, identityId: string, otherId: string | null, evidence: unknown, now: number) {
  return db.$transaction(async tx => {
    const id = integrityDigest('signal', `${kind}:${identityId}:${otherId || ''}:${new Date(now).toISOString().slice(0, 10)}`)
    if (await tx.pokerIntegritySignal.findUnique({ where: { id } })) return false
    await tx.pokerIntegritySignal.create({ data: { id, kind, identityId, otherId, payload: seal(evidence, id), createdAt: new Date(now), expiresAt: new Date(now + INTEGRITY_RETENTION_MS) } })
    await tx.adminAlert.create({ data: { type: 'poker_integrity', severity: kind === 'shared-network' ? 'info' : 'warning',
      title: `Poker review: ${kind.replaceAll('-', ' ')}`,
      description: 'A poker integrity indicator needs review. This does not establish cheating. No automatic ban or balance change has been applied.',
      metadata: JSON.stringify({ signalId: id, identityId, otherId, evidencePath: `/api/admin/poker/integrity?signalId=${id}` }),
    } })
    return true
  })
}
function sample(d: { id: string; handId: string; identityId: string; phase: string; action: string; source: string; elapsedMs: number | null; payload: string; hand: { variant: string } }): DecisionSample {
  return { ...d, variant: d.hand.variant, context: unseal<DecisionContext>(d.payload, d.id) }
}
/** Bounded background batches; statistical reads run outside the gameplay transaction. */
export async function analyzeHand(db: PrismaClient, handId: string, now = Date.now()) {
  const tx = db
  const hand = await tx.pokerHand.findUnique({ where: { id: handId }, include: { players: true } })
  if (!hand || !hand.completedAt || hand.analyzedAt || hand.expiresAt.getTime() <= now) return
  const payload = unseal<{ partial: boolean }>(hand.payload, hand.id)
  if (hand.mode === 'real' && !payload.partial) {
    const ids = hand.players.map(p => p.identityId)
    const observations = await tx.pokerObservation.findMany({ where: { identityId: { in: ids }, expiresAt: { gt: new Date(now) }, createdAt: { lte: hand.completedAt } }, orderBy: { createdAt: 'desc' }, take: 300 })
    const linked = new Set<string>()
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const [first, second] = [ids[a], ids[b]].sort()
      const left = observations.filter(o => o.identityId === first), right = observations.filter(o => o.identityId === second)
      const sameBrowser = left.some(l => right.some(r => r.browserKey === l.browserKey))
      const sameNetwork = left.some(l => l.networkKey && right.some(r => r.networkKey === l.networkKey))
      if (sameBrowser || sameNetwork) await signal(tx, sameBrowser ? 'shared-browser' : 'shared-network', first, second, { handIds: [hand.id], caveat: 'Two identities sharing a browser marker or network played together. Households and shared devices are legitimate explanations. Markers can be cleared; this is not proof of a single person.' }, now)
      if (sameBrowser) { linked.add(first); linked.add(second) }
    }
    for (const id of ids) {
      const rows = await tx.pokerDecision.findMany({ where: { identityId: id, hand: { variant: hand.variant, mode: 'real', completedAt: { not: null }, expiresAt: { gt: new Date(now) } } }, include: { hand: { select: { variant: true } } }, orderBy: { createdAt: 'desc' }, take: 400 })
      const samples = rows.map(sample)
      const timing = timingEvidence(samples)
      if (timing) {
        await signal(tx, 'uniform-decision-timing', id, null, timing, now)
        // A fresh check requires independent corroboration, and is throttled to once per 12h.
        if (linked.has(id)) await tx.pokerIdentity.updateMany({ where: { id, OR: [{ lastRecheckAt: null }, { lastRecheckAt: { lt: new Date(now - 12 * 60 * 60_000) } }] }, data: { recheckRequired: true, lastRecheckAt: new Date(now) } })
      }
      for (const partner of ids.filter(other => other !== id)) {
        const passive = passivityEvidence(samples, id, partner)
        if (passive) await signal(tx, 'selective-passivity', id, partner, passive, now)
        // Only one query per unordered pair; evidence is evaluated in both directions.
        if (id > partner) continue
        const shared = await tx.pokerHand.findMany({ where: { variant: hand.variant, mode: 'real', completedAt: { not: null }, expiresAt: { gt: new Date(now) }, AND: [{ players: { some: { identityId: id } } }, { players: { some: { identityId: partner } } }] }, include: { players: true, decisions: { include: { hand: { select: { variant: true } } } } }, orderBy: { completedAt: 'desc' }, take: 100 })
        const hands: PairHand[] = shared.filter(h => !unseal<{ partial: boolean }>(h.payload, h.id).partial).map(h => ({ ...h, decisions: h.decisions.map(sample) }))
        for (const [loser, winner] of [[id, partner], [partner, id]]) {
          const concessions = concessionEvidence(hands, loser, winner)
          if (concessions) await signal(tx, 'possible-chip-dumping', loser, winner, concessions, now)
        }
      }
    }
  }
  await tx.pokerHand.updateMany({ where: { id: hand.id, analyzedAt: null }, data: { analyzedAt: new Date(now) } })
}
export async function expireIntegrityData(db: PrismaClient, now = Date.now()) {
  const before = new Date(now)
  await db.$transaction(async tx => {
    const oldTables = await tx.pokerTable.findMany({ where: { updatedAt: { lt: new Date(now - INTEGRITY_RETENTION_MS) } }, take: 100 })
    for (const row of oldTables) {
      const state = JSON.parse(row.state) as PokerState
      if (activeHand(state)) continue
      state.board = []; state.deck = []; state.log = []
      for (const player of state.seats) if (player) player.cards = []
      await tx.pokerTable.updateMany({ where: { id: row.id, version: row.version }, data: { state: JSON.stringify(state), version: { increment: 1 } } })
    }
    await tx.pokerHand.deleteMany({ where: { expiresAt: { lte: before } } })
    await tx.pokerObservation.deleteMany({ where: { expiresAt: { lte: before } } })
    await tx.pokerHumanToken.deleteMany({ where: { expiresAt: { lte: before } } })
    await tx.pokerIntegritySignal.deleteMany({ where: { expiresAt: { lte: before } } })
    await tx.adminAlert.deleteMany({ where: { type: 'poker_integrity', createdAt: { lt: new Date(now - INTEGRITY_RETENTION_MS) } } })
  })
}
export async function runIntegrityBatch(db: PrismaClient = prisma) {
  const hands = await db.pokerHand.findMany({ where: { completedAt: { not: null }, analyzedAt: null, expiresAt: { gt: new Date() } }, orderBy: { completedAt: 'asc' }, take: 3, select: { id: true } })
  for (const hand of hands) await analyzeHand(db, hand.id)
}
export function startIntegrityWorker() {
  const shared = globalThis as typeof globalThis & { pokerIntegrityWorker?: ReturnType<typeof setInterval> }
  if (shared.pokerIntegrityWorker) return
  let busy = false, lastCleanup = 0
  shared.pokerIntegrityWorker = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      if (Date.now() - lastCleanup > 60 * 60_000) { await expireIntegrityData(prisma); lastCleanup = Date.now() }
      await runIntegrityBatch()
    } catch { console.error('[Poker integrity] Background analysis unavailable; retrying next batch.') }
    finally { busy = false }
  }, 10_000)
  shared.pokerIntegrityWorker.unref()
}
