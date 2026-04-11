import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SwapWidget } from './SwapWidget'

vi.mock('@/components/ui/QRCode', () => ({
  CopyButton: ({ text }: { text: string }) => <button data-testid={`copy-${text.slice(0, 8)}`}>Copy</button>,
}))

describe('SwapWidget', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('requests a quote and uses the transparent fallback address as the ZEC recipient', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          rail: {
            id: 'sol',
            label: 'SOL',
            symbol: 'SOL',
            blockchain: 'sol',
            blockchainLabel: 'Solana',
            assetId: 'nep141:sol.omft.near',
            decimals: 9,
            refundPlaceholder: 'Your Solana wallet address',
            refundHint: 'Use a self-custody Solana address you control in case the route refunds.',
          },
          quote: {
            amountIn: '10000000',
            amountInFormatted: '0.01',
            amountInUsd: '0.85',
            amountOut: '180000',
            amountOutFormatted: '0.0018',
            amountOutUsd: '0.67',
            minAmountOut: '178200',
            timeEstimate: 135,
            deadline: '2026-04-12T00:00:00.000Z',
            timeWhenInactive: '2026-04-12T00:00:00.000Z',
            depositAddress: 'solana-quote-address',
          },
          quoteRequest: {
            deadline: '2026-04-11T23:20:00.000Z',
            recipient: 't1fallbackrecipient',
            refundTo: 'sol-refund-wallet',
          },
          configuredAppFeeBps: 15,
          partnerAuthEnabled: true,
          correlationId: 'corr-123456',
        }),
      })
      .mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          status: 'PENDING_DEPOSIT',
          updatedAt: '2099-01-01T00:00:00.000Z',
          correlationId: 'corr-123456',
          swapDetails: {
            originChainTxHashes: [],
            destinationChainTxHashes: [],
          },
        }),
      })

    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(
      <SwapWidget
        depositAddress="u1shieldeddeposit"
        transparentAddress="t1fallbackrecipient"
      />
    )

    await user.type(screen.getByPlaceholderText('0.10 SOL'), '0.01')
    await user.type(screen.getByPlaceholderText('Your Solana wallet address'), 'sol-refund-wallet')
    await user.click(screen.getByRole('button', { name: 'Get SOL → ZEC quote' }))

    await waitFor(() => {
      expect(screen.getByText('Quote ready')).toBeInTheDocument()
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/swap')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({
      action: 'quote',
      railId: 'sol',
      amount: '0.01',
      recipientAddress: 't1fallbackrecipient',
      refundAddress: 'sol-refund-wallet',
    })

    expect(screen.getByText('0.0018 ZEC')).toBeInTheDocument()
    expect(screen.getByText(/Includes a Zcashino fee of 0.15%/i)).toBeInTheDocument()
    expect(screen.getByText(/Waiting for your SOL deposit/i)).toBeInTheDocument()
  })
})
