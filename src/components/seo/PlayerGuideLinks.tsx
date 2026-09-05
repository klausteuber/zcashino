import Link from 'next/link'
import type { BrandId } from '@/lib/brand/types'
import { getPlayerGuides } from '@/lib/seo/guides'

export default function PlayerGuideLinks({ brandId }: { brandId: BrandId }) {
  const guides = getPlayerGuides(brandId)
  if (!guides.length) return null

  return (
    <section className="mx-auto max-w-5xl px-4 py-12" aria-labelledby="player-guides-title">
      <h2 id="player-guides-title" className="font-display text-2xl text-[var(--text-primary)] mb-6">
        {brandId === '21z' ? 'Know the rules. Check the hand.' : 'Your guide to playing with Zcash'}
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        {guides.map(guide => (
          <Link key={guide.slug} href={`/guides/${guide.slug}`} className="block rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 hover:border-[var(--accent-primary)]">
            <h3 className="font-display text-xl text-[var(--accent-primary)] mb-3">{guide.title}</h3>
            <p className="text-[var(--text-secondary)] leading-relaxed">{guide.description}</p>
          </Link>
        ))}
      </div>
      <nav aria-label="Player resources" className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-[var(--accent-primary)] underline underline-offset-4">
        <Link href="/get-zec">Get Zcash</Link>
        <Link href="/provably-fair">How fairness works</Link>
        <Link href="/verify">Verify a hand</Link>
        <Link href="/responsible-gambling">Responsible gambling</Link>
      </nav>
    </section>
  )
}
