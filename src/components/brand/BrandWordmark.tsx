interface BrandWordmarkProps {
  className?: string
  sizeClassName?: string
}

export function BrandWordmark({
  className = '',
  sizeClassName = 'text-xl',
}: BrandWordmarkProps) {
  return (
    <span className={`brand-wordmark inline-flex items-baseline ${sizeClassName} ${className}`}>
      <span className="brand-wordmark-cypher font-display font-bold tracking-tight">
        <span className="text-masque-gold">Cypher</span>
        <span className="text-bone-white">Jester</span>
      </span>
      <span className="brand-wordmark-21z font-display tracking-tight">
        <span className="font-bold text-accent-primary glitch-text">21</span>
        <sub className="relative -bottom-0.5 ml-0.5 text-[0.55em] font-normal text-accent-secondary/70">z</sub>
      </span>
    </span>
  )
}
