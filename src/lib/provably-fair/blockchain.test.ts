import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendZecMock: vi.fn(),
  waitForOperationMock: vi.fn(),
  getTransactionMock: vi.fn(),
  checkNodeStatusMock: vi.fn(),
}))

vi.mock('@/lib/wallet/rpc', async () => {
  const actual = await vi.importActual<typeof import('@/lib/wallet/rpc')>('@/lib/wallet/rpc')
  return {
    ...actual,
    sendZec: mocks.sendZecMock,
    waitForOperation: mocks.waitForOperationMock,
    getTransaction: mocks.getTransactionMock,
    checkNodeStatus: mocks.checkNodeStatusMock,
  }
})

let commitServerSeedHash: typeof import('./blockchain').commitServerSeedHash

describe('commitServerSeedHash unpaid-action retries', () => {
  beforeEach(async () => {
    vi.resetModules()
    process.env.HOUSE_ZADDR_MAINNET = 'u1houseaddress'
    ;({ commitServerSeedHash } = await import('./blockchain'))

    vi.clearAllMocks()
    mocks.checkNodeStatusMock.mockResolvedValue({
      connected: true,
      synced: true,
      blockHeight: 3242101,
    })
    mocks.getTransactionMock.mockResolvedValue({
      confirmations: 1,
      amount: 0.00001,
      fee: 0.00055,
      time: 1_732_000_000,
      blocktime: 1_732_000_001,
    })
  })

  it('retries with higher fee when operation fails with unpaid-action policy', async () => {
    mocks.sendZecMock
      .mockResolvedValueOnce({ operationId: 'opid-1' })
      .mockResolvedValueOnce({ operationId: 'opid-2' })
    mocks.waitForOperationMock
      .mockResolvedValueOnce({
        success: false,
        error: 'SendTransaction: Transaction commit failed:: tx unpaid action limit exceeded: 9 action(s) exceeds limit of 0',
      })
      .mockResolvedValueOnce({
        success: true,
        txid: 'txid-2',
      })

    const result = await commitServerSeedHash('abcd1234', 'mainnet')

    expect(result.success).toBe(true)
    expect(result.txHash).toBe('txid-2')
    expect(mocks.sendZecMock).toHaveBeenCalledTimes(2)

    const firstCall = mocks.sendZecMock.mock.calls[0]
    const secondCall = mocks.sendZecMock.mock.calls[1]
    expect(firstCall[6]).toBe(0.0001)
    expect(secondCall[6]).toBe(0.00055)
  })

  it('returns failure when operation error is not unpaid-action related', async () => {
    mocks.sendZecMock.mockResolvedValueOnce({ operationId: 'opid-1' })
    mocks.waitForOperationMock.mockResolvedValueOnce({
      success: false,
      error: 'transaction was rejected: bad-txns-sapling-unknown-anchor',
    })

    const result = await commitServerSeedHash('abcd1234', 'mainnet')

    expect(result.success).toBe(false)
    expect(result.error).toContain('bad-txns-sapling-unknown-anchor')
    expect(mocks.sendZecMock).toHaveBeenCalledTimes(1)
  })
})
