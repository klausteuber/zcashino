export interface PokerAccess {
  identityId: string
  nickname: string | null
  recoveryRequired: boolean
  setupComplete: boolean
  entryVerified: boolean
  playVerified: boolean
  restricted: boolean
  provider: 'self-hosted' | 'local-test' | 'unavailable'
  nonce: string
}
