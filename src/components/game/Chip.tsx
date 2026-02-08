'use client'

interface ChipProps {
  value: number
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const chipStyles: Record<number, string> = {
  0.01: 'bg-ivory-white border-monaco-gold text-rich-black',
  0.05: 'bg-burgundy border-burgundy/70 text-ivory-white',
  0.1: 'bg-pepe-green border-pepe-green-light text-ivory-white',
  0.25: 'bg-velvet-purple border-velvet-purple/70 text-ivory-white',
  0.5: 'bg-gradient-to-br from-monaco-gold to-champagne-gold border-champagne-gold text-rich-black',
  1: 'bg-rich-black border-monaco-gold text-monaco-gold'
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
      className={`
        ${sizeClasses[size]}
        ${baseStyle}
        rounded-full
        font-bold
        shadow-lg
        flex items-center justify-center
        ${selected ? 'chip-select ring-4 ring-monaco-gold shadow-[0_0_15px_rgba(201,162,39,0.5)]' : 'transition-all duration-150'}
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
}

export function ChipStack({
  values,
  selectedValue,
  onSelect,
  disabled = false
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
        />
      ))}
    </div>
  )
}
