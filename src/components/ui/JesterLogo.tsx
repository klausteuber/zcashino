'use client'

interface JesterLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-6 w-auto',
  md: 'h-8 w-auto',
  lg: 'h-10 w-auto'
}

// CypherJester logo — jester hat with Guy Fawkes mask
export default function JesterLogo({ className = '', size = 'md' }: JesterLogoProps) {
  return (
    <img
      src="/images/jester-logo.png"
      alt="CypherJester"
      className={`${sizeClasses[size]} ${className}`}
    />
  )
}

// Jester bell icon for card backs
export function JesterBell({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
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
  )
}

// Compact version for favicon/small uses
export function JesterIcon({ className = '' }: { className?: string }) {
  return (
    <img
      src="/images/jester-logo.png"
      alt="CypherJester"
      className={className}
    />
  )
}
