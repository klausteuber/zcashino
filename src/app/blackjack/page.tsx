import BlackjackGame from '@/components/game/BlackjackGame'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { getBrandUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export default async function BlackjackPage() {
  const brand = await getServerBrand()
  const homeUrl = getBrandUrlForPath(brand.id, '/')
  const pageUrl = getBrandUrlForPath(brand.id, '/blackjack')

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: homeUrl },
          { name: 'Play Blackjack', url: pageUrl },
        ]}
      />

      <BlackjackGame />

      {/* Static SEO content — server-rendered, crawlable by search engines */}
      <section className="felt-texture border-t border-masque-gold/20">
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          <h2 className="text-3xl font-display font-bold text-bone-white mb-8 text-center">
            How to Play Blackjack at {brand.config.name}
          </h2>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-midnight-black/40 rounded-xl p-6 border border-masque-gold/20">
              <h3 className="text-xl font-display font-semibold text-masque-gold mb-3">
                Game Rules
              </h3>
              <ul className="space-y-2 text-venetian-gold/70 text-sm">
                <li>Beat the dealer by getting closer to 21 without going over</li>
                <li>Number cards are worth their face value</li>
                <li>Face cards (J, Q, K) are worth 10</li>
                <li>Aces are worth 1 or 11, whichever is better for your hand</li>
                <li>Blackjack (Ace + 10-value card) pays 3:2</li>
                <li>Dealer must hit on 16 and stand on 17</li>
              </ul>
            </div>

            <div className="bg-midnight-black/40 rounded-xl p-6 border border-masque-gold/20">
              <h3 className="text-xl font-display font-semibold text-masque-gold mb-3">
                Your Options
              </h3>
              <ul className="space-y-2 text-venetian-gold/70 text-sm">
                <li>
                  <strong className="text-bone-white">Hit</strong> &mdash; Take
                  another card to increase your hand value
                </li>
                <li>
                  <strong className="text-bone-white">Stand</strong> &mdash;
                  Keep your current hand and end your turn
                </li>
                <li>
                  <strong className="text-bone-white">Double Down</strong>{' '}
                  &mdash; Double your bet and take exactly one more card
                </li>
                <li>
                  <strong className="text-bone-white">Split</strong> &mdash;
                  Split a pair into two separate hands
                </li>
                <li>
                  <strong className="text-bone-white">Surrender</strong> &mdash;
                  Fold your initial two-card hand and get half your bet back
                </li>
                <li>
                  <strong className="text-bone-white">Insurance</strong> &mdash;
                  Side bet when dealer shows an Ace (pays 2:1)
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-midnight-black/40 rounded-xl p-6 border border-masque-gold/20 mb-12">
            <h3 className="text-xl font-display font-semibold text-masque-gold mb-3">
              Why Play at {brand.config.name}?
            </h3>
            <div className="grid sm:grid-cols-3 gap-6 text-sm text-venetian-gold/70">
              <div>
                <h4 className="text-bone-white font-semibold mb-1">
                  Provably Fair
                </h4>
                <p>
                  Every deal uses blockchain-committed seeds. Verify any hand
                  yourself after the game using our{' '}
                  <a
                    href="/verify"
                    className="text-masque-gold hover:underline"
                  >
                    verification tool
                  </a>
                  .
                </p>
              </div>
              <div>
                <h4 className="text-bone-white font-semibold mb-1">
                  True Privacy
                </h4>
                <p>
                  No accounts, no KYC. Play with Zcash shielded transactions for
                  maximum privacy. Learn more about our{' '}
                  <a
                    href="/provably-fair"
                    className="text-masque-gold hover:underline"
                  >
                    fairness system
                  </a>
                  .
                </p>
              </div>
              <div>
                <h4 className="text-bone-white font-semibold mb-1">
                  Low House Edge
                </h4>
                <p>
                  Approximately 0.5% house edge with basic strategy under our
                  current ruleset (including re-split aces). Full transparency
                  on all odds &mdash; check our{' '}
                  <a
                    href="/terms"
                    className="text-masque-gold hover:underline"
                  >
                    house edge disclosures
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-xl font-display font-semibold text-bone-white mb-4">
              Keyboard Shortcuts
            </h3>
            <div className="inline-grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-venetian-gold/70 text-left">
              <span>
                <kbd className="px-2 py-1 bg-midnight-black/60 rounded text-masque-gold font-mono text-xs">
                  H
                </kbd>{' '}
                Hit
              </span>
              <span>
                <kbd className="px-2 py-1 bg-midnight-black/60 rounded text-masque-gold font-mono text-xs">
                  S
                </kbd>{' '}
                Stand
              </span>
              <span>
                <kbd className="px-2 py-1 bg-midnight-black/60 rounded text-masque-gold font-mono text-xs">
                  D
                </kbd>{' '}
                Double Down
              </span>
              <span>
                <kbd className="px-2 py-1 bg-midnight-black/60 rounded text-masque-gold font-mono text-xs">
                  P
                </kbd>{' '}
                Split
              </span>
              <span>
                <kbd className="px-2 py-1 bg-midnight-black/60 rounded text-masque-gold font-mono text-xs">
                  Y
                </kbd>{' '}
                Accept Insurance
              </span>
              <span>
                <kbd className="px-2 py-1 bg-midnight-black/60 rounded text-masque-gold font-mono text-xs">
                  N
                </kbd>{' '}
                Decline Insurance
              </span>
              <span>
                <kbd className="px-2 py-1 bg-midnight-black/60 rounded text-masque-gold font-mono text-xs">
                  Enter
                </kbd>{' '}
                Deal / Play Again
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
