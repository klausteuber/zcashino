import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reserveFunds, creditFunds, releaseFunds } from './ledger'

type MockTx = {
  session: {
    updateMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  $executeRaw: ReturnType<typeof vi.fn>
}

function createTx(): MockTx {
  return {
    session: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $executeRaw: vi.fn(),
  }
}

describe('ledger service', () => {
  let tx: MockTx

  beforeEach(() => {
    tx = createTx()
  })

  it('reserveFunds allows tiny float dust and normalizes numeric fields', async () => {
    tx.session.updateMany.mockResolvedValue({ count: 1 })

    const reserved = await reserveFunds(
      tx as never,
      'session-1',
      0.55,
      'totalWithdrawn',
      0.5499
    )

    expect(reserved).toBe(true)
    const call = tx.session.updateMany.mock.calls[0]?.[0]
    expect(call.where.balance.gte).toBeCloseTo(0.5499999999, 12)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
  })

  it('reserveFunds does not normalize when reserve is rejected', async () => {
    tx.session.updateMany.mockResolvedValue({ count: 0 })

    const reserved = await reserveFunds(tx as never, 'session-1', 0.55, 'totalWithdrawn')

    expect(reserved).toBe(false)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })

  it('creditFunds normalizes session amounts after increment', async () => {
    tx.session.update.mockResolvedValue(undefined)

    await creditFunds(tx as never, 'session-1', 0.25, 'totalWon')

    expect(tx.session.update).toHaveBeenCalledTimes(1)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
  })

  it('releaseFunds normalizes session amounts after compensating reserve', async () => {
    tx.session.update.mockResolvedValue(undefined)

    await releaseFunds(tx as never, 'session-1', 0.25, 'totalWithdrawn', 0.2499)

    expect(tx.session.update).toHaveBeenCalledTimes(1)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
  })
})
