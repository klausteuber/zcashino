import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingModal } from './OnboardingModal'
import { BrandProvider } from '@/components/brand/BrandProvider'
import { getBrandConfig } from '@/lib/brand/config'

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
    it('should render 21z copy when 21z brand is active', () => {
      render(
        <BrandProvider
          brand={{
            id: '21z',
            host: '21z.cash',
            source: 'forced',
            config: getBrandConfig('21z'),
          }}
        >
          <OnboardingModal {...defaultProps} />
        </BrandProvider>
      )

      expect(screen.getByText('Welcome to 21z')).toBeInTheDocument()
      expect(screen.getByText('Prove Everything. Reveal Nothing.')).toBeInTheDocument()
    })

    it('should render welcome screen when modal is open', () => {
      render(<OnboardingModal {...defaultProps} />)

      expect(screen.getByText('Welcome to CypherJester')).toBeInTheDocument()
      expect(screen.getByText('Play in Private. Verify in Public.')).toBeInTheDocument()
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

      expect(screen.queryByText('Welcome to CypherJester')).not.toBeInTheDocument()
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

  describe('Deposit Screen (skips setup)', () => {
    it('should auto-advance to deposit screen when opened with existing deposit address', () => {
      render(
        <OnboardingModal
          {...defaultProps}
          sessionId="session-123"
          depositAddress="tmDeposit123456789012345678901234"
        />
      )

      // Should auto-advance to deposit screen without clicking anything
      expect(screen.getByText('Deposit ZEC')).toBeInTheDocument()
      expect(screen.getByTestId('qr-code')).toBeInTheDocument()
    })

    it('should show deposit requirements', () => {
      render(
        <OnboardingModal
          {...defaultProps}
          sessionId="session-123"
          depositAddress="tmDeposit123"
        />
      )

      expect(screen.getByText(/minimum.*0\.001/i)).toBeInTheDocument()
      expect(screen.getByText(/3 confirmations/i)).toBeInTheDocument()
    })

    it('should render QR code with raw address value', () => {
      const depositAddress = 'tmDeposit123456789012345678901234'

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId="session-123"
          depositAddress={depositAddress}
        />
      )

      expect(screen.getByTestId('qr-code')).toHaveTextContent(depositAddress)
      expect(screen.getByTestId('qr-code')).not.toHaveTextContent('zcash:')
    })

    it('should label unified mainnet deposit addresses as mainnet', () => {
      const unifiedMainnetAddress = `u1${'a'.repeat(100)}`

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId="session-123"
          depositAddress={unifiedMainnetAddress}
        />
      )

      expect(screen.getByText('Network: mainnet')).toBeInTheDocument()
    })

    it('should have a back button that returns to welcome screen', async () => {
      const user = userEvent.setup()

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId="session-123"
          depositAddress="tmDeposit123456789012345678901234"
        />
      )

      // Should auto-advance to deposit screen
      expect(screen.getByText('Deposit ZEC')).toBeInTheDocument()

      const backButton = screen.getByText('Back')
      await user.click(backButton)

      await waitFor(() => {
        expect(screen.getByText('Welcome to CypherJester')).toBeInTheDocument()
      })
    })

    it('should go to deposit screen via Real ZEC when no existing deposit address', async () => {
      const user = userEvent.setup()

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId={null}
          depositAddress={null}
        />
      )

      // Should show welcome screen since no existing deposit address
      expect(screen.getByText('Welcome to CypherJester')).toBeInTheDocument()

      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(defaultProps.onCreateRealSession).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(screen.getByText('Deposit ZEC')).toBeInTheDocument()
      })
    })

    it('should show error screen when session creation fails', async () => {
      const user = userEvent.setup()

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId={null}
          depositAddress={null}
          onCreateRealSession={vi.fn().mockResolvedValue(null)}
        />
      )

      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(screen.getByText('Something Went Wrong')).toBeInTheDocument()
        expect(screen.getByText('Try Again')).toBeInTheDocument()
      })
    })

    it('should show error screen when deposit address is missing', async () => {
      const user = userEvent.setup()

      render(
        <OnboardingModal
          {...defaultProps}
          sessionId={null}
          depositAddress={null}
          onCreateRealSession={vi.fn().mockResolvedValue({ sessionId: 'session-123', depositAddress: null })}
        />
      )

      const realButton = screen.getByText('Real ZEC').closest('button')!
      await user.click(realButton)

      await waitFor(() => {
        expect(screen.getByText('Something Went Wrong')).toBeInTheDocument()
        expect(screen.getByText(/failed to generate deposit address/i)).toBeInTheDocument()
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
