import { describe, it, expect } from 'vitest'
import {
  getDepositInfo,
  generateDepositMemo,
  parseDepositMemo,
  getAddressExplorerUrl,
  getTransactionExplorerUrl,
} from './addresses'
import { MIN_DEPOSIT, CONFIRMATIONS_REQUIRED } from './index'

describe('getDepositInfo', () => {
  it('returns correct structure', () => {
    const info = getDepositInfo('tmTestAddr123', 'transparent', 'testnet')
    expect(info.address).toBe('tmTestAddr123')
    expect(info.addressType).toBe('transparent')
    expect(info.network).toBe('testnet')
  })

  it('sets minimumDeposit from constant', () => {
    const info = getDepositInfo('addr')
    expect(info.minimumDeposit).toBe(MIN_DEPOSIT)
  })

  it('sets confirmationsRequired from constant', () => {
    const info = getDepositInfo('addr')
    expect(info.confirmationsRequired).toBe(CONFIRMATIONS_REQUIRED)
  })

  it('generates qrCodeData as raw address text', () => {
    const info = getDepositInfo('tmABC123')
    expect(info.qrCodeData).toBe('tmABC123')
  })
})

describe('generateDepositMemo', () => {
  it('prefixes sessionId with ZCASHINO:', () => {
    expect(generateDepositMemo('session-abc')).toBe('ZCASHINO:session-abc')
  })

  it('truncates sessionId if total exceeds 512 bytes', () => {
    const longId = 'A'.repeat(600)
    const memo = generateDepositMemo(longId)
    expect(memo.length).toBeLessThanOrEqual(512)
    expect(memo.startsWith('ZCASHINO:')).toBe(true)
  })

  it('handles empty sessionId', () => {
    expect(generateDepositMemo('')).toBe('ZCASHINO:')
  })
})

describe('parseDepositMemo', () => {
  it('extracts sessionId from valid memo', () => {
    expect(parseDepositMemo('ZCASHINO:session-xyz')).toBe('session-xyz')
  })

  it('returns null for memo without ZCASHINO: prefix', () => {
    expect(parseDepositMemo('OTHER:session-xyz')).toBeNull()
  })

  it('returns empty string for "ZCASHINO:" with no ID', () => {
    expect(parseDepositMemo('ZCASHINO:')).toBe('')
  })

  it('returns null for empty string', () => {
    expect(parseDepositMemo('')).toBeNull()
  })
})

describe('memo round-trip', () => {
  it('generate then parse returns original sessionId', () => {
    const sessionId = 'my-session-12345'
    const memo = generateDepositMemo(sessionId)
    expect(parseDepositMemo(memo)).toBe(sessionId)
  })
})

describe('getAddressExplorerUrl', () => {
  it('mainnet uses zcashblockexplorer.com', () => {
    const url = getAddressExplorerUrl('t1ABC', 'mainnet')
    expect(url).toBe('https://zcashblockexplorer.com/address/t1ABC')
  })

  it('testnet uses testnet.zcashblockexplorer.com', () => {
    const url = getAddressExplorerUrl('tmABC', 'testnet')
    expect(url).toBe('https://testnet.zcashblockexplorer.com/address/tmABC')
  })

  it('includes address in URL', () => {
    const url = getAddressExplorerUrl('myaddr123', 'testnet')
    expect(url).toContain('myaddr123')
  })
})

describe('getTransactionExplorerUrl', () => {
  it('mainnet URL format correct', () => {
    const url = getTransactionExplorerUrl('txhash123', 'mainnet')
    expect(url).toBe('https://zcashblockexplorer.com/tx/txhash123')
  })

  it('testnet URL format correct', () => {
    const url = getTransactionExplorerUrl('txhash456', 'testnet')
    expect(url).toBe('https://testnet.zcashblockexplorer.com/tx/txhash456')
  })

  it('includes txHash in URL', () => {
    const url = getTransactionExplorerUrl('abc123def', 'testnet')
    expect(url).toContain('abc123def')
  })
})
