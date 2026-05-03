import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ToneBadge } from '@/components/redesign/ToneBadge'

describe('ToneBadge', () => {
  it('renders critical tone with provided label text', () => {
    render(<ToneBadge tone="critical">MISSED IT</ToneBadge>)
    expect(screen.getByText('MISSED IT')).toBeDefined()
  })

  it('renders good tone with provided label text', () => {
    render(<ToneBadge tone="good">SOLID RUN</ToneBadge>)
    expect(screen.getByText('SOLID RUN')).toBeDefined()
  })

  it('renders neutral tone with provided label text', () => {
    render(<ToneBadge tone="neutral">—</ToneBadge>)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('applies critical tone accent background class', () => {
    const { container } = render(<ToneBadge tone="critical">CRITICAL</ToneBadge>)
    expect(container.querySelector('span')?.className).toContain('bg-accent')
  })

  it('applies good tone ink background class', () => {
    const { container } = render(<ToneBadge tone="good">GOOD</ToneBadge>)
    expect(container.querySelector('span')?.className).toContain('bg-ink')
  })

  it('applies neutral tone transparent background with border', () => {
    const { container } = render(<ToneBadge tone="neutral">NEUTRAL</ToneBadge>)
    const span = container.querySelector('span')
    expect(span?.className).toContain('bg-transparent')
    expect(span?.className).toContain('border')
  })

  it('merges custom className without overriding base styles', () => {
    const { container } = render(
      <ToneBadge tone="good" className="mt-2">CUSTOM</ToneBadge>
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('mt-2')
    expect(span?.className).toContain('bg-ink')
  })

  it('renders long verdict tag text without crashing', () => {
    render(<ToneBadge tone="critical">HELD THE LINE</ToneBadge>)
    expect(screen.getByText('HELD THE LINE')).toBeDefined()
  })
})
