import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import prisma from '../src/lib/db'
import { hashPassword } from '../src/lib/admin/rbac'

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim() || 'admin'
  const password = process.env.ADMIN_PASSWORD?.trim()
  if (!password || password.length < 12) throw new Error('Set ADMIN_PASSWORD to at least 12 characters')

  // Never reset an existing account, its MFA, or a deliberate deactivation.
  if (await prisma.adminUser.count({ where: { username: { not: 'telegram-bot' } } }) === 0) {
    await prisma.adminUser.create({ data: {
      username, passwordHash: await hashPassword(password), role: 'super_admin', createdBy: 'bootstrap-cli',
    } })
    console.log('Initial administrator created. Enable MFA after signing in.')
  } else {
    console.log('Administrator already initialized; credentials were not changed.')
  }

  if (process.argv.includes('--telegram')) {
    await prisma.adminUser.upsert({
      where: { username: 'telegram-bot' },
      update: {},
      create: {
        username: 'telegram-bot', passwordHash: await hashPassword(randomBytes(48).toString('hex')),
        role: 'super_admin', createdBy: 'bootstrap-cli',
      },
    })
    console.log('Telegram service account provisioned; existing permissions/status preserved.')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Bootstrap failed')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
