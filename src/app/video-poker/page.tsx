import VideoPokerGame from '@/components/game/VideoPokerGame'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { getBrandUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export default async function VideoPokerPage() {
  const brand = await getServerBrand()
  const homeUrl = getBrandUrlForPath(brand.id, '/')
  const pageUrl = getBrandUrlForPath(brand.id, '/video-poker')

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: homeUrl },
          { name: 'Video Poker', url: pageUrl },
        ]}
      />

      <VideoPokerGame />

      {/* Static SEO content — server-rendered, crawlable by search engines */}
      <section className="felt-texture border-t border-masque-gold/20">
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          <h2 className="text-3xl font-display font-bold text-bone-white mb-8 text-center">
            How to Play Video Poker at {brand.config.name}
          </h2>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-midnight-black/40 rounded-xl p-6 border border-masque-gold/20">
              <h3 className="text-xl font-display font-semibold text-masque-gold mb-3">
                Jacks or Better (9/6 Full Pay)
              </h3>
              <ul className="space-y-2 text-venetian-gold/70 text-sm">
                <li>Minimum winning hand: pair of Jacks, Queens, Kings, or Aces</li>
                <li>Full House pays 9x, Flush pays 6x (9/6 schedule)</li>
                <li>Royal Flush at max bet (5 coins) pays 4,000x</li>
                <li>House edge: approximately 0.46% with optimal strategy</li>
                <li>Standard 52-card deck, no wild cards</li>
              </ul>
            </div>

            <div className="bg-midnight-black/40 rounded-xl p-6 border border-masque-gold/20">
              <h3 className="text-xl font-display font-semibold text-masque-gold mb-3">
                Deuces Wild (Full Pay)
              </h3>
              <ul className="space-y-2 text-venetian-gold/70 text-sm">
                <li>All four 2s (Deuces) are wild and substitute for any card</li>
                <li>Minimum winning hand: Three of a Kind</li>
                <li>Four Deuces pays 200x per coin</li>
                <li>Natural Royal Flush at max bet pays 4,000x</li>
                <li>House edge: approximately 0.76% with optimal strategy</li>
              </ul>
            </div>
          </div>

          <div className="bg-midnight-black/40 rounded-xl p-6 border border-masque-gold/20 mb-12">
            <h3 className="text-xl font-display font-semibold text-masque-gold mb-3">
              How Video Poker Works
            </h3>
            <div className="grid sm:grid-cols-3 gap-6 text-sm text-venetian-gold/70">
              <div>
                <h4 className="text-bone-white font-semibold mb-1">1. Deal</h4>
                <p>
                  Choose your bet and coin multiplier (1-5x), then press Deal. You
                  receive 5 cards from a provably fair shuffled deck.
                </p>
              </div>
              <div>
                <h4 className="text-bone-white font-semibold mb-1">2. Hold &amp; Draw</h4>
                <p>
                  Click the cards you want to keep (hold). Non-held cards are replaced
                  from the same deck. Your best 5-card poker hand determines the payout.
                </p>
              </div>
              <div>
                <h4 className="text-bone-white font-semibold mb-1">3. Verify</h4>
                <p>
                  Every deal uses a blockchain-committed seed. After the hand, verify
                  the shuffle was fair using our{' '}
                  <a href="/verify" className="text-masque-gold hover:underline">
                    verification tool
                  </a>.
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
                  1-5
                </kbd>{' '}
                Toggle Hold (card position)
              </span>
              <span>
                <kbd className="px-2 py-1 bg-midnight-black/60 rounded text-masque-gold font-mono text-xs">
                  Enter
                </kbd>{' '}
                Deal / Draw
              </span>
              <span>
                <kbd className="px-2 py-1 bg-midnight-black/60 rounded text-masque-gold font-mono text-xs">
                  D
                </kbd>{' '}
                Deal / Draw
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
