/**
 * TOTP (Time-based One-Time Password) utilities for admin 2FA.
 *
 * Uses the `otpauth` library (RFC 6238 compliant, ~5KB, zero dependencies).
 *
 * Flow:
 *   1. Setup: generateTotpSecret() → QR URI for authenticator app
 *   2. Verify setup: verifyTotpCode(secret, code) — user confirms first code
 *   3. Login: verifyTotpCode(secret, code) — checked on every login when enabled
 */

import * as OTPAuth from 'otpauth'

const ISSUER = 'Zcashino Admin'
const ALGORITHM = 'SHA1'
const DIGITS = 6
const PERIOD = 30

/**
 * Generate a new TOTP secret and return the secret + provisioning URI.
 * The URI can be encoded as a QR code for authenticator apps.
 */
export function generateTotpSecret(username: string): {
  secret: string // base32 secret string (store in DB)
  uri: string // otpauth://totp/... URI for QR code
} {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: new OTPAuth.Secret({ size: 20 }),
  })

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  }
}

/**
 * Verify a TOTP code against a secret.
 * Allows +-1 time window (30s each direction) for clock drift.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  })

  // validate returns the time step difference (null = invalid)
  // window: 1 allows +-1 period (30s) for clock drift
  const delta = totp.validate({ token: code, window: 1 })
  return delta !== null
}

/**
 * Generate the current TOTP code (for testing only).
 */
export function generateCurrentCode(secret: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  })

  return totp.generate()
}
