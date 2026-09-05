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

  it('shows reserved funds under review instead of offering an immediate retry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ requiresReview: true, transactionId: 'review-1' }) } as Response)
    render(<WithdrawalModal {...baseProps} />)
    fireEvent.change(screen.getByPlaceholderText('Min: 0.01 ZEC'), { target: { value: '0.1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review Withdrawal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Withdrawal' }))
    expect(await screen.findByText('Withdrawal Under Review')).toBeInTheDocument()
    expect(baseProps.onBalanceUpdate).toHaveBeenCalledWith(0.4499)
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

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
