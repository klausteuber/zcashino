import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')

    // Run startup validation (fatal on mainnet, warnings on testnet)
    const { enforceStartupValidation } = await import('./lib/startup-validator')
    enforceStartupValidation()

    // Start the commitment pool manager (background refill + cleanup)
    const { initForNextJS } = await import('./lib/services/commitment-pool-manager')
    await initForNextJS()

    // Start the deposit sweep service (consolidate deposit funds → house wallet)
    const { initSweepForNextJS } = await import('./lib/services/deposit-sweep')
    await initSweepForNextJS()
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
