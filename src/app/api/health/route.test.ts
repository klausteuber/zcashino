import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    session: {
      count: vi.fn(),
    },
    seedCommitment: {
      count: vi.fn(),
    },
    transaction: {
      count: vi.fn(),
    },
  },
  checkNodeStatusMock: vi.fn(),
  getWalletBalanceMock: vi.fn(),
  isKillSwitchActiveMock: vi.fn(),
  getProvablyFairModeMock: vi.fn(),
  getSessionSeedPoolStatusMock: vi.fn(),
}))

const {
  prismaMock,
  checkNodeStatusMock,
  getWalletBalanceMock,
  isKillSwitchActiveMock,
  getProvablyFairModeMock,
  getSessionSeedPoolStatusMock,
} = mocks

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

vi.mock('@/lib/wallet/rpc', () => ({
  checkNodeStatus: mocks.checkNodeStatusMock,
  getWalletBalance: mocks.getWalletBalanceMock,
  getWalletBalanceCached: mocks.getWalletBalanceMock,
}))

vi.mock('@/lib/wallet', () => ({
  DEFAULT_NETWORK: 'mainnet',
}))

vi.mock('@/lib/kill-switch', () => ({
  isKillSwitchActive: mocks.isKillSwitchActiveMock,
}))

vi.mock('@/lib/provably-fair/mode', () => ({
  getProvablyFairMode: mocks.getProvablyFairModeMock,
}))

vi.mock('@/lib/services/session-seed-pool-manager', () => ({
  getSessionSeedPoolStatus: mocks.getSessionSeedPoolStatusMock,
}))

import { GET } from './route'

describe('/api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.session.count.mockResolvedValue(12)
    prismaMock.seedCommitment.count.mockResolvedValue(10)
    prismaMock.transaction.count.mockResolvedValue(0)
    checkNodeStatusMock.mockResolvedValue({ connected: true, synced: true, blockHeight: 12345 })
    getWalletBalanceMock.mockResolvedValue({ confirmed: 2, pending: 0.1, total: 2.1 })
    isKillSwitchActiveMock.mockReturnValue(false)
    getProvablyFairModeMock.mockReturnValue('legacy_per_game_v1')
    getSessionSeedPoolStatusMock.mockResolvedValue({ available: 5 })
  })

  it('reports pending withdrawals without running reconciliation side effects', async () => {
    const response = await GET()
    expect(response.status).toBe(200)

    const payload = await response.json()
    expect(payload.pendingWithdrawals).toBe(0)
    expect(prismaMock.transaction.count).toHaveBeenCalledWith({
      where: { type: 'withdrawal', status: { in: ['pending', 'pending_approval'] } },
    })
  })
})
