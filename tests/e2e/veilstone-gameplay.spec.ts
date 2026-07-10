import { expect, test, type Page } from '@playwright/test'

interface SnapshotResponse {
  matchId: string
  stateVersion: string
  phase: string
  playerView: {
    players: Record<string, {
      shieldedZats?: string | null
      producedEpochs?: number[]
      payoutZats?: string
    }>
    contracts: Array<{
      id: string
      publicStakeZats: string
      shieldedStakeZats: string | null
    }>
    commitments: Array<{
      id: string
      commitmentHash: string
      playerSessionId: string
      publicAmountZats?: string
      reveal?: { amountZats: string; dataSpent: number }
    }>
    orders: unknown[]
  }
}

interface TableResponse {
  table: {
    id: string
    match?: { id: string } | null
  }
  match?: { id: string } | null
}

async function appFetch<T = unknown>(
  page: Page,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; ok: boolean; body: T }> {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, options)
    const body = await response.json().catch(() => null)
    return { status: response.status, ok: response.ok, body }
  }, { path, options }) as Promise<{ status: number; ok: boolean; body: T }>
}

async function getSessionId(page: Page): Promise<string> {
  const response = await appFetch<{ id: string }>(page, '/api/session', { method: 'GET' })
  expect(response.ok).toBe(true)
  return response.body.id
}

async function postJson<T = unknown>(page: Page, path: string, body: Record<string, unknown>) {
  return appFetch<T>(page, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function getSnapshot(page: Page, matchId: string, sessionId?: string) {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
  const response = await appFetch<SnapshotResponse>(page, `/api/veilstone/matches/${matchId}/snapshot${query}`)
  expect(response.ok).toBe(true)
  return response.body
}

async function submitAction<T = { duplicate: boolean; snapshot: SnapshotResponse }>(
  page: Page,
  input: {
    matchId: string
    sessionId: string
    expectedStateVersion: string
    action: Record<string, unknown>
    clientActionId?: string
  }
) {
  return postJson<T>(page, `/api/veilstone/matches/${input.matchId}/actions`, {
    clientActionId: input.clientActionId ?? `e2e-${Date.now()}-${Math.random()}`,
    matchId: input.matchId,
    sessionId: input.sessionId,
    expectedStateVersion: input.expectedStateVersion,
    action: input.action,
  })
}

async function startMatchViaApi(page: Page) {
  await page.goto('/veilstone')
  const sessionId = await getSessionId(page)
  const createResponse = await postJson<TableResponse>(page, '/api/veilstone/tables', { sessionId })
  expect(createResponse.ok).toBe(true)
  const tableId = createResponse.body.table.id

  const humanSeat = await postJson<TableResponse>(page, `/api/veilstone/tables/${tableId}/seat`, {
    sessionId,
    seatIndex: 0,
  })
  expect(humanSeat.ok).toBe(true)

  for (let seatIndex = 1; seatIndex < 4; seatIndex += 1) {
    const botSeat = await postJson<TableResponse>(page, `/api/veilstone/tables/${tableId}/seat`, {
      asBot: true,
      seatIndex,
    })
    expect(botSeat.ok).toBe(true)
  }

  const readyResponse = await postJson<TableResponse>(page, `/api/veilstone/tables/${tableId}/ready`, {
    sessionId,
    publicStartZats: '35000000',
  })
  expect(readyResponse.ok).toBe(true)

  const matchId = readyResponse.body.match?.id ?? readyResponse.body.table.match?.id
  expect(matchId).toBeTruthy()
  return { sessionId, tableId, matchId: matchId! }
}

test.describe('Veilstone gameplay', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }, testInfo) => {
    await page.setExtraHTTPHeaders({
      'x-forwarded-for': `veilstone-e2e-${testInfo.workerIndex}-${testInfo.parallelIndex}-${Date.now()}`,
    })
  })

  test('plays a Play-ZEC table from lobby to replay with conserved payouts', async ({ page }) => {
    test.setTimeout(60_000)

    const { matchId, sessionId } = await startMatchViaApi(page)
    await page.goto(`/veilstone/match/${matchId}?playtest=1`)
    await expect(page.locator('main')).toContainText(/Loading match|Epoch/i)

    const playtestOpened = await postJson(page, '/api/veilstone/playtest/events', {
      matchId,
      sessionId,
      seatIndex: 0,
      eventName: 'playtest_mode_opened',
      phase: 'EPOCH_1_FORECAST',
      stateVersion: '0',
    })
    expect(playtestOpened.ok).toBe(true)

    let snapshot = await getSnapshot(page, matchId, sessionId)
    expect(snapshot.phase).toBe('EPOCH_1_FORECAST')

    async function apply(action: Record<string, unknown>) {
      const response = await submitAction(page, {
        matchId,
        sessionId,
        expectedStateVersion: snapshot.stateVersion,
        action,
      })
      expect(response.ok).toBe(true)
      snapshot = response.body.snapshot
      return snapshot
    }

    await apply({ type: 'ADVANCE_PHASE', payload: {} })
    expect(snapshot.phase).toBe('EPOCH_1_PRODUCTION')
    await apply({ type: 'PRODUCE', payload: {} })
    await apply({ type: 'ADVANCE_PHASE', payload: {} })
    expect(snapshot.phase).toBe('EPOCH_1_MARKET')
    await apply({ type: 'PLACE_PUBLIC_ORDER', payload: { resource: 'compute', side: 'buy', quantity: 1, priceZats: '1000000' } })
    expect(snapshot.playerView.orders.length).toBeGreaterThan(0)
    await apply({ type: 'ADVANCE_PHASE', payload: {} })
    expect(snapshot.phase).toBe('EPOCH_1_CONTRACTS')
    const contractId = snapshot.playerView.contracts[0].id
    await apply({ type: 'BID_CONTRACT', payload: { contractId, amountZats: '2000000' } })
    await apply({ type: 'SEALED_BID_COMMIT', payload: { contractId, amountZats: '1500000', dataSpent: 1 } })
    expect(snapshot.playerView.commitments.length).toBeGreaterThan(0)

    let built = false
    for (let safety = 0; safety < 60; safety += 1) {
      if (snapshot.phase === 'MATCH_COMPLETE') break

      if (snapshot.phase.endsWith('_BUILD') && !built) {
        await apply({ type: 'BUILD_STRUCTURE', payload: { structureType: 'DATA_TRUST' } })
        built = true
      }

      await apply({ type: snapshot.phase === 'FINAL_RECKONING' ? 'FINALIZE_MATCH' : 'ADVANCE_PHASE', payload: {} })
    }

    expect(snapshot.phase).toBe('MATCH_COMPLETE')
    const feedbackResponse = await postJson(page, '/api/veilstone/playtest/feedback', {
      matchId,
      sessionId,
      seatIndex: 0,
      understoodGoal: 6,
      decisionsMattered: 6,
      understoodOutcome: 5,
      shieldedFeltFair: 5,
      trustPrestigeMattered: 6,
      feltSkillful: 6,
      wouldPlayAgain: 7,
      mostExcitingMoment: 'sealed bid reveal',
      mostConfusingMoment: 'final reckoning',
      oneThingToChange: 'clearer phase prompts',
    })
    expect(feedbackResponse.ok).toBe(true)

    const replayResponse = await appFetch<{
      replay: { players: Record<string, { payoutZats?: string }> }
      events: unknown[]
      finalHash: string | null
    }>(page, `/api/veilstone/replay/${matchId}`)
    expect(replayResponse.ok).toBe(true)
    expect(replayResponse.body.finalHash).toBeTruthy()
    expect(replayResponse.body.events.length).toBeGreaterThan(0)

    const payoutTotal = Object.values(replayResponse.body.replay.players)
      .reduce((sum, player) => sum + BigInt(player.payoutZats ?? '0'), 0n)
    expect(payoutTotal).toBe(400000000n)

    await page.goto(`/veilstone/replay/${matchId}?playtest=1`)
    await expect(page.locator('main')).toContainText(/Loading replay|Delayed Reveal Replay/i)
  })

  test('enforces API idempotency, stale versions, balance checks, and live redaction', async ({ page }) => {
    test.setTimeout(45_000)

    const { sessionId, matchId } = await startMatchViaApi(page)
    const initial = await getSnapshot(page, matchId, sessionId)
    expect(initial.phase).toBe('EPOCH_1_FORECAST')

    const duplicateClientActionId = `duplicate-${Date.now()}`
    const firstAdvance = await submitAction(page, {
      matchId,
      sessionId,
      expectedStateVersion: initial.stateVersion,
      clientActionId: duplicateClientActionId,
      action: { type: 'ADVANCE_PHASE', payload: {} },
    })
    expect(firstAdvance.ok).toBe(true)
    expect(firstAdvance.body.duplicate).toBe(false)
    expect(firstAdvance.body.snapshot.phase).toBe('EPOCH_1_PRODUCTION')

    const duplicateAdvance = await submitAction(page, {
      matchId,
      sessionId,
      expectedStateVersion: initial.stateVersion,
      clientActionId: duplicateClientActionId,
      action: { type: 'ADVANCE_PHASE', payload: {} },
    })
    expect(duplicateAdvance.ok).toBe(true)
    expect(duplicateAdvance.body.duplicate).toBe(true)
    expect(duplicateAdvance.body.snapshot.stateVersion).toBe(firstAdvance.body.snapshot.stateVersion)

    const staleAdvance = await submitAction(page, {
      matchId,
      sessionId,
      expectedStateVersion: initial.stateVersion,
      action: { type: 'ADVANCE_PHASE', payload: {} },
    })
    expect(staleAdvance.status).toBe(409)

    const marketAdvance = await submitAction(page, {
      matchId,
      sessionId,
      expectedStateVersion: firstAdvance.body.snapshot.stateVersion,
      action: { type: 'ADVANCE_PHASE', payload: {} },
    })
    expect(marketAdvance.ok).toBe(true)
    expect(marketAdvance.body.snapshot.phase).toBe('EPOCH_1_MARKET')

    const beforeOverspend = marketAdvance.body.snapshot.stateVersion
    const overspend = await submitAction(page, {
      matchId,
      sessionId,
      expectedStateVersion: beforeOverspend,
      action: {
        type: 'PLACE_PUBLIC_ORDER',
        payload: { resource: 'compute', side: 'buy', quantity: 1, priceZats: '999999999999' },
      },
    })
    expect(overspend.status).toBe(400)

    const afterOverspend = await getSnapshot(page, matchId, sessionId)
    expect(afterOverspend.stateVersion).toBe(beforeOverspend)

    const contractsAdvance = await submitAction(page, {
      matchId,
      sessionId,
      expectedStateVersion: afterOverspend.stateVersion,
      action: { type: 'ADVANCE_PHASE', payload: {} },
    })
    expect(contractsAdvance.ok).toBe(true)
    expect(contractsAdvance.body.snapshot.phase).toBe('EPOCH_1_CONTRACTS')

    const contractId = contractsAdvance.body.snapshot.playerView.contracts[0]?.id
    expect(contractId).toBeTruthy()
    const sealedBid = await submitAction(page, {
      matchId,
      sessionId,
      expectedStateVersion: contractsAdvance.body.snapshot.stateVersion,
      action: {
        type: 'SEALED_BID_COMMIT',
        payload: { contractId, amountZats: '1500000', dataSpent: 0 },
      },
    })
    expect(sealedBid.ok).toBe(true)
    expect(sealedBid.body.snapshot.playerView.commitments[0].commitmentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(sealedBid.body.snapshot.playerView.commitments[0].reveal?.amountZats).toBe('1500000')
    expect(sealedBid.body.snapshot.playerView.contracts[0].shieldedStakeZats).toBeNull()

    const publicSnapshot = await getSnapshot(page, matchId)
    const publicCommitment = publicSnapshot.playerView.commitments[0]
    expect(publicSnapshot.playerView.players[sessionId].shieldedZats).toBeNull()
    expect(publicSnapshot.playerView.contracts[0].shieldedStakeZats).toBeNull()
    expect(publicCommitment.commitmentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(publicCommitment.reveal).toBeUndefined()
    expect(publicCommitment.publicAmountZats).toBeUndefined()

    const invalidSession = await submitAction(page, {
      matchId,
      sessionId: 'invalid-session',
      expectedStateVersion: sealedBid.body.snapshot.stateVersion,
      action: { type: 'ADVANCE_PHASE', payload: {} },
    })
    expect([401, 403]).toContain(invalidSession.status)
  })
})
