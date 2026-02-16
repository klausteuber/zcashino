'use client'

import { useEffect, useRef, useState } from 'react'
import QRCodeLib from 'qrcode'

interface QRCodeProps {
  value: string
  size?: number
  bgColor?: string
  fgColor?: string
  className?: string
}

export function QRCode({
  value,
  size = 200,
  bgColor = '#ffffff',
  fgColor = '#000000',
  className = ''
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value) return

    let cancelled = false

    const render = async () => {
      try {
        await QRCodeLib.toCanvas(canvas, value, {
          width: size,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: fgColor,
            light: bgColor,
          },
        })

        if (!cancelled) {
          setHasError(false)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('QR generation error:', err)
          setHasError(true)
        }
      }
    }

    render()

    return () => {
      cancelled = true
    }
  }, [value, size, bgColor, fgColor])

  if (value && hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-800 text-zinc-400 text-sm ${className}`}
        style={{ width: size, height: size }}
      >
        Failed to generate QR code
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
    />
  )
}

// Copy address to clipboard component
interface CopyButtonProps {
  text: string
  className?: string
}

export function CopyButton({ text, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        copied
          ? 'bg-green-500/20 text-green-400'
          : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
      } ${className}`}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}
