import PlayerGuideLinks from '@/components/seo/PlayerGuideLinks'
import Link from 'next/link'
import VerifiedHandsFeed from '@/components/feed/VerifiedHandsFeed'

const PROCESS_STEPS = [
  {
    n: '01',
    t: 'Commit the session',
    d: 'Before betting begins, the house anchors a hash of the seed session to Zcash. One confirmed commitment can cover multiple hands.',
  },
  {
    n: '02',
    t: 'Derive each hand',
    d: 'The committed server seed, your client seed, and an incrementing hand nonce deterministically produce a fresh deck.',
  },
  {
    n: '03',
    t: 'Verify',
    d: 'When the seed session rotates, the server seed is revealed. Re-derive any hand and compare every card yourself.',
  },
]

const TABLE_FACTS = [
  { label: 'Network', value: 'Zcash' },
  { label: 'Access', value: 'No accounts' },
  { label: 'Proof', value: 'Session anchored' },
  { label: 'Audit Trail', value: 'Public feed' },
]

function TerminalBlock() {
  return (
    <figure className="z21-panel mt-14 p-5 max-w-[540px]">
      <figcaption className="flex justify-between items-center mb-2.5">
        <span className="z21-eyebrow text-[9px]">
          <span className="dot" aria-hidden="true" />
          seed.commit
        </span>
        <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
          Example only · not live
        </span>
      </figcaption>
      <div className="font-mono text-[11px] leading-[1.7] text-[var(--text-secondary)]">
        <div>
          <span className="text-[var(--accent-primary)]">$</span> commit --seed-session 042
        </div>
        <div className="text-[var(--text-muted)]">  hash sha256:7a3f...e91d</div>
        <div className="text-[var(--text-muted)]">  example block · confirmed</div>
        <div>
          <span className="text-[var(--accent-primary)]">$</span> derive --hand-nonce 017
        </div>
        <div className="text-[var(--color-success)]">  ✓ replay matched</div>
      </div>
    </figure>
  )
}

function StackedCardsVisual() {
  return (
    <div className="hidden md:flex flex-1 justify-center md:justify-end" aria-hidden="true">
      <div className="relative w-full max-w-[460px]">
        <div className="relative h-[420px]">
          {/* Ace of spades, tilted left */}
          <div className="absolute left-1/2 top-[60px] -translate-x-[130%] -rotate-[8deg]">
            <CardFace rank="A" suit="♠" color="black" />
          </div>
          {/* King of hearts, centered */}
          <div className="absolute left-1/2 top-[30px] -translate-x-1/2">
            <CardFace rank="K" suit="♥" color="red" />
          </div>
          {/* Queen of diamonds, tilted right */}
          <div className="absolute left-1/2 top-[70px] translate-x-[30%] rotate-[8deg]">
            <CardFace rank="Q" suit="♦" color="red" />
          </div>
          {/* '21' watermark stamp */}
          <div
            className="absolute left-1/2 top-[240px] -translate-x-1/2 font-display"
            style={{
              fontSize: 96,
              fontWeight: 800,
              color: 'transparent',
              WebkitTextStroke: '1px rgba(0, 240, 255, 0.4)',
              letterSpacing: '0.04em',
              textShadow: '0 0 30px rgba(0,240,255,0.2)',
            }}
          >
            21
          </div>
          <div
            className="absolute left-1/2 top-[358px] -translate-x-1/2 font-mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.3em',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            ACE × KING · BLACKJACK
          </div>
        </div>
      </div>
    </div>
  )
}

function CardFace({ rank, suit, color }: { rank: string; suit: string; color: 'red' | 'black' }) {
  return (
    <div
      className="z21-bevel-sm"
      style={{
        width: 82,
        height: 118,
        background: 'linear-gradient(160deg, #0a0a14 0%, #161825 100%)',
        border: '1px solid rgba(0, 240, 255, 0.35)',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: 'var(--font-orbitron), sans-serif',
        fontWeight: 700,
        color: color === 'red' ? 'var(--color-error)' : 'var(--text-primary)',
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>{rank}</span>
        <span style={{ fontSize: 13 }}>{suit}</span>
      </div>
      <div style={{ fontSize: 28, alignSelf: 'center', lineHeight: 1 }}>{suit}</div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 2,
          transform: 'rotate(180deg)',
        }}
      >
        <span>{rank}</span>
        <span style={{ fontSize: 13 }}>{suit}</span>
      </div>
    </div>
  )
}

export default function Home21z() {
  return (
    <div className="z21-page-in" style={{ padding: '48px 24px' }}>
      <div className="max-w-[1280px] mx-auto">
        {/* Hero */}
        <section className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-8 md:gap-16 items-center min-h-[70vh]" aria-labelledby="home-hero-title">
          <div>
            <div className="z21-eyebrow">
              <span className="dot" aria-hidden="true" />
              Provably fair Zcash blackjack · No accounts
            </div>
            <h1
              id="home-hero-title"
              className="font-display"
              style={{
                fontSize: 'clamp(48px, 7vw, 96px)',
                fontWeight: 800,
                lineHeight: 0.95,
                margin: '24px 0 28px',
                letterSpacing: '-0.01em',
                color: 'var(--text-primary)',
              }}
            >
              Prove
              <br />
              <span style={{ color: 'var(--accent-primary)' }}>everything.</span>
              <br />
              Reveal nothing.
            </h1>
            <p
              style={{
                fontSize: 19,
                color: 'var(--text-secondary)',
                maxWidth: 480,
                lineHeight: 1.5,
                marginBottom: 36,
              }}
            >
              Play Zcash blackjack with rules you can read and hands you can check.
              Before real play, the house commits a seed session to Zcash.
              After seed reveal, reproduce your hand from its recorded inputs.
            </p>
            <div className="flex flex-wrap gap-3.5">
              <Link href="/blackjack" className="z21-btn z21-btn-primary">
                Open Table
              </Link>
              <Link href="/feed" className="z21-btn">
                Verify a hand
              </Link>
            </div>
            <TerminalBlock />
          </div>
          <StackedCardsVisual />
        </section>

        {/* Table facts */}
        <section style={{ marginTop: 80 }} aria-labelledby="table-facts-title">
          <h2 id="table-facts-title" className="z21-eyebrow" style={{ marginBottom: 16 }}>
            <span className="dot" aria-hidden="true" />
            Table facts
          </h2>
          <dl className="z21-grid-stats">
            {TABLE_FACTS.map(s => (
              <div key={s.label}>
                <dt className="label">{s.label}</dt>
                <dd className="value">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Three-step process */}
        <section aria-labelledby="verification-process-title">
          <h2 id="verification-process-title" className="sr-only">How hand verification works</h2>
          <ol
            style={{
              marginTop: 64,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 24,
            }}
          >
            {PROCESS_STEPS.map(c => (
              <li key={c.n} className="z21-panel z21-brackets" style={{ padding: 28 }}>
                <div
                  className="font-mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--accent-primary)',
                    letterSpacing: '0.18em',
                    marginBottom: 12,
                  }}
                >
                  {c.n}
                </div>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                  {c.t}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>
                  {c.d}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Verified hands feed (compact) */}
        <section className="z21-panel" style={{ marginTop: 64, padding: 28 }} aria-labelledby="recent-hands-title">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h2 id="recent-hands-title" className="z21-eyebrow">
              <span className="dot" aria-hidden="true" />
              Recent verified hands
            </h2>
            <Link
              href="/feed"
              className="font-mono"
              style={{
                fontSize: 11,
                color: 'var(--accent-primary)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              View all →
            </Link>
          </div>
          <VerifiedHandsFeed limit={5} compact />
        </section>

        <PlayerGuideLinks brandId="21z" />

        {/* Footer */}
        <footer
          style={{
            marginTop: 96,
            paddingTop: 32,
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            21z.cash · play 18+ · gambling can be addictive
          </div>
          <nav aria-label="Footer" style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            {[
              { label: 'Provably Fair', href: '/provably-fair' },
              { label: 'Reserves', href: '/reserves' },
              { label: 'Privacy', href: '/privacy' },
              { label: 'Terms', href: '/terms' },
            ].map(l => (
              <Link
                key={l.label}
                href={l.href}
                className="font-mono"
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </div>
  )
}
