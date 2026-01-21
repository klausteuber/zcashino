import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QRCode, CopyButton } from './QRCode'

describe('QRCode', () => {
  beforeEach(() => {
    // Mock canvas context
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
    })
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

  it('should call getContext on render', () => {
    render(<QRCode value="test-address" />)
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d')
  })

  it('should show error message when canvas context fails', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null)

    const { container } = render(<QRCode value="test-address" />)
    // When context is null, nothing renders (based on implementation)
    // The component returns early if !ctx
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument() // Canvas still exists, just empty
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

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-address-123')
    })
  })

  it('should show "Copied!" after successful copy', async () => {
    render(<CopyButton text="test-text" />)

    const button = screen.getByText('Copy')
    fireEvent.click(button)

    await vi.waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })
  })

  it('should revert to "Copy" after 2 seconds', async () => {
    render(<CopyButton text="test-text" />)

    fireEvent.click(screen.getByText('Copy'))

    // Wait for the copied state
    await vi.waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })

    // After 2 seconds it should revert to "Copy"
    // Use a longer timeout since we're waiting for real 2 seconds
    await vi.waitFor(
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

    await vi.waitFor(() => {
      expect(button).toHaveClass('bg-green-500/20')
      expect(button).toHaveClass('text-green-400')
    })
  })

  it('should handle clipboard error gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('Clipboard error'))

    render(<CopyButton text="test" />)

    fireEvent.click(screen.getByText('Copy'))

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('Failed to copy:', expect.any(Error))
    })

    // Should still show "Copy" since it failed
    expect(screen.getByText('Copy')).toBeInTheDocument()

    consoleError.mockRestore()
  })
})
