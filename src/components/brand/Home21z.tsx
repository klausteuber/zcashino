'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import VerifiedHandsFeed from '@/components/feed/VerifiedHandsFeed'

const PROCESS_STEPS = [
  {
    n: '01',
    t: 'Pre-commit',
    d: 'The house publishes a hash of the next seed to the Zcash chain before you bet. The outcome is locked in before the deal.',
  },
  {
    n: '02',
    t: 'Play',
    d: 'Hit, stand, double, split. Every action is signed against the committed seed and your client nonce.',
  },
  {
    n: '03',
    t: 'Verify',
    d: 'After the round, reveal the seed. Re-derive every card yourself. The math either checks or it doesn’t.',
  },
]

const HOUSE_STATS = [
  { label: 'Hands · 24h', value: '14,287' },
  { label: 'Total Volume', value: '4,902 ZEC' },
  { label: 'Avg Edge', value: '0.50%' },
  { label: 'Pool Health', value: '1,000 / 1,000' },
]

function TerminalBlock() {
  const [time, setTime] = useState<string>('--:--:--')
  useEffect(() => {
    const tick = () => setTime(new Date().toISOString().slice(11, 19))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="z21-panel mt-14 p-5 max-w-[540px]">
      <div className="flex justify-between items-center mb-2.5">
        <span className="z21-eyebrow text-[9px]">
          <span className="dot" />
          seed.commit
        </span>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {time} UTC
        </span>
      </div>
      <div className="font-mono text-[11px] leading-[1.7] text-[var(--text-secondary)]">
        <div>
          <span className="text-[var(--accent-primary)]">$</span> commit --hand 412 887
        </div>
        <div className="text-[var(--text-muted)]">  hash sha256:7a3f...e91d</div>
        <div className="text-[var(--text-muted)]">  block 2,441,082 · confirmed</div>
        <div>
          <span className="text-[var(--accent-primary)]">$</span> reveal --post-hand
        </div>
        <div className="text-[var(--color-success)]">  ✓ verified</div>
      </div>
    </div>
  )
}

function StackedCardsVisual() {
  return (
    <div className="hidden md:flex flex-1 justify-center md:justify-end">
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
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-8 md:gap-16 items-center min-h-[70vh]">
          <div>
            <div className="z21-eyebrow">
              <span className="dot" />
              Provably fair · Zcash mainnet · No accounts
            </div>
            <h1
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
              A quiet table for serious play. Every hand commits on-chain before you bet.
              Every outcome is verifiable. Your address never leaves your wallet.
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
        </div>

        {/* Live stats */}
        <div style={{ marginTop: 80 }}>
          <div className="z21-eyebrow" style={{ marginBottom: 16 }}>
            <span className="dot" />
            Live · last 24h
          </div>
          <div className="z21-grid-stats">
            {HOUSE_STATS.map(s => (
              <div key={s.label}>
                <div className="label">{s.label}</div>
                <div className="value">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Three-step process */}
        <div
          style={{
            marginTop: 64,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 24,
          }}
        >
          {PROCESS_STEPS.map(c => (
            <div key={c.n} className="z21-panel z21-brackets" style={{ padding: 28 }}>
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
              <div className="font-display" style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                {c.t}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>
                {c.d}
              </div>
            </div>
          ))}
        </div>

        {/* Verified hands feed (compact) */}
        <div className="z21-panel" style={{ marginTop: 64, padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <div className="z21-eyebrow">
              <span className="dot" />
              Recent verified hands
            </div>
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
        </div>

        {/* Footer */}
        <div
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
          <div style={{ display: 'flex', gap: 24 }}>
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
          </div>
        </div>
      </div>
    </div>
  )
}
