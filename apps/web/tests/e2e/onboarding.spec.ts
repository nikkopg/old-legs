import { test, expect } from '@playwright/test'

/**
 * Onboarding modal tests
 *
 * Verifies that the OnboardingModal is shown when the user's
 * `onboarding_completed` flag is false, hidden when it is true,
 * and that a 401 on `GET /user/me` redirects to the landing page.
 *
 * API calls are fully mocked via page.route() — no live backend required.
 */

const mockUserComplete = {
  id: 1,
  strava_athlete_id: 'str_123',
  name: 'Test Runner',
  onboarding_completed: true,
  weekly_km_target: 40,
  days_available: 5,
  biggest_struggle: 'consistency',
  resting_hr: 55,
  max_hr: 185,
  max_hr_observed: 178,
  created_at: '2026-01-01T00:00:00Z',
}

const mockUserNew = { ...mockUserComplete, onboarding_completed: false }

// Minimal stubs for the other endpoints the dashboard page fetches on mount
const mockActivities: never[] = []
const mockPlanNotFound = { detail: 'Not found', status: 404 }
const mockInsights = { pak_har_commentary: 'Steady week.', weekly_km_trend: [], avg_hr: null, load_change_pct: null }

test.describe('Onboarding modal', () => {
  /**
   * Helper: intercept every backend call and route each endpoint to an
   * appropriate fixture.  The dashboard fires GET /user/me (via useUser),
   * GET /activities and GET /plan/current (via useDashboard), and GET /insights
   * (non-blocking).
   */
  async function mockDashboard(
    page: import('@playwright/test').Page,
    user: typeof mockUserComplete,
  ) {
    await page.route('http://localhost:8000/**', async (route) => {
      const url = route.request().url()

      if (url.includes('/user/me')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(user),
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

      if (url.includes('/plan/current')) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify(mockPlanNotFound),
        })
        return
      }

      if (url.includes('/insights')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockInsights),
        })
        return
      }

      // Default: pass through anything not explicitly mocked
      await route.continue()
    })
  }

  test('shows onboarding modal when onboarding_completed is false', async ({ page }) => {
    await mockDashboard(page, mockUserNew)
    await page.goto('/dashboard')

    // The OnboardingModal renders a step indicator on step 1
    await expect(page.getByText('Step 1 of 5')).toBeVisible({ timeout: 10_000 })

    // It also renders the first question
    await expect(
      page.getByText('How many km do you want to run per week?'),
    ).toBeVisible()
  })

  test('does not show onboarding modal when onboarding_completed is true', async ({ page }) => {
    await mockDashboard(page, mockUserComplete)
    await page.goto('/dashboard')

    // Dashboard content from DashboardPaper should be visible — confirms the
    // page rendered without the modal.
    await expect(page.getByText('Front Page · Weekly Edition')).toBeVisible({ timeout: 10_000 })

    // The modal step indicator must NOT appear
    await expect(page.getByText('Step 1 of 5')).not.toBeVisible()
  })

  test('redirects to / when GET /user/me returns 401', async ({ page }) => {
    await page.route('http://localhost:8000/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not authenticated' }),
      })
    })

    await page.goto('/dashboard')
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })
})
