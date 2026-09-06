'use client'

import Link from 'next/link'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import JesterLogo from '@/components/ui/JesterLogo'
import { useBrandContext } from '@/components/brand/BrandProvider'

const casinoNavLinks = [
  { href: '/blackjack', label: 'Blackjack' },
  { href: '/video-poker', label: 'Video Poker' },
  { href: '/poker', label: 'Poker' },
  { href: '/feed', label: 'Verified Hands' },
  { href: '/provably-fair', label: 'Provably Fair' },
]

const veilstoneNavLinks = [
  { href: '/veilstone/lobby', label: 'Lobby' },
  { href: '/veilstone#rules', label: 'Rules' },
  { href: '/veilstone#frontier', label: 'Frontier' },
]

function VeilstoneMark() {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-lg border border-accent-primary/40 bg-bg-elevated text-accent-primary shadow-lg" aria-hidden="true">
      <span className="text-lg font-display font-bold leading-none">V</span>
    </span>
  )
}

export default function SiteHeader() {
  const brand = useBrandContext()
  const isVeilstone = brand.id === 'veilstone'
  const navLinks = isVeilstone ? veilstoneNavLinks : casinoNavLinks
  const homeHref = isVeilstone ? '/veilstone' : '/'
  const ctaHref = isVeilstone ? '/veilstone/lobby' : '/get-zec'
  const ctaLabel = isVeilstone ? 'Play Now' : 'Buy ZEC'

  return (
    <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={homeHref}
            className="flex min-h-11 min-w-0 shrink items-center gap-2 sm:gap-3"
            aria-label={`Go to ${brand.config.name} home`}
          >
            {isVeilstone ? (
              <VeilstoneMark />
            ) : (
              <JesterLogo
                size="md"
                className="text-jester-purple-light"
                brand={brand.id === '21z' ? '21z' : 'cypher'}
                decorative
                preload
              />
            )}
            <BrandWordmark sizeClassName="text-lg sm:text-xl" className="max-[360px]:hidden" />
          </Link>

          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-6 text-base whitespace-nowrap">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-masque-gold transition-colors shrink-0">
                {link.label}
              </Link>
            ))}
          </nav>

          <Link
            href={ctaHref}
            className="buy-zec-cta btn-gold-shimmer rounded-lg text-midnight-black shrink-0"
            aria-label={isVeilstone ? 'Open the Veilstone lobby' : 'Buy ZEC or find ways to get Zcash'}
          >
            {ctaLabel}
          </Link>
        </div>

        <nav aria-label="Primary navigation" className="mt-3 flex items-center gap-4 overflow-x-auto no-scrollbar pb-1 text-sm sm:text-base whitespace-nowrap scroll-smooth snap-x lg:hidden">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="inline-flex min-h-11 shrink-0 snap-start items-center px-2 hover:text-masque-gold transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
