import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { LandingPage } from '@/components/redesign/LandingPage'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

describe('LandingPage', () => {
  it('renders "Old Legs" masthead', () => {
    render(<LandingPage onConnect={vi.fn()} />)
    expect(screen.getByText('Old Legs')).toBeDefined()
  })

  it('renders the tagline text', () => {
    render(<LandingPage onConnect={vi.fn()} />)
    expect(screen.getByText(/He.*s 70\. He.*s already lapped you\./)).toBeDefined()
  })

  it('renders "And he has thoughts." accent line', () => {
    render(<LandingPage onConnect={vi.fn()} />)
    expect(screen.getByText('And he has thoughts.')).toBeDefined()
  })

  it('renders connect button in idle state', () => {
    render(<LandingPage onConnect={vi.fn()} connectState="idle" />)
    expect(screen.getByRole('button', { name: /Connect Strava/i })).toBeDefined()
  })

  it('shows connecting text when connectState is "connecting"', () => {
    render(<LandingPage onConnect={vi.fn()} connectState="connecting" />)
    expect(screen.getByText(/Opening Strava/)).toBeDefined()
  })

  it('does not show idle connect button when connecting', () => {
    render(<LandingPage onConnect={vi.fn()} connectState="connecting" />)
    expect(screen.queryByRole('button', { name: /Connect Strava/i })).toBeNull()
  })

  it('shows Errata label in error state', () => {
    render(<LandingPage onConnect={vi.fn()} connectState="error" />)
    expect(screen.getByText('Errata')).toBeDefined()
  })

  it('shows error message in error state', () => {
    render(<LandingPage onConnect={vi.fn()} connectState="error" />)
    expect(screen.getByText(/Strava did not answer/)).toBeDefined()
  })

  it('shows retry button in error state', () => {
    render(<LandingPage onConnect={vi.fn()} connectState="error" />)
    expect(screen.getByRole('button', { name: /Retry/i })).toBeDefined()
  })

  it('calls onConnect when idle button is clicked', async () => {
    const user = userEvent.setup()
    const onConnect = vi.fn()
    render(<LandingPage onConnect={onConnect} connectState="idle" />)
    await user.click(screen.getByRole('button', { name: /Connect Strava/i }))
    expect(onConnect).toHaveBeenCalledOnce()
  })

  it('calls onConnect when retry button is clicked in error state', async () => {
    const user = userEvent.setup()
    const onConnect = vi.fn()
    render(<LandingPage onConnect={onConnect} connectState="error" />)
    await user.click(screen.getByRole('button', { name: /Retry/i }))
    expect(onConnect).toHaveBeenCalledOnce()
  })
})
