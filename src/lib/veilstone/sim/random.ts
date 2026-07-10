export interface SeededRng {
  next(): number
  int(minInclusive: number, maxInclusive: number): number
  pick<T>(entries: readonly T[]): T
  chance(probability: number): boolean
}

export function createSeededRng(seed: number): SeededRng {
  let value = seed >>> 0

  function next() {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }

  return {
    next,
    int(minInclusive, maxInclusive) {
      return Math.floor(next() * (maxInclusive - minInclusive + 1)) + minInclusive
    },
    pick(entries) {
      if (entries.length === 0) throw new Error('Cannot pick from an empty list')
      return entries[Math.floor(next() * entries.length)]
    },
    chance(probability) {
      return next() < probability
    },
  }
}
