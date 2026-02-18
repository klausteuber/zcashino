import prisma from '@/lib/db'

export interface AdminSettings {
  blackjack: {
    minBet: number
    maxBet: number
    deckCount: number
    dealerStandsOn: number
    blackjackPayout: number
    allowSurrender: boolean
    allowPerfectPairs: boolean
  }
  videoPoker: {
    minBet: number
    maxBet: number
    enabledVariants: string[]
    paytableJacksOrBetter: string
    paytableDeucesWild: string
  }
  pool: {
    autoRefillThreshold: number
    targetSize: number
    minHealthy: number
  }
  alerts: {
    largeWinThreshold: number
    highRtpThreshold: number
    consecutiveWins: number
  }
  rg: {
    defaultDepositLimit: number | null
    defaultLossLimit: number | null
    defaultSessionLimit: number | null
    selfExclusionMinDays: number
  }
}

const DEFAULT_SETTINGS: AdminSettings = {
  blackjack: {
    minBet: 0.01,
    maxBet: 1,
    deckCount: 6,
    dealerStandsOn: 17,
    blackjackPayout: 1.5,
    allowSurrender: false,
    allowPerfectPairs: true,
  },
  videoPoker: {
    minBet: 0.01,
    maxBet: 1,
    enabledVariants: ['jacks_or_better', 'deuces_wild'],
    paytableJacksOrBetter: '9/6',
    paytableDeucesWild: 'full_pay',
  },
  pool: { autoRefillThreshold: 5, targetSize: 15, minHealthy: 5 },
  alerts: { largeWinThreshold: 1.0, highRtpThreshold: 1.5, consecutiveWins: 10 },
  rg: {
    defaultDepositLimit: null,
    defaultLossLimit: null,
    defaultSessionLimit: null,
    selfExclusionMinDays: 1,
  },
}

export const ADMIN_SETTINGS_KEYS = [
  'blackjack.minBet',
  'blackjack.maxBet',
  'blackjack.deckCount',
  'blackjack.dealerStandsOn',
  'blackjack.blackjackPayout',
  'blackjack.allowSurrender',
  'blackjack.allowPerfectPairs',
  'videoPoker.minBet',
  'videoPoker.maxBet',
  'videoPoker.enabledVariants',
  'videoPoker.paytableJacksOrBetter',
  'videoPoker.paytableDeucesWild',
  'alerts.largeWinThreshold',
  'alerts.highRtpThreshold',
  'alerts.consecutiveWins',
  'pool.autoRefillThreshold',
  'pool.targetSize',
  'pool.minHealthy',
  'rg.defaultDepositLimit',
  'rg.defaultLossLimit',
  'rg.defaultSessionLimit',
  'rg.selfExclusionMinDays',
] as const

type SettingsKey = (typeof ADMIN_SETTINGS_KEYS)[number]

const CACHE_TTL_MS = 30_000
let cached: { loadedAtMs: number; settings: AdminSettings } | null = null

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return null
}

function coerceInt(value: unknown): number | null {
  const num = coerceNumber(value)
  if (num === null) return null
  const intVal = Math.trunc(num)
  if (!Number.isFinite(intVal)) return null
  return intVal
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return null
}

function coerceStringArray(value: unknown): string[] | null {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value
  return null
}

function clampNonNegative(n: number): number {
  return n < 0 ? 0 : n
}

function applySettingsToDefaults(rows: Array<{ key: string; value: string }>): AdminSettings {
  const byKey = new Map<string, string>()
  for (const row of rows) byKey.set(row.key, row.value)

  const readNumber = (key: SettingsKey, fallback: number) => {
    const raw = byKey.get(key)
    if (!raw) return fallback
    const parsed = safeJsonParse(raw)
    const num = coerceNumber(parsed)
    return num === null ? fallback : num
  }

  const readInt = (key: SettingsKey, fallback: number) => {
    const raw = byKey.get(key)
    if (!raw) return fallback
    const parsed = safeJsonParse(raw)
    const num = coerceInt(parsed)
    return num === null ? fallback : num
  }

  const readNullableNumber = (key: SettingsKey, fallback: number | null) => {
    const raw = byKey.get(key)
    if (!raw) return fallback
    const parsed = safeJsonParse(raw)
    if (parsed === null) return null
    const num = coerceNumber(parsed)
    return num === null ? fallback : num
  }

  const readNullableInt = (key: SettingsKey, fallback: number | null) => {
    const raw = byKey.get(key)
    if (!raw) return fallback
    const parsed = safeJsonParse(raw)
    if (parsed === null) return null
    const num = coerceInt(parsed)
    return num === null ? fallback : num
  }

  const readBoolean = (key: SettingsKey, fallback: boolean) => {
    const raw = byKey.get(key)
    if (!raw) return fallback
    const parsed = safeJsonParse(raw)
    const bool = coerceBoolean(parsed)
    return bool === null ? fallback : bool
  }

  const readString = (key: SettingsKey, fallback: string) => {
    const raw = byKey.get(key)
    if (!raw) return fallback
    const parsed = safeJsonParse(raw)
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : fallback
  }

  const readStringArray = (key: SettingsKey, fallback: string[]) => {
    const raw = byKey.get(key)
    if (!raw) return fallback
    const parsed = safeJsonParse(raw)
    const arr = coerceStringArray(parsed)
    return arr === null || arr.length === 0 ? fallback : arr
  }

  const minBj = clampNonNegative(readNumber('blackjack.minBet', DEFAULT_SETTINGS.blackjack.minBet))
  const maxBj = clampNonNegative(readNumber('blackjack.maxBet', DEFAULT_SETTINGS.blackjack.maxBet))
  const deckCount = Math.max(1, Math.min(8, readInt('blackjack.deckCount', DEFAULT_SETTINGS.blackjack.deckCount)))
  const dealerStandsOn = Math.max(16, Math.min(18, readInt('blackjack.dealerStandsOn', DEFAULT_SETTINGS.blackjack.dealerStandsOn)))
  const blackjackPayout = readNumber('blackjack.blackjackPayout', DEFAULT_SETTINGS.blackjack.blackjackPayout)
  const allowSurrender = readBoolean('blackjack.allowSurrender', DEFAULT_SETTINGS.blackjack.allowSurrender)
  const allowPerfectPairs = readBoolean('blackjack.allowPerfectPairs', DEFAULT_SETTINGS.blackjack.allowPerfectPairs)
  const minVp = clampNonNegative(readNumber('videoPoker.minBet', DEFAULT_SETTINGS.videoPoker.minBet))
  const maxVp = clampNonNegative(readNumber('videoPoker.maxBet', DEFAULT_SETTINGS.videoPoker.maxBet))
  const enabledVariants = readStringArray('videoPoker.enabledVariants', DEFAULT_SETTINGS.videoPoker.enabledVariants)
  const paytableJacksOrBetter = readString('videoPoker.paytableJacksOrBetter', DEFAULT_SETTINGS.videoPoker.paytableJacksOrBetter)
  const paytableDeucesWild = readString('videoPoker.paytableDeucesWild', DEFAULT_SETTINGS.videoPoker.paytableDeucesWild)

  const poolAuto = clampNonNegative(readInt('pool.autoRefillThreshold', DEFAULT_SETTINGS.pool.autoRefillThreshold))
  const poolTarget = clampNonNegative(readInt('pool.targetSize', DEFAULT_SETTINGS.pool.targetSize))
  const poolMinHealthy = clampNonNegative(readInt('pool.minHealthy', DEFAULT_SETTINGS.pool.minHealthy))

  const largeWin = clampNonNegative(readNumber('alerts.largeWinThreshold', DEFAULT_SETTINGS.alerts.largeWinThreshold))
  const highRtp = clampNonNegative(readNumber('alerts.highRtpThreshold', DEFAULT_SETTINGS.alerts.highRtpThreshold))
  const consecutiveWins = clampNonNegative(readInt('alerts.consecutiveWins', DEFAULT_SETTINGS.alerts.consecutiveWins))

  const defaultDepositLimit = readNullableNumber('rg.defaultDepositLimit', DEFAULT_SETTINGS.rg.defaultDepositLimit)
  const defaultLossLimit = readNullableNumber('rg.defaultLossLimit', DEFAULT_SETTINGS.rg.defaultLossLimit)
  const defaultSessionLimit = readNullableInt('rg.defaultSessionLimit', DEFAULT_SETTINGS.rg.defaultSessionLimit)
  const selfExclusionMinDays = clampNonNegative(readInt('rg.selfExclusionMinDays', DEFAULT_SETTINGS.rg.selfExclusionMinDays))

  return {
    blackjack: {
      minBet: Math.min(minBj, maxBj || minBj),
      maxBet: Math.max(maxBj, minBj),
      deckCount,
      dealerStandsOn,
      blackjackPayout,
      allowSurrender,
      allowPerfectPairs,
    },
    videoPoker: {
      minBet: Math.min(minVp, maxVp || minVp),
      maxBet: Math.max(maxVp, minVp),
      enabledVariants,
      paytableJacksOrBetter,
      paytableDeucesWild,
    },
    pool: {
      autoRefillThreshold: poolAuto,
      targetSize: Math.max(poolTarget, poolAuto),
      minHealthy: poolMinHealthy,
    },
    alerts: {
      largeWinThreshold: largeWin,
      highRtpThreshold: highRtp,
      consecutiveWins,
    },
    rg: {
      defaultDepositLimit,
      defaultLossLimit,
      defaultSessionLimit,
      selfExclusionMinDays,
    },
  }
}

export function invalidateAdminSettingsCache(): void {
  cached = null
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const now = Date.now()
  if (cached && now - cached.loadedAtMs < CACHE_TTL_MS) {
    return cached.settings
  }

  try {
    const rows = await prisma.adminConfig.findMany({
      where: { key: { in: [...ADMIN_SETTINGS_KEYS] } },
      select: { key: true, value: true },
    })
    const settings = applySettingsToDefaults(rows)
    cached = { loadedAtMs: now, settings }
    return settings
  } catch (error) {
    // If migrations haven't been run yet (AdminConfig table missing), we fall back
    // to safe defaults so runtime behavior is predictable.
    console.error('[AdminSettings] Failed to load AdminConfig, using defaults:', error)
    cached = { loadedAtMs: now, settings: DEFAULT_SETTINGS }
    return DEFAULT_SETTINGS
  }
}
