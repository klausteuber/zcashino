import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import JesterLogo from '@/components/ui/JesterLogo'
import { getBrandUrlForPath, getCanonicalUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'
import SiteHeader from '@/components/layout/SiteHeader'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  const brandUrl = getBrandUrlForPath(brand.id, '/terms')
  const canonicalUrl = getCanonicalUrlForPath(brand.id, '/terms')
  const brandTitle = brand.id === '21z' ? '21z' : 'CypherJester'

  return {
    title: 'Terms of Service',
    description:
      `Terms and conditions for using ${brandTitle}, a provably fair privacy casino powered by Zcash.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Terms of Service | ${brandTitle}`,
      url: brandUrl,
    },
  }
}

export default async function TermsPage() {
  const brand = await getServerBrand()

  return (
    <main className="min-h-screen felt-texture">
      <SiteHeader />

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-8 text-bone-white">Terms of Service</h1>
        <div className="prose prose-invert prose-gold space-y-6 text-venetian-gold/80">

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using {brand.config.name}, you agree to be bound by these Terms of Service. If you do not agree, do not use our platform. You must be at least 18 years old (or the legal gambling age in your jurisdiction) to use {brand.config.name}.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">2. Eligibility</h2>
            <p>You represent and warrant that:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You are at least 18 years of age or the minimum legal gambling age in your jurisdiction, whichever is higher.</li>
              <li>Online gambling is legal in your jurisdiction.</li>
              <li>You are not located in a jurisdiction where online gambling is prohibited.</li>
              <li>You are using your own funds and not funds obtained through illegal activity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">3. Account & Sessions</h2>
            <p>{brand.config.name} operates on a session-based model tied to your Zcash wallet address. No personal accounts are created. You are responsible for maintaining the security of your wallet keys. We cannot recover lost funds if you lose access to your wallet.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">4. Deposits & Withdrawals</h2>
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
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">5. Provably Fair Gaming</h2>
            <p>All game outcomes are determined using a provably fair algorithm. Server seeds are committed to the Zcash blockchain before bets are placed. After each game, you can verify the outcome using the verification page at <Link href="/verify" className="text-masque-gold hover:underline">/verify</Link>. Game rules, including house edges, are disclosed on our homepage.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">6. House Edge</h2>
            <p>Our house edges are publicly disclosed:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Blackjack (basic strategy): approximately 0.5% depending on decisions</li>
              <li>Perfect Pairs side bet: approximately 4.5%</li>
              <li>Insurance bet: approximately 7.4%</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">7. Prohibited Activities</h2>
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
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">8. Limitation of Liability</h2>
            <p>{brand.config.name} is provided &quot;as is&quot; without warranties of any kind. We are not liable for any losses incurred through gambling. You acknowledge that gambling involves risk and that you may lose your deposited funds. We are not responsible for blockchain network delays, failures, or fees beyond our control.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">9. Dispute Resolution</h2>
            <p>All game outcomes are verifiable on-chain. If you believe a game outcome is incorrect, you may verify it using the provably fair verification page. If you have a dispute regarding deposits or withdrawals, contact us and we will investigate. The provably fair verification system serves as the definitive record of game outcomes.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">10. Responsible Gambling</h2>
            <p>We encourage responsible gambling. Deposit limits, loss limits, session time limits, and self-exclusion periods are all enforced. For more information, visit our <Link href="/responsible-gambling" className="text-masque-gold hover:underline">Responsible Gambling</Link> page.</p>
          </section>

          <section>
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">11. Changes to Terms</h2>
            <p>We may update these terms at any time. Continued use of the platform constitutes acceptance of updated terms. Material changes will be communicated through the platform.</p>
          </section>

          <p className="text-venetian-gold/50 text-sm border-t border-masque-gold/20 pt-6">
            Last updated: February 2026
          </p>
        </div>
      </div>
    </main>
  )
}
