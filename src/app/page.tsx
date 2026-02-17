import Image from 'next/image'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import JesterLogo from '@/components/ui/JesterLogo'
import { getBrandUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export default async function Home() {
  const brand = await getServerBrand()
  const homeUrl = getBrandUrlForPath(brand.id, '/')
  const is21z = brand.id === '21z'

  return (
    <>
      <BreadcrumbJsonLd
        items={[{ name: 'Home', url: homeUrl }]}
      />

      <main className="min-h-screen felt-texture">
        <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <JesterLogo size="md" className="text-jester-purple-light" />
              <BrandWordmark />
            </div>
            <nav className="flex items-center gap-6">
              <a href="/blackjack" className="hover:text-masque-gold transition-colors">
                Blackjack
              </a>
              <a href="/video-poker" className="hover:text-masque-gold transition-colors">
                Video Poker
              </a>
              <a href="/provably-fair" className="hover:text-masque-gold transition-colors">
                Provably Fair
              </a>
              <a href="/responsible-gambling" className="hover:text-masque-gold transition-colors">
                Responsible Gambling
              </a>
            </nav>
          </div>
        </header>

        <section className="container mx-auto px-4 py-12 md:py-20">
          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-5xl md:text-7xl font-display font-bold mb-6 tracking-tight">
                <span className="text-gold-gradient">
                  {is21z ? 'Prove Everything.' : 'Play in Private.'}
                </span>
                <br />
                <span className="text-bone-white">
                  {is21z ? 'Reveal Nothing.' : 'Verify in Public.'}
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-venetian-gold/70 mb-8 max-w-xl">
                {is21z
                  ? 'A cyber-minimal blackjack floor where every outcome can be verified on-chain.'
                  : 'The first casino where every hand is verifiable on-chain. Play with Zcash for maximum privacy.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                <a
                  href="/blackjack"
                  className="btn-gold-shimmer text-midnight-black px-8 py-4 rounded-lg font-bold text-lg"
                >
                  Play Blackjack
                </a>
                <a
                  href="/video-poker"
                  className="btn-gold-shimmer text-midnight-black px-8 py-4 rounded-lg font-bold text-lg"
                >
                  Play Video Poker
                </a>
                <a
                  href="/provably-fair"
                  className="border-2 border-masque-gold text-masque-gold px-8 py-4 rounded-lg font-bold text-lg hover:bg-masque-gold/10 transition-colors"
                >
                  Learn How It Works
                </a>
              </div>
            </div>

            <div className="flex-1 flex justify-center md:justify-end">
              {is21z ? (
                <div className="relative clip-bevel-tr border border-accent-primary/40 bg-bg-surface/70 px-10 py-8 glow-cyan">
                  <div className="text-8xl font-display font-bold tracking-tight text-accent-primary glitch-text">
                    21
                    <sub className="relative -bottom-1 text-3xl font-normal text-accent-secondary/70">z</sub>
                  </div>
                  <div className="mt-3 text-text-secondary font-mono text-sm uppercase tracking-[0.2em]">
                    {brand.config.tagline}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute inset-0 bg-masque-gold/20 blur-3xl rounded-full scale-75" />
                  <Image
                    src="/images/jester-mask.png"
                    alt="CypherJester - Venetian mask at the card table"
                    width={400}
                    height={400}
                    className="relative z-10 rounded-2xl shadow-2xl border-2 border-masque-gold/30"
                    priority
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20 hover:border-masque-gold/40 transition-colors">
              <div className="w-12 h-12 bg-masque-gold/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-masque-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-display font-semibold mb-2 text-bone-white">Provably Fair</h3>
              <p className="text-venetian-gold/60">
                Every game outcome is verifiable. Seeds are committed on-chain before you bet,
                and you can verify any hand yourself.
              </p>
            </div>

            <div className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20 hover:border-masque-gold/40 transition-colors">
              <div className="w-12 h-12 bg-masque-gold/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-masque-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-display font-semibold mb-2 text-bone-white">True Privacy</h3>
              <p className="text-venetian-gold/60">
                No accounts required. Play with Zcash shielded transactions.
                We don&apos;t know who you are, and we don&apos;t want to.
              </p>
            </div>

            <div className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20 hover:border-masque-gold/40 transition-colors">
              <div className="w-12 h-12 bg-masque-gold/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-masque-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-display font-semibold mb-2 text-bone-white">Instant Payouts</h3>
              <p className="text-venetian-gold/60">
                Withdrawals are processed automatically. Your ZEC is sent directly to your wallet
                within minutes.
              </p>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-8 border border-masque-gold/20 text-center">
            <h2 className="text-2xl font-display font-semibold mb-4 text-bone-white">Transparent House Edge</h2>
            <p className="text-venetian-gold/70 mb-6 max-w-2xl mx-auto">
              We believe in full transparency. Here are our house edges:
            </p>
            <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6">
              <div className="bg-midnight-black/50 rounded-lg p-4 border border-masque-gold/10">
                <div className="text-3xl font-display font-bold text-masque-gold">0.5%</div>
                <div className="text-venetian-gold/60">Blackjack (Basic Strategy)</div>
              </div>
              <div className="bg-midnight-black/50 rounded-lg p-4 border border-masque-gold/10">
                <div className="text-3xl font-display font-bold text-masque-gold">0.46%</div>
                <div className="text-venetian-gold/60">Jacks or Better (9/6)</div>
              </div>
              <div className="bg-midnight-black/50 rounded-lg p-4 border border-masque-gold/10">
                <div className="text-3xl font-display font-bold text-masque-gold">0.76%</div>
                <div className="text-venetian-gold/60">Deuces Wild (Full Pay)</div>
              </div>
              <div className="bg-midnight-black/50 rounded-lg p-4 border border-masque-gold/10">
                <div className="text-3xl font-display font-bold text-masque-gold">4.5%</div>
                <div className="text-venetian-gold/60">Perfect Pairs Side Bet</div>
              </div>
              <div className="bg-midnight-black/50 rounded-lg p-4 border border-masque-gold/10">
                <div className="text-3xl font-display font-bold text-masque-gold">7.4%</div>
                <div className="text-venetian-gold/60">Insurance Bet</div>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-masque-gold/20 bg-midnight-black/40 mt-16">
          <div className="container mx-auto px-4 py-8">
            <div className="grid md:grid-cols-4 gap-8">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <JesterLogo size="sm" className="text-jester-purple-light" />
                  <BrandWordmark />
                </div>
                <p className="text-venetian-gold/50 text-sm">
                  {brand.config.tagline}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-4 text-bone-white">Games</h4>
                <ul className="space-y-2 text-venetian-gold/60 text-sm">
                  <li><a href="/blackjack" className="hover:text-masque-gold transition-colors">Blackjack</a></li>
                  <li><a href="/video-poker" className="hover:text-masque-gold transition-colors">Video Poker</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4 text-bone-white">Resources</h4>
                <ul className="space-y-2 text-venetian-gold/60 text-sm">
                  <li><a href="/provably-fair" className="hover:text-masque-gold transition-colors">Provably Fair</a></li>
                  <li><a href="/responsible-gambling" className="hover:text-masque-gold transition-colors">Responsible Gambling</a></li>
                  <li><a href="/terms" className="hover:text-masque-gold transition-colors">Terms of Service</a></li>
                  <li><a href="/privacy" className="hover:text-masque-gold transition-colors">Privacy Policy</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4 text-bone-white">Support</h4>
                <ul className="space-y-2 text-venetian-gold/60 text-sm">
                  <li><a href="https://gamblerssanonymous.org" target="_blank" rel="noopener noreferrer" className="hover:text-masque-gold transition-colors">Gamblers Anonymous</a></li>
                  <li><a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" className="hover:text-masque-gold transition-colors">BeGambleAware</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-masque-gold/20 mt-8 pt-8 text-center text-venetian-gold/40 text-sm">
              <p>Players must be 18+ and located in a jurisdiction where online gambling is legal.</p>
              <p className="mt-2">Gambling can be addictive. Please play responsibly.</p>
            </div>
          </div>
        </footer>
      </main>
    </>
  )
}
