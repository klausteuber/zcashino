'use client'

interface PepeLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10'
}

// Minimalist frog silhouette with monocle - classy and subtle
export default function PepeLogo({ className = '', size = 'md' }: PepeLogoProps) {
  return (
    <svg
      className={`${sizeClasses[size]} ${className}`}
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Frog head silhouette */}
      <ellipse cx="50" cy="55" rx="38" ry="32" />

      {/* Left eye bulge */}
      <ellipse cx="30" cy="35" rx="14" ry="12" />

      {/* Right eye bulge */}
      <ellipse cx="70" cy="35" rx="14" ry="12" />

      {/* Monocle circle */}
      <circle
        cx="70"
        cy="35"
        r="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-monaco-gold"
      />

      {/* Monocle chain */}
      <path
        d="M 82 45 Q 90 60, 85 80"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-monaco-gold"
      />

      {/* Eye cutouts (darker/transparent) */}
      <ellipse cx="30" cy="35" rx="6" ry="5" className="text-rich-black" />
      <ellipse cx="70" cy="35" rx="6" ry="5" className="text-rich-black" />

      {/* Subtle smile line */}
      <path
        d="M 25 65 Q 50 78, 75 65"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-pepe-green-dark"
      />
    </svg>
  )
}

// Simple crown icon for card backs
export function PepeCrown({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  )
}

// Compact frog icon for favicon/small uses
export function PepeIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Simplified frog head */}
      <ellipse cx="16" cy="18" rx="12" ry="10" />
      {/* Left eye */}
      <circle cx="10" cy="12" r="4" />
      {/* Right eye */}
      <circle cx="22" cy="12" r="4" />
      {/* Monocle ring */}
      <circle
        cx="22"
        cy="12"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-monaco-gold"
      />
    </svg>
  )
}
