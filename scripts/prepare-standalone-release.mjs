import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

// Next copies these two files outside output-file tracing exclusions. Runtime
// configuration must come from the host, never a developer's build directory.
// Only remove generated copies; the validator rejects any other forbidden files.
for (const name of ['.env', '.env.production']) {
  await rm(resolve('.next/standalone', name), { force: true })
}
