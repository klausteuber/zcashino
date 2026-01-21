import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingModal } from './OnboardingModal'

// Mock the useDepositPolling hook
vi.mock('@/hooks/useDepositPolling', () => ({
  useDepositPolling: () => ({
    status: 'idle',
    confirmations: 0,
    requiredConfirmations: 3,
    amount: null,
    txHash: null,
    error: null,
    refresh: vi.fn(),
    reset: vi.fn(),
    isPolling: false,
  }),
}))

// Mock QRCode component
vi.mock('@/components/ui/QRCode', () => ({
  QRCode: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>,
  CopyButton: ({ text }: { text: string }) => (
    <button data-testid="copy-button">Copy {text.slice(0, 10)}...</button>
  ),
}))

describe('OnboardingModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onDemoSelect: vi.fn(),
    onDepositComplete: vi.fn(),
    sessionId: null,
    depositAddress: null,
    onCreateRealSession: vi.fn().mockResolvedValue({ sessionId: 'session-123', depositAddress: 'tm123...' }),
    onSetWithdrawalAddress: vi.fn().mockResolvedValue(true),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Welcome Screen', () => {
    it('should render welcome screen when modal is open', () => {
      render(<OnboardingModal {...defaultProps} />)

      expect(screen.getByText('Welcome to Zcashino')).toBeInTheDocument()
      expect(screen.getByText('Provably Fair ZEC Blackjack')).toBeInTheDocument()
    })

    it('should show Demo and Real ZEC options', () => {
      render(<OnboardingModal {...defaultProps} />)

      expect(screen.getByText('Try Demo')).toBeInTheDocument()
      expect(screen.getByText('10 ZEC')).toBeInTheDocument()
      expect(screen.getByText('Play Money')).toBeInTheDocument()
      expect(screen.getByText('Deposit')).toBeInTheDocument()
      expect(screen.getByText('Real ZEC')).toBeInTheDocument()
    })

    it('should not render when isOpen is false', () => {
      render(<OnboardingModal {...defaultProps} isOpen={false} />)

      expect(screen.queryByText('Welcome to Zcashino')).not.toBeInTheDocument()
    })

    it('should call onDemoSelect and onClose when Demo is clicked', async () => {
      const user = userEvent.setup()
      render(<OnboardingModal {...defaultProps} />)

      const demoButton = screen.getByText('Try Demo').closest('button')!
      await user.click(demoButton)

      expect(defaultProps.onDemoSelect).toHaveBeenCalled()
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('should call onCreateRealSession when Real ZEC is clicked', async () => {
      const user = userEvent.setup()
      render(<OnboardingModal {...defaultProps} />)

      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(defaultProps.onCreateRealSession).toHaveBeenCalled()
      })
    })
  })

  describe('Setup Screen', () => {
    it('should show setup screen after clicking Real ZEC', async () => {
      const user = userEvent.setup()
      render(<OnboardingModal {...defaultProps} />)

      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(screen.getByText('Set Withdrawal Address')).toBeInTheDocument()
      })
    })

    it('should have a back button that returns to welcome screen', async () => {
      const user = userEvent.setup()
      render(<OnboardingModal {...defaultProps} />)

      // Go to setup screen
      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(screen.getByText('Set Withdrawal Address')).toBeInTheDocument()
      })

      // Click back
      const backButton = screen.getByText('Back')
      await user.click(backButton)

      await waitFor(() => {
        expect(screen.getByText('Welcome to Zcashino')).toBeInTheDocument()
      })
    })

    it('should validate withdrawal address format', async () => {
      const user = userEvent.setup()
      const mockSetAddress = vi.fn().mockResolvedValue(false)

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId="session-123"
          onSetWithdrawalAddress={mockSetAddress}
        />
      )

      // Go to setup screen
      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/zs1|t1|tm/i)).toBeInTheDocument()
      })

      // Enter invalid address
      const input = screen.getByPlaceholderText(/zs1|t1|tm/i)
      await user.type(input, 'invalid-address')

      const continueButton = screen.getByText('Continue to Deposit')
      await user.click(continueButton)

      await waitFor(() => {
        expect(screen.getByText(/invalid/i)).toBeInTheDocument()
      })
    })

    it('should accept valid testnet address', async () => {
      const user = userEvent.setup()
      const mockSetAddress = vi.fn().mockResolvedValue(true)

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId="session-123"
          onSetWithdrawalAddress={mockSetAddress}
        />
      )

      // Go to setup screen
      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/zs1|t1|tm/i)).toBeInTheDocument()
      })

      // Enter valid testnet address (starts with tm and is long enough)
      const input = screen.getByPlaceholderText(/zs1|t1|tm/i)
      await user.type(input, 'tmTestAddress123456789012345678901234567890')

      const continueButton = screen.getByText('Continue to Deposit')
      await user.click(continueButton)

      await waitFor(() => {
        expect(mockSetAddress).toHaveBeenCalledWith('tmTestAddress123456789012345678901234567890')
      })
    })
  })

  describe('Deposit Screen', () => {
    it('should show deposit screen with QR code after setting address', async () => {
      const user = userEvent.setup()
      const mockSetAddress = vi.fn().mockResolvedValue(true)

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId="session-123"
          depositAddress="tmDeposit123456789012345678901234"
          onSetWithdrawalAddress={mockSetAddress}
        />
      )

      // Go to setup screen
      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/zs1|t1|tm/i)).toBeInTheDocument()
      })

      // Enter valid address
      const input = screen.getByPlaceholderText(/zs1|t1|tm/i)
      await user.type(input, 'tmTestAddress123456789012345678901234567890')

      const continueButton = screen.getByText('Continue to Deposit')
      await user.click(continueButton)

      await waitFor(() => {
        expect(screen.getByText('Deposit ZEC')).toBeInTheDocument()
        expect(screen.getByTestId('qr-code')).toBeInTheDocument()
      })
    })

    it('should show deposit requirements', async () => {
      const user = userEvent.setup()
      const mockSetAddress = vi.fn().mockResolvedValue(true)

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId="session-123"
          depositAddress="tmDeposit123"
          onSetWithdrawalAddress={mockSetAddress}
        />
      )

      // Navigate to deposit screen
      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/zs1|t1|tm/i)).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText(/zs1|t1|tm/i)
      await user.type(input, 'tmTestAddress123456789012345678901234567890')

      await user.click(screen.getByText('Continue to Deposit'))

      await waitFor(() => {
        expect(screen.getByText(/minimum.*0\.001/i)).toBeInTheDocument()
        expect(screen.getByText(/3 confirmations/i)).toBeInTheDocument()
      })
    })
  })

  describe('Modal Behavior', () => {
    it('should have correct modal styling', () => {
      const { container } = render(<OnboardingModal {...defaultProps} />)

      // Check for backdrop
      const backdrop = container.querySelector('.fixed.inset-0')
      expect(backdrop).toBeInTheDocument()
      expect(backdrop).toHaveClass('bg-black/80')
    })

    it('should show restore session option', () => {
      render(<OnboardingModal {...defaultProps} />)

      expect(screen.getByText(/already have a session/i)).toBeInTheDocument()
      expect(screen.getByText('Restore')).toBeInTheDocument()
    })
  })
})
