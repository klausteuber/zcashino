import { runVeilstoneMonteCarlo } from './runner'
import { writeSimulationArtifacts } from './report'

function readArg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return fallback
  return process.argv[index + 1] ?? fallback
}

async function main() {
  const matches = Number(readArg('matches', '1000'))
  const seed = Number(readArg('seed', '12345'))
  const lineup = readArg('lineup', 'mixed') ?? 'mixed'
  const out = readArg('out', `artifacts/veilstone-sim/${lineup}-${matches}`) ?? `artifacts/veilstone-sim/${lineup}-${matches}`

  if (!Number.isSafeInteger(matches) || matches <= 0) throw new Error('--matches must be a positive integer')
  if (!Number.isSafeInteger(seed)) throw new Error('--seed must be an integer')

  const result = runVeilstoneMonteCarlo({ matches, seed, lineup })
  await writeSimulationArtifacts(result, out)

  console.log(`Veilstone simulation complete: ${matches} matches`)
  console.log(`Artifacts: ${out}.json, ${out}.csv, ${out}.md`)
  console.log(`Invariant failure matches: ${result.aggregate.invariantFailureCount}`)
  console.log(`Win rates by bot: ${JSON.stringify(result.aggregate.winRateByBot)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
