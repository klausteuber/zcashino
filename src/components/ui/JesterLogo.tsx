'use client'

interface JesterLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10'
}

// Venetian half-mask with jester cap point — mysterious and elegant
export default function JesterLogo({ className = '', size = 'md' }: JesterLogoProps) {
  return (
    <svg
      className={`${sizeClasses[size]} ${className}`}
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Mask body - Colombina half-mask shape */}
      <path
        d="M12 52 Q12 38 28 32 Q40 28 50 28 Q60 28 72 32 Q88 38 88 52 Q88 62 78 68 Q68 74 58 74 L42 74 Q32 74 22 68 Q12 62 12 52Z"
      />

      {/* Left eye cutout */}
      <ellipse cx="35" cy="48" rx="10" ry="7" className="text-midnight-black" />

      {/* Right eye cutout - the all-seeing eye */}
      <ellipse cx="65" cy="48" rx="10" ry="7" className="text-midnight-black" />

      {/* Ornate nose bridge */}
      <path
        d="M46 44 Q50 40 54 44"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-masque-gold"
      />

      {/* Mask brow arch - decorative filigree */}
      <path
        d="M20 42 Q35 30 50 32 Q65 30 80 42"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-masque-gold"
      />

      {/* Jester cap point - single asymmetric flourish */}
      <path
        d="M68 32 Q78 18 82 8 Q84 12 80 20 Q76 28 72 32"
        className="text-masque-gold"
      />

      {/* Cap bell at tip */}
      <circle cx="82" cy="8" r="3" className="text-masque-gold" />

      {/* Lower mask edge - decorative scallop */}
      <path
        d="M30 70 Q36 76 42 70 Q48 76 54 70 Q60 76 66 70"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-jester-purple-dark"
      />
    </svg>
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
      {/* Jester cap with three points */}
      <path d="M12 2 Q8 6 4 4 Q6 10 8 14 L16 14 Q18 10 20 4 Q16 6 12 2Z" />
      {/* Bells at tips */}
      <circle cx="4" cy="4" r="2" />
      <circle cx="20" cy="4" r="2" />
      <circle cx="12" cy="2" r="1.5" />
      {/* Mask face below */}
      <path d="M8 14 Q8 20 12 22 Q16 20 16 14Z" />
    </svg>
  )
}

// Compact mask icon for favicon/small uses
export function JesterIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Simplified mask */}
      <path d="M4 16 Q4 10 10 8 Q14 7 16 7 Q18 7 22 8 Q28 10 28 16 Q28 20 24 22 Q20 24 16 24 Q12 24 8 22 Q4 20 4 16Z" />
      {/* Left eye */}
      <ellipse cx="11" cy="15" rx="3" ry="2" className="text-midnight-black" />
      {/* Right eye */}
      <ellipse cx="21" cy="15" rx="3" ry="2" className="text-midnight-black" />
      {/* Cap point */}
      <path d="M22 8 Q25 4 26 2" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-masque-gold" />
      <circle cx="26" cy="2" r="1.5" className="text-masque-gold" />
    </svg>
  )
}
