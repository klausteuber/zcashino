'use client'

import { useSyncExternalStore } from 'react'
import type { Suit } from '@/types'

// Brand accent colors (stroke/detail)
const CYPHER_ACCENT = '#c9a227'
const Z21_ACCENT = '#00f0ff'

// Read brand from DOM without triggering extra renders
const noopSubscribe = () => () => {}
const getIs21zClient = () => document.body.dataset.brand === '21z'
const getIs21zServer = () => false

function useIs21z(): boolean {
  return useSyncExternalStore(noopSubscribe, getIs21zClient, getIs21zServer)
}

// ─── CypherJester Face Cards (baroque, masked figures with curves) ───

function CypherJack({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M10 80 C 10 65, 50 65, 50 80 Z" fill="currentColor" />
      <path d="M15 65 L10 50 L25 55 L35 45 L45 55 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M20 55 C 10 50, 15 30, 30 25 C 45 25, 45 45, 35 55 Z" fill="currentColor" />
      <path d="M15 35 C 15 45, 35 48, 42 35 C 42 30, 35 30, 30 35 C 25 30, 15 28, 15 35 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M18 37 Q 22 35 25 37" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
      <path d="M31 38 Q 35 36 38 38" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
      <path d="M20 28 C 10 15, 5 25, 12 35" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M35 26 C 45 15, 55 20, 48 35" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M28 25 C 25 10, 35 10, 32 25" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

function CypherQueen({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M12 80 C 15 65, 45 65, 48 80 Z" fill="currentColor" />
      <path d="M22 65 C 30 70, 35 70, 42 62" fill="none" stroke={accent} strokeWidth="2" />
      <path d="M22 60 C 25 50, 35 50, 40 60 Z" fill="currentColor" />
      <path d="M18 55 C 10 45, 15 25, 30 25 C 45 25, 45 45, 35 55 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M18 45 C 25 45, 30 40, 25 35" fill="none" stroke={accent} strokeWidth="2" />
      <path d="M25 25 L 22 15 L 28 20 L 32 12 L 36 20 L 40 16 L 38 25 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M38 35 C 50 25, 55 40, 45 50 C 50 45, 55 35, 40 38" fill="none" stroke={accent} strokeWidth="1.5" />
    </svg>
  )
}

function CypherKing({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M5 80 L 10 60 L 50 60 L 55 80 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M15 60 L 15 45 M 45 60 L 45 45" fill="none" stroke={accent} strokeWidth="2" />
      <path d="M20 55 L 25 65 L 35 60" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M15 45 L 22 55 L 40 50 L 42 30 L 30 25 L 18 30 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M18 38 L 26 36 L 28 38" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M16 28 L 12 10 L 25 20 L 32 8 L 38 22 L 48 15 L 42 30 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  )
}

// ─── 21z Face Cards (angular geometric, zero curves) ───

function Z21Jack({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M5 80 L 10 65 L 25 60 L 35 65 L 55 80 Z" fill="currentColor" />
      <path d="M5 80 L 10 65 Z" fill="none" stroke={accent} strokeWidth="2" />
      <path d="M35 65 L 50 55 L 55 80 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M20 62 L 15 50 L 25 55 L 35 50 L 40 62 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M15 45 L 25 55 L 40 50 L 45 25 L 30 15 L 18 25 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M15 35 L 35 32 L 35 38 L 18 40 Z" fill={accent} />
      <path d="M30 40 L 30 50 L 35 55" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
    </svg>
  )
}

function Z21Queen({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M8 80 L 12 65 L 25 70 L 35 70 L 48 65 L 52 80 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M20 55 L 28 65 L 38 60 L 42 35 L 30 25 L 15 35 Z" fill="currentColor" />
      <path d="M15 35 L 30 45 L 42 35 L 38 55 L 20 50 Z" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M20 38 L 24 35 L 28 38 L 24 41 Z" fill={accent} />
      <path d="M15 25 L 25 10 L 35 25 L 30 15 L 20 15 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M25 18 L 30 5 L 38 15 L 32 20 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M45 40 L 55 30 M 42 45 L 52 35 M 48 55 L 58 45" fill="none" stroke={accent} strokeWidth="1.5" />
    </svg>
  )
}

function Z21King({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M5 80 L 5 65 L 20 55 L 40 55 L 55 65 L 55 80 Z" fill="currentColor" />
      <path d="M5 65 L 15 70 L 25 60 M 55 65 L 45 70 L 35 60" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M25 70 L 30 65 L 35 70 L 35 76 L 30 80 L 25 76 Z" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M15 50 L 25 58 L 40 55 L 45 30 L 28 25 L 12 30 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M12 38 L 35 34 L 35 42 L 15 44 Z" fill={accent} />
      <path d="M12 28 L 8 10 L 22 22 L 30 5 L 38 20 L 50 12 L 42 28 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
    </svg>
  )
}

// ─── CypherJester Aces (ornate decorative suit symbols) ───

function CypherAceHearts({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M30 60 C 30 60, 10 40, 10 25 C 10 15, 20 10, 30 20 C 40 10, 50 15, 50 25 C 50 40, 30 60, 30 60 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M15 25 C 0 35, 15 55, 30 68" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M45 25 C 60 35, 45 55, 30 68" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M22 28 C 22 40, 30 50, 30 50" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M38 28 C 38 40, 30 50, 30 50" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M30 10 L 32 14 L 30 18 L 28 14 Z" fill={accent} />
    </svg>
  )
}

function CypherAceDiamonds({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M30 15 L 50 40 L 30 65 L 10 40 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M30 22 L 43 40 L 30 58 L 17 40 Z" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M23 32 L 30 40 L 23 48 M 37 32 L 30 40 L 37 48" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M30 15 C 25 10, 35 5, 30 5" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
      <path d="M30 65 C 25 70, 35 75, 30 75" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function CypherAceClubs({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M30 45 C 45 45, 50 30, 38 25 C 40 10, 20 10, 22 25 C 10 30, 15 45, 30 45 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M28 45 C 28 60, 15 65, 20 70 C 25 75, 40 70, 32 45 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M30 30 L 30 40 M 25 35 L 35 35" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M30 18 L 30 22" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
      <path d="M18 35 L 23 35" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
      <path d="M42 35 L 37 35" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function CypherAceSpades({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M30 20 C 50 45, 55 55, 40 55 C 30 55, 30 45, 30 45 C 30 45, 30 55, 20 55 C 5 55, 10 45, 30 20 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M28 50 C 25 65, 15 65, 15 70 L 45 70 C 45 65, 35 65, 32 50 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M30 18 C 25 10, 28 5, 30 8 C 32 5, 35 10, 30 18 Z" fill={accent} />
      <path d="M25 12 C 20 15, 23 18, 28 16" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M35 12 C 40 15, 37 18, 32 16" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M25 40 C 20 45, 20 50, 25 50 C 30 50, 28 45, 25 40 Z" fill="none" stroke={accent} strokeWidth="1.5" />
      <path d="M35 40 C 40 45, 40 50, 35 50 C 30 50, 32 45, 35 40 Z" fill="none" stroke={accent} strokeWidth="1.5" />
      <path d="M30 28 L 30 45" fill="none" stroke={accent} strokeWidth="1.5" />
    </svg>
  )
}

// ─── 21z Aces (angular geometric, zero curves) ───

function Z21AceHearts({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M30 65 L 10 35 L 10 20 L 20 10 L 30 20 L 40 10 L 50 20 L 50 35 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="miter"/>
      <path d="M30 65 L 30 20 M 10 35 L 30 45 L 50 35" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M5 25 L 10 20 M 55 25 L 50 20" fill="none" stroke={accent} strokeWidth="1.5" />
      <path d="M15 70 L 22 60 M 45 70 L 38 60" fill="none" stroke={accent} strokeWidth="1.5" />
    </svg>
  )
}

function Z21AceDiamonds({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M30 10 L 50 40 L 30 70 L 10 40 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="miter"/>
      <path d="M30 20 L 42 40 L 30 60 L 18 40 Z" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M28 38 L 32 38 L 32 42 L 28 42 Z" fill={accent} />
      <path d="M30 5 L 30 10 M 30 75 L 30 70" fill="none" stroke={accent} strokeWidth="2" />
      <path d="M5 40 L 10 40 M 55 40 L 50 40" fill="none" stroke={accent} strokeWidth="2" />
      <path d="M15 25 L 20 30 M 45 25 L 40 30 M 15 55 L 20 50 M 45 55 L 40 50" fill="none" stroke={accent} strokeWidth="1.5" />
    </svg>
  )
}

function Z21AceClubs({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M22 20 L 26 10 L 34 10 L 38 20 L 34 30 L 26 30 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M10 35 L 14 25 L 22 25 L 26 35 L 22 45 L 14 45 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M38 45 L 34 35 L 38 25 L 46 25 L 50 35 L 46 45 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M26 35 L 30 30 L 34 35 L 30 40 Z" fill="currentColor" />
      <path d="M26 42 L 20 70 L 40 70 L 34 42 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M28 28 L 32 28 L 32 32 L 28 32 Z" fill={accent} />
      <path d="M24 38 L 28 38 L 28 42 L 24 42 Z" fill={accent} />
      <path d="M32 38 L 36 38 L 36 42 L 32 42 Z" fill={accent} />
    </svg>
  )
}

function Z21AceSpades({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M30 5 L 55 25 L 55 60 L 30 80 L 5 60 L 5 25 Z" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M30 10 L 50 28 L 50 57 L 30 75 L 10 57 L 10 28 Z" fill="none" stroke={accent} strokeWidth="1" strokeLinejoin="miter"/>
      <path d="M30 20 L 15 45 L 15 55 L 25 55 L 30 45 L 35 55 L 45 55 L 45 45 Z" fill="currentColor" stroke={accent} strokeWidth="2" strokeLinejoin="miter"/>
      <path d="M30 20 L 30 45 L 20 50 M 30 45 L 40 50" fill="none" stroke={accent} strokeWidth="1.5" />
      <path d="M25 55 L 20 70 L 40 70 L 35 55 Z" fill="currentColor" stroke={accent} strokeWidth="1.5" strokeLinejoin="miter"/>
      <path d="M25 15 L 30 10 L 35 15" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="miter"/>
      <path d="M5 42 L 10 42 M 50 42 L 55 42" fill="none" stroke={accent} strokeWidth="1.5" />
      <path d="M15 65 L 20 65 M 40 65 L 45 65" fill="none" stroke={accent} strokeWidth="1.5" />
    </svg>
  )
}

// ─── SVG size classes per card size ───

// For ace centerpieces (full center area)
const aceSvgSizeClasses: Record<string, string> = {
  sm: 'w-8 h-auto',
  md: 'w-10 h-auto',
  lg: 'w-14 h-auto',
  xl: 'w-18 h-auto',
}

// For face card SVGs (smaller, below the rank letter)
const faceSvgSizeClasses: Record<string, string> = {
  sm: 'w-5 h-auto',
  md: 'w-7 h-auto',
  lg: 'w-9 h-auto',
  xl: 'w-12 h-auto',
}

// Rank letter sizing per card size
const faceRankClasses: Record<string, string> = {
  sm: 'text-sm font-bold leading-none',
  md: 'text-base font-bold leading-none',
  lg: 'text-lg font-bold leading-none',
  xl: 'text-xl font-bold leading-none',
}

// ─── Exported Components ───

const CYPHER_FACE: Record<string, (props: { accent: string }) => React.ReactElement> = {
  J: CypherJack,
  Q: CypherQueen,
  K: CypherKing,
}

const Z21_FACE: Record<string, (props: { accent: string }) => React.ReactElement> = {
  J: Z21Jack,
  Q: Z21Queen,
  K: Z21King,
}

const CYPHER_ACES: Record<Suit, (props: { accent: string }) => React.ReactElement> = {
  hearts: CypherAceHearts,
  diamonds: CypherAceDiamonds,
  clubs: CypherAceClubs,
  spades: CypherAceSpades,
}

const Z21_ACES: Record<Suit, (props: { accent: string }) => React.ReactElement> = {
  hearts: Z21AceHearts,
  diamonds: Z21AceDiamonds,
  clubs: Z21AceClubs,
  spades: Z21AceSpades,
}

export function FaceCardCenter({ rank, size = 'md' }: { rank: 'J' | 'Q' | 'K'; size?: string }) {
  const is21z = useIs21z()

  const faceCards = is21z ? Z21_FACE : CYPHER_FACE
  const accent = is21z ? Z21_ACCENT : CYPHER_ACCENT
  const FaceComponent = faceCards[rank]
  if (!FaceComponent) return null

  return (
    <div className="flex flex-col items-center gap-0" aria-hidden="true">
      {/* Prominent rank letter — inherits suit color from parent */}
      <span className={faceRankClasses[size] || faceRankClasses.md}>{rank}</span>
      {/* Smaller SVG illustration below */}
      <div className={faceSvgSizeClasses[size] || faceSvgSizeClasses.md}>
        <FaceComponent accent={accent} />
      </div>
    </div>
  )
}

export function AceCenterpiece({ suit, size = 'md' }: { suit: Suit; size?: string }) {
  const is21z = useIs21z()

  const aces = is21z ? Z21_ACES : CYPHER_ACES
  const accent = is21z ? Z21_ACCENT : CYPHER_ACCENT
  const AceComponent = aces[suit]
  if (!AceComponent) return null

  return (
    <div className={`flex items-center justify-center ${aceSvgSizeClasses[size] || aceSvgSizeClasses.md}`} aria-hidden="true">
      <AceComponent accent={accent} />
    </div>
  )
}
