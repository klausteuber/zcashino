'use client'

import { useCallback, useRef, useEffect, useState } from 'react'

// Sound effect types
type SoundType = 'cardDeal' | 'cardFlip' | 'chipPlace' | 'win' | 'lose' | 'blackjack' | 'push' | 'buttonClick'

// Synthesize sounds using Web Audio API (no external files needed)
const createAudioContext = () => {
  if (typeof window === 'undefined') return null
  return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
}

export function useGameSounds(enabled: boolean = true) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const [isMuted, setIsMuted] = useState(!enabled)

  // Initialize audio context on first interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = createAudioContext()
      }
    }

    // Initialize on any user interaction
    document.addEventListener('click', initAudio, { once: true })
    document.addEventListener('touchstart', initAudio, { once: true })

    return () => {
      document.removeEventListener('click', initAudio)
      document.removeEventListener('touchstart', initAudio)
    }
  }, [])

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) => {
    if (isMuted || !audioContextRef.current) return

    const ctx = audioContextRef.current
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

    // Envelope for smooth sound
    gainNode.gain.setValueAtTime(0, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration)
  }, [isMuted])

  const playNoise = useCallback((duration: number, volume: number = 0.1) => {
    if (isMuted || !audioContextRef.current) return

    const ctx = audioContextRef.current
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    // Create white noise
    const bufferSize = ctx.sampleRate * duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5
    }

    const source = ctx.createBufferSource()
    const gainNode = ctx.createGain()
    const filterNode = ctx.createBiquadFilter()

    source.buffer = buffer
    filterNode.type = 'lowpass'
    filterNode.frequency.setValueAtTime(2000, ctx.currentTime)

    source.connect(filterNode)
    filterNode.connect(gainNode)
    gainNode.connect(ctx.destination)

    gainNode.gain.setValueAtTime(volume, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

    source.start(ctx.currentTime)
    source.stop(ctx.currentTime + duration)
  }, [isMuted])

  const playSound = useCallback((type: SoundType) => {
    if (isMuted) return

    switch (type) {
      case 'cardDeal':
        // Quick whoosh/snap sound
        playNoise(0.08, 0.15)
        playTone(800, 0.05, 'square', 0.1)
        break

      case 'cardFlip':
        // Card flip sound
        playNoise(0.06, 0.1)
        playTone(600, 0.08, 'triangle', 0.15)
        break

      case 'chipPlace':
        // Chip click sound
        playTone(1200, 0.05, 'square', 0.15)
        playTone(800, 0.08, 'sine', 0.1)
        break

      case 'win':
        // Ascending happy tones
        playTone(523, 0.15, 'sine', 0.25) // C5
        setTimeout(() => playTone(659, 0.15, 'sine', 0.25), 100) // E5
        setTimeout(() => playTone(784, 0.2, 'sine', 0.3), 200) // G5
        setTimeout(() => playTone(1047, 0.3, 'sine', 0.25), 300) // C6
        break

      case 'blackjack':
        // Celebratory fanfare
        playTone(523, 0.1, 'sine', 0.3) // C5
        setTimeout(() => playTone(659, 0.1, 'sine', 0.3), 80) // E5
        setTimeout(() => playTone(784, 0.1, 'sine', 0.3), 160) // G5
        setTimeout(() => playTone(1047, 0.15, 'sine', 0.35), 240) // C6
        setTimeout(() => playTone(1319, 0.2, 'sine', 0.35), 320) // E6
        setTimeout(() => playTone(1568, 0.4, 'sine', 0.3), 400) // G6
        break

      case 'lose':
        // Descending sad tones
        playTone(400, 0.2, 'sine', 0.2)
        setTimeout(() => playTone(350, 0.2, 'sine', 0.18), 150)
        setTimeout(() => playTone(300, 0.3, 'sine', 0.15), 300)
        break

      case 'push':
        // Neutral two-tone
        playTone(440, 0.15, 'triangle', 0.2)
        setTimeout(() => playTone(440, 0.15, 'triangle', 0.15), 150)
        break

      case 'buttonClick':
        // Quick click
        playTone(1000, 0.03, 'square', 0.1)
        break
    }
  }, [isMuted, playTone, playNoise])

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev)
  }, [])

  return {
    playSound,
    isMuted,
    toggleMute
  }
}
