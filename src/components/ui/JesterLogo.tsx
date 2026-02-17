import Image from 'next/image'

interface JesterLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeDimensions = {
  sm: { width: 32, height: 32, textClass: 'text-[1.25rem]' },
  md: { width: 48, height: 48, textClass: 'text-[1.8rem]' },
  lg: { width: 64, height: 64, textClass: 'text-[2.3rem]' },
}

/**
 * Historical component name kept intentionally to avoid large import churn.
 * It now renders both Cypher and 21z marks, with CSS selecting by body[data-brand].
 */
export default function JesterLogo({ className = '', size = 'md' }: JesterLogoProps) {
  const dims = sizeDimensions[size]
  return (
    <span className={`brand-logo inline-flex items-center justify-center ${className}`} data-size={size}>
      <Image
        src="/images/jester-logo.png"
        alt="CypherJester"
        width={dims.width}
        height={dims.height}
        className="brand-logo-cypher"
      />
      <span className={`brand-logo-21z font-display leading-none ${dims.textClass}`} aria-label="21z">
        <span className="font-bold tracking-tight text-accent-primary glitch-text">21</span>
        <sub className="relative -bottom-0.5 ml-0.5 text-xs font-normal text-accent-secondary/70">z</sub>
      </span>
    </span>
  )
}

// Jester bell icon for card backs
export function JesterBell({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-bell inline-flex ${className}`} aria-hidden="true">
      <svg
        className="brand-bell-cypher"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 2 Q8 6 4 4 Q6 10 8 14 L16 14 Q18 10 20 4 Q16 6 12 2Z" />
        <circle cx="4" cy="4" r="2" />
        <circle cx="20" cy="4" r="2" />
        <circle cx="12" cy="2" r="1.5" />
        <path d="M8 14 Q8 20 12 22 Q16 20 16 14Z" />
      </svg>
      <svg
        className="brand-bell-21z"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M4 4H14L20 10V20H4V4Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 4V10H20" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 16H16" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  )
}

// Compact version for favicon/small uses
export function JesterIcon({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-icon inline-flex items-center justify-center ${className}`}>
      <Image
        src="/images/jester-logo.png"
        alt="CypherJester"
        width={24}
        height={24}
        className="brand-logo-cypher"
      />
      <span className="brand-logo-21z font-display text-sm leading-none" aria-label="21z">
        <span className="font-bold text-accent-primary">21</span>
        <sub className="relative -bottom-0.5 text-[0.55rem] text-accent-secondary/70">z</sub>
      </span>
    </span>
  )
}
