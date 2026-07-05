import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    depositWallet: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    sweepLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
  },
  checkNodeStatusMock: vi.fn(),
  getAddressBalanceMock: vi.fn(),
  sendZecMock: vi.fn(),
  getOperationStatusMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/wallet', () => ({
  DEFAULT_NETWORK: 'mainnet',
  roundZec: (value: number) => Math.round(value * 1e8) / 1e8,
}))

vi.mock('@/lib/wallet/rpc', () => ({
  checkNodeStatus: mocks.checkNodeStatusMock,
  getAddressBalance: mocks.getAddressBalanceMock,
  sendZec: mocks.sendZecMock,
  getOperationStatus: mocks.getOperationStatusMock,
  DEFAULT_Z_SENDMANY_FEE: 0.0001,
}))

import { sweepDeposits } from './deposit-sweep'

describe('deposit sweep service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HOUSE_ZADDR_MAINNET = 'u-house'
    mocks.checkNodeStatusMock.mockResolvedValue({ connected: true, synced: true })
    mocks.getAddressBalanceMock.mockResolvedValue({ confirmed: 0.02, pending: 0, total: 0.02 })
    mocks.prismaMock.sweepLog.findFirst.mockResolvedValue(null)
    mocks.prismaMock.sweepLog.create.mockResolvedValue({})
    mocks.sendZecMock.mockResolvedValue({ operationId: 'op-1' })
  })

  it('skips legacy wallets that lack a unified address instead of retrying z_sendmany forever', async () => {
    mocks.prismaMock.depositWallet.findMany.mockResolvedValue([
      {
        id: 'wallet-legacy',
        transparentAddr: 't-legacy',
        unifiedAddr: null,
      },
    ])

    const result = await sweepDeposits()

    expect(result).toMatchObject({
      swept: 0,
      skipped: 1,
      errors: 0,
    })
    expect(result.details[0]).toMatchObject({
      address: 't-legacy',
      amount: 0.0199,
      status: 'legacy-missing-unified-address',
    })
    expect(mocks.sendZecMock).not.toHaveBeenCalled()
    expect(mocks.prismaMock.sweepLog.create).not.toHaveBeenCalled()
  })

  it('sweeps with the full unified address when one is available', async () => {
    mocks.prismaMock.depositWallet.findMany.mockResolvedValue([
      {
        id: 'wallet-current',
        transparentAddr: 't-current',
        unifiedAddr: 'u-current',
      },
    ])

    const result = await sweepDeposits()

    expect(result).toMatchObject({
      swept: 1,
      skipped: 0,
      errors: 0,
    })
    expect(mocks.sendZecMock).toHaveBeenCalledWith(
      'u-current',
      'u-house',
      0.0199,
      undefined,
      'mainnet'
    )
    expect(mocks.prismaMock.sweepLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        depositWalletId: 'wallet-current',
        fromAddress: 't-current',
        toAddress: 'u-house',
        amount: 0.0199,
        operationId: 'op-1',
        status: 'pending',
      }),
    })
  })
})
