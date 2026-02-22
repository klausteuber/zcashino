'use client'

interface ChipProps {
  value: number
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const chipStyles: Record<number, string> = {
  0.01: 'bg-bone-white border-masque-gold text-midnight-black',
  0.05: 'bg-blood-ruby border-blood-ruby/70 text-bone-white',
  0.1: 'bg-[#1a4a7a] border-[#3a7abf] text-bone-white',
  0.25: 'bg-[#1a6a3a] border-[#3aaf5a] text-bone-white',
  0.5: 'bg-gradient-to-br from-masque-gold to-venetian-gold border-venetian-gold text-midnight-black',
  1: 'bg-midnight-black border-masque-gold text-masque-gold'
}

const sizeClasses = {
  sm: 'w-10 h-10 text-xs border-2',
  md: 'w-14 h-14 text-sm border-[3px]',
  lg: 'w-20 h-20 text-base border-4'
}

export default function Chip({
  value,
  selected = false,
  onClick,
  disabled = false,
  size = 'md'
}: ChipProps) {
  const baseStyle = chipStyles[value] || chipStyles[0.01]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-value={value}
      className={`
        ${sizeClasses[size]}
        ${baseStyle} chip
        rounded-full
        font-bold
        shadow-lg
        flex items-center justify-center
        ${selected ? 'chip-select ring-4 ring-accent-primary shadow-[0_0_15px_color-mix(in_srgb,var(--accent-primary)_45%,transparent)]' : 'transition-all duration-150'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95 cursor-pointer'}
      `}
    >
      {value}
    </button>
  )
}

interface ChipStackProps {
  values: number[]
  selectedValue: number | null
  onSelect: (value: number) => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function ChipStack({
  values,
  selectedValue,
  onSelect,
  disabled = false,
  size = 'md'
}: ChipStackProps) {
  return (
    <div className="flex gap-2 justify-center">
      {values.map(value => (
        <Chip
          key={value}
          value={value}
          selected={selectedValue === value}
          onClick={() => onSelect(value)}
          disabled={disabled}
          size={size}
        />
      ))}
    </div>
  )
}
