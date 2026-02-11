import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'

function createOptions(overrides: Partial<Parameters<typeof useKeyboardShortcuts>[0]> = {}) {
  return {
    availableActions: ['hit', 'stand'] as Parameters<typeof useKeyboardShortcuts>[0]['availableActions'],
    gamePhase: 'playerTurn' as string | undefined,
    isLoading: false,
    isAutoBetting: false,
    showInsuranceOffer: false,
    hasGameState: true,
    onAction: vi.fn(),
    onInsurance: vi.fn(),
    onPlaceBet: vi.fn(),
    onNewRound: vi.fn(),
    ...overrides,
  }
}

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...opts })
  document.dispatchEvent(event)
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps H key to hit action during playerTurn', () => {
    const options = createOptions()
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('h')

    expect(options.onAction).toHaveBeenCalledWith('hit')
  })

  it('maps S key to stand action during playerTurn', () => {
    const options = createOptions()
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('s')

    expect(options.onAction).toHaveBeenCalledWith('stand')
  })

  it('maps D key to double action when available', () => {
    const options = createOptions({ availableActions: ['hit', 'stand', 'double'] })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('d')

    expect(options.onAction).toHaveBeenCalledWith('double')
  })

  it('maps P key to split action when available', () => {
    const options = createOptions({ availableActions: ['hit', 'stand', 'split'] })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('p')

    expect(options.onAction).toHaveBeenCalledWith('split')
  })

  it('does not fire double when not in availableActions', () => {
    const options = createOptions({ availableActions: ['hit', 'stand'] })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('d')

    expect(options.onAction).not.toHaveBeenCalled()
  })

  it('does not fire actions when isLoading is true', () => {
    const options = createOptions({ isLoading: true })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('h')

    expect(options.onAction).not.toHaveBeenCalled()
  })

  it('does not fire actions when isAutoBetting is true', () => {
    const options = createOptions({ isAutoBetting: true })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('h')

    expect(options.onAction).not.toHaveBeenCalled()
  })

  it('does not fire actions when modifier keys are held', () => {
    const options = createOptions()
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('h', { ctrlKey: true })
    pressKey('h', { metaKey: true })
    pressKey('h', { altKey: true })

    expect(options.onAction).not.toHaveBeenCalled()
  })

  it('does not fire game actions when phase is not playerTurn', () => {
    const options = createOptions({ gamePhase: 'complete' })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('h')

    expect(options.onAction).not.toHaveBeenCalled()
  })

  it('maps Y key to insurance yes when showInsuranceOffer is true', () => {
    const options = createOptions({ showInsuranceOffer: true })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('y')

    expect(options.onInsurance).toHaveBeenCalledWith(true)
  })

  it('maps N key to insurance no when showInsuranceOffer is true', () => {
    const options = createOptions({ showInsuranceOffer: true })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('n')

    expect(options.onInsurance).toHaveBeenCalledWith(false)
  })

  it('maps Enter to onPlaceBet during betting phase', () => {
    const options = createOptions({ gamePhase: undefined, hasGameState: false })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('Enter')

    expect(options.onPlaceBet).toHaveBeenCalled()
  })

  it('maps Enter to onNewRound during complete phase', () => {
    const options = createOptions({ gamePhase: 'complete' })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey('Enter')

    expect(options.onNewRound).toHaveBeenCalled()
  })

  it('maps Space to onPlaceBet during betting phase', () => {
    const options = createOptions({ gamePhase: undefined, hasGameState: false })
    renderHook(() => useKeyboardShortcuts(options))

    pressKey(' ')

    expect(options.onPlaceBet).toHaveBeenCalled()
  })

  it('does not fire when target is an input element', () => {
    const options = createOptions()
    renderHook(() => useKeyboardShortcuts(options))

    const input = document.createElement('input')
    document.body.appendChild(input)
    const event = new KeyboardEvent('keydown', { key: 'h', bubbles: true })
    Object.defineProperty(event, 'target', { value: input })
    document.dispatchEvent(event)
    document.body.removeChild(input)

    expect(options.onAction).not.toHaveBeenCalled()
  })

  it('cleans up event listener on unmount', () => {
    const options = createOptions()
    const { unmount } = renderHook(() => useKeyboardShortcuts(options))

    unmount()

    pressKey('h')

    expect(options.onAction).not.toHaveBeenCalled()
  })
})
