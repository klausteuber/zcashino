import { describe, expect, it } from 'vitest'
import {
  getBrandUrlForPath,
  getCanonicalUrlForPath,
  makeAbsoluteUrl,
} from '@/lib/brand/config'

describe('brand URL helpers', () => {
  it('normalizes relative paths when creating absolute URLs', () => {
    expect(makeAbsoluteUrl('https://21z.cash', 'blackjack')).toBe('https://21z.cash/blackjack')
    expect(makeAbsoluteUrl('https://21z.cash', '/blackjack')).toBe('https://21z.cash/blackjack')
  })

  it('uses 21z as canonical origin for both brands', () => {
    expect(getCanonicalUrlForPath('21z', '/verify')).toBe('https://21z.cash/verify')
    expect(getCanonicalUrlForPath('cypher', '/verify')).toBe('https://21z.cash/verify')
  })

  it('uses brand origin for brand URLs', () => {
    expect(getBrandUrlForPath('21z', '/blackjack')).toBe('https://21z.cash/blackjack')
    expect(getBrandUrlForPath('cypher', '/blackjack')).toBe('https://cypherjester.com/blackjack')
  })
})
