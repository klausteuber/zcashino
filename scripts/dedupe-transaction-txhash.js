#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const apply = process.argv.includes('--apply')

  const duplicates = await prisma.$queryRawUnsafe(`
    SELECT
      sessionId,
      type,
      txHash,
      COUNT(*) AS dupCount
    FROM "Transaction"
    WHERE txHash IS NOT NULL
    GROUP BY sessionId, type, txHash
    HAVING COUNT(*) > 1
    ORDER BY dupCount DESC
  `)

  if (!duplicates.length) {
    console.log('[dedupe] No duplicate (sessionId, type, txHash) groups found.')
    return
  }

  console.log(`[dedupe] Found ${duplicates.length} duplicate groups.`)
  if (!apply) {
    console.log('[dedupe] Dry run only. Re-run with --apply to delete duplicates.')
  }

  let totalRowsDeleted = 0

  for (const group of duplicates) {
    const rows = await prisma.transaction.findMany({
      where: {
        sessionId: group.sessionId,
        type: group.type,
        txHash: group.txHash,
      },
      orderBy: [
        { status: 'desc' }, // keep confirmed over pending when possible
        { createdAt: 'asc' },
      ],
      select: { id: true, status: true, createdAt: true },
    })

    const keep = rows[0]
    const remove = rows.slice(1)

    console.log(
      `[dedupe] ${group.sessionId} ${group.type} ${group.txHash} -> keep ${keep.id}, remove ${remove.length}`
    )

    if (apply && remove.length > 0) {
      const result = await prisma.transaction.deleteMany({
        where: {
          id: { in: remove.map((r) => r.id) },
        },
      })
      totalRowsDeleted += result.count
    }
  }

  if (apply) {
    console.log(`[dedupe] Completed. Deleted ${totalRowsDeleted} duplicate rows.`)
  }
}

main()
  .catch((err) => {
    console.error('[dedupe] Failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
