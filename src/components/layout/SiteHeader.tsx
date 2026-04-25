import Link from 'next/link'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import JesterLogo from '@/components/ui/JesterLogo'

const navLinks = [
  { href: '/blackjack', label: 'Blackjack' },
  { href: '/video-poker', label: 'Video Poker' },
  { href: '/feed', label: 'Verified Hands' },
  { href: '/provably-fair', label: 'Provably Fair' },
]

export default function SiteHeader() {
  return (
    <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
            <JesterLogo size="md" className="text-jester-purple-light" />
            <BrandWordmark sizeClassName="text-lg sm:text-xl" className="max-[360px]:hidden" />
          </Link>

          <nav className="hidden lg:flex items-center gap-6 text-base whitespace-nowrap">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-masque-gold transition-colors shrink-0">
                {link.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/get-zec"
            className="buy-zec-cta btn-gold-shimmer rounded-lg text-midnight-black shrink-0"
            aria-label="Buy ZEC or find ways to get Zcash"
          >
            Buy ZEC
          </Link>
        </div>

        <nav className="mt-3 flex items-center gap-6 overflow-x-auto no-scrollbar pb-1 text-sm sm:text-base whitespace-nowrap scroll-smooth snap-x lg:hidden">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-masque-gold transition-colors shrink-0 snap-start">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
