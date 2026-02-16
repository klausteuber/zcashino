import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QRCode, CopyButton } from './QRCode'

const { toCanvasMock } = vi.hoisted(() => ({
  toCanvasMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('qrcode', () => ({
  default: {
    toCanvas: toCanvasMock,
  },
}))

describe('QRCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toCanvasMock.mockResolvedValue(undefined)
  })

  it('should render a canvas element', () => {
    const { container } = render(<QRCode value="test-address" />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('should apply custom size', () => {
    const { container } = render(<QRCode value="test-address" size={300} />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toHaveAttribute('width', '300')
    expect(canvas).toHaveAttribute('height', '300')
  })

  it('should apply default size of 200', () => {
    const { container } = render(<QRCode value="test-address" />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toHaveAttribute('width', '200')
    expect(canvas).toHaveAttribute('height', '200')
  })

  it('should apply custom className', () => {
    const { container } = render(<QRCode value="test-address" className="custom-class" />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toHaveClass('custom-class')
  })

  it('should have rounded-lg class by default', () => {
    const { container } = render(<QRCode value="test-address" />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toHaveClass('rounded-lg')
  })

  it('should call qrcode.toCanvas with expected options', async () => {
    const { container } = render(<QRCode value="test-address" size={240} />)
    const canvas = container.querySelector('canvas')

    await waitFor(() => {
      expect(toCanvasMock).toHaveBeenCalledWith(
        canvas,
        'test-address',
        expect.objectContaining({
          width: 240,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        })
      )
    })
  })

  it('should show error message when QR rendering fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    toCanvasMock.mockRejectedValueOnce(new Error('QR failed'))

    render(<QRCode value="test-address" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to generate QR code')).toBeInTheDocument()
    })

    consoleError.mockRestore()
  })
})

describe('CopyButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('should render with "Copy" text initially', () => {
    render(<CopyButton text="test-text" />)
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('should copy text to clipboard when clicked', async () => {
    render(<CopyButton text="test-address-123" />)

    const button = screen.getByText('Copy')
    fireEvent.click(button)

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-address-123')
    })
  })

  it('should show "Copied!" after successful copy', async () => {
    render(<CopyButton text="test-text" />)

    const button = screen.getByText('Copy')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })
  })

  it('should revert to "Copy" after 2 seconds', async () => {
    render(<CopyButton text="test-text" />)

    fireEvent.click(screen.getByText('Copy'))

    // Wait for the copied state
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })

    // After 2 seconds it should revert to "Copy"
    // Use a longer timeout since we're waiting for real 2 seconds
    await waitFor(
      () => {
        expect(screen.getByText('Copy')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it('should apply custom className', () => {
    const { container } = render(<CopyButton text="test" className="custom-class" />)
    const button = container.querySelector('button')
    expect(button).toHaveClass('custom-class')
  })

  it('should have correct styling classes', () => {
    const { container } = render(<CopyButton text="test" />)
    const button = container.querySelector('button')
    expect(button).toHaveClass('px-3', 'py-1.5', 'rounded-lg', 'text-sm', 'font-medium')
  })

  it('should change style when copied', async () => {
    render(<CopyButton text="test" />)

    const button = screen.getByRole('button')

    // Initial style
    expect(button).toHaveClass('bg-zinc-700')

    fireEvent.click(button)

    await waitFor(() => {
      expect(button).toHaveClass('bg-green-500/20')
      expect(button).toHaveClass('text-green-400')
    })
  })

  it('should handle clipboard error gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('Clipboard error'))

    render(<CopyButton text="test" />)

    fireEvent.click(screen.getByText('Copy'))

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('Failed to copy:', expect.any(Error))
    })

    // Should still show "Copy" since it failed
    expect(screen.getByText('Copy')).toBeInTheDocument()

    consoleError.mockRestore()
  })
})
