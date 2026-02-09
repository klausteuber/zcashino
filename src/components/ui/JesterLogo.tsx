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

// Jester character with mask — playful trickster with three-pointed cap and half-mask
export default function JesterLogo({ className = '', size = 'md' }: JesterLogoProps) {
  return (
    <svg
      className={`${sizeClasses[size]} ${className}`}
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Jester hat - three-pointed cap with bells */}
      {/* Left point curling outward */}
      <path
        d="M30 38 Q18 20 8 14 Q10 18 12 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-masque-gold"
      />
      <circle cx="8" cy="13" r="3.5" className="text-masque-gold" />

      {/* Center point */}
      <path
        d="M42 38 Q44 18 50 6 Q56 18 58 38"
        className="text-masque-gold"
      />
      <circle cx="50" cy="5" r="3.5" className="text-masque-gold" />

      {/* Right point curling outward */}
      <path
        d="M70 38 Q82 20 92 14 Q90 18 88 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-masque-gold"
      />
      <circle cx="92" cy="13" r="3.5" className="text-masque-gold" />

      {/* Hat brim / headband */}
      <path
        d="M22 40 Q30 34 50 34 Q70 34 78 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-masque-gold"
      />

      {/* Face / head shape */}
      <ellipse cx="50" cy="58" rx="26" ry="24" className="text-venetian-gold" />

      {/* Half-mask covering upper face — the signature CypherJester element */}
      <path
        d="M24 52 Q24 40 36 38 Q44 36 50 36 Q56 36 64 38 Q76 40 76 52 Q76 56 72 58 L28 58 Q24 56 24 52Z"
      />

      {/* Left eye cutout in mask */}
      <ellipse cx="38" cy="48" rx="7" ry="5" className="text-midnight-black" />
      {/* Eye glint */}
      <circle cx="36" cy="47" r="1.5" className="text-bone-white" opacity="0.6" />

      {/* Right eye cutout in mask */}
      <ellipse cx="62" cy="48" rx="7" ry="5" className="text-midnight-black" />
      {/* Eye glint */}
      <circle cx="60" cy="47" r="1.5" className="text-bone-white" opacity="0.6" />

      {/* Ornate mask brow decoration */}
      <path
        d="M30 44 Q38 38 50 40 Q62 38 70 44"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-masque-gold"
      />

      {/* Nose */}
      <path
        d="M48 54 Q50 58 52 54"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-jester-purple-dark"
      />

      {/* Sly grin below the mask */}
      <path
        d="M38 66 Q44 72 50 72 Q56 72 62 66"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-jester-purple-dark"
      />

      {/* Chin dimple / smirk accent */}
      <path
        d="M62 66 Q64 64 66 65"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-jester-purple-dark"
      />

      {/* Collar ruffles at bottom */}
      <path
        d="M30 78 Q36 84 42 78 Q48 84 54 78 Q60 84 66 78 Q72 84 76 80"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-masque-gold"
      />

      {/* Neck */}
      <path
        d="M42 80 Q42 86 40 90 L60 90 Q58 86 58 80"
        className="text-venetian-gold"
        opacity="0.8"
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

// Compact jester with mask for favicon/small uses
export function JesterIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hat center point */}
      <path d="M14 10 Q15 4 16 2 Q17 4 18 10" className="text-masque-gold" />
      <circle cx="16" cy="2" r="1.5" className="text-masque-gold" />
      {/* Hat left point */}
      <path d="M10 12 Q6 6 4 5" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-masque-gold" />
      <circle cx="4" cy="5" r="1.5" className="text-masque-gold" />
      {/* Hat right point */}
      <path d="M22 12 Q26 6 28 5" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-masque-gold" />
      <circle cx="28" cy="5" r="1.5" className="text-masque-gold" />
      {/* Face */}
      <ellipse cx="16" cy="19" rx="9" ry="8" className="text-venetian-gold" />
      {/* Mask upper half */}
      <path d="M7 17 Q7 12 12 11 Q14 10 16 10 Q18 10 20 11 Q25 12 25 17 Q25 18 24 19 L8 19 Q7 18 7 17Z" />
      {/* Left eye */}
      <ellipse cx="12" cy="15" rx="2.5" ry="1.8" className="text-midnight-black" />
      {/* Right eye */}
      <ellipse cx="20" cy="15" rx="2.5" ry="1.8" className="text-midnight-black" />
      {/* Grin */}
      <path d="M12 22 Q14 25 16 25 Q18 25 20 22" fill="none" stroke="currentColor" strokeWidth="1" className="text-jester-purple-dark" />
    </svg>
  )
}
