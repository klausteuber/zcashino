import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin } from '@/lib/admin/auth'
import {
  checkAdminRateLimit,
  createRateLimitResponse,
} from '@/lib/admin/rate-limit'
import { logAdminEvent } from '@/lib/admin/audit'
import { guardCypherAdminRequest } from '@/lib/admin/host-guard'
import { ADMIN_SETTINGS_KEYS, invalidateAdminSettingsCache } from '@/lib/admin/runtime-settings'

type SettingKind = 'number' | 'integer' | 'nullable-number' | 'nullable-integer' | 'boolean' | 'string' | 'string-array'
type SettingSpec = {
  kind: SettingKind
  min?: number
  max?: number
  allowedValues?: string[]
  allowedItems?: string[]
}

const SETTING_SPECS: Record<string, SettingSpec> = {
  'blackjack.minBet': { kind: 'number', min: 0 },
  'blackjack.maxBet': { kind: 'number', min: 0 },
  'blackjack.deckCount': { kind: 'integer', min: 1, max: 8 },
  'blackjack.dealerStandsOn': { kind: 'integer', min: 16, max: 18 },
  'blackjack.blackjackPayout': { kind: 'number', min: 1, max: 2, allowedValues: ['1.2', '1.5'] },
  'blackjack.allowSurrender': { kind: 'boolean' },
  'blackjack.allowPerfectPairs': { kind: 'boolean' },
  'videoPoker.minBet': { kind: 'number', min: 0 },
  'videoPoker.maxBet': { kind: 'number', min: 0 },
  'videoPoker.enabledVariants': { kind: 'string-array', allowedItems: ['jacks_or_better', 'deuces_wild'] },
  'videoPoker.paytableJacksOrBetter': { kind: 'string', allowedValues: ['9/6', '8/5', '7/5'] },
  'videoPoker.paytableDeucesWild': { kind: 'string', allowedValues: ['full_pay'] },
  'alerts.largeWinThreshold': { kind: 'number', min: 0 },
  'alerts.highRtpThreshold': { kind: 'number', min: 1 },
  'alerts.consecutiveWins': { kind: 'integer', min: 1 },
  'pool.autoRefillThreshold': { kind: 'integer', min: 0 },
  'pool.targetSize': { kind: 'integer', min: 0 },
  'pool.minHealthy': { kind: 'integer', min: 0 },
  'rg.defaultDepositLimit': { kind: 'nullable-number', min: 0 },
  'rg.defaultLossLimit': { kind: 'nullable-number', min: 0 },
  'rg.defaultSessionLimit': { kind: 'nullable-integer', min: 0 },
  'rg.selfExclusionMinDays': { kind: 'integer', min: 1 },
}

type ValidatedResult =
  | { ok: true; normalized: number | boolean | string | string[] | null }
  | { ok: false; error: string }

function validateSettingValue(key: string, value: unknown): ValidatedResult {
  const spec = SETTING_SPECS[key]
  if (!spec) {
    return { ok: false, error: `Unknown setting key: ${key}` }
  }

  // Boolean settings
  if (spec.kind === 'boolean') {
    if (typeof value === 'boolean') return { ok: true, normalized: value }
    if (value === 'true' || value === '1') return { ok: true, normalized: true }
    if (value === 'false' || value === '0') return { ok: true, normalized: false }
    return { ok: false, error: `${key} must be true or false` }
  }

  // String settings
  if (spec.kind === 'string') {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return { ok: false, error: `${key} must be a non-empty string` }
    }
    if (spec.allowedValues && !spec.allowedValues.includes(value)) {
      return { ok: false, error: `${key} must be one of: ${spec.allowedValues.join(', ')}` }
    }
    return { ok: true, normalized: value }
  }

  // String array settings
  if (spec.kind === 'string-array') {
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
      return { ok: false, error: `${key} must be an array of strings` }
    }
    if (value.length === 0) {
      return { ok: false, error: `${key} must have at least one item` }
    }
    if (spec.allowedItems) {
      const invalid = value.filter((v: string) => !spec.allowedItems!.includes(v))
      if (invalid.length > 0) {
        return { ok: false, error: `${key} contains invalid items: ${invalid.join(', ')}` }
      }
    }
    return { ok: true, normalized: value }
  }

  // Numeric settings (existing logic)
  const nullable = spec.kind.startsWith('nullable')
  const wantInteger = spec.kind.endsWith('integer')

  if (value === null) {
    if (!nullable) return { ok: false, error: `${key} cannot be null` }
    return { ok: true, normalized: null }
  }

  const num = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : NaN

  if (!Number.isFinite(num)) {
    return { ok: false, error: `${key} must be a ${wantInteger ? 'whole number' : 'number'}` }
  }

  const normalized = wantInteger ? Math.trunc(num) : num
  if (wantInteger && normalized !== num) {
    return { ok: false, error: `${key} must be an integer` }
  }

  if (spec.min !== undefined && normalized < spec.min) {
    return { ok: false, error: `${key} must be >= ${spec.min}` }
  }
  if (spec.max !== undefined && normalized > spec.max) {
    return { ok: false, error: `${key} must be <= ${spec.max}` }
  }

  if (spec.allowedValues && !spec.allowedValues.includes(String(normalized))) {
    return { ok: false, error: `${key} must be one of: ${spec.allowedValues.join(', ')}` }
  }

  return { ok: true, normalized }
}

/**
 * GET /api/admin/settings
 * Read all AdminConfig records and return as key-value object.
 */
export async function GET(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const readLimit = checkAdminRateLimit(request, 'admin-read')
  if (!readLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.settings.read',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: readLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(readLimit)
  }

  const adminCheck = requireAdmin(request, 'manage_settings')
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.settings.read',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const configs = await prisma.adminConfig.findMany()
    const settings: Record<string, unknown> = {}
    for (const config of configs) {
      try {
        settings[config.key] = JSON.parse(config.value)
      } catch {
        settings[config.key] = config.value
      }
    }

    await logAdminEvent({
      request,
      action: 'admin.settings.read',
      success: true,
      actor: adminCheck.session.username,
      details: 'Settings fetched',
    })

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Admin settings read error:', error)
    await logAdminEvent({
      request,
      action: 'admin.settings.read',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to fetch settings',
    })
    return NextResponse.json(
      { error: 'Failed to fetch admin settings.' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/settings
 * Upsert a single AdminConfig key-value pair.
 * Body: { key: string, value: any }
 */
export async function PATCH(request: NextRequest) {
  const hostGuard = guardCypherAdminRequest(request)
  if (hostGuard) return hostGuard

  const actionLimit = checkAdminRateLimit(request, 'admin-action')
  if (!actionLimit.allowed) {
    await logAdminEvent({
      request,
      action: 'admin.settings.update',
      success: false,
      details: 'Rate limit exceeded',
      metadata: { retryAfterSeconds: actionLimit.retryAfterSeconds },
    })
    return createRateLimitResponse(actionLimit)
  }

  const adminCheck = requireAdmin(request, 'manage_settings')
  if (!adminCheck.ok) {
    await logAdminEvent({
      request,
      action: 'admin.settings.update',
      success: false,
      details: 'Unauthorized access attempt',
    })
    return adminCheck.response
  }

  try {
    const body = await request.json()
    const { key, value } = body

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: key (string)' },
        { status: 400 }
      )
    }

    if (!ADMIN_SETTINGS_KEYS.includes(key as (typeof ADMIN_SETTINGS_KEYS)[number])) {
      return NextResponse.json(
        { error: `Invalid setting key: ${key}` },
        { status: 400 }
      )
    }

    const validated = validateSettingValue(key, value)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const serialized = JSON.stringify(validated.normalized)

    await prisma.adminConfig.upsert({
      where: { key },
      update: {
        value: serialized,
        updatedBy: adminCheck.session.username,
      },
      create: {
        key,
        value: serialized,
        updatedBy: adminCheck.session.username,
      },
    })

    invalidateAdminSettingsCache()

    await logAdminEvent({
      request,
      action: 'admin.settings.update',
      success: true,
      actor: adminCheck.session.username,
      details: `Setting updated: ${key}`,
      metadata: { key, value: validated.normalized },
    })

    return NextResponse.json({ success: true, key, value: validated.normalized })
  } catch (error) {
    console.error('Admin settings update error:', error)
    await logAdminEvent({
      request,
      action: 'admin.settings.update',
      success: false,
      actor: adminCheck.session.username,
      details: error instanceof Error ? error.message : 'Failed to update setting',
    })
    return NextResponse.json(
      { error: 'Failed to update admin setting.' },
      { status: 500 }
    )
  }
}
