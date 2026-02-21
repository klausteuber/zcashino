import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import JesterLogo from '@/components/ui/JesterLogo'
import { getBrandUrlForPath, getCanonicalUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'
import ResponsibleGamblingTools from '@/components/responsible-gambling/ResponsibleGamblingTools'
import SiteHeader from '@/components/layout/SiteHeader'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  const brandUrl = getBrandUrlForPath(brand.id, '/responsible-gambling')
  const canonicalUrl = getCanonicalUrlForPath(brand.id, '/responsible-gambling')
  const brandTitle = brand.id === '21z' ? '21z' : 'CypherJester'

  return {
    title: 'Responsible Gambling',
    description:
      `Tools and resources for responsible gambling at ${brandTitle}. Enforced session limits, loss limits, and self-exclusion.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Responsible Gambling | ${brandTitle}`,
      url: brandUrl,
    },
  }
}

export default function ResponsibleGamblingPage() {
  return (
    <main className="min-h-screen felt-texture">
      <SiteHeader />

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-4 text-bone-white">Responsible Gambling</h1>
        <p className="text-xl text-venetian-gold/70 mb-10">
          Gambling should be entertainment, not a source of income. We provide tools to help you stay in control.
        </p>

        <div className="space-y-8">

          <section className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20">
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-4">Self-Assessment</h2>
            <p className="text-venetian-gold/80 mb-4">Ask yourself these questions honestly:</p>
            <ul className="space-y-3 text-venetian-gold/80">
              <li className="flex gap-3">
                <span className="text-masque-gold shrink-0">?</span>
                Do you gamble more than you can afford to lose?
              </li>
              <li className="flex gap-3">
                <span className="text-masque-gold shrink-0">?</span>
                Do you chase losses by betting more after losing?
              </li>
              <li className="flex gap-3">
                <span className="text-masque-gold shrink-0">?</span>
                Does gambling interfere with your daily life or relationships?
              </li>
              <li className="flex gap-3">
                <span className="text-masque-gold shrink-0">?</span>
                Do you feel restless or irritable when not gambling?
              </li>
              <li className="flex gap-3">
                <span className="text-masque-gold shrink-0">?</span>
                Do you lie about how much time or money you spend gambling?
              </li>
            </ul>
            <p className="text-venetian-gold/60 mt-4 text-sm">
              If you answered yes to any of these, please consider using our limit tools or seeking help from the resources below.
            </p>
          </section>

          <section className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20">
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-4">Available Tools</h2>
            <div className="space-y-4">
              <div className="border-b border-masque-gold/10 pb-4">
                <h3 className="text-lg font-semibold text-bone-white mb-1">Deposit Limits</h3>
                <p className="text-venetian-gold/70">Enforced now. When set, deposits that would exceed your rolling 24-hour limit are not credited to your balance.</p>
              </div>
              <div className="border-b border-masque-gold/10 pb-4">
                <h3 className="text-lg font-semibold text-bone-white mb-1">Loss Limits</h3>
                <p className="text-venetian-gold/70">Enforced now. When your session net loss reaches the configured cap, new wagers are blocked for that session.</p>
              </div>
              <div className="border-b border-masque-gold/10 pb-4">
                <h3 className="text-lg font-semibold text-bone-white mb-1">Session Time Limits</h3>
                <p className="text-venetian-gold/70">Enforced now. When elapsed session time reaches the configured limit, new wagers are blocked. Withdrawal and verification actions remain available.</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-bone-white mb-1">Self-Exclusion</h3>
                <p className="text-venetian-gold/70">Enforced now. Temporarily or permanently exclude yourself from the platform. Available periods: 24 hours, 1 week, 1 month, 6 months, 1 year, or permanent. Self-exclusion cannot be reversed during the exclusion period.</p>
              </div>
            </div>
          </section>

          {/* Interactive limits & self-exclusion (client component) */}
          <ResponsibleGamblingTools />

          <section className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20">
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-4">Tips for Safe Gambling</h2>
            <ul className="space-y-3 text-venetian-gold/80">
              <li className="flex gap-3">
                <span className="text-jester-purple shrink-0">1.</span>
                Set a budget before you start and stick to it.
              </li>
              <li className="flex gap-3">
                <span className="text-jester-purple shrink-0">2.</span>
                Never gamble with money you cannot afford to lose.
              </li>
              <li className="flex gap-3">
                <span className="text-jester-purple shrink-0">3.</span>
                Set time limits for your sessions.
              </li>
              <li className="flex gap-3">
                <span className="text-jester-purple shrink-0">4.</span>
                Do not chase losses. Accept that losing is part of gambling.
              </li>
              <li className="flex gap-3">
                <span className="text-jester-purple shrink-0">5.</span>
                Do not gamble when upset, stressed, or under the influence.
              </li>
              <li className="flex gap-3">
                <span className="text-jester-purple shrink-0">6.</span>
                Take regular breaks.
              </li>
              <li className="flex gap-3">
                <span className="text-jester-purple shrink-0">7.</span>
                Balance gambling with other activities.
              </li>
            </ul>
          </section>

          <section className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-blood-ruby/40">
            <h2 className="text-2xl font-display font-semibold text-bone-white mb-4">Need Help?</h2>
            <p className="text-venetian-gold/80 mb-6">
              If you or someone you know has a gambling problem, these organizations provide free, confidential support:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <a
                href="https://gamblerssanonymous.org"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-midnight-black/50 rounded-lg border border-masque-gold/20 hover:border-masque-gold/40 transition-colors"
              >
                <h3 className="font-semibold text-bone-white mb-1">Gamblers Anonymous</h3>
                <p className="text-venetian-gold/60 text-sm">gamblerssanonymous.org</p>
              </a>
              <a
                href="https://www.begambleaware.org"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-midnight-black/50 rounded-lg border border-masque-gold/20 hover:border-masque-gold/40 transition-colors"
              >
                <h3 className="font-semibold text-bone-white mb-1">BeGambleAware</h3>
                <p className="text-venetian-gold/60 text-sm">begambleaware.org</p>
              </a>
              <a
                href="https://www.ncpgambling.org"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-midnight-black/50 rounded-lg border border-masque-gold/20 hover:border-masque-gold/40 transition-colors"
              >
                <h3 className="font-semibold text-bone-white mb-1">National Council on Problem Gambling</h3>
                <p className="text-venetian-gold/60 text-sm">ncpgambling.org | 1-800-522-4700</p>
              </a>
              <a
                href="https://www.gamcare.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-midnight-black/50 rounded-lg border border-masque-gold/20 hover:border-masque-gold/40 transition-colors"
              >
                <h3 className="font-semibold text-bone-white mb-1">GamCare</h3>
                <p className="text-venetian-gold/60 text-sm">gamcare.org.uk | 0808 8020 133</p>
              </a>
            </div>
          </section>

        </div>

        <p className="text-venetian-gold/50 text-sm mt-8 border-t border-masque-gold/20 pt-6">
          Last updated: February 2026
        </p>
      </div>
    </main>
  )
}
