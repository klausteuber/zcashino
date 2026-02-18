'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Setting field definitions
// ---------------------------------------------------------------------------

interface NumberField {
  key: string
  label: string
  type: 'number' | 'integer'
  step?: number
  placeholder?: string
  suffix?: string
}

interface BooleanField {
  key: string
  label: string
  type: 'boolean'
  description?: string
}

interface SelectField {
  key: string
  label: string
  type: 'select'
  options: { value: string; label: string }[]
}

interface MultiSelectField {
  key: string
  label: string
  type: 'multi-select'
  options: { value: string; label: string }[]
}

type SettingField = NumberField | BooleanField | SelectField | MultiSelectField

interface SettingCategory {
  title: string
  description: string
  fields: SettingField[]
}

const SETTING_CATEGORIES: SettingCategory[] = [
  {
    title: 'Game Limits',
    description:
      'Minimum and maximum bet amounts per game type. Enforced in real-time by game logic on every wager.',
    fields: [
      { key: 'blackjack.minBet', label: 'Blackjack min bet', type: 'number', step: 0.0001, suffix: 'ZEC' },
      { key: 'blackjack.maxBet', label: 'Blackjack max bet', type: 'number', step: 0.0001, suffix: 'ZEC' },
      { key: 'videoPoker.minBet', label: 'Video Poker min bet', type: 'number', step: 0.0001, suffix: 'ZEC' },
      { key: 'videoPoker.maxBet', label: 'Video Poker max bet', type: 'number', step: 0.0001, suffix: 'ZEC' },
    ],
  },
  {
    title: 'Blackjack Rules',
    description:
      'House rules for blackjack. Changes apply to new rounds only — in-progress games use the rules from when they started.',
    fields: [
      {
        key: 'blackjack.deckCount',
        label: 'Number of decks',
        type: 'select',
        options: [
          { value: '1', label: '1 deck' },
          { value: '2', label: '2 decks' },
          { value: '4', label: '4 decks' },
          { value: '6', label: '6 decks (standard)' },
          { value: '8', label: '8 decks' },
        ],
      },
      {
        key: 'blackjack.dealerStandsOn',
        label: 'Dealer stands on',
        type: 'select',
        options: [
          { value: '17', label: 'Soft 17 (S17 — standard)' },
          { value: '18', label: 'Soft 18' },
        ],
      },
      {
        key: 'blackjack.blackjackPayout',
        label: 'Blackjack payout',
        type: 'select',
        options: [
          { value: '1.5', label: '3:2 (1.5× — standard)' },
          { value: '1.2', label: '6:5 (1.2×)' },
        ],
      },
      {
        key: 'blackjack.allowSurrender',
        label: 'Allow surrender',
        type: 'boolean',
        description: 'Let players forfeit half their bet on the initial two cards.',
      },
      {
        key: 'blackjack.allowPerfectPairs',
        label: 'Allow Perfect Pairs side bet',
        type: 'boolean',
        description: 'Enable the Perfect Pairs optional side bet.',
      },
    ],
  },
  {
    title: 'Video Poker Rules',
    description:
      'Configure available variants and paytable schedules for video poker.',
    fields: [
      {
        key: 'videoPoker.enabledVariants',
        label: 'Enabled variants',
        type: 'multi-select',
        options: [
          { value: 'jacks_or_better', label: 'Jacks or Better' },
          { value: 'deuces_wild', label: 'Deuces Wild' },
        ],
      },
      {
        key: 'videoPoker.paytableJacksOrBetter',
        label: 'Jacks or Better paytable',
        type: 'select',
        options: [
          { value: '9/6', label: '9/6 Full Pay (99.54% RTP)' },
          { value: '8/5', label: '8/5 (97.30% RTP)' },
          { value: '7/5', label: '7/5 (96.15% RTP)' },
        ],
      },
      {
        key: 'videoPoker.paytableDeucesWild',
        label: 'Deuces Wild paytable',
        type: 'select',
        options: [
          { value: 'full_pay', label: 'Full Pay (99.73% RTP)' },
        ],
      },
    ],
  },
  {
    title: 'Alert Thresholds',
    description:
      'Thresholds that trigger admin alerts. The alert generator checks these values on each cycle.',
    fields: [
      { key: 'alerts.largeWinThreshold', label: 'Large win threshold', type: 'number', step: 0.01, suffix: 'ZEC' },
      { key: 'alerts.highRtpThreshold', label: 'High RTP threshold', type: 'number', step: 0.01, placeholder: '1.5', suffix: '×' },
      { key: 'alerts.consecutiveWins', label: 'Consecutive wins alert', type: 'integer', placeholder: '10' },
    ],
  },
  {
    title: 'Pool Settings',
    description:
      'Commitment pool management parameters. Controls automatic pool health monitoring.',
    fields: [
      { key: 'pool.autoRefillThreshold', label: 'Auto-refill threshold', type: 'integer', placeholder: '5' },
      { key: 'pool.targetSize', label: 'Target pool size', type: 'integer', placeholder: '15' },
      { key: 'pool.minHealthy', label: 'Minimum healthy count', type: 'integer', placeholder: '5' },
    ],
  },
  {
    title: 'Responsible Gambling Defaults',
    description:
      'Default limits applied to new player sessions. Players can set stricter personal limits.',
    fields: [
      { key: 'rg.defaultDepositLimit', label: 'Default deposit limit (24h)', type: 'number', step: 0.01, suffix: 'ZEC' },
      { key: 'rg.defaultLossLimit', label: 'Default loss limit (24h)', type: 'number', step: 0.01, suffix: 'ZEC' },
      { key: 'rg.defaultSessionLimit', label: 'Default session time limit', type: 'integer', suffix: 'min' },
      { key: 'rg.selfExclusionMinDays', label: 'Self-exclusion minimum period', type: 'integer', suffix: 'days' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Per-field save status
// ---------------------------------------------------------------------------

type FieldStatus = 'idle' | 'saving' | 'saved' | 'error'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [localValues, setLocalValues] = useState<Record<string, string>>({})
  const [fieldStatus, setFieldStatus] = useState<Record<string, FieldStatus>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // -----------------------------------------------------------------------
  // Load settings on mount
  // -----------------------------------------------------------------------

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const s = (data.settings ?? {}) as Record<string, unknown>
      setSettings(s)

      // Hydrate local input values from stored settings
      const initial: Record<string, string> = {}
      for (const category of SETTING_CATEGORIES) {
        for (const field of category.fields) {
          const stored = s[field.key]
          if (field.type === 'multi-select') {
            // Store as JSON string for multi-select
            initial[field.key] = Array.isArray(stored) ? JSON.stringify(stored) : '[]'
          } else if (field.type === 'boolean') {
            initial[field.key] = stored === true ? 'true' : 'false'
          } else {
            initial[field.key] = stored != null ? String(stored) : ''
          }
        }
      }
      setLocalValues(initial)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // -----------------------------------------------------------------------
  // Save a value for any field type
  // -----------------------------------------------------------------------

  const saveValue = async (key: string, value: unknown) => {
    setFieldStatus((prev) => ({ ...prev, [key]: 'saving' }))
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }

      setSettings((prev) => ({ ...prev, [key]: value }))
      setFieldStatus((prev) => ({ ...prev, [key]: 'saved' }))

      setTimeout(() => {
        setFieldStatus((prev) =>
          prev[key] === 'saved' ? { ...prev, [key]: 'idle' } : prev
        )
      }, 2000)
    } catch (err) {
      setFieldStatus((prev) => ({ ...prev, [key]: 'error' }))
      setFieldErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : 'Save failed',
      }))
    }
  }

  const saveNumberField = async (field: NumberField) => {
    const raw = localValues[field.key] ?? ''
    if (raw.trim() === '') return

    const numVal = Number(raw)
    if (isNaN(numVal)) {
      setFieldStatus((prev) => ({ ...prev, [field.key]: 'error' }))
      setFieldErrors((prev) => ({ ...prev, [field.key]: 'Must be a number' }))
      return
    }

    if (field.type === 'integer' && !Number.isInteger(numVal)) {
      setFieldStatus((prev) => ({ ...prev, [field.key]: 'error' }))
      setFieldErrors((prev) => ({ ...prev, [field.key]: 'Must be a whole number' }))
      return
    }

    await saveValue(field.key, numVal)
  }

  // -----------------------------------------------------------------------
  // Check if a field has unsaved changes
  // -----------------------------------------------------------------------

  const isDirty = (key: string) => {
    const stored = settings[key]
    const local = localValues[key] ?? ''
    if (local.trim() === '' && stored == null) return false
    if (stored == null) return local.trim() !== ''
    // For arrays, compare JSON
    if (Array.isArray(stored)) return JSON.stringify(stored) !== local
    return String(stored) !== local
  }

  // -----------------------------------------------------------------------
  // Status badge
  // -----------------------------------------------------------------------

  const StatusBadge = ({ fieldKey }: { fieldKey: string }) => {
    const status = fieldStatus[fieldKey] ?? 'idle'
    if (status === 'saving') return <span className="text-xs text-venetian-gold/60 animate-pulse">Saving…</span>
    if (status === 'saved') return <span className="text-xs text-green-400">Saved</span>
    if (status === 'error') return <span className="text-xs text-blood-ruby">{fieldErrors[fieldKey]}</span>
    return null
  }

  // -----------------------------------------------------------------------
  // Render field by type
  // -----------------------------------------------------------------------

  const renderField = (field: SettingField) => {
    const status = fieldStatus[field.key] ?? 'idle'

    // Number / Integer field
    if (field.type === 'number' || field.type === 'integer') {
      const nf = field as NumberField
      const dirty = isDirty(field.key)
      return (
        <div key={field.key}>
          <label className="block text-xs text-venetian-gold/70 mb-1">
            {field.label}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                step={nf.step ?? 1}
                value={localValues[field.key] ?? ''}
                placeholder={nf.placeholder ?? ''}
                onChange={(e) =>
                  setLocalValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && dirty) saveNumberField(nf)
                }}
                className="w-full px-3 py-1.5 bg-midnight-black/70 border border-masque-gold/20 rounded-lg text-sm text-bone-white placeholder:text-bone-white/20 focus:outline-none focus:border-masque-gold/50 transition-colors font-mono"
              />
              {nf.suffix && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-venetian-gold/40 pointer-events-none">
                  {nf.suffix}
                </span>
              )}
            </div>
            <button
              onClick={() => saveNumberField(nf)}
              disabled={!dirty || status === 'saving'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                status === 'saved'
                  ? 'bg-green-700/30 text-green-400 border border-green-500/30'
                  : status === 'error'
                    ? 'bg-blood-ruby/20 text-blood-ruby border border-blood-ruby/30'
                    : dirty
                      ? 'bg-masque-gold/20 text-masque-gold border border-masque-gold/40 hover:bg-masque-gold/30'
                      : 'bg-midnight-black/30 text-bone-white/20 border border-bone-white/10 cursor-not-allowed'
              }`}
            >
              {status === 'saving' ? '…' : status === 'saved' ? '✓' : status === 'error' ? '!' : 'Save'}
            </button>
          </div>
          {status === 'error' && fieldErrors[field.key] && (
            <p className="text-xs text-blood-ruby mt-1">{fieldErrors[field.key]}</p>
          )}
        </div>
      )
    }

    // Boolean toggle
    if (field.type === 'boolean') {
      const bf = field as BooleanField
      const isOn = localValues[field.key] === 'true'
      return (
        <div key={field.key} className="flex items-start justify-between gap-3 py-1">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-venetian-gold/70">{field.label}</div>
            {bf.description && (
              <div className="text-[10px] text-bone-white/30 mt-0.5 leading-tight">{bf.description}</div>
            )}
            <StatusBadge fieldKey={field.key} />
          </div>
          <button
            onClick={async () => {
              const newVal = !isOn
              setLocalValues((prev) => ({ ...prev, [field.key]: String(newVal) }))
              await saveValue(field.key, newVal)
            }}
            disabled={status === 'saving'}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              isOn ? 'bg-masque-gold' : 'bg-bone-white/20'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-bone-white shadow-sm transition-transform ${
                isOn ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )
    }

    // Select dropdown
    if (field.type === 'select') {
      const sf = field as SelectField
      return (
        <div key={field.key}>
          <label className="block text-xs text-venetian-gold/70 mb-1">
            {field.label}
          </label>
          <div className="flex items-center gap-2">
            <select
              value={localValues[field.key] ?? ''}
              onChange={async (e) => {
                const val = e.target.value
                setLocalValues((prev) => ({ ...prev, [field.key]: val }))
                // Auto-save on selection — need to convert numeric strings back to numbers for numeric settings
                const numVal = Number(val)
                await saveValue(field.key, Number.isFinite(numVal) && sf.options.some((o) => o.value === val) ? (val.includes('.') || !isNaN(numVal) ? numVal : val) : val)
              }}
              disabled={status === 'saving'}
              className="flex-1 px-3 py-1.5 bg-midnight-black/70 border border-masque-gold/20 rounded-lg text-sm text-bone-white focus:outline-none focus:border-masque-gold/50 transition-colors"
            >
              {sf.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <StatusBadge fieldKey={field.key} />
          </div>
        </div>
      )
    }

    // Multi-select checkboxes
    if (field.type === 'multi-select') {
      const mf = field as MultiSelectField
      let selected: string[] = []
      try {
        selected = JSON.parse(localValues[field.key] ?? '[]')
      } catch { /* keep empty */ }
      return (
        <div key={field.key}>
          <label className="block text-xs text-venetian-gold/70 mb-1.5">
            {field.label}
          </label>
          <div className="space-y-1.5">
            {mf.options.map((opt) => {
              const checked = selected.includes(opt.value)
              return (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={async () => {
                      const next = checked
                        ? selected.filter((v) => v !== opt.value)
                        : [...selected, opt.value]
                      if (next.length === 0) return // Must have at least one
                      setLocalValues((prev) => ({ ...prev, [field.key]: JSON.stringify(next) }))
                      await saveValue(field.key, next)
                    }}
                    disabled={status === 'saving' || (checked && selected.length === 1)}
                    className="h-3.5 w-3.5 rounded border-masque-gold/30 bg-midnight-black/70 text-masque-gold focus:ring-masque-gold/30 accent-masque-gold"
                  />
                  <span className="text-sm text-bone-white/80 group-hover:text-bone-white transition-colors">
                    {opt.label}
                  </span>
                </label>
              )
            })}
          </div>
          <StatusBadge fieldKey={field.key} />
        </div>
      )
    }

    return null
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-midnight-black text-bone-white p-6 flex items-center justify-center">
        <p className="text-venetian-gold/60 animate-pulse">Loading settings…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-midnight-black text-bone-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-blood-ruby/20 border border-blood-ruby/40 rounded-lg p-4">
            <p className="text-blood-ruby">{fetchError}</p>
          </div>
          <button
            onClick={fetchSettings}
            className="mt-4 text-sm text-venetian-gold hover:text-masque-gold"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-midnight-black text-bone-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)]">
            Settings
          </h1>
          <Link
            href="/admin"
            className="text-sm text-venetian-gold hover:text-masque-gold transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>

        {/* Info banner */}
        <div className="mb-6 p-4 bg-jester-purple/10 border border-jester-purple/30 rounded-xl">
          <p className="text-sm text-jester-purple font-medium">
            Settings are enforced in real-time by game and alert logic.
          </p>
          <p className="text-xs text-venetian-gold/50 mt-1">
            Game rules, bet limits, responsible gambling limits, alert thresholds, and pool health
            parameters are applied immediately. All changes are audit-logged.
          </p>
        </div>

        {/* Setting category cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SETTING_CATEGORIES.map((category) => (
            <div
              key={category.title}
              className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4"
            >
              <h2 className="text-lg font-semibold text-bone-white mb-1">
                {category.title}
              </h2>
              <p className="text-xs text-venetian-gold/60 mb-4 leading-relaxed">
                {category.description}
              </p>

              <div className="space-y-3">
                {category.fields.map(renderField)}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 text-xs text-bone-white/30 text-center">
          Settings are backed by the AdminConfig model. All changes are audit-logged.
        </div>
      </div>
    </div>
  )
}
