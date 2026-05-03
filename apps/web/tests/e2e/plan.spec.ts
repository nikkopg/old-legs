import { test, expect } from '@playwright/test'

/**
 * Plan page tests
 *
 * Verifies that PlanPaper renders the fixtures table when a plan is returned,
 * shows the empty state when no plan exists (404), and redirects on 401.
 *
 * API calls are fully mocked via page.route() — no live backend required.
 */

// A valid TrainingPlan fixture matching the API schema (ApiTrainingPlan shape).
// plan_data keys are lowercase day names; PlanDay.type drives the row display.
const mockPlan = {
  id: 1,
  user_id: 1,
  week_start_date: '2026-04-28',
  plan_data: {
    monday: {
      day: 'Monday',
      type: 'Easy',
      description: 'Keep HR under 145.',
      duration_minutes: 40,
      target: '6 km under 145 bpm',
    },
  },
  pak_har_notes: {
    monday: 'Keep easy days easy.',
  },
  is_active: true,
  created_at: '2026-04-28T00:00:00Z',
  updated_at: '2026-04-28T00:00:00Z',
}

// Minimal activities stub — plan page fires GET /activities in parallel
const mockActivities: never[] = []

test.describe('Plan page', () => {
  /**
   * Helper: intercept all backend calls for the plan page.
   * PlanPage fires GET /plan/current and GET /activities in parallel.
   */
  async function mockPlanEndpoints(
    page: import('@playwright/test').Page,
    planResponse: { status: number; body: unknown },
  ) {
    await page.route('http://localhost:8000/**', async (route) => {
      const url = route.request().url()

      if (url.includes('/plan/current')) {
        await route.fulfill({
          status: planResponse.status,
          contentType: 'application/json',
          body: JSON.stringify(planResponse.body),
        })
        return
      }

      if (url.includes('/activities')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockActivities),
        })
        return
      }

      await route.continue()
    })
  }

  test('renders the fixtures table when a plan is returned', async ({ page }) => {
    await mockPlanEndpoints(page, { status: 200, body: mockPlan })
    await page.goto('/plan')

    // PlanPaper renders a Caps heading "The Fixtures · Week N" when plan is loaded
    await expect(page.getByText(/The Fixtures/)).toBeVisible({ timeout: 10_000 })

    // The h1 derives from run count — one run day maps to the generic fallback
    await expect(page.getByText('Seven days. The plan is filed.')).toBeVisible()
  })

  test('shows the no-plan empty state when GET /plan/current returns 404', async ({ page }) => {
    await mockPlanEndpoints(page, {
      status: 404,
      body: { detail: 'No active plan found', status: 404 },
    })
    await page.goto('/plan')

    // PlanPaper empty-state copy when plan === null and isGenerating === false
    await expect(
      page.getByText("No plan yet. Pak Har will build one when he's seen enough of your runs."),
    ).toBeVisible({ timeout: 10_000 })

    // The generate button is also present
    await expect(page.getByRole('button', { name: /generate plan/i })).toBeVisible()
  })

  test('redirects to / when GET /plan/current returns 401', async ({ page }) => {
    await page.route('http://localhost:8000/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not authenticated' }),
      })
    })

    await page.goto('/plan')
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })
})
