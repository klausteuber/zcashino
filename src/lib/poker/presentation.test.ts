import { describe, expect, it } from 'vitest'
import { betPresets } from './presentation'
const legal = { canCheck: false, call: 20, minRaiseTo: 60, maxRaiseTo: 1000, canRaise: true, bringIn: null, raiseOptions: null }
describe('bet sizing', () => {
  it('includes the call and existing street bet in pot-sized raises', () => {
    expect(betPresets(legal, 10, 100, 'holdem').map(p => p.amount)).toEqual([60, 90, 120, 150, 1000])
  })
  it('caps every Omaha preset at the server pot limit', () => {
    const presets = betPresets({ ...legal, maxRaiseTo: 80 }, 10, 100, 'omaha')
    expect(presets.map(p => p.amount)).toEqual([60, 80, 80, 80, 80])
    expect(presets.at(-1)?.label).toBe('Max')
  })
  it('allows a short all-in below the normal minimum', () => {
    expect(betPresets({ ...legal, maxRaiseTo: 40 }, 0, 0, 'holdem').every(p => p.amount === 40)).toBe(true)
  })
})
