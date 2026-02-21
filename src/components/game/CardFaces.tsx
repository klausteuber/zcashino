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

// ─── CypherJester Face Cards (bold iconic silhouettes, curves allowed) ───

function CypherJack({ accent }: { accent: string }) {
  // Jester hat: 3-pointed cap with round bells at tips
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M10 70 C10 55 14 50 18 42 L10 14 L22 28 L30 10 L38 28 L50 14 L42 42 C46 50 50 55 50 70 Z" fill="currentColor" />
      <path d="M7 14 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 M27 10 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 M47 14 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0" fill={accent} />
    </svg>
  )
}

function CypherQueen({ accent }: { accent: string }) {
  // Elegant crown: 5 rounded arches + ornamental veil curve below
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M10 55 L10 35 Q17 45 22 30 Q26 42 30 25 Q34 42 38 30 Q43 45 50 35 L50 55 Z" fill="currentColor" />
      <path d="M15 60 Q30 75 45 60" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function CypherKing({ accent }: { accent: string }) {
  // Imperial crown: tall sharp points + cross on top
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M8 70 L8 40 L16 50 L24 30 L30 42 L36 30 L44 50 L52 40 L52 70 Z" fill="currentColor" />
      <path d="M28 30 L28 14 L32 14 L32 30 Z M24 20 L36 20 L36 24 L24 24 Z" fill={accent} />
    </svg>
  )
}

// ─── 21z Face Cards (bold iconic silhouettes, zero curves) ───

function Z21Jack({ accent }: { accent: string }) {
  // Hexagonal visor/shield with horizontal slit
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M10 20 L30 10 L50 20 L50 50 L30 65 L10 50 Z" fill="currentColor" />
      <path d="M14 32 L46 32 L46 38 L14 38 Z" fill={accent} />
    </svg>
  )
}

function Z21Queen({ accent }: { accent: string }) {
  // Angular 3-spike crown + diamond accent below
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M10 60 L10 40 L20 50 L30 20 L40 50 L50 40 L50 60 Z" fill="currentColor" />
      <path d="M30 62 L24 68 L30 74 L36 68 Z" fill={accent} />
    </svg>
  )
}

function Z21King({ accent }: { accent: string }) {
  // Heavy 5-spike crown + bold band at base
  return (
    <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="card-face-svg">
      <path d="M6 65 L6 35 L16 45 L24 20 L30 32 L36 20 L44 45 L54 35 L54 65 Z" fill="currentColor" />
      <path d="M8 55 L52 55 L52 62 L8 62 Z" fill={accent} />
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
