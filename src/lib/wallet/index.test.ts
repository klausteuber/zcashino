import { describe, it, expect } from 'vitest'
import {
  validateAddress,
  parseAddress,
  isShieldedAddress,
  formatZec,
  parseZec,
  zecToZatoshi,
  zatoshiToZec,
  MIN_DEPOSIT,
  MIN_WITHDRAWAL,
  WITHDRAWAL_FEE,
  CONFIRMATIONS_REQUIRED,
} from './index'

// Valid-length test addresses for each type
const TESTNET_T = 'tm' + 'A'.repeat(33) // 35 chars
const TESTNET_Z = 'ztestsapling' + 'A'.repeat(66) // 78 chars
const TESTNET_U = 'utest' + 'A'.repeat(50) // 55 chars

const MAINNET_T = 't1' + 'A'.repeat(33) // 35 chars
const MAINNET_Z = 'zs' + 'A'.repeat(76) // 78 chars
const MAINNET_U = 'u1' + 'A'.repeat(50) // 52 chars

describe('validateAddress - testnet', () => {
  it('valid tm address (35 chars)', () => {
    const result = validateAddress(TESTNET_T, 'testnet')
    expect(result).toEqual({ valid: true, type: 'transparent' })
  })

  it('tm address wrong length', () => {
    const result = validateAddress('tm' + 'A'.repeat(10), 'testnet')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('length')
  })

  it('valid ztestsapling address (78 chars)', () => {
    const result = validateAddress(TESTNET_Z, 'testnet')
    expect(result).toEqual({ valid: true, type: 'sapling' })
  })

  it('ztestsapling address too short', () => {
    const result = validateAddress('ztestsapling' + 'A'.repeat(10), 'testnet')
    expect(result.valid).toBe(false)
  })

  it('valid utest address (55 chars)', () => {
    const result = validateAddress(TESTNET_U, 'testnet')
    expect(result).toEqual({ valid: true, type: 'unified' })
  })

  it('utest address too short', () => {
    const result = validateAddress('utest' + 'A'.repeat(5), 'testnet')
    expect(result.valid).toBe(false)
  })

  it('wrong prefix returns invalid with helpful error', () => {
    const result = validateAddress('xyz123456', 'testnet')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('tm')
  })

  it('empty string returns invalid', () => {
    const result = validateAddress('', 'testnet')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('required')
  })

  it('null/undefined returns invalid', () => {
    // @ts-expect-error testing invalid input
    expect(validateAddress(null).valid).toBe(false)
    // @ts-expect-error testing invalid input
    expect(validateAddress(undefined).valid).toBe(false)
  })

  it('whitespace-only returns invalid', () => {
    const result = validateAddress('   ', 'testnet')
    expect(result.valid).toBe(false)
  })
})

describe('validateAddress - mainnet', () => {
  it('valid t1 address', () => {
    expect(validateAddress(MAINNET_T, 'mainnet')).toEqual({ valid: true, type: 'transparent' })
  })

  it('valid zs address', () => {
    expect(validateAddress(MAINNET_Z, 'mainnet')).toEqual({ valid: true, type: 'sapling' })
  })

  it('valid u1 address', () => {
    expect(validateAddress(MAINNET_U, 'mainnet')).toEqual({ valid: true, type: 'unified' })
  })

  it('testnet tm prefix rejected on mainnet', () => {
    const result = validateAddress(TESTNET_T, 'mainnet')
    expect(result.valid).toBe(false)
  })
})

describe('parseAddress', () => {
  it('valid address returns ZcashAddress object', () => {
    const result = parseAddress(TESTNET_T, 'testnet')
    expect(result).toEqual({
      type: 'transparent',
      address: TESTNET_T,
      network: 'testnet',
    })
  })

  it('invalid address returns null', () => {
    expect(parseAddress('invalid', 'testnet')).toBeNull()
  })

  it('trims whitespace from address', () => {
    const result = parseAddress(`  ${TESTNET_T}  `, 'testnet')
    expect(result?.address).toBe(TESTNET_T)
  })
})

describe('isShieldedAddress', () => {
  it('z-address returns true', () => {
    expect(isShieldedAddress(TESTNET_Z, 'testnet')).toBe(true)
  })

  it('u-address returns true', () => {
    expect(isShieldedAddress(TESTNET_U, 'testnet')).toBe(true)
  })

  it('t-address returns false', () => {
    expect(isShieldedAddress(TESTNET_T, 'testnet')).toBe(false)
  })

  it('invalid address returns false', () => {
    expect(isShieldedAddress('invalid', 'testnet')).toBe(false)
  })
})

describe('formatZec', () => {
  it('1.0 returns "1"', () => {
    expect(formatZec(1.0)).toBe('1')
  })

  it('0.5 returns "0.5"', () => {
    expect(formatZec(0.5)).toBe('0.5')
  })

  it('0.00000001 returns "0.00000001"', () => {
    expect(formatZec(0.00000001)).toBe('0.00000001')
  })

  it('respects decimals param', () => {
    expect(formatZec(1.23456789, 4)).toBe('1.2346')
  })

  it('0 returns "0"', () => {
    expect(formatZec(0)).toBe('0')
  })

  it('strips trailing zeros', () => {
    expect(formatZec(1.5)).toBe('1.5')
    expect(formatZec(10.0)).toBe('10')
  })
})

describe('parseZec', () => {
  it('"1.5" returns 1.5', () => {
    expect(parseZec('1.5')).toBe(1.5)
  })

  it('"0" returns 0', () => {
    expect(parseZec('0')).toBe(0)
  })

  it('"abc" returns null', () => {
    expect(parseZec('abc')).toBeNull()
  })

  it('"-1" returns null (negative)', () => {
    expect(parseZec('-1')).toBeNull()
  })

  it('rounds to 8 decimal places', () => {
    const result = parseZec('0.123456789')
    expect(result).toBe(0.12345679) // rounded at 8th decimal
  })
})

describe('zecToZatoshi', () => {
  it('1 ZEC = 100000000n zatoshi', () => {
    expect(zecToZatoshi(1)).toBe(BigInt(100000000))
  })

  it('0.00000001 ZEC = 1n zatoshi', () => {
    expect(zecToZatoshi(0.00000001)).toBe(BigInt(1))
  })

  it('0.5 ZEC = 50000000n zatoshi', () => {
    expect(zecToZatoshi(0.5)).toBe(BigInt(50000000))
  })
})

describe('zatoshiToZec', () => {
  it('100000000n = 1 ZEC', () => {
    expect(zatoshiToZec(BigInt(100000000))).toBe(1)
  })

  it('1n = 0.00000001 ZEC', () => {
    expect(zatoshiToZec(BigInt(1))).toBe(0.00000001)
  })

  it('0n = 0', () => {
    expect(zatoshiToZec(BigInt(0))).toBe(0)
  })
})

describe('constants', () => {
  it('MIN_DEPOSIT is 0.001', () => {
    expect(MIN_DEPOSIT).toBe(0.001)
  })

  it('MIN_WITHDRAWAL is 0.01', () => {
    expect(MIN_WITHDRAWAL).toBe(0.01)
  })

  it('WITHDRAWAL_FEE is 0.0001', () => {
    expect(WITHDRAWAL_FEE).toBe(0.0001)
  })

  it('CONFIRMATIONS_REQUIRED is 3', () => {
    expect(CONFIRMATIONS_REQUIRED).toBe(3)
  })
})
