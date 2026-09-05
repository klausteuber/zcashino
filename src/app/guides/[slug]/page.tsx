import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/layout/SiteHeader'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import PlayerGuideLinks from '@/components/seo/PlayerGuideLinks'
import { getServerBrand } from '@/lib/brand/server'
import { getCanonicalUrlForPath } from '@/lib/brand/config'
import { getPlayerGuide } from '@/lib/seo/guides'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await getServerBrand()
  const guide = getPlayerGuide(brand.id, (await params).slug)
  if (!guide) notFound()
  const url = getCanonicalUrlForPath(brand.id, `/guides/${guide.slug}`)
  return {
    title: { absolute: guide.title.includes(brand.config.name) ? guide.title : `${guide.title} | ${brand.config.name}` },
    description: guide.description,
    alternates: { canonical: url },
    openGraph: { type: 'article', title: guide.title, description: guide.description, url, images: [brand.config.ogImagePath] },
    twitter: { card: 'summary_large_image', title: guide.title, description: guide.description, images: [brand.config.ogImagePath] },
  }
}

export default async function PlayerGuidePage({ params }: Props) {
  const brand = await getServerBrand()
  const guide = getPlayerGuide(brand.id, (await params).slug)
  if (!guide) notFound()
  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <SiteHeader />
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: getCanonicalUrlForPath(brand.id, '/') },
        { name: guide.title, url: getCanonicalUrlForPath(brand.id, `/guides/${guide.slug}`) },
      ]} />
      <article className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/" className="text-[var(--accent-primary)] underline underline-offset-4">{brand.config.name} home</Link>
        <h1 className="mt-6 font-display text-3xl md:text-5xl leading-tight">{guide.title}</h1>
        <p className="mt-5 text-lg text-[var(--text-secondary)] leading-relaxed">{guide.description}</p>
        <p className="mt-4 text-sm text-[var(--text-secondary)]">By {brand.config.name} · Player guide</p>
        {guide.sections.map(section => (
          <section key={section.title} className="mt-10">
            <h2 className="font-display text-2xl text-[var(--accent-primary)]">{section.title}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph} className="mt-4 text-[var(--text-secondary)] leading-7">{paragraph}</p>)}
          </section>
        ))}
        <nav aria-label="Next steps" className="mt-10 flex flex-wrap gap-5 text-[var(--accent-primary)] underline underline-offset-4">
          {guide.links.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
      </article>
      <PlayerGuideLinks brandId={brand.id} />
    </main>
  )
}
