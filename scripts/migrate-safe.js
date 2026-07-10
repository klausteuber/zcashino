const { existsSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const { createClient } = require('@libsql/client')

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl?.startsWith('file:')) {
  throw new Error('Safe migration requires a local SQLite DATABASE_URL beginning with file:')
}

function runPrisma(args) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(command, ['prisma', ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Prisma command failed: prisma ${args.join(' ')}`)
  }
}

function migrationNames() {
  const migrationsDirectory = join(process.cwd(), 'prisma', 'migrations')
  return readdirSync(migrationsDirectory)
    .filter((name) => {
      const directory = join(migrationsDirectory, name)
      const migrationFile = join(directory, 'migration.sql')
      return statSync(directory).isDirectory()
        && existsSync(migrationFile)
        && statSync(migrationFile).isFile()
    })
    .sort()
}

async function tableNames() {
  const client = createClient({ url: databaseUrl })
  try {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    return result.rows.map((row) => String(row.name))
  } finally {
    client.close()
  }
}

async function main() {
  runPrisma(['validate'])

  const tables = await tableNames()
  const hasMigrationHistory = tables.includes('_prisma_migrations')

  if (hasMigrationHistory) {
    console.log('Existing Prisma migration history found; deploying pending migrations.')
    runPrisma(['migrate', 'deploy'])
    runPrisma(['migrate', 'status'])
    return
  }

  if (tables.length > 0) {
    throw new Error(
      `Refusing to migrate a non-empty database without Prisma migration history. Found tables: ${tables.join(', ')}`
    )
  }

  const migrations = migrationNames()
  if (migrations.length === 0) {
    throw new Error('No Prisma migrations were found; refusing to create an untracked database')
  }

  console.log('Empty SQLite database detected; creating the current schema and baselining legacy migrations.')
  runPrisma(['db', 'push', '--accept-data-loss'])

  for (const migration of migrations) {
    runPrisma(['migrate', 'resolve', '--applied', migration])
  }

  runPrisma(['migrate', 'deploy'])
  runPrisma(['migrate', 'status'])
  console.log(`Bootstrap complete; ${migrations.length} legacy migrations are recorded as applied.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
