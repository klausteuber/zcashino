'use client'

import { useState } from 'react'

interface LimitsPanelProps {
  sessionId: string
  currentDepositLimit: number | null
  currentLossLimit: number | null
  currentSessionLimit: number | null
}

export default function LimitsPanel({
  sessionId,
  currentDepositLimit,
  currentLossLimit,
  currentSessionLimit,
}: LimitsPanelProps) {
  const [depositLimit, setDepositLimit] = useState(currentDepositLimit?.toString() ?? '')
  const [lossLimit, setLossLimit] = useState(currentLossLimit?.toString() ?? '')
  const [sessionLimit, setSessionLimit] = useState(currentSessionLimit?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)

    const payload: Record<string, unknown> = {
      action: 'update-limits',
      sessionId,
    }

    const depVal = depositLimit.trim() ? parseFloat(depositLimit) : null
    const lossVal = lossLimit.trim() ? parseFloat(lossLimit) : null
    const sessVal = sessionLimit.trim() ? parseInt(sessionLimit, 10) : null

    if (depositLimit.trim() && (isNaN(depVal!) || depVal! < 0)) {
      setError('Deposit limit must be a positive number')
      setSaving(false)
      return
    }
    if (lossLimit.trim() && (isNaN(lossVal!) || lossVal! < 0)) {
      setError('Loss limit must be a positive number')
      setSaving(false)
      return
    }
    if (sessionLimit.trim() && (isNaN(sessVal!) || sessVal! < 1)) {
      setError('Session limit must be at least 1 minute')
      setSaving(false)
      return
    }

    payload.depositLimit = depVal
    payload.lossLimit = lossVal
    payload.sessionLimit = sessVal

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update limits')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="text-venetian-gold/70 mb-5">
        Set personal limits to help control your gambling. Leave a field empty to remove the limit.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-bone-white mb-1">
            Deposit Limit (ZEC per day)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={depositLimit}
            onChange={(e) => setDepositLimit(e.target.value)}
            placeholder="No limit"
            className="w-full px-4 py-2 bg-midnight-black/50 border border-masque-gold/30 rounded-lg text-bone-white placeholder-venetian-gold/40 focus:border-masque-gold focus:outline-none text-sm"
          />
          <p className="text-venetian-gold/50 text-xs mt-1">
            Maximum ZEC you can deposit per day. Planned — not yet enforced on deposits.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-bone-white mb-1">
            Loss Limit (ZEC per session)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={lossLimit}
            onChange={(e) => setLossLimit(e.target.value)}
            placeholder="No limit"
            className="w-full px-4 py-2 bg-midnight-black/50 border border-masque-gold/30 rounded-lg text-bone-white placeholder-venetian-gold/40 focus:border-masque-gold focus:outline-none text-sm"
          />
          <p className="text-venetian-gold/50 text-xs mt-1">
            When your net session loss reaches this cap, new wagers are blocked.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-bone-white mb-1">
            Session Time Limit (minutes)
          </label>
          <input
            type="number"
            step="1"
            min="1"
            value={sessionLimit}
            onChange={(e) => setSessionLimit(e.target.value)}
            placeholder="No limit"
            className="w-full px-4 py-2 bg-midnight-black/50 border border-masque-gold/30 rounded-lg text-bone-white placeholder-venetian-gold/40 focus:border-masque-gold focus:outline-none text-sm"
          />
          <p className="text-venetian-gold/50 text-xs mt-1">
            When elapsed session time reaches this limit, new wagers are blocked.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-blood-ruby text-sm mt-3">{error}</p>
      )}
      {success && (
        <p className="text-green-400 text-sm mt-3">Limits updated successfully.</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-5 px-5 py-2 rounded-lg bg-masque-gold text-midnight-black font-semibold text-sm disabled:opacity-50 hover:bg-masque-gold/80 transition-colors"
      >
        {saving ? 'Saving...' : 'Save Limits'}
      </button>
    </div>
  )
}
