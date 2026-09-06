export interface PokerAccess {
  identityId: string
  nickname: string | null
  recoveryRequired: boolean
  setupComplete: boolean
  entryVerified: boolean
  playVerified: boolean
  restricted: boolean
  provider: 'turnstile' | 'local-test' | 'unavailable'
  siteKey: string | null
  nonce: string
}
