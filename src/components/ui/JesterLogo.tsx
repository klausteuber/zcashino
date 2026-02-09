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

// Jester hat with Guy Fawkes mask — three-pointed cap over stylized golden mask face
export default function JesterLogo({ className = '', size = 'md' }: JesterLogoProps) {
  return (
    <svg
      className={`${sizeClasses[size]} ${className}`}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* === JESTER HAT === */}

      {/* Center hat point — tall, curling slightly right, gold front with green back */}
      <path
        d="M50 48 Q48 30 42 18 Q44 8 50 2 Q52 8 56 4 Q54 14 52 30 Q51 40 50 48Z"
        className="text-masque-gold"
        fill="currentColor"
      />
      {/* Center point green back side */}
      <path
        d="M50 48 Q52 30 56 4 Q58 10 58 18 Q56 30 54 48Z"
        className="text-jester-purple-dark"
        fill="currentColor"
      />
      {/* Center bell */}
      <circle cx="50" cy="2" r="3" className="text-masque-gold" fill="currentColor" />

      {/* Left hat point — curls down and left */}
      <path
        d="M38 50 Q30 44 22 42 Q14 40 8 44 Q4 46 2 52"
        className="text-jester-purple"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0"
      />
      <path
        d="M38 50 Q32 42 24 38 Q16 36 8 38 Q4 42 2 52 Q4 46 8 44 Q14 40 22 42 Q30 44 38 50Z"
        className="text-jester-purple"
        fill="currentColor"
      />
      {/* Left point underside / darker */}
      <path
        d="M38 50 Q30 46 22 44 Q14 42 8 44 Q4 46 2 52 Q6 48 12 46 Q20 44 30 48 Q34 50 38 50Z"
        className="text-jester-purple-dark"
        fill="currentColor"
      />
      {/* Left bell */}
      <circle cx="2" cy="52" r="3" className="text-masque-gold" fill="currentColor" />

      {/* Right hat point — curls down and right */}
      <path
        d="M62 50 Q70 42 78 38 Q86 36 92 38 Q96 42 98 52 Q96 46 92 44 Q86 40 78 42 Q70 44 62 50Z"
        className="text-jester-purple"
        fill="currentColor"
      />
      {/* Right point underside / darker */}
      <path
        d="M62 50 Q70 46 78 44 Q86 42 92 44 Q96 46 98 52 Q94 48 88 46 Q80 44 70 48 Q66 50 62 50Z"
        className="text-jester-purple-dark"
        fill="currentColor"
      />
      {/* Right bell */}
      <circle cx="98" cy="52" r="3" className="text-masque-gold" fill="currentColor" />

      {/* Hat brim band */}
      <path
        d="M24 52 Q36 46 50 46 Q64 46 76 52"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-jester-purple-dark"
      />

      {/* === MASK FACE — Guy Fawkes / V style === */}

      {/* Face shape — pointed chin, wide cheeks */}
      <path
        d="M26 56 Q24 52 28 50 Q36 46 50 46 Q64 46 72 50 Q76 52 74 56 Q74 72 68 82 Q62 92 56 98 Q52 102 50 104 Q48 102 44 98 Q38 92 32 82 Q26 72 26 56Z"
        className="text-masque-gold"
        fill="currentColor"
      />

      {/* Forehead shadow / upper mask darker area */}
      <path
        d="M30 54 Q36 48 50 48 Q64 48 70 54 Q70 58 66 60 L34 60 Q30 58 30 54Z"
        className="text-jester-purple-dark"
        fill="currentColor"
        opacity="0.25"
      />

      {/* Left eyebrow — arched, sharp */}
      <path
        d="M32 58 Q36 52 44 56"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="text-jester-purple-dark"
      />

      {/* Right eyebrow — arched, sharp */}
      <path
        d="M68 58 Q64 52 56 56"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="text-jester-purple-dark"
      />

      {/* Left eye — narrow, angular slits */}
      <path
        d="M34 62 Q38 58 44 62 Q38 64 34 62Z"
        className="text-midnight-black"
        fill="currentColor"
      />

      {/* Right eye — narrow, angular slits */}
      <path
        d="M56 62 Q62 58 66 62 Q62 64 56 62Z"
        className="text-midnight-black"
        fill="currentColor"
      />

      {/* Nose — narrow, defined */}
      <path
        d="M48 66 L50 76 L52 66"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-jester-purple-dark"
      />
      {/* Nose tip flare */}
      <path
        d="M47 76 Q50 78 53 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-jester-purple-dark"
      />

      {/* Cheek lines — rosy cheek accents */}
      <path
        d="M30 68 Q34 72 36 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        className="text-jester-purple-dark"
        opacity="0.4"
      />
      <path
        d="M70 68 Q66 72 64 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        className="text-jester-purple-dark"
        opacity="0.4"
      />

      {/* Mustache — curling upward at ends */}
      <path
        d="M34 82 Q38 78 44 80 Q48 82 50 80 Q52 82 56 80 Q62 78 66 82"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-jester-purple-dark"
      />

      {/* Thin smile line */}
      <path
        d="M40 84 Q45 88 50 88 Q55 88 60 84"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        className="text-jester-purple-dark"
        opacity="0.5"
      />

      {/* Goatee — pointed triangular beard */}
      <path
        d="M44 88 Q46 90 48 94 Q50 100 50 104 Q50 100 52 94 Q54 90 56 88 Q52 92 50 96 Q48 92 44 88Z"
        className="text-jester-purple-dark"
        fill="currentColor"
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

// Compact jester with Guy Fawkes mask for favicon/small uses
export function JesterIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Center hat point */}
      <path d="M14 15 Q14 8 16 1 Q18 8 18 15Z" className="text-masque-gold" fill="currentColor" />
      <circle cx="16" cy="1" r="1.5" className="text-masque-gold" fill="currentColor" />
      {/* Left hat point */}
      <path d="M10 16 Q6 14 2 16" className="text-jester-purple" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="2" cy="16" r="1.5" className="text-masque-gold" fill="currentColor" />
      {/* Right hat point */}
      <path d="M22 16 Q26 14 30 16" className="text-jester-purple" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="30" cy="16" r="1.5" className="text-masque-gold" fill="currentColor" />
      {/* Face — pointed chin */}
      <path d="M8 17 Q8 15 16 15 Q24 15 24 17 Q24 26 20 30 Q18 33 16 35 Q14 33 12 30 Q8 26 8 17Z" className="text-masque-gold" fill="currentColor" />
      {/* Left eye */}
      <path d="M11 20 Q13 18 15 20 Q13 21 11 20Z" className="text-midnight-black" fill="currentColor" />
      {/* Right eye */}
      <path d="M17 20 Q19 18 21 20 Q19 21 17 20Z" className="text-midnight-black" fill="currentColor" />
      {/* Mustache */}
      <path d="M11 26 Q13 24 16 25 Q19 24 21 26" fill="none" stroke="currentColor" strokeWidth="1" className="text-jester-purple-dark" />
      {/* Goatee */}
      <path d="M14 28 Q16 33 18 28 Q16 31 14 28Z" className="text-jester-purple-dark" fill="currentColor" />
    </svg>
  )
}
