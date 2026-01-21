'use client'

import { useEffect, useRef, useState } from 'react'

interface QRCodeProps {
  value: string
  size?: number
  bgColor?: string
  fgColor?: string
  className?: string
}

// Simple QR code generation using canvas
// Uses a basic QR code algorithm - for production consider using a library
export function QRCode({
  value,
  size = 200,
  bgColor = '#ffffff',
  fgColor = '#000000',
  className = ''
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    try {
      // Generate QR code matrix
      const matrix = generateQRMatrix(value)
      const moduleCount = matrix.length
      const moduleSize = size / moduleCount

      // Clear canvas
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, size, size)

      // Draw modules
      ctx.fillStyle = fgColor
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (matrix[row][col]) {
            ctx.fillRect(
              col * moduleSize,
              row * moduleSize,
              moduleSize,
              moduleSize
            )
          }
        }
      }
      setError(null)
    } catch (err) {
      setError('Failed to generate QR code')
      console.error('QR generation error:', err)
    }
  }, [value, size, bgColor, fgColor])

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-800 text-zinc-400 text-sm ${className}`}
        style={{ width: size, height: size }}
      >
        {error}
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

// Minimal QR code generator - Version 2 (25x25), Error Correction Level L
// For a production app, use a proper library like qrcode.react
function generateQRMatrix(data: string): boolean[][] {
  const size = 25 // Version 2 QR code
  const matrix: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false))

  // Add finder patterns (top-left, top-right, bottom-left)
  addFinderPattern(matrix, 0, 0)
  addFinderPattern(matrix, size - 7, 0)
  addFinderPattern(matrix, 0, size - 7)

  // Add timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0
    matrix[i][6] = i % 2 === 0
  }

  // Add alignment pattern (for version 2)
  addAlignmentPattern(matrix, 16, 16)

  // Add format info (simplified)
  matrix[8][0] = true
  matrix[8][1] = true
  matrix[8][2] = false
  matrix[8][3] = true
  matrix[8][4] = true
  matrix[8][5] = false

  // Encode data in remaining space with simple pattern
  // This is a simplified encoding - real QR needs proper Reed-Solomon
  const dataBytes = encodeToBytes(data)
  let byteIndex = 0
  let bitIndex = 0

  // Fill data area with encoded data
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5 // Skip timing column

    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2; c++) {
        const x = col - c
        const y = col % 4 === 0 ? size - 1 - row : row

        if (!isReserved(x, y, size)) {
          if (byteIndex < dataBytes.length) {
            const bit = (dataBytes[byteIndex] >> (7 - bitIndex)) & 1
            matrix[y][x] = bit === 1
            bitIndex++
            if (bitIndex === 8) {
              bitIndex = 0
              byteIndex++
            }
          } else {
            // Padding pattern
            matrix[y][x] = (x + y) % 2 === 0
          }
        }
      }
    }
  }

  // Apply mask pattern 0 (checkerboard)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isReserved(x, y, size)) {
        if ((x + y) % 2 === 0) {
          matrix[y][x] = !matrix[y][x]
        }
      }
    }
  }

  return matrix
}

function addFinderPattern(matrix: boolean[][], startX: number, startY: number) {
  // 7x7 finder pattern
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const isOuter = y === 0 || y === 6 || x === 0 || x === 6
      const isInner = y >= 2 && y <= 4 && x >= 2 && x <= 4
      matrix[startY + y][startX + x] = isOuter || isInner
    }
  }
  // Add separator (white border)
  for (let i = 0; i < 8; i++) {
    if (startX + 7 < matrix.length) matrix[startY + Math.min(i, 6)][startX + 7] = false
    if (startY + 7 < matrix.length) matrix[startY + 7][startX + Math.min(i, 6)] = false
  }
}

function addAlignmentPattern(matrix: boolean[][], centerX: number, centerY: number) {
  for (let y = -2; y <= 2; y++) {
    for (let x = -2; x <= 2; x++) {
      const isOuter = Math.abs(x) === 2 || Math.abs(y) === 2
      const isCenter = x === 0 && y === 0
      matrix[centerY + y][centerX + x] = isOuter || isCenter
    }
  }
}

function isReserved(x: number, y: number, size: number): boolean {
  // Finder patterns + separators
  if (x < 9 && y < 9) return true // Top-left
  if (x >= size - 8 && y < 9) return true // Top-right
  if (x < 9 && y >= size - 8) return true // Bottom-left

  // Timing patterns
  if (x === 6 || y === 6) return true

  // Alignment pattern
  if (x >= 14 && x <= 18 && y >= 14 && y <= 18) return true

  return false
}

function encodeToBytes(data: string): number[] {
  const bytes: number[] = []

  // Mode indicator (0100 = byte mode) + character count
  const length = data.length
  bytes.push(0x40 | (length >> 4))
  bytes.push(((length & 0x0f) << 4) | (data.charCodeAt(0) >> 4))

  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    if (i === 0) {
      bytes.push(((char & 0x0f) << 4) | ((i + 1 < data.length ? data.charCodeAt(i + 1) >> 4 : 0)))
    } else if (i % 2 === 1) {
      bytes.push(((data.charCodeAt(i - 1) & 0x0f) << 4) | (char >> 4))
      if (i + 1 < data.length) {
        bytes.push(((char & 0x0f) << 4) | (data.charCodeAt(i + 1) >> 4))
      } else {
        bytes.push((char & 0x0f) << 4)
      }
    }
  }

  // Terminator
  bytes.push(0x00)

  return bytes
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
