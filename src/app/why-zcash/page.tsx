import type { Metadata } from 'next'
import Link from 'next/link'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { getBrandUrlForPath, getCanonicalUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'
import SiteHeader from '@/components/layout/SiteHeader'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  const brandTitle = brand.id === '21z' ? '21z' : 'CypherJester'
  const brandUrl = getBrandUrlForPath(brand.id, '/why-zcash')
  const canonicalUrl = getCanonicalUrlForPath(brand.id, '/why-zcash')

  return {
    title: 'Why Zcash?',
    description:
      `Why ${brandTitle} is built on Zcash. Financial privacy for gambling — shielded transactions, no address reuse, no on-chain surveillance.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Why Zcash for Gambling | ${brandTitle}`,
      description:
        'Privacy is not optional — it is the point. Learn why Zcash is the right chain for provably fair gambling.',
      url: brandUrl,
    },
  }
}

export default async function WhyZcashPage() {
  const brand = await getServerBrand()
  const homeUrl = getBrandUrlForPath(brand.id, '/')
  const pageUrl = getBrandUrlForPath(brand.id, '/why-zcash')

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: homeUrl },
          { name: 'Why Zcash?', url: pageUrl },
        ]}
      />
    <main className="min-h-screen felt-texture">
      <SiteHeader />

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-display font-bold text-bone-white mb-4">Why Zcash?</h1>
          <p className="text-lg text-venetian-gold/70">
            Privacy isn&apos;t optional &mdash; it&apos;s the point.
          </p>
        </div>

        {/* The Problem */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-4">The Problem with Transparent Chains</h2>
          <div className="space-y-4 text-venetian-gold/80">
            <p>
              When you gamble with Bitcoin or Ethereum, every deposit and withdrawal is visible
              on a public ledger. Anyone with your address &mdash; an exchange, an employer, a data
              broker &mdash; can see exactly what you did, when, and how much.
            </p>
            <div className="p-4 bg-midnight-black/60 rounded-lg border border-blood-ruby/30">
              <h3 className="text-sm font-semibold text-blood-ruby mb-2">What transparent chains expose:</h3>
              <ul className="space-y-2 text-sm text-venetian-gold/70">
                <li className="flex gap-2">
                  <span className="text-blood-ruby shrink-0">&#10005;</span>
                  <span><strong className="text-bone-white">On-chain history</strong> &mdash; Every deposit to a gambling address is permanently recorded and linked to your wallet.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blood-ruby shrink-0">&#10005;</span>
                  <span><strong className="text-bone-white">Address clustering</strong> &mdash; Analytics firms group your addresses together, building a profile of your financial activity.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blood-ruby shrink-0">&#10005;</span>
                  <span><strong className="text-bone-white">Exchange scrutiny</strong> &mdash; Withdrawals from known gambling addresses can trigger account freezes or closure at exchanges.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blood-ruby shrink-0">&#10005;</span>
                  <span><strong className="text-bone-white">Third-party judgment</strong> &mdash; Insurance companies, lenders, and employers increasingly use blockchain analytics to assess risk.</span>
                </li>
              </ul>
            </div>
            <p>
              This is not a hypothetical threat. Blockchain analytics is a multi-billion dollar
              industry. If you use Bitcoin to gamble, that activity is part of your permanent financial record.
            </p>
          </div>
        </section>

        {/* How Zcash Solves It */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-4">How Zcash Solves This</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <h3 className="text-lg font-semibold text-bone-white mb-2">Shielded Transactions</h3>
              <p className="text-sm text-venetian-gold/70">
                Zcash uses zero-knowledge proofs to encrypt transaction amounts, sender, and
                receiver addresses. The network validates transactions without revealing any details.
              </p>
            </div>
            <div className="p-4 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <h3 className="text-lg font-semibold text-bone-white mb-2">Unified Addresses</h3>
              <p className="text-sm text-venetian-gold/70">
                Each deposit gets a unique unified address. There is no address reuse, no linking
                of deposits, and no way to associate your session with other on-chain activity.
              </p>
            </div>
            <div className="p-4 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <h3 className="text-lg font-semibold text-bone-white mb-2">Selective Disclosure</h3>
              <p className="text-sm text-venetian-gold/70">
                Zcash viewing keys let the house prove reserves and fairness to auditors without
                exposing individual player activity. Transparency when needed, privacy by default.
              </p>
            </div>
            <div className="p-4 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <h3 className="text-lg font-semibold text-bone-white mb-2">No Metadata Leakage</h3>
              <p className="text-sm text-venetian-gold/70">
                Unlike mixing services or coin tumblers, Zcash shielded pools do not leave
                forensic traces. The protocol itself provides the privacy guarantee.
              </p>
            </div>
          </div>
        </section>

        {/* Why It Matters for Gambling */}
        <section className="mb-12 p-6 bg-midnight-black/60 rounded-xl border border-masque-gold/20">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-4">Why This Matters for Gambling</h2>
          <ul className="space-y-3 text-venetian-gold/80">
            <li className="flex gap-3">
              <span className="text-masque-gold mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-bone-white">Financial privacy is a right</strong> &mdash; What you do with your money is your business. Gambling legally should not create a permanent surveillance record.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-masque-gold mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-bone-white">No third-party consequences</strong> &mdash; Your gambling activity cannot be used against you by exchanges, insurers, lenders, or employers.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-masque-gold mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-bone-white">Provably fair + private</strong> &mdash; We prove every game is fair using cryptographic commitments. You verify outcomes without revealing your identity.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-masque-gold mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-bone-white">Regulatory-compatible</strong> &mdash; Unlike some privacy coins, Zcash offers optional transparency via viewing keys. This satisfies audit requirements without sacrificing user privacy.</span>
            </li>
          </ul>
        </section>

        {/* Zcash vs Other Options */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-4">Zcash vs Other Options</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-masque-gold/20">
                  <th className="text-left py-3 pr-4 text-venetian-gold/50 font-normal">&nbsp;</th>
                  <th className="text-center py-3 px-4 text-masque-gold font-semibold">Zcash</th>
                  <th className="text-center py-3 px-4 text-venetian-gold/50 font-normal">Bitcoin</th>
                  <th className="text-center py-3 px-4 text-venetian-gold/50 font-normal">Monero</th>
                </tr>
              </thead>
              <tbody className="text-venetian-gold/70">
                <tr className="border-b border-masque-gold/10">
                  <td className="py-3 pr-4 text-bone-white">Privacy by default</td>
                  <td className="text-center py-3 px-4 text-masque-gold">&#10003;</td>
                  <td className="text-center py-3 px-4 text-blood-ruby">&#10005;</td>
                  <td className="text-center py-3 px-4 text-masque-gold">&#10003;</td>
                </tr>
                <tr className="border-b border-masque-gold/10">
                  <td className="py-3 pr-4 text-bone-white">Optional transparency</td>
                  <td className="text-center py-3 px-4 text-masque-gold">&#10003;</td>
                  <td className="text-center py-3 px-4 text-venetian-gold/50">N/A</td>
                  <td className="text-center py-3 px-4 text-blood-ruby">&#10005;</td>
                </tr>
                <tr className="border-b border-masque-gold/10">
                  <td className="py-3 pr-4 text-bone-white">Exchange availability</td>
                  <td className="text-center py-3 px-4 text-masque-gold">Wide</td>
                  <td className="text-center py-3 px-4 text-masque-gold">Universal</td>
                  <td className="text-center py-3 px-4 text-venetian-gold/50">Limited</td>
                </tr>
                <tr className="border-b border-masque-gold/10">
                  <td className="py-3 pr-4 text-bone-white">Regulatory posture</td>
                  <td className="text-center py-3 px-4 text-masque-gold">Compatible</td>
                  <td className="text-center py-3 px-4 text-masque-gold">Compatible</td>
                  <td className="text-center py-3 px-4 text-blood-ruby">Delisted</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-bone-white">Proof of reserves</td>
                  <td className="text-center py-3 px-4 text-masque-gold">&#10003;</td>
                  <td className="text-center py-3 px-4 text-masque-gold">&#10003;</td>
                  <td className="text-center py-3 px-4 text-blood-ruby">Difficult</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-venetian-gold/50 mt-4">
            Zcash is the only chain that combines strong default privacy with the optional
            transparency needed for provably fair gambling and proof of reserves.
          </p>
        </section>

        {/* CTA */}
        <section className="text-center p-8 bg-midnight-black/60 rounded-xl border border-masque-gold/20">
          <h2 className="text-2xl font-display font-bold text-bone-white mb-3">Ready to Play?</h2>
          <p className="text-venetian-gold/70 mb-6">
            Get ZEC and start playing in minutes. No account, no KYC.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/get-zec"
              className="btn-gold-shimmer px-6 py-3 text-midnight-black font-semibold rounded-lg inline-block"
            >
              Get ZEC →
            </Link>
            <Link
              href="/blackjack"
              className="px-6 py-3 border border-masque-gold/30 text-venetian-gold font-semibold rounded-lg hover:bg-masque-gold/10 transition-colors inline-block"
            >
              Play Blackjack
            </Link>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-masque-gold/20 bg-midnight-black/30 py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-venetian-gold/50">
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/terms" className="hover:text-masque-gold transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-masque-gold transition-colors">Privacy</Link>
            <Link href="/responsible-gambling" className="hover:text-masque-gold transition-colors">Responsible Gambling</Link>
          </div>
          <p>{brand.config.name} &mdash; {brand.config.tagline}</p>
        </div>
      </footer>
    </main>
    </>
  )
}
