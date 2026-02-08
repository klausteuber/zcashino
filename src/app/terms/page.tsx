import type { Metadata } from 'next'
import PepeLogo from '@/components/ui/PepeLogo'

export const metadata: Metadata = {
  title: 'Terms of Service - Zcashino',
  description: 'Terms and conditions for using Zcashino, a provably fair privacy casino.',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen felt-texture">
      <header className="border-b border-monaco-gold/20 bg-rich-black/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <a href="/" className="flex items-center gap-3">
            <PepeLogo size="md" className="text-pepe-green-light" />
            <span className="text-xl font-display font-bold tracking-tight">
              <span className="text-monaco-gold">Z</span>
              <span className="text-ivory-white">cashino</span>
            </span>
          </a>
          <a href="/blackjack" className="btn-gold-shimmer text-rich-black px-4 py-2 rounded-lg font-semibold">
            Play Now
          </a>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-8 text-ivory-white">Terms of Service</h1>
        <div className="prose prose-invert prose-gold space-y-6 text-champagne-gold/80">

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using Zcashino, you agree to be bound by these Terms of Service. If you do not agree, do not use our platform. You must be at least 18 years old (or the legal gambling age in your jurisdiction) to use Zcashino.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">2. Eligibility</h2>
            <p>You represent and warrant that:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You are at least 18 years of age or the minimum legal gambling age in your jurisdiction, whichever is higher.</li>
              <li>Online gambling is legal in your jurisdiction.</li>
              <li>You are not located in a jurisdiction where online gambling is prohibited.</li>
              <li>You are using your own funds and not funds obtained through illegal activity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">3. Account & Sessions</h2>
            <p>Zcashino operates on a session-based model tied to your Zcash wallet address. No personal accounts are created. You are responsible for maintaining the security of your wallet keys. We cannot recover lost funds if you lose access to your wallet.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">4. Deposits & Withdrawals</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Deposits are accepted in Zcash (ZEC) only.</li>
              <li>Minimum deposit and withdrawal amounts apply.</li>
              <li>A network fee applies to all withdrawals.</li>
              <li>Withdrawals are sent to the address registered during session setup.</li>
              <li>Processing times depend on blockchain confirmation times.</li>
              <li>We reserve the right to delay or refuse withdrawals if fraud is suspected.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">5. Provably Fair Gaming</h2>
            <p>All game outcomes are determined using a provably fair algorithm. Server seeds are committed to the Zcash blockchain before bets are placed. After each game, you can verify the outcome using the verification page at <a href="/verify" className="text-monaco-gold hover:underline">/verify</a>. Game rules, including house edges, are disclosed on our homepage.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">6. House Edge</h2>
            <p>Our house edges are publicly disclosed:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Blackjack (basic strategy): approximately 0.5%</li>
              <li>Perfect Pairs side bet: approximately 4.5%</li>
              <li>Insurance bet: approximately 7.4%</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">7. Prohibited Activities</h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Use automated bots or software to play games.</li>
              <li>Exploit bugs, vulnerabilities, or errors in the platform.</li>
              <li>Attempt to manipulate game outcomes.</li>
              <li>Use the platform for money laundering or other illegal activities.</li>
              <li>Circumvent geographic restrictions or age verification.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">8. Limitation of Liability</h2>
            <p>Zcashino is provided &quot;as is&quot; without warranties of any kind. We are not liable for any losses incurred through gambling. You acknowledge that gambling involves risk and that you may lose your deposited funds. We are not responsible for blockchain network delays, failures, or fees beyond our control.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">9. Dispute Resolution</h2>
            <p>All game outcomes are verifiable on-chain. If you believe a game outcome is incorrect, you may verify it using the provably fair verification page. If you have a dispute regarding deposits or withdrawals, contact us and we will investigate. The provably fair verification system serves as the definitive record of game outcomes.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">10. Responsible Gambling</h2>
            <p>We encourage responsible gambling. You can set deposit limits, loss limits, and self-exclusion periods through the platform. For more information, visit our <a href="/responsible-gambling" className="text-monaco-gold hover:underline">Responsible Gambling</a> page.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-ivory-white mb-3">11. Changes to Terms</h2>
            <p>We may update these terms at any time. Continued use of the platform constitutes acceptance of updated terms. Material changes will be communicated through the platform.</p>
          </section>

          <p className="text-champagne-gold/50 text-sm border-t border-monaco-gold/20 pt-6">
            Last updated: February 2026
          </p>
        </div>
      </div>
    </main>
  )
}
