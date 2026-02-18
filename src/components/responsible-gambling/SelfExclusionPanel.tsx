'use client'

import { useState } from 'react'

const DURATIONS = [
  { value: '24h', label: '24 Hours', description: 'Cool-off period' },
  { value: '1w', label: '1 Week', description: 'Short break' },
  { value: '1m', label: '1 Month', description: 'Extended break' },
  { value: '6m', label: '6 Months', description: 'Long break' },
  { value: '1y', label: '1 Year', description: 'Year-long break' },
  { value: 'permanent', label: 'Permanent', description: 'Irreversible' },
] as const

interface SelfExclusionPanelProps {
  sessionId: string
  excludedUntil?: string | null
}

export default function SelfExclusionPanel({ sessionId, excludedUntil }: SelfExclusionPanelProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [step, setStep] = useState<'select' | 'confirm' | 'done'>('select')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultDate, setResultDate] = useState<string | null>(null)

  // Already excluded
  if (excludedUntil) {
    const until = new Date(excludedUntil)
    const isPermanent = until.getFullYear() > 2099
    return (
      <div className="p-5 rounded-lg border border-blood-ruby/40 bg-blood-ruby/10">
        <h3 className="text-lg font-semibold text-bone-white mb-2">Self-Exclusion Active</h3>
        <p className="text-venetian-gold/80">
          {isPermanent
            ? 'You are permanently excluded from this platform.'
            : `You are excluded until ${until.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`}
        </p>
        <p className="text-venetian-gold/60 text-sm mt-2">
          This cannot be reversed during the exclusion period.
        </p>
      </div>
    )
  }

  if (step === 'done') {
    const d = resultDate ? new Date(resultDate) : null
    const isPermanent = d && d.getFullYear() > 2099
    return (
      <div className="p-5 rounded-lg border border-jester-purple/40 bg-jester-purple/10">
        <h3 className="text-lg font-semibold text-bone-white mb-2">Self-Exclusion Confirmed</h3>
        <p className="text-venetian-gold/80">
          {isPermanent
            ? 'You have been permanently excluded from this platform.'
            : `You are excluded until ${d?.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`}
        </p>
        <p className="text-venetian-gold/60 text-sm mt-2">
          You will not be able to place any wagers during this period. Withdrawals remain available.
        </p>
      </div>
    )
  }

  async function handleConfirm() {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-limits',
          sessionId,
          excludeDuration: selected,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to set exclusion')
      setResultDate(data.excludedUntil)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedDuration = DURATIONS.find((d) => d.value === selected)

  return (
    <div>
      {step === 'select' && (
        <>
          <p className="text-venetian-gold/70 mb-4">
            Choose how long you want to be excluded. During this period, all wagers will be blocked. This cannot be undone early.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setSelected(d.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  selected === d.value
                    ? 'border-masque-gold bg-masque-gold/10 text-bone-white'
                    : 'border-masque-gold/20 bg-midnight-black/30 text-venetian-gold/70 hover:border-masque-gold/40'
                }`}
              >
                <span className="block font-semibold text-sm">{d.label}</span>
                <span className="block text-xs mt-0.5 opacity-70">{d.description}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (selected) setStep('confirm')
            }}
            disabled={!selected}
            className="px-5 py-2 rounded-lg bg-blood-ruby text-bone-white font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blood-ruby/80 transition-colors"
          >
            Continue
          </button>
        </>
      )}

      {step === 'confirm' && (
        <div className="p-5 rounded-lg border border-blood-ruby/40 bg-blood-ruby/10">
          <h3 className="text-lg font-semibold text-bone-white mb-2">Are you sure?</h3>
          <p className="text-venetian-gold/80 mb-1">
            You are about to exclude yourself for <strong className="text-bone-white">{selectedDuration?.label}</strong>.
          </p>
          <p className="text-venetian-gold/60 text-sm mb-4">
            {selected === 'permanent'
              ? 'This is permanent and cannot be reversed under any circumstances.'
              : 'This cannot be reversed during the exclusion period. You will not be able to place wagers, but withdrawals will remain available.'}
          </p>
          {error && (
            <p className="text-blood-ruby text-sm mb-3">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-blood-ruby text-bone-white font-semibold text-sm disabled:opacity-50 hover:bg-blood-ruby/80 transition-colors"
            >
              {submitting ? 'Processing...' : 'Confirm Exclusion'}
            </button>
            <button
              onClick={() => {
                setStep('select')
                setError(null)
              }}
              disabled={submitting}
              className="px-5 py-2 rounded-lg border border-masque-gold/30 text-venetian-gold text-sm hover:border-masque-gold/60 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
