import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateStartupConfig } from './startup-validator'
import { getDefaultFairnessVersion } from './game/shuffle'

afterEach(() => vi.unstubAllEnvs())

describe('secure mainnet defaults', () => {
  it('rejects compatibility auth and missing secure shuffle configuration', () => {
    vi.stubEnv('ZCASH_NETWORK', 'mainnet')
    vi.stubEnv('PLAYER_SESSION_AUTH_MODE', 'compat')
    vi.stubEnv('FAIRNESS_DEFAULT_VERSION', '')
    const errors = validateStartupConfig().errors.join('\n')
    expect(errors).toContain('PLAYER_SESSION_AUTH_MODE must be "strict"')
    expect(errors).toContain('FAIRNESS_DEFAULT_VERSION must be "hmac_sha256_v1"')
  })
  it('uses HMAC by default and refuses legacy or misspelled new-game algorithms', () => {
    vi.stubEnv('FAIRNESS_DEFAULT_VERSION', '')
    expect(getDefaultFairnessVersion()).toBe('hmac_sha256_v1')
    vi.stubEnv('FAIRNESS_DEFAULT_VERSION', 'legacy_mulberry_v1')
    expect(() => getDefaultFairnessVersion()).toThrow()
    vi.stubEnv('FAIRNESS_DEFAULT_VERSION', 'hmac_typo')
    expect(() => getDefaultFairnessVersion()).toThrow()
  })
})
