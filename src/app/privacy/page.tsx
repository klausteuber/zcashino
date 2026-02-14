import type { Metadata } from 'next'
import Link from 'next/link'
import JesterLogo from '@/components/ui/JesterLogo'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How CypherJester handles your data and protects your privacy. No KYC, no tracking, privacy by design.',
  openGraph: {
    title: 'Privacy Policy | CypherJester',
    url: 'https://cypherjester.com/privacy',
  },
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen felt-texture">
      <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <JesterLogo size="md" className="text-jester-purple-light" />
            <span className="text-xl font-display font-bold tracking-tight">
              <span className="text-masque-gold">Cypher</span>
              <span className="text-bone-white">Jester</span>
            </span>
          </Link>
          <Link href="/blackjack" className="btn-gold-shimmer text-midnight-black px-4 py-2 rounded-lg font-semibold">
            Play Now
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-8 text-bone-white">Privacy Policy</h1>
        <div className="prose prose-invert prose-gold space-y-6 text-venetian-gold/80">

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Privacy-First Design</h2>
            <p>CypherJester is built with privacy as a core principle. We do not require personal accounts, email addresses, or any identifying information to use the platform. Your gaming session is tied to a Zcash wallet address, not to your identity.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Data We Collect</h2>
            <p>We collect only the minimum data necessary to operate the platform:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong className="text-bone-white">Zcash wallet addresses</strong> &mdash; Your deposit and withdrawal addresses, used to process transactions.</li>
              <li><strong className="text-bone-white">Game records</strong> &mdash; Bet amounts, game outcomes, and provably fair seed data. Required for verification and dispute resolution.</li>
              <li><strong className="text-bone-white">Transaction records</strong> &mdash; Deposit and withdrawal amounts, transaction hashes, and confirmation status.</li>
              <li><strong className="text-bone-white">Session data</strong> &mdash; Balance, wagering totals, and responsible gambling limits you set.</li>
              <li><strong className="text-bone-white">IP addresses</strong> &mdash; Used temporarily for rate limiting and geo-compliance checks. Not stored long-term or linked to sessions.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Data We Do Not Collect</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Names, email addresses, or phone numbers</li>
              <li>Government-issued identification</li>
              <li>Bank account or credit card information</li>
              <li>Location data beyond IP-based geo-checks</li>
              <li>Browsing history or cross-site tracking data</li>
              <li>Social media profiles or contacts</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Processing deposits and withdrawals</li>
              <li>Operating the provably fair gaming system</li>
              <li>Enforcing responsible gambling limits you set</li>
              <li>Preventing abuse and fraud</li>
              <li>Complying with legal requirements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Blockchain Data</h2>
            <p>Zcash transactions are recorded on the blockchain. Transparent address transactions are publicly visible on block explorers. For maximum privacy, we support shielded (z-address) withdrawals. Provably fair commitments are published to the blockchain as part of the verification system.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Cookies & Local Storage</h2>
            <p>We use browser local storage to remember your session ID so you can resume your session. We do not use third-party tracking cookies. Admin sessions use HTTP-only secure cookies for authentication.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Data Retention</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Game records are retained indefinitely for provably fair verification.</li>
              <li>Transaction records are retained for operational and compliance purposes.</li>
              <li>IP-based rate limiting data is held in memory and cleared on server restart.</li>
              <li>Geo-check logs are retained for up to 30 days.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Third-Party Services</h2>
            <p>We may use error tracking services (such as Sentry) to monitor platform stability. These services may receive anonymized error data including stack traces and request metadata. No wallet addresses or game data are sent to third parties for marketing purposes.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Data Security</h2>
            <p>We protect your data with HTTPS encryption, secure HTTP-only cookies, rate limiting, and regular security reviews. However, no system is perfectly secure. You are responsible for safeguarding your own wallet keys.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">Changes to This Policy</h2>
            <p>We may update this privacy policy at any time. Material changes will be communicated through the platform. Continued use constitutes acceptance of the updated policy.</p>
          </section>

          <p className="text-venetian-gold/50 text-sm border-t border-masque-gold/20 pt-6">
            Last updated: February 2026
          </p>
        </div>
      </div>
    </main>
  )
}
