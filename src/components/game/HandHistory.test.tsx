import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HandHistory } from './HandHistory'
import type { HandHistoryEntry } from '@/types'

function createEntry(overrides: Partial<HandHistoryEntry> = {}): HandHistoryEntry {
  return {
    id: 'game-1',
    outcome: 'win',
    mainBet: 0.1,
    payout: 0.2,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('HandHistory', () => {
  it('returns null when entries array is empty', () => {
    const { container } = render(<HandHistory entries={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a details element when entries exist', () => {
    render(<HandHistory entries={[createEntry()]} />)
    const details = document.querySelector('details')
    expect(details).toBeTruthy()
  })

  it('is collapsed by default', () => {
    render(<HandHistory entries={[createEntry()]} />)
    const details = document.querySelector('details')
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('shows the correct count badge', () => {
    const entries = [
      createEntry({ id: 'g1' }),
      createEntry({ id: 'g2' }),
      createEntry({ id: 'g3' }),
    ]
    render(<HandHistory entries={entries} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('displays "Recent Hands" label', () => {
    render(<HandHistory entries={[createEntry()]} />)
    expect(screen.getByText('Recent Hands')).toBeInTheDocument()
  })

  it('shows win outcome with checkmark icon', () => {
    render(<HandHistory entries={[createEntry({ outcome: 'win' })]} />)
    expect(screen.getByText('\u2713')).toBeInTheDocument()
    expect(screen.getByText('Win')).toBeInTheDocument()
  })

  it('shows loss outcome with X icon', () => {
    render(<HandHistory entries={[createEntry({ outcome: 'lose' })]} />)
    expect(screen.getByText('\u2717')).toBeInTheDocument()
    expect(screen.getByText('Loss')).toBeInTheDocument()
  })

  it('shows blackjack outcome with star icon', () => {
    render(<HandHistory entries={[createEntry({ outcome: 'blackjack' })]} />)
    expect(screen.getByText('\u2605')).toBeInTheDocument()
    expect(screen.getByText('BJ')).toBeInTheDocument()
  })

  it('shows push outcome with line icon', () => {
    render(<HandHistory entries={[createEntry({ outcome: 'push', payout: 0.1 })]} />)
    expect(screen.getByText('\u2550')).toBeInTheDocument()
    expect(screen.getByText('Push')).toBeInTheDocument()
  })

  it('shows bet amount formatted to 2 decimals', () => {
    render(<HandHistory entries={[createEntry({ mainBet: 0.25 })]} />)
    expect(screen.getByText('0.25')).toBeInTheDocument()
  })

  it('shows positive net result with plus sign', () => {
    render(<HandHistory entries={[createEntry({ mainBet: 0.1, payout: 0.2 })]} />)
    expect(screen.getByText('+0.1000')).toBeInTheDocument()
  })

  it('shows negative net result without plus sign', () => {
    render(<HandHistory entries={[createEntry({ mainBet: 0.1, payout: 0 })]} />)
    expect(screen.getByText('-0.1000')).toBeInTheDocument()
  })
})
