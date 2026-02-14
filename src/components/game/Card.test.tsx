import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import Card from './Card'

const faceDownCard = {
  rank: 'A',
  suit: 'spades',
  faceUp: false,
} as const

describe('Card', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('animates from hidden to dealt to settled for new cards', () => {
    vi.useFakeTimers()

    const { container } = render(
      <Card card={faceDownCard} isNew={true} dealDelay={120} />
    )
    const root = container.firstElementChild
    expect(root).toHaveClass('opacity-0')

    act(() => {
      vi.advanceTimersByTime(120)
    })
    expect(root).toHaveClass('deal-from-shoe')

    act(() => {
      vi.advanceTimersByTime(401)
    })
    expect(root).not.toHaveClass('deal-from-shoe')
    expect(root).toHaveClass('transition-all')
  })

  it('reveals card face halfway through flip animation', () => {
    vi.useFakeTimers()

    const { rerender } = render(<Card card={faceDownCard} />)
    expect(screen.queryByText('A')).not.toBeInTheDocument()

    rerender(<Card card={{ ...faceDownCard, faceUp: true }} />)

    act(() => {
      vi.advanceTimersByTime(149)
    })
    expect(screen.queryByText('A')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getAllByText('A').length).toBeGreaterThan(0)
  })

  it('cleans up pending animation timers on unmount', () => {
    vi.useFakeTimers()

    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout')

    const { unmount } = render(
      <Card card={faceDownCard} isNew={true} dealDelay={75} />
    )

    act(() => {
      vi.advanceTimersByTime(75)
    })

    const timers = setTimeoutSpy.mock.results
      .map(result => result.value)
      .slice(0, 2)
    expect(timers).toHaveLength(2)

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timers[0])
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timers[1])
  })
})
