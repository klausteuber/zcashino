'use client'

import Link from 'next/link'

// ---------------------------------------------------------------------------
// Setting categories — displayed as Coming Soon placeholder cards
// ---------------------------------------------------------------------------

interface SettingCategory {
  title: string
  description: string
  fields: string[]
}

const SETTING_CATEGORIES: SettingCategory[] = [
  {
    title: 'Game Limits',
    description:
      'Minimum and maximum bet amounts per game type. These values are currently hardcoded and will become configurable through the admin dashboard.',
    fields: [
      'Blackjack min bet',
      'Blackjack max bet',
      'Video Poker min bet',
      'Video Poker max bet',
    ],
  },
  {
    title: 'Alert Thresholds',
    description:
      'Thresholds that trigger admin alerts for unusual activity. Large wins and abnormal RTP values will generate notifications.',
    fields: [
      'Large win threshold (ZEC)',
      'High RTP threshold (%)',
      'Consecutive wins alert count',
    ],
  },
  {
    title: 'Pool Settings',
    description:
      'Commitment pool management parameters. Controls when automatic refills are triggered and pool size targets.',
    fields: [
      'Auto-refill threshold (min available)',
      'Target pool size',
      'Minimum healthy count',
      'Commitment expiry (minutes)',
    ],
  },
  {
    title: 'Responsible Gambling Defaults',
    description:
      'Default limits applied to new player sessions. Players can set stricter personal limits but cannot exceed these defaults.',
    fields: [
      'Default deposit limit (ZEC / 24h)',
      'Default loss limit (ZEC / 24h)',
      'Default session time limit (minutes)',
      'Self-exclusion minimum period (days)',
    ],
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminSettingsPage() {
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
        <div className="mb-6 p-4 bg-midnight-black/50 border border-masque-gold/20 rounded-xl">
          <p className="text-sm text-venetian-gold/70">
            Runtime configuration for the CypherJester platform. Settings stored in
            AdminConfig will be editable here once the backend integration is complete.
            Currently showing placeholder sections for planned configuration areas.
          </p>
        </div>

        {/* Setting category cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SETTING_CATEGORIES.map((category) => (
            <div
              key={category.title}
              className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl p-4 relative overflow-hidden"
            >
              {/* Coming Soon overlay */}
              <div className="absolute top-3 right-3">
                <span className="text-[10px] px-2 py-0.5 rounded bg-jester-purple/20 text-jester-purple border border-jester-purple/30 font-bold uppercase tracking-wider">
                  Coming Soon
                </span>
              </div>

              <h2 className="text-lg font-semibold text-bone-white mb-2 pr-24">
                {category.title}
              </h2>
              <p className="text-xs text-venetian-gold/60 mb-4 leading-relaxed">
                {category.description}
              </p>

              {/* Field list — shown as disabled placeholders */}
              <div className="space-y-2">
                {category.fields.map((field) => (
                  <div
                    key={field}
                    className="flex items-center justify-between gap-3 px-3 py-2 bg-midnight-black/70 border border-masque-gold/10 rounded-lg opacity-50"
                  >
                    <span className="text-xs text-venetian-gold/60">{field}</span>
                    <span className="text-xs text-bone-white/30 font-mono">--</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 text-xs text-bone-white/30 text-center">
          Settings are backed by the AdminConfig model. Use the API at
          /api/admin/settings to read and update configuration programmatically.
        </div>
      </div>
    </div>
  )
}
