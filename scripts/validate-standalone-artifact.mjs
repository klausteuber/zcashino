#!/usr/bin/env node

import { lstat, readdir, realpath } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_ARTIFACT_ROOT = '.next/standalone'

const forbiddenDirectoryNames = new Set([
  '.git',
  '.github',
  '__tests__',
  'coverage',
  'notes',
  'playwright-report',
  'prisma',
  'reports',
  'scripts',
  'src',
  'test',
  'test-results',
  'tests',
])

function isEnvironmentFile(name) {
  const lowerName = name.toLowerCase()
  return lowerName === '.env' || lowerName.startsWith('.env.') || lowerName.startsWith('.env-')
}

function isDatabaseFile(name) {
  return /\.(?:db|sqlite|sqlite3)(?:[.-].+)?$/i.test(name)
}

function isLogFile(name) {
  return /\.log(?:\..+)?$/i.test(name)
}

function forbiddenReason(relativePath) {
  const segments = relativePath.split('/').filter(Boolean)
  const lowerSegments = segments.map((segment) => segment.toLowerCase())
  const name = segments.at(-1) ?? ''

  if (isEnvironmentFile(name)) return 'environment file'
  if (isDatabaseFile(name)) return 'database file'
  if (isLogFile(name)) return 'log file'

  // Dependency packages may contain directories named "test" as runtime data.
  // Project-owned material is never valid in the standalone release artifact.
  const isDependency = lowerSegments.includes('node_modules')
  if (!isDependency) {
    const forbiddenDirectory = lowerSegments.find((segment) => forbiddenDirectoryNames.has(segment))
    if (forbiddenDirectory) return `project ${forbiddenDirectory}/ directory`

    if (segments.length === 1 && /\.(?:md|ts|tsx)$/i.test(name)) {
      return 'project source or internal documentation'
    }

    if (
      segments.length === 1 &&
      /^(?:dockerfile|docker-compose.*|eslint\.config\..*|next\.config\..*|playwright\.config\..*|postcss\.config\..*|prisma\.config\..*|tsconfig.*\.json|package-lock\.json)$/i.test(name)
    ) {
      return 'project build or development configuration'
    }
  }

  return null
}

async function collectForbiddenPaths(artifactRoot) {
  const root = resolve(artifactRoot)
  const violations = []

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name)
      const relativePath = relative(root, absolutePath).split(sep).join('/')
      const reason = forbiddenReason(relativePath)
      if (reason) violations.push({ path: relativePath, reason })

      const stats = await lstat(absolutePath)
      if (stats.isSymbolicLink()) {
        const target = await realpath(absolutePath)
        const targetRelativePath = relative(root, target)
        if (targetRelativePath === '..' || targetRelativePath.startsWith(`..${sep}`)) {
          violations.push({ path: relativePath, reason: 'symlink escapes the artifact root' })
        }
      } else if (stats.isDirectory()) {
        await walk(absolutePath)
      }
    }
  }

  await walk(root)
  return violations.sort((a, b) => a.path.localeCompare(b.path))
}

function runSelfTest() {
  const cases = [
    ['.env', 'environment file'],
    ['nested/.env.production.local', 'environment file'],
    ['prisma/dev.db', 'database file'],
    ['data/live.db-wal', 'database file'],
    ['backups/live.db.gz', 'database file'],
    ['logs/server.log.1', 'log file'],
    ['src/lib/db.js', 'project src/ directory'],
    ['tests/smoke.spec.js', 'project tests/ directory'],
    ['notes/runbook.md', 'project notes/ directory'],
    ['reports/security_report.json', 'project reports/ directory'],
    ['next.config.js', 'project build or development configuration'],
  ]

  for (const [path, expected] of cases) {
    const actual = forbiddenReason(path)
    if (actual !== expected) {
      throw new Error(`Self-test failed for ${path}: expected ${expected}, received ${actual}`)
    }
  }

  for (const allowed of ['server.js', '.next/server/app.js', 'node_modules/package/runtime.js']) {
    if (forbiddenReason(allowed)) {
      throw new Error(`Self-test failed: ${allowed} should be allowed`)
    }
  }

  console.log('Standalone artifact validator self-test passed.')
}

async function main() {
  if (process.argv[2] === '--self-test') {
    runSelfTest()
    return
  }

  const artifactRoot = process.argv[2] ?? DEFAULT_ARTIFACT_ROOT
  let violations
  try {
    violations = await collectForbiddenPaths(artifactRoot)
  } catch (error) {
    console.error(`Unable to validate standalone artifact at ${resolve(artifactRoot)}.`)
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
    return
  }

  if (violations.length > 0) {
    console.error(`Standalone artifact contains ${violations.length} forbidden path(s):`)
    for (const violation of violations) {
      console.error(`- ${violation.path} (${violation.reason})`)
    }
    process.exitCode = 1
    return
  }

  // Turbopack can trace an external package's manifest without its src entry.
  // Import from the artifact itself so that omission blocks a production build.
  const cap = await import(pathToFileURL(resolve(artifactRoot, 'node_modules/capjs-core/src/index.js')).href)
  const challenge = await cap.generateChallenge('artifact-check-only-secret-32-characters', { challengeCount: 1, challengeDifficulty: 1 })
  if (!challenge.token || typeof cap.validateChallenge !== 'function') throw new Error('Standalone Cap runtime is incomplete')
  console.log(`Standalone artifact passed validation: ${resolve(artifactRoot)}`)
}

await main()
