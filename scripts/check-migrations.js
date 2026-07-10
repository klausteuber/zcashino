const { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs')
const { join, relative } = require('node:path')
const { spawnSync } = require('node:child_process')
const { createClient } = require('@libsql/client')

// Prisma resolves SQLite file URLs from the project root. Keeping the isolated
// database under that root avoids platform-specific absolute-path handling.
const temporaryDirectory = mkdtempSync(join(process.cwd(), '.migration-check-'))
const databasePath = join(temporaryDirectory, 'bootstrap-check.db')
const unsafeDatabasePath = join(temporaryDirectory, 'unbaselined-check.db')
writeFileSync(databasePath, '')
writeFileSync(unsafeDatabasePath, '')
const environment = {
  ...process.env,
  DATABASE_URL: `file:./${relative(process.cwd(), databasePath)}`,
}

function runNodeScript(script, env, stdio = 'inherit') {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env,
    stdio,
    encoding: stdio === 'pipe' ? 'utf8' : undefined,
  })

  if (result.error) throw result.error
  return result
}

function expectedMigrationNames() {
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

async function verifyBaseline() {
  const client = createClient({ url: environment.DATABASE_URL })
  try {
    const result = await client.execute(
      'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name'
    )
    const expected = expectedMigrationNames()
    const applied = result.rows
      .filter((row) => row.finished_at && !row.rolled_back_at)
      .map((row) => String(row.migration_name))

    if (JSON.stringify(applied) !== JSON.stringify(expected)) {
      throw new Error(`Baseline history mismatch. Expected ${expected.length} migrations, found ${applied.length}.`)
    }
  } finally {
    client.close()
  }
}

async function createUnbaselinedDatabase() {
  const url = `file:./${relative(process.cwd(), unsafeDatabasePath)}`
  const client = createClient({ url })
  try {
    await client.execute('CREATE TABLE legacy_data (id TEXT PRIMARY KEY)')
  } finally {
    client.close()
  }
  return url
}

async function main() {
  console.log('Validating the isolated empty-database bootstrap path.')

  const bootstrap = runNodeScript('scripts/migrate-safe.js', environment)
  if (bootstrap.status !== 0) throw new Error('Empty-database bootstrap failed')
  await verifyBaseline()

  console.log('Validating the existing migration-history deploy path.')
  const redeploy = runNodeScript('scripts/migrate-safe.js', environment)
  if (redeploy.status !== 0) throw new Error('Existing-database migration deploy failed')

  console.log('Validating fail-closed handling for an unbaselined non-empty database.')
  const unsafeUrl = await createUnbaselinedDatabase()
  const rejected = runNodeScript('scripts/migrate-safe.js', {
    ...process.env,
    DATABASE_URL: unsafeUrl,
  }, 'pipe')
  const rejectionOutput = `${rejected.stdout || ''}\n${rejected.stderr || ''}`
  if (rejected.status === 0 || !rejectionOutput.includes('Refusing to migrate a non-empty database')) {
    throw new Error('Unbaselined non-empty database was not rejected safely')
  }

  console.log('Migration bootstrap, deploy, status, and fail-closed checks passed.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true })
})
