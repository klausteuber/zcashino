// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ dueTables: vi.fn(), tick: vi.fn() }))
vi.mock('./service', () => ({ poker: mocks }))
import { startPokerWorker } from './worker'
import { PokerError } from './engine'
const shared = globalThis as typeof globalThis & { pokerWorker?: ReturnType<typeof setInterval> }
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.dueTables.mockResolvedValue([{ id: 'one' }, { id: 'two' }]); mocks.tick.mockResolvedValue(undefined) })
afterEach(() => { clearInterval(shared.pokerWorker); delete shared.pokerWorker; vi.useRealTimers() })
it('runs deadlines without polling and initializes only one interval', async () => {
  startPokerWorker(); startPokerWorker()
  await vi.advanceTimersByTimeAsync(1_000)
  expect(mocks.dueTables).toHaveBeenCalledTimes(1)
  expect(mocks.tick.mock.calls).toEqual([['one'], ['two']])
})
it('continues with other tables after a competing worker wins a version race', async () => {
  mocks.tick.mockRejectedValueOnce(new PokerError('Version changed', 409))
  startPokerWorker()
  await vi.advanceTimersByTimeAsync(1_000)
  expect(mocks.tick).toHaveBeenCalledWith('two')
})
it('does not overlap iterations when a table operation is still pending', async () => {
  let finish!: () => void
  mocks.tick.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  startPokerWorker()
  await vi.advanceTimersByTimeAsync(4_000)
  expect(mocks.dueTables).toHaveBeenCalledTimes(1)
  finish()
  await vi.advanceTimersByTimeAsync(1_000)
  expect(mocks.dueTables).toHaveBeenCalledTimes(2)
})
