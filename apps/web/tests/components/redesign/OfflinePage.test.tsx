import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { OfflinePage } from '@/components/redesign/OfflinePage'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

describe('OfflinePage', () => {
  describe('kind="api"', () => {
    it('renders the correct headline', () => {
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText('The presses are down.')).toBeDefined()
    })

    it('renders the correct deck copy', () => {
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText(/The office cannot be reached/)).toBeDefined()
    })

    it('renders the correct sub copy', () => {
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText(/Try again in a moment/)).toBeDefined()
    })

    it('renders the correct status code', () => {
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText('503 · Service Unavailable')).toBeDefined()
    })
  })

  describe('kind="ollama"', () => {
    it('renders the correct headline', () => {
      render(<OfflinePage kind="ollama" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText('Pak Har is not at his desk.')).toBeDefined()
    })

    it('renders the correct deck copy', () => {
      render(<OfflinePage kind="ollama" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText(/The editor is offline/)).toBeDefined()
    })

    it('renders the correct sub copy', () => {
      render(<OfflinePage kind="ollama" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText(/Make sure Ollama is running/)).toBeDefined()
    })

    it('renders the correct status code', () => {
      render(<OfflinePage kind="ollama" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText('502 · Bad Gateway')).toBeDefined()
    })
  })

  describe('kind="strava"', () => {
    it('renders the correct headline', () => {
      render(<OfflinePage kind="strava" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText('Strava did not answer.')).toBeDefined()
    })

    it('renders the correct deck copy', () => {
      render(<OfflinePage kind="strava" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText(/The wire to Strava is quiet/)).toBeDefined()
    })

    it('renders the correct sub copy', () => {
      render(<OfflinePage kind="strava" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText(/Refresh in a minute or two/)).toBeDefined()
    })

    it('renders the correct status code', () => {
      render(<OfflinePage kind="strava" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText('504 · Upstream Timeout')).toBeDefined()
    })
  })

  describe('Retry button', () => {
    it('renders a Retry button', () => {
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByRole('button', { name: /Retry/i })).toBeDefined()
    })

    it('calls onRetry when Retry button is clicked', async () => {
      const user = userEvent.setup()
      const onRetry = vi.fn()
      render(<OfflinePage kind="api" onRetry={onRetry} onNav={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: /Retry/i }))
      expect(onRetry).toHaveBeenCalledOnce()
    })

    it('calls onRetry only once per click', async () => {
      const user = userEvent.setup()
      const onRetry = vi.fn()
      render(<OfflinePage kind="ollama" onRetry={onRetry} onNav={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: /Retry/i }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })
  })

  describe('nav', () => {
    it('renders all nav items', () => {
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText('Front Page')).toBeDefined()
      expect(screen.getByText('Dispatches')).toBeDefined()
      expect(screen.getByText('Plan')).toBeDefined()
      expect(screen.getByText('Letters')).toBeDefined()
      expect(screen.getByText('Desk')).toBeDefined()
    })

    it('calls onNav with the correct key when a nav item is clicked', async () => {
      const user = userEvent.setup()
      const onNav = vi.fn()
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={onNav} />)
      await user.click(screen.getByText('Dispatches'))
      expect(onNav).toHaveBeenCalledWith('activities')
    })

    it('activeNav is always "dashboard" regardless of kind', () => {
      render(<OfflinePage kind="strava" onRetry={vi.fn()} onNav={vi.fn()} />)
      const frontPageLink = screen.getByText('Front Page').closest('a')
      expect(frontPageLink?.style.fontWeight).toBe('800')
    })
  })

  describe('secondary info', () => {
    it('renders all three info column labels', () => {
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText('Status')).toBeDefined()
      expect(screen.getByText('Cache')).toBeDefined()
      expect(screen.getByText('Support')).toBeDefined()
    })

    it('renders the Status info text', () => {
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText(/All three services checked in/)).toBeDefined()
    })

    it('renders the Cache info text', () => {
      render(<OfflinePage kind="api" onRetry={vi.fn()} onNav={vi.fn()} />)
      expect(screen.getByText(/Your last successful sync is still on file/)).toBeDefined()
    })
  })
})
