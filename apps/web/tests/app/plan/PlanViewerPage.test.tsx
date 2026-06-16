/**
 * Tests for the delete state machine in apps/web/src/app/plan/[id]/page.tsx
 *
 * Coverage:
 * - Delete button (idle) → clicking shows confirmation UI
 * - Confirming → clicking "Delete" calls deletePlan and redirects to /settings
 * - Confirming → clicking "Cancel" does not call deletePlan, returns to idle
 *
 * Design:
 * - useParams is mocked to return id=99
 * - @/lib/api is mocked so deletePlan is an AsyncMock under our control
 * - useRouter is mocked so router.push is assertable
 * - Wrapped in QueryClientProvider (page calls useQueryClient)
 * - useQuery is mocked at the module level: returns a resolved plan immediately
 *   so the page renders its content instead of the loading skeleton
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import PlanViewerPage from '@/app/plan/[id]/page'

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the component import
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn()
const mockRouterReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
  useParams: () => ({ id: '99' }),
}))

const mockDeletePlan = vi.fn()
const mockGetPlan = vi.fn()
const mockGetActivities = vi.fn()

vi.mock('@/lib/api', () => ({
  deletePlan: (...args: unknown[]) => mockDeletePlan(...args),
  getPlan: (...args: unknown[]) => mockGetPlan(...args),
  getActivities: (...args: unknown[]) => mockGetActivities(...args),
}))

// Stub out heavy child components so we only test the delete state machine
vi.mock('@/components/redesign/PlanPaper', () => ({
  PlanPaper: () => <div data-testid="plan-paper">Plan Paper</div>,
}))
vi.mock('@/components/redesign/PageLoadingSkeleton', () => ({
  PageLoadingSkeleton: () => <div>Loading...</div>,
}))
vi.mock('@/components/redesign/NewspaperChrome', () => ({
  OL: {
    ink: '#000',
    muted: '#888',
    accent: '#f00',
    paper: '#fff',
    mono: 'monospace',
    body: 'sans-serif',
    rule: '#ccc',
  },
  NewspaperChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// ---------------------------------------------------------------------------
// Minimal plan fixture
// ---------------------------------------------------------------------------

function makePlan() {
  return {
    id: 99,
    week_start_date: '2026-06-09',
    created_at: '2026-06-09T05:00:00Z',
    is_active: false,
    editor_note: '',
    plan_data: {
      monday: { type: 'rest', distance_km: 0, duration_minutes: 0, target: '', description: '' },
      tuesday: { type: 'easy', distance_km: 5, duration_minutes: 35, target: '7:00', description: '' },
      wednesday: { type: 'rest', distance_km: 0, duration_minutes: 0, target: '', description: '' },
      thursday: { type: 'easy', distance_km: 6, duration_minutes: 42, target: '7:00', description: '' },
      friday: { type: 'rest', distance_km: 0, duration_minutes: 0, target: '', description: '' },
      saturday: { type: 'long', distance_km: 10, duration_minutes: 75, target: '7:30', description: '' },
      sunday: { type: 'rest', distance_km: 0, duration_minutes: 0, target: '', description: '' },
    },
    pak_har_notes: {
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    },
  }
}

// ---------------------------------------------------------------------------
// Render helper — wraps with a fresh QueryClientProvider every test
// ---------------------------------------------------------------------------

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <PlanViewerPage />
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlanViewerPage — delete state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPlan.mockResolvedValue(makePlan())
    mockGetActivities.mockResolvedValue([])
    mockDeletePlan.mockResolvedValue(undefined)
  })

  it('test 1: idle state shows "Delete this plan" button', async () => {
    renderPage()
    const btn = await screen.findByText(/Delete this plan/i)
    expect(btn).toBeDefined()
  })

  it('test 2: clicking "Delete this plan" transitions to confirming state', async () => {
    renderPage()
    const deleteBtn = await screen.findByText(/Delete this plan/i)
    fireEvent.click(deleteBtn)
    // Confirmation text and action buttons appear
    expect(screen.getByText(/Delete this plan\? This cannot be undone\./i)).toBeDefined()
    expect(screen.getByText(/^Delete$/i)).toBeDefined()
    expect(screen.getByText(/^Cancel$/i)).toBeDefined()
  })

  it('test 3: confirming "Delete" calls deletePlan and redirects to /settings', async () => {
    renderPage()
    // Move to confirming
    const deleteBtn = await screen.findByText(/Delete this plan/i)
    fireEvent.click(deleteBtn)
    // Click the confirm button
    const confirmBtn = screen.getByText(/^Delete$/i)
    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(mockDeletePlan).toHaveBeenCalledOnce()
      expect(mockDeletePlan).toHaveBeenCalledWith(99)
    })
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/settings')
    })
  })

  it('test 4: clicking "Cancel" does not call deletePlan and returns to idle', async () => {
    renderPage()
    // Move to confirming
    const deleteBtn = await screen.findByText(/Delete this plan/i)
    fireEvent.click(deleteBtn)
    // Click cancel
    const cancelBtn = screen.getByText(/^Cancel$/i)
    fireEvent.click(cancelBtn)
    // Back to idle — the original delete button is visible again
    expect(screen.getByText(/Delete this plan/i)).toBeDefined()
    expect(mockDeletePlan).not.toHaveBeenCalled()
  })
})
