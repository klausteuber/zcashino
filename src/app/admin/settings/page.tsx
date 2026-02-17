'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Setting field definitions
// ---------------------------------------------------------------------------

interface SettingField {
  key: string
  label: string
  type: 'number' | 'integer'
  step?: number
  placeholder?: string
  suffix?: string
}

interface SettingCategory {
  title: string
  description: string
  fields: SettingField[]
}

const SETTING_CATEGORIES: SettingCategory[] = [
  {
    title: 'Game Limits',
    description:
      'Minimum and maximum bet amounts per game type. These values are stored for reference; enforcement is handled by game logic.',
    fields: [
      { key: 'blackjack.minBet', label: 'Blackjack min bet', type: 'number', step: 0.0001, suffix: 'ZEC' },
      { key: 'blackjack.maxBet', label: 'Blackjack max bet', type: 'number', step: 0.0001, suffix: 'ZEC' },
      { key: 'videoPoker.minBet', label: 'Video Poker min bet', type: 'number', step: 0.0001, suffix: 'ZEC' },
      { key: 'videoPoker.maxBet', label: 'Video Poker max bet', type: 'number', step: 0.0001, suffix: 'ZEC' },
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
          initial[field.key] = stored != null ? String(stored) : ''
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
  // Save a single field
  // -----------------------------------------------------------------------

  const saveField = async (field: SettingField) => {
    const raw = localValues[field.key] ?? ''

    // Allow clearing a field (empty string)
    if (raw.trim() === '') {
      // Skip saving empty — or clear the value
      return
    }

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

    setFieldStatus((prev) => ({ ...prev, [field.key]: 'saving' }))
    setFieldErrors((prev) => ({ ...prev, [field.key]: '' }))

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: field.key, value: numVal }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }

      setSettings((prev) => ({ ...prev, [field.key]: numVal }))
      setFieldStatus((prev) => ({ ...prev, [field.key]: 'saved' }))

      // Clear "saved" after 2 seconds
      setTimeout(() => {
        setFieldStatus((prev) =>
          prev[field.key] === 'saved' ? { ...prev, [field.key]: 'idle' } : prev
        )
      }, 2000)
    } catch (err) {
      setFieldStatus((prev) => ({ ...prev, [field.key]: 'error' }))
      setFieldErrors((prev) => ({
        ...prev,
        [field.key]: err instanceof Error ? err.message : 'Save failed',
      }))
    }
  }

  // -----------------------------------------------------------------------
  // Check if a field has unsaved changes
  // -----------------------------------------------------------------------

  const isDirty = (key: string) => {
    const stored = settings[key]
    const local = localValues[key] ?? ''
    if (local.trim() === '' && stored == null) return false
    if (stored == null) return local.trim() !== ''
    return String(stored) !== local
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
            ⚠ Settings are stored but not yet enforced by game/pool logic.
          </p>
          <p className="text-xs text-venetian-gold/50 mt-1">
            Values saved here are persisted to the database and audit-logged.
            Enforcement wiring is a follow-up.
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
                {category.fields.map((field) => {
                  const status = fieldStatus[field.key] ?? 'idle'
                  const error = fieldErrors[field.key] ?? ''
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
                            step={field.step ?? 1}
                            value={localValues[field.key] ?? ''}
                            placeholder={field.placeholder ?? ''}
                            onChange={(e) =>
                              setLocalValues((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && dirty) saveField(field)
                            }}
                            className="w-full px-3 py-1.5 bg-midnight-black/70 border border-masque-gold/20 rounded-lg text-sm text-bone-white placeholder:text-bone-white/20 focus:outline-none focus:border-masque-gold/50 transition-colors font-mono"
                          />
                          {field.suffix && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-venetian-gold/40 pointer-events-none">
                              {field.suffix}
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => saveField(field)}
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
                          {status === 'saving'
                            ? '…'
                            : status === 'saved'
                              ? '✓'
                              : status === 'error'
                                ? '!'
                                : 'Save'}
                        </button>
                      </div>

                      {/* Error message */}
                      {status === 'error' && error && (
                        <p className="text-xs text-blood-ruby mt-1">{error}</p>
                      )}
                    </div>
                  )
                })}
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
