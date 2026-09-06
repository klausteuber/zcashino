import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

function mockRpcResponse(result: unknown, error: { code: number; message: string } | null = null) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      jsonrpc: '2.0',
      id: 'zcashino',
      result,
      error,
    }),
  } as Response
}

async function loadZalletRpc() {
  vi.resetModules()
  process.env.ZCASH_WALLET_BACKEND = 'zallet'
  return import('./rpc')
}

describe('Zallet RPC compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    delete process.env.ZCASH_WALLET_BACKEND
    vi.resetModules()
  })

  it('uses wallet scan status instead of zcashd blockchain info', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(mockRpcResponse({
      node_tip: { blockhash: 'aa', height: 3417102 },
      wallet_tip: { blockhash: 'aa', height: 3417102 },
      fully_synced_height: 3417102,
    }))
    const { checkNodeStatus } = await loadZalletRpc()

    await expect(checkNodeStatus()).resolves.toEqual({
      connected: true,
      synced: true,
      blockHeight: 3417102,
    })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.method).toBe('getwalletstatus')
  })

  it('creates a named UUID account and preserves its ZIP-32 index', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(mockRpcResponse({ account_uuid: 'account-uuid' }))
      .mockResolvedValueOnce(mockRpcResponse({
        account_uuid: 'account-uuid',
        zip32_account_index: 87,
      }))
      .mockResolvedValueOnce(mockRpcResponse({ address: 'u1deposit' }))
      .mockResolvedValueOnce(mockRpcResponse({ p2pkh: 't1deposit', sapling: 'zsdeposit' }))
    const { generateDepositAddressSet } = await loadZalletRpc()

    await expect(generateDepositAddressSet()).resolves.toEqual({
      unifiedAddr: 'u1deposit',
      transparentAddr: 't1deposit',
      accountIndex: 87,
      accountUuid: 'account-uuid',
    })

    const calls = fetchMock.mock.calls.map((call) =>
      JSON.parse((call[1] as RequestInit).body as string)
    )
    expect(calls[0].method).toBe('z_getnewaccount')
    expect(calls[0].params[0]).toMatch(/^cypherjester-deposit-/)
    expect(calls[1]).toMatchObject({ method: 'z_getaccount', params: ['account-uuid'] })
    expect(calls[2]).toMatchObject({
      method: 'z_getaddressforaccount',
      params: ['account-uuid', ['p2pkh', 'sapling']],
    })
  })

  const allocationError = { code: -20, message: 'ZIP 32 account identifiers must be less than 0x7FFFFFFF.' }
  const migratedAccounts = [
    { account_uuid: 'old', seedfp: 'seed', zip32_account_index: 86 },
    { account_uuid: 'legacy', seedfp: 'seed', zip32_account_index: 2147483647 },
  ]
  const syncedStatus = { node_tip: { height: 3500000 }, wallet_tip: { height: 3500000 }, fully_synced_height: 3500000 }

  it('allocates a fresh ordinary account when the migrated Legacy index blocks automatic allocation', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(mockRpcResponse(null, allocationError))
      .mockResolvedValueOnce(mockRpcResponse(migratedAccounts))
      .mockResolvedValueOnce(mockRpcResponse(syncedStatus))
      .mockResolvedValueOnce(mockRpcResponse({ accounts: [{ account_uuid: 'new', zip32_account_index: 87, seedfp: 'seed' }] }))
      .mockImplementationOnce(() => Promise.resolve(mockRpcResponse({ account_uuid: 'new', zip32_account_index: 87, seedfp: 'seed', name: JSON.parse(fetchMock.mock.calls[0][1].body).params[0] })))
      .mockResolvedValueOnce(mockRpcResponse({ address: 'u1new' }))
      .mockResolvedValueOnce(mockRpcResponse({ p2pkh: 't1new' }))
    const { generateDepositAddressSet } = await loadZalletRpc()
    await expect(generateDepositAddressSet()).resolves.toEqual({
      unifiedAddr: 'u1new', transparentAddr: 't1new', accountIndex: 87, accountUuid: 'new',
    })
    const calls = fetchMock.mock.calls.map(call => JSON.parse(call[1].body))
    expect(calls[3]).toMatchObject({ method: 'z_recoveraccounts', params: [[{
      seedfp: 'seed', zip32_account_index: 87, birthday_height: 3500000,
    }]] })
    expect(calls[5].params[0]).toBe('new')
  })

  it.each([{ created: [] }, { created: ['old'] }])('never reuses an account after an allocation race ($created)', async ({ created }) => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(mockRpcResponse(null, allocationError))
      .mockResolvedValueOnce(mockRpcResponse(migratedAccounts))
      .mockResolvedValueOnce(mockRpcResponse(syncedStatus))
      .mockResolvedValueOnce(mockRpcResponse({ accounts: created.map(account_uuid => ({ account_uuid })) }))
    const { generateDepositAddressSet } = await loadZalletRpc()
    await expect(generateDepositAddressSet()).rejects.toThrow('allocation conflicted')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('fails closed when the wallet contains multiple seeds', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(mockRpcResponse(null, allocationError))
      .mockResolvedValueOnce(mockRpcResponse([...migratedAccounts, { seedfp: 'other', zip32_account_index: 0 }]))
    const { generateDepositAddressSet } = await loadZalletRpc()
    await expect(generateDepositAddressSet()).rejects.toThrow('ZIP 32')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not try another allocation after a network or unrelated RPC failure', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(mockRpcResponse(null, { code: -20, message: 'wallet locked' }))
    const { generateDepositAddressSet } = await loadZalletRpc()
    await expect(generateDepositAddressSet()).rejects.toThrow('wallet locked')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('looks up an account balance without ever falling back to the whole wallet', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(mockRpcResponse({
        pools: { transparent: { valueZat: 25_000_000 } },
      }))
      .mockResolvedValueOnce(mockRpcResponse({
        pools: { transparent: { valueZat: 30_000_000 } },
      }))
    const { getAddressBalance } = await loadZalletRpc()

    await expect(getAddressBalance('t1deposit', 'mainnet', 3, 'account-uuid')).resolves.toEqual({
      confirmed: 0.25,
      pending: 0.05,
      total: 0.3,
      pools: {
        transparent: 0.25,
        sapling: 0,
        orchard: 0,
        ironwood: 0,
      },
    })
    const methods = fetchMock.mock.calls.map((call) =>
      JSON.parse((call[1] as RequestInit).body as string).method
    )
    expect(methods).toEqual(['z_getbalanceforaccount', 'z_getbalanceforaccount'])
  })

  it('lets Zallet calculate ZIP-317 fees and reads the returned txids array', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(mockRpcResponse('opid-1'))
      .mockResolvedValueOnce(mockRpcResponse([{
        id: 'opid-1',
        status: 'success',
        result: { txids: ['txid-1'] },
      }]))
    const { getOperationStatus, sendZec } = await loadZalletRpc()

    await expect(sendZec('t1source', 'u1destination', 0.1)).resolves.toEqual({
      operationId: 'opid-1',
    })
    const sendBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(sendBody.params[3]).toBeNull()

    await expect(getOperationStatus('opid-1')).resolves.toEqual({
      status: 'success',
      txid: 'txid-1',
      error: undefined,
    })
  })
})
