import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNearIntentsStatus, requestNearIntentsQuote, submitNearIntentsDeposit } from './near-intents'

function mockJsonResponse(body: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('near-intents service', () => {
  const originalEnv = {
    NEAR_INTENTS_API_KEY: process.env.NEAR_INTENTS_API_KEY,
    NEAR_INTENTS_APP_FEE_BPS: process.env.NEAR_INTENTS_APP_FEE_BPS,
    NEAR_INTENTS_APP_FEE_RECIPIENT: process.env.NEAR_INTENTS_APP_FEE_RECIPIENT,
    NEAR_INTENTS_BASE_URL: process.env.NEAR_INTENTS_BASE_URL,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.NEAR_INTENTS_BASE_URL = 'https://1click.chaindefuser.com'
    process.env.NEAR_INTENTS_API_KEY = 'partner-key'
    process.env.NEAR_INTENTS_APP_FEE_BPS = '15'
    process.env.NEAR_INTENTS_APP_FEE_RECIPIENT = 'zcashino-fee-wallet'
  })

  afterEach(() => {
    process.env.NEAR_INTENTS_API_KEY = originalEnv.NEAR_INTENTS_API_KEY
    process.env.NEAR_INTENTS_APP_FEE_BPS = originalEnv.NEAR_INTENTS_APP_FEE_BPS
    process.env.NEAR_INTENTS_APP_FEE_RECIPIENT = originalEnv.NEAR_INTENTS_APP_FEE_RECIPIENT
    process.env.NEAR_INTENTS_BASE_URL = originalEnv.NEAR_INTENTS_BASE_URL
  })

  it('builds a quote request for SOL with auth and app fees', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        quote: {
          amountIn: '10000000',
          amountInFormatted: '0.01',
          amountInUsd: '1.00',
          minAmountIn: '10000000',
          amountOut: '200000',
          amountOutFormatted: '0.002',
          amountOutUsd: '0.75',
          minAmountOut: '198000',
          timeEstimate: 135,
          deadline: '2026-04-12T00:00:00.000Z',
          timeWhenInactive: '2026-04-12T00:00:00.000Z',
          depositAddress: 'solana-deposit-address',
        },
        quoteRequest: {
          dry: false,
          swapType: 'EXACT_INPUT',
          slippageTolerance: 100,
          originAsset: 'nep141:sol.omft.near',
          depositType: 'ORIGIN_CHAIN',
          destinationAsset: 'nep141:zec.omft.near',
          amount: '10000000',
          recipient: 't1zcashrecipient',
          recipientType: 'DESTINATION_CHAIN',
          refundTo: 'solRefundWallet',
          refundType: 'ORIGIN_CHAIN',
          deadline: '2026-04-11T23:20:00.000Z',
          appFees: [{ recipient: 'zcashino-fee-wallet', fee: 15 }],
        },
        signature: 'sig',
        timestamp: '2026-04-11T23:05:00.000Z',
        correlationId: 'corr-1',
      })
    )

    vi.stubGlobal('fetch', fetchMock)

    const result = await requestNearIntentsQuote({
      railId: 'sol',
      amount: '0.01',
      recipientAddress: 't1zcashrecipient',
      refundAddress: 'solRefundWallet',
    })

    expect(result.rail.id).toBe('sol')
    expect(result.configuredAppFeeBps).toBe(15)
    expect(result.partnerAuthEnabled).toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://1click.chaindefuser.com/v0/quote')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer partner-key',
    })

    const body = JSON.parse(String(init?.body))
    expect(body.originAsset).toBe('nep141:sol.omft.near')
    expect(body.destinationAsset).toBe('nep141:zec.omft.near')
    expect(body.amount).toBe('10000000')
    expect(body.recipient).toBe('t1zcashrecipient')
    expect(body.refundTo).toBe('solRefundWallet')
    expect(body.appFees).toEqual([{ recipient: 'zcashino-fee-wallet', fee: 15 }])
    expect(typeof body.deadline).toBe('string')
  })

  it('uses the status and deposit submit endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: 'PENDING_DEPOSIT',
          updatedAt: '2026-04-11T23:05:00.000Z',
          correlationId: 'corr-2',
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          success: true,
          message: 'submitted',
        })
      )

    vi.stubGlobal('fetch', fetchMock)

    const status = await getNearIntentsStatus('deposit-address-1')
    const submit = await submitNearIntentsDeposit('deposit-address-1', 'tx-hash-1')

    expect(status.status).toBe('PENDING_DEPOSIT')
    expect(submit.message).toBe('submitted')

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://1click.chaindefuser.com/v0/status?depositAddress=deposit-address-1'
    )
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://1click.chaindefuser.com/v0/deposit/submit')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
  })
})
