import { describe, it, expect, vi } from 'vitest'
import { checkNodeStatus, sendZec } from './rpc'

function mockRpcResponse(result: unknown, error: { code: number; message: string } | null = null) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      jsonrpc: '1.0',
      id: 'test',
      result,
      error,
    }),
  } as Response
}

describe('sendZec fee retry behavior', () => {
  it('retries with higher fee when node rejects for unpaid actions', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(
        mockRpcResponse(null, {
          code: -4,
          message: 'SendTransaction: Transaction commit failed:: tx unpaid action limit exceeded: 2 action(s) exceeds limit of 0',
        })
      )
      .mockResolvedValueOnce(mockRpcResponse('opid-123'))

    const result = await sendZec('zsfromaddress', 'u1destinationaddress', 0.55)

    expect(result.operationId).toBe('opid-123')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstCallBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)

    expect(firstCallBody.method).toBe('z_sendmany')
    expect(firstCallBody.params[3]).toBe(0.0001)
    expect(secondCallBody.params[3]).toBe(0.0002)
  })

  it('does not retry unrelated RPC failures', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      mockRpcResponse(null, {
        code: -4,
        message: 'insufficient funds',
      })
    )

    await expect(sendZec('zsfromaddress', 'u1destinationaddress', 0.55)).rejects.toThrow('insufficient funds')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('checkNodeStatus sync gate behavior', () => {
  it('treats node as synced when initial_block_download_complete is true', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      mockRpcResponse({
        blocks: 3242101,
        headers: 3242675,
        verificationprogress: 0.9993,
        initial_block_download_complete: true,
      })
    )

    const status = await checkNodeStatus()

    expect(status).toEqual({
      connected: true,
      synced: true,
      blockHeight: 3242101,
    })
  })

  it('treats node as not synced when initial_block_download_complete is false', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      mockRpcResponse({
        blocks: 3242101,
        headers: 3242675,
        verificationprogress: 0.99999,
        initial_block_download_complete: false,
      })
    )

    const status = await checkNodeStatus()

    expect(status).toEqual({
      connected: true,
      synced: false,
      blockHeight: 3242101,
    })
  })

  it('falls back to verificationprogress when IBD field is unavailable', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      mockRpcResponse({
        blocks: 100,
        headers: 100,
        verificationprogress: 0.99995,
      })
    )

    const status = await checkNodeStatus()
    expect(status.synced).toBe(true)
  })
})
