/**
 * Startup Validator
 *
 * Validates environment configuration at application startup.
 * Prevents catastrophic misconfiguration — especially on mainnet
 * where real money is at stake.
 *
 * Called from instrumentation.ts on Node.js runtime startup.
 */

export interface StartupValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate all environment configuration.
 * On mainnet, validation failures are fatal (app refuses to start).
 * On testnet, some issues are logged as warnings instead.
 */
export function validateStartupConfig(): StartupValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const network = process.env.ZCASH_NETWORK || 'testnet'
  const isMainnet = network === 'mainnet'
  const isDemoMode = process.env.DEMO_MODE === 'true'

  // ── Network validation ──────────────────────────────────────────────
  if (network !== 'mainnet' && network !== 'testnet') {
    errors.push(
      `ZCASH_NETWORK="${network}" is invalid. Must be "mainnet" or "testnet".`
    )
  }

  // ── CRITICAL: Demo mode + mainnet = catastrophe ─────────────────────
  if (isMainnet && isDemoMode) {
    errors.push(
      'FATAL: DEMO_MODE=true on mainnet. This would give users fake balances ' +
      'and bypass provably fair guarantees with real money. ' +
      'Set DEMO_MODE=false or switch to testnet.'
    )
  }

  // ── House wallet address ────────────────────────────────────────────
  const houseAddr = isMainnet
    ? process.env.HOUSE_ZADDR_MAINNET
    : process.env.HOUSE_ZADDR_TESTNET

  if (isMainnet && (!houseAddr || houseAddr.trim().length === 0)) {
    errors.push(
      'HOUSE_ZADDR_MAINNET is empty. Cannot process commitments or withdrawals on mainnet.'
    )
  }

  if (!isMainnet && (!houseAddr || houseAddr.includes('ztestsapling1...'))) {
    warnings.push(
      'HOUSE_ZADDR_TESTNET is placeholder or empty. Will use mock commitments.'
    )
  }

  // ── Admin credentials ───────────────────────────────────────────────
  const adminPassword = process.env.ADMIN_PASSWORD
  const sessionSecret = process.env.ADMIN_SESSION_SECRET

  if (isMainnet) {
    if (!adminPassword || adminPassword.length < 12) {
      errors.push(
        'ADMIN_PASSWORD must be at least 12 characters on mainnet. ' +
        `Current length: ${adminPassword?.length ?? 0}`
      )
    }
    if (!sessionSecret || sessionSecret.length < 32) {
      errors.push(
        'ADMIN_SESSION_SECRET must be at least 32 characters on mainnet. ' +
        `Current length: ${sessionSecret?.length ?? 0}`
      )
    }
  } else {
    if (!adminPassword) {
      warnings.push('ADMIN_PASSWORD not set. Admin dashboard will be inaccessible.')
    }
    if (!sessionSecret || sessionSecret.length < 16) {
      warnings.push(
        `ADMIN_SESSION_SECRET is weak (${sessionSecret?.length ?? 0} chars). ` +
        'Use 32+ characters in production.'
      )
    }
  }

  // ── RPC credentials ─────────────────────────────────────────────────
  const rpcPassword = process.env.ZCASH_RPC_PASSWORD
  if (!rpcPassword || rpcPassword.trim().length === 0) {
    if (isMainnet) {
      errors.push('ZCASH_RPC_PASSWORD is empty. Cannot connect to zcashd securely.')
    } else {
      warnings.push('ZCASH_RPC_PASSWORD is empty. RPC calls may fail.')
    }
  }

  // ── FORCE_HTTPS on mainnet ──────────────────────────────────────────
  if (isMainnet && process.env.FORCE_HTTPS !== 'true') {
    errors.push(
      'FORCE_HTTPS must be "true" on mainnet. ' +
      'Secure cookies require HTTPS to prevent session hijacking.'
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Run validation and log results.
 * Throws on mainnet validation failures (fatal).
 * Logs warnings on testnet.
 */
export function enforceStartupValidation(): void {
  const result = validateStartupConfig()
  const network = process.env.ZCASH_NETWORK || 'testnet'

  // Always log warnings
  for (const warning of result.warnings) {
    console.warn(`[StartupValidator] ⚠️  ${warning}`)
  }

  if (!result.valid) {
    for (const error of result.errors) {
      console.error(`[StartupValidator] ❌ ${error}`)
    }

    if (network === 'mainnet') {
      throw new Error(
        `[StartupValidator] FATAL: ${result.errors.length} critical configuration error(s) detected on mainnet. ` +
        'The application will NOT start to protect real funds. Fix the errors above and restart.'
      )
    } else {
      console.warn(
        `[StartupValidator] ${result.errors.length} configuration issue(s) detected on testnet. ` +
        'These would be FATAL on mainnet.'
      )
    }
  } else {
    console.log(`[StartupValidator] ✅ Configuration valid for ${network}`)
  }
}
