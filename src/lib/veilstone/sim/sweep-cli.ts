import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runVeilstoneBalanceSweep } from './sweep'

function readArg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return fallback
  return process.argv[index + 1] ?? fallback
}

function replacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value
}

function markdownForSweep(candidates: ReturnType<typeof runVeilstoneBalanceSweep>): string {
  return [
    '# Veilstone Balance Sweep',
    '',
    'These are candidate configs for designer review, not final balance recommendations.',
    '',
    '| Rank | Candidate | Score | Notes |',
    '| ---: | --- | ---: | --- |',
    ...candidates.map((candidate, index) => (
      `| ${index + 1} | ${candidate.name} | ${candidate.score.toFixed(3)} | ${candidate.notes.join('; ') || 'No red flags'} |`
    )),
    '',
    '## Deferred',
    '',
    '- Contract payout multiplier sweeps are deferred until contract-resolution payouts exist beyond MVP-zero stake locking.',
    '',
  ].join('\n')
}

async function main() {
  const matches = Number(readArg('matches', '1000'))
  const seed = Number(readArg('seed', '12345'))
  const outDir = readArg('out', 'artifacts/veilstone-sim/sweeps') ?? 'artifacts/veilstone-sim/sweeps'
  const lineup = readArg('lineup', 'mixed')

  if (!Number.isSafeInteger(matches) || matches <= 0) throw new Error('--matches must be a positive integer')
  if (!Number.isSafeInteger(seed)) throw new Error('--seed must be an integer')

  const candidates = runVeilstoneBalanceSweep({ matches, seed, lineup })
  await mkdir(outDir, { recursive: true })
  await Promise.all([
    writeFile(path.join(outDir, 'sweep.json'), JSON.stringify(candidates, replacer, 2)),
    writeFile(path.join(outDir, 'sweep.md'), markdownForSweep(candidates)),
  ])

  console.log(`Veilstone balance sweep complete: ${candidates.length} candidates`)
  console.log(`Top candidate: ${candidates[0]?.name ?? 'none'} (${candidates[0]?.score.toFixed(3) ?? '0'})`)
  console.log(`Artifacts: ${path.join(outDir, 'sweep.json')}, ${path.join(outDir, 'sweep.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
