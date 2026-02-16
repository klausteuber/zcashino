import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WithdrawalModal } from './WithdrawalModal'

describe('WithdrawalModal', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    sessionId: 'session-123',
    balance: 0.55,
    withdrawalAddress: 'u1withdrawaladdress1234567890',
    isDemo: false,
    onBalanceUpdate: vi.fn(),
  }

  it('allows exact-balance withdrawal after fee without precision rejection', () => {
    render(<WithdrawalModal {...baseProps} />)

    const input = screen.getByPlaceholderText('Min: 0.01 ZEC')
    fireEvent.change(input, { target: { value: '0.5499' } })

    expect(screen.queryByText(/Insufficient balance/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Withdrawal' })).toBeEnabled()
  })

  it('shows insufficient balance when amount plus fee exceeds available balance', () => {
    render(<WithdrawalModal {...baseProps} />)

    const input = screen.getByPlaceholderText('Min: 0.01 ZEC')
    fireEvent.change(input, { target: { value: '0.55' } })

    expect(screen.getByText(/Insufficient balance/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Withdrawal' })).toBeDisabled()
  })
})
