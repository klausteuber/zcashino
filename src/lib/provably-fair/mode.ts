export const LEGACY_PER_GAME_MODE = 'legacy_per_game_v1' as const
export const SESSION_NONCE_MODE = 'session_nonce_v1' as const

export type ProvablyFairMode = typeof LEGACY_PER_GAME_MODE | typeof SESSION_NONCE_MODE

export function getProvablyFairMode(): ProvablyFairMode {
  const raw = process.env.PROVABLY_FAIR_MODE
  return raw === SESSION_NONCE_MODE ? SESSION_NONCE_MODE : LEGACY_PER_GAME_MODE
}

export function isSessionNonceMode(): boolean {
  return getProvablyFairMode() === SESSION_NONCE_MODE
}
