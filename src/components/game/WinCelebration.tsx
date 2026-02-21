'use client'

import { useSyncExternalStore } from 'react'

// Read brand from DOM without triggering extra renders
const noopSubscribe = () => () => {}
const getIs21zClient = () => document.body.dataset.brand === '21z'
const getIs21zServer = () => false

function useIs21z(): boolean {
  return useSyncExternalStore(noopSubscribe, getIs21zClient, getIs21zServer)
}

// ─── CypherJester confetti shapes (ornate: diamond, star, spade, streamer, chip, crown, strip, heart) ───

const CYPHER_SHAPES = [
  // 1. Diamond/Rhombus
  <svg key="c1" viewBox="0 0 16 16"><polygon points="8,0 16,8 8,16 0,8" fill="#c9a227"/></svg>,
  // 2. Five-Pointed Star
  <svg key="c2" viewBox="0 0 16 16"><polygon points="8,0 10.5,5 16,6 12,10 13,16 8,13 3,16 4,10 0,6 5.5,5" fill="#e8d5a3"/></svg>,
  // 3. Small Spade
  <svg key="c3" viewBox="0 0 16 16"><path d="M8,1C5,5 2,8 2,11A3.5,3.5 0 0,0 8,12A3.5,3.5 0 0,0 14,11C14,8 11,5 8,1Z M7,12 L5,16 h6 L9,12 Z" fill="#5a9e78"/></svg>,
  // 4. Streamer/Ribbon Curl
  <svg key="c4" viewBox="0 0 16 16"><path d="M1,4 Q5,-2 8,6 T15,8 Q11,14 8,6 T1,4" fill="#faf7f0"/></svg>,
  // 5. Mini Chip
  <svg key="c5" viewBox="0 0 16 16"><path fillRule="evenodd" d="M8,0a8,8 0 1,0 0,16a8,8 0 1,0 0-16z M8,4a4,4 0 1,1 0,8a4,4 0 1,1 0-8z" fill="#722f37"/></svg>,
  // 6. Small Crown
  <svg key="c6" viewBox="0 0 16 16"><polygon points="1,14 15,14 13,4 10.5,8 8,2 5.5,8 3,4" fill="#c9a227"/></svg>,
  // 7. Rectangle Strip
  <svg key="c7" viewBox="0 0 16 16"><polygon points="2,12 5,15 14,4 11,1" fill="#e8d5a3"/></svg>,
  // 8. Heart Silhouette
  <svg key="c8" viewBox="0 0 16 16"><path d="M8,15 L2,9 A4,4 0 0,1 8,4 A4,4 0 0,1 14,9 Z" fill="#5a9e78"/></svg>,
]

// ─── 21z confetti shapes (geometric: beveled diamond, hexagon, lightning, data-block, chevron, circuit, parallelogram, crosshair) ───

const Z21_SHAPES = [
  // 1. Beveled Diamond
  <svg key="z1" viewBox="0 0 16 16"><polygon points="8,0 13,5 13,11 8,16 3,11 3,5" fill="#00f0ff"/></svg>,
  // 2. Hexagon
  <svg key="z2" viewBox="0 0 16 16"><polygon points="8,0 15,4 15,12 8,16 1,12 1,4" fill="#00ffb3"/></svg>,
  // 3. Lightning Bolt
  <svg key="z3" viewBox="0 0 16 16"><polygon points="9,0 3,9 8,9 7,16 13,7 8,7" fill="#8890a6"/></svg>,
  // 4. Data Block/Pixel Cluster
  <svg key="z4" viewBox="0 0 16 16"><path d="M3,3h4v4h-4z M9,3h4v4h-4z M3,9h4v4h-4z M9,9h4v4h-4z" fill="#e0e4f0"/></svg>,
  // 5. Chevron Arrow
  <svg key="z5" viewBox="0 0 16 16"><polygon points="3,2 8,7 13,2 16,5 8,13 0,5" fill="#ff2e63"/></svg>,
  // 6. Circuit Node
  <svg key="z6" viewBox="0 0 16 16"><path d="M8,4A4,4 0 1,0 8,12A4,4 0 1,0 8,4Z M0,7h4v2h-4z M12,7h4v2h-4z" fill="#00f0ff"/></svg>,
  // 7. Thin Parallelogram Strip
  <svg key="z7" viewBox="0 0 16 16"><polygon points="2,14 12,2 14,2 4,14" fill="#00ffb3"/></svg>,
  // 8. Small Crosshair
  <svg key="z8" viewBox="0 0 16 16"><path d="M7,0h2v5h-2z M7,11h2v5h-2z M0,7h5v2h-5z M11,7h5v2h-5z M6,6h4v4h-4z" fill="#8890a6"/></svg>,
]

// ─── CypherJester casino chips (classic circular, gold) ───

const CYPHER_CHIPS = [
  // 1. Jester Mask
  <svg key="cc1" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="15" fill="#c9a227" stroke="#e8d5a3"/>
    <path d="M16 1v4m0 22v4M1 16h4m22 0h4M5 5l3 3m16 16 3 3M5 27l3-3m16-16 3-3" stroke="#1a1a2e" strokeWidth="4"/>
    <circle cx="16" cy="16" r="10" fill="none" stroke="#1a1a2e" strokeDasharray="2 2"/>
    <circle cx="16" cy="16" r="8" fill="none" stroke="#1a1a2e"/>
    <path d="M10,11 Q10,7 13,8 Q15,10 16,14 Q17,10 19,8 Q22,7 22,11 Q22,15 16,19 Q10,15 10,11 Z" fill="#1a1a2e"/>
  </svg>,
  // 2. Spade
  <svg key="cc2" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="15" fill="#c9a227" stroke="#e8d5a3"/>
    <path d="M16 1v4m0 22v4M1 16h4m22 0h4M5 5l3 3m16 16 3 3M5 27l3-3m16-16 3-3" stroke="#1a1a2e" strokeWidth="4"/>
    <circle cx="16" cy="16" r="10" fill="none" stroke="#1a1a2e" strokeDasharray="2 2"/>
    <circle cx="16" cy="16" r="8" fill="none" stroke="#1a1a2e"/>
    <path d="M16,9 C12,14 11,16 11,18 A3,3 0 0,0 21,18 C21,16 20,14 16,9 Z M14,21 L16,18 L18,21 Z" fill="#1a1a2e"/>
  </svg>,
  // 3. "21"
  <svg key="cc3" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="15" fill="#c9a227" stroke="#e8d5a3"/>
    <path d="M16 1v4m0 22v4M1 16h4m22 0h4M5 5l3 3m16 16 3 3M5 27l3-3m16-16 3-3" stroke="#1a1a2e" strokeWidth="4"/>
    <circle cx="16" cy="16" r="10" fill="none" stroke="#1a1a2e" strokeDasharray="2 2"/>
    <circle cx="16" cy="16" r="8" fill="none" stroke="#1a1a2e"/>
    <path d="M11,12 C11,9 15,9 15,13 L11,18 L16,18 M18,10 L19,10 V18 M18,18 L21,18" fill="none" stroke="#1a1a2e" strokeWidth="1.5"/>
  </svg>,
  // 4. Diamond
  <svg key="cc4" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="15" fill="#c9a227" stroke="#e8d5a3"/>
    <path d="M16 1v4m0 22v4M1 16h4m22 0h4M5 5l3 3m16 16 3 3M5 27l3-3m16-16 3-3" stroke="#1a1a2e" strokeWidth="4"/>
    <circle cx="16" cy="16" r="10" fill="none" stroke="#1a1a2e" strokeDasharray="2 2"/>
    <circle cx="16" cy="16" r="8" fill="none" stroke="#1a1a2e"/>
    <polygon points="16,9 21,15 16,21 11,15" fill="#1a1a2e"/>
  </svg>,
]

// ─── 21z casino chips (octagonal, cyan) ───

const Z21_CHIPS = [
  // 1. "21"
  <svg key="zc1" viewBox="0 0 32 32">
    <polygon points="10,2 22,2 30,10 30,22 22,30 10,30 2,22 2,10" fill="#0a0a14" stroke="#00f0ff" strokeWidth="1.5"/>
    <polygon points="12,6 20,6 26,12 26,20 20,26 12,26 6,20 6,12" fill="none" stroke="#00f0ff" strokeWidth="1" strokeDasharray="3 3"/>
    <path d="M2,16h4m20 0h4M16,2v4m0 20v4M5,5l3 3m16 16 3 3M5,27l3-3m16-16 3-3" stroke="#00f0ff" strokeWidth="1.5"/>
    <path d="M11,11 h4 v4 h-4 v5 h5 M20,11 v9" fill="none" stroke="#00f0ff" strokeWidth="2"/>
    <rect x="15" y="6" width="2" height="2" fill="#00ffb3"/>
  </svg>,
  // 2. Crosshair
  <svg key="zc2" viewBox="0 0 32 32">
    <polygon points="10,2 22,2 30,10 30,22 22,30 10,30 2,22 2,10" fill="#0a0a14" stroke="#00f0ff" strokeWidth="1.5"/>
    <polygon points="12,6 20,6 26,12 26,20 20,26 12,26 6,20 6,12" fill="none" stroke="#00f0ff" strokeWidth="1" strokeDasharray="3 3"/>
    <path d="M2,16h4m20 0h4M16,2v4m0 20v4M5,5l3 3m16 16 3 3M5,27l3-3m16-16 3-3" stroke="#00f0ff" strokeWidth="1.5"/>
    <path d="M16,10v12M10,16h12" fill="none" stroke="#00f0ff" strokeWidth="1.5"/>
    <circle cx="16" cy="16" r="3" fill="none" stroke="#00ffb3"/>
  </svg>,
  // 3. Hex-Z
  <svg key="zc3" viewBox="0 0 32 32">
    <polygon points="10,2 22,2 30,10 30,22 22,30 10,30 2,22 2,10" fill="#0a0a14" stroke="#00f0ff" strokeWidth="1.5"/>
    <polygon points="12,6 20,6 26,12 26,20 20,26 12,26 6,20 6,12" fill="none" stroke="#00f0ff" strokeWidth="1" strokeDasharray="3 3"/>
    <path d="M2,16h4m20 0h4M16,2v4m0 20v4M5,5l3 3m16 16 3 3M5,27l3-3m16-16 3-3" stroke="#00f0ff" strokeWidth="1.5"/>
    <polygon points="16,9 22,12.5 22,19.5 16,23 10,19.5 10,12.5" fill="none" stroke="#00ffb3" strokeWidth="1.5"/>
    <path d="M13,13h6l-6,6h6" fill="none" stroke="#00f0ff" strokeWidth="2"/>
  </svg>,
  // 4. Lightning
  <svg key="zc4" viewBox="0 0 32 32">
    <polygon points="10,2 22,2 30,10 30,22 22,30 10,30 2,22 2,10" fill="#0a0a14" stroke="#00f0ff" strokeWidth="1.5"/>
    <polygon points="12,6 20,6 26,12 26,20 20,26 12,26 6,20 6,12" fill="none" stroke="#00f0ff" strokeWidth="1" strokeDasharray="3 3"/>
    <path d="M2,16h4m20 0h4M16,2v4m0 20v4M5,5l3 3m16 16 3 3M5,27l3-3m16-16 3-3" stroke="#00f0ff" strokeWidth="1.5"/>
    <polygon points="17,9 11,16 15,16 14,23 20,15 16,15" fill="#00ffb3"/>
    <circle cx="16" cy="16" r="7" fill="none" stroke="#00f0ff" strokeDasharray="2 4"/>
  </svg>,
]

// ─── Build 24 particles by cycling through 8 shapes × 3 repeats ───

function buildParticles(shapes: React.JSX.Element[]): number[] {
  return Array.from({ length: 24 }, (_, i) => i)
}

const PARTICLE_INDICES = buildParticles([])

// ─── Components ───

export function ConfettiBurst() {
  const is21z = useIs21z()

  const shapes = is21z ? Z21_SHAPES : CYPHER_SHAPES

  return (
    <div className="confetti-container" aria-hidden="true">
      {PARTICLE_INDICES.map((i) => (
        <span key={i} className="confetti-particle">
          {shapes[i % shapes.length]}
        </span>
      ))}
    </div>
  )
}

export function ChipSlide() {
  const is21z = useIs21z()

  const chips = is21z ? Z21_CHIPS : CYPHER_CHIPS

  return (
    <div className="chip-slide-container" aria-hidden="true">
      {chips.map((chip, i) => (
        <span key={i} className="chip-slide">
          {chip}
        </span>
      ))}
    </div>
  )
}
