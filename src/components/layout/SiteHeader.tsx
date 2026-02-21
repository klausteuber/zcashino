import Link from 'next/link'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import JesterLogo from '@/components/ui/JesterLogo'

export default function SiteHeader() {
  return (
    <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <JesterLogo size="md" className="text-jester-purple-light" />
            <BrandWordmark />
          </Link>
        </div>
        <nav className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-1 sm:pb-0 text-sm sm:text-base whitespace-nowrap scroll-smooth snap-x">
          <Link href="/blackjack" className="hover:text-masque-gold transition-colors shrink-0 snap-start">
            Blackjack
          </Link>
          <Link href="/video-poker" className="hover:text-masque-gold transition-colors shrink-0 snap-start">
            Video Poker
          </Link>
          <Link href="/feed" className="hover:text-masque-gold transition-colors shrink-0 snap-start">
            Verified Hands
          </Link>
          <Link href="/provably-fair" className="hover:text-masque-gold transition-colors shrink-0 snap-start">
            Provably Fair
          </Link>
          <Link href="/responsible-gambling" className="hover:text-masque-gold transition-colors shrink-0 snap-start">
            Responsible Gambling
          </Link>
        </nav>
      </div>
    </header>
  )
}
