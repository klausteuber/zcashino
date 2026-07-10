import type { ZatsString } from './types'

export function toZatsString(value: bigint | number | string): ZatsString {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Unsafe zatoshi number: ${value}`)
    }
    return BigInt(value).toString()
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid zatoshi string: ${value}`)
  }
  return BigInt(value).toString()
}

export function parseZats(value: ZatsString | bigint | number): bigint {
  if (typeof value === 'bigint') return value
  return BigInt(toZatsString(value))
}

export function addZats(a: ZatsString, b: ZatsString | bigint): ZatsString {
  return (parseZats(a) + parseZats(b)).toString()
}

export function subtractZats(a: ZatsString, b: ZatsString | bigint): ZatsString {
  const result = parseZats(a) - parseZats(b)
  if (result < 0n) throw new Error('Zatoshi balance cannot go negative')
  return result.toString()
}

export function compareZats(a: ZatsString | bigint, b: ZatsString | bigint): number {
  const left = parseZats(a)
  const right = parseZats(b)
  if (left === right) return 0
  return left > right ? 1 : -1
}

export function formatZecFromZats(value: ZatsString | bigint): string {
  const zats = parseZats(value)
  const whole = zats / 100_000_000n
  const fraction = (zats % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}
