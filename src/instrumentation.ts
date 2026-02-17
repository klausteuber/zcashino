import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')

    // Run startup validation (fatal on mainnet, warnings on testnet)
    const { enforceStartupValidation } = await import('./lib/startup-validator')
    enforceStartupValidation()

    const { getProvablyFairMode } = await import('./lib/provably-fair/mode')
    const fairnessMode = getProvablyFairMode()

    if (fairnessMode === 'session_nonce_v1') {
      const { initSessionSeedPoolForNextJS } = await import('./lib/services/session-seed-pool-manager')
      await initSessionSeedPoolForNextJS()
    } else {
      // Start the legacy commitment pool manager (background refill + cleanup)
      const { initForNextJS } = await import('./lib/services/commitment-pool-manager')
      await initForNextJS()
    }

    // Start the deposit sweep service (consolidate deposit funds → house wallet)
    const { initSweepForNextJS } = await import('./lib/services/deposit-sweep')
    await initSweepForNextJS()

    // Start the alert generator service (check for unusual activity every 5 minutes)
    const { startAlertGenerator } = await import('./lib/services/alert-generator')
    startAlertGenerator()
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
