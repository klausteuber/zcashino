import { startIntegrityWorker } from './integrity-monitor'
import { poker } from './service'
import { PokerError } from './engine'

/** Database deadlines survive restarts. CAS transactions also support multiple workers. */
export function startPokerWorker() {
  startIntegrityWorker()
  const shared = globalThis as typeof globalThis & { pokerWorker?: ReturnType<typeof setInterval> }
  if (shared.pokerWorker) return
  let busy = false
  shared.pokerWorker = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      for (const table of await poker.dueTables()) {
        try { await poker.tick(table.id) }
        catch (error) {
          if (!(error instanceof PokerError && error.status === 409)) console.error('[Poker] Table tick failed:', table.id, error)
        }
      }
    } catch (error) { console.error('[Poker] Worker failed:', error) }
    finally { busy = false }
  }, 1_000)
  shared.pokerWorker.unref()
}
