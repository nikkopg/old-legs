import { test, expect } from '@playwright/test'

/**
 * Weekly review tests
 *
 * Verifies the WeeklyReviewCard behaviour on the dashboard:
 *   - When GET /review/current returns a valid review, the review text is shown.
 *   - When GET /review/current returns 404, the dashboard still renders and
 *     shows the "no review yet" empty state instead of crashing.
 *   - When GET /user/me returns 401, the user is redirected to /.
 *
 * All API calls are mocked via page.route() — no live backend required.
 *
 * NOTE: these tests target the WeeklyReviewCard component.  If the component
 * is not yet embedded in the dashboard page, the review-content assertions
 * will need to be re-evaluated when integration is complete.
 */

// A valid WeeklyReview fixture matching the API schema.
const mockReview = {
  id: 1,
  user_id: 1,
  week_start_date: '2026-04-28',
  planned_runs: 4,
  actual_runs: 3,
  review_text: 'Three runs this week. Pace held steady.',
  created_at: '2026-04-28T20:00:00Z',
}

const mockUser = {
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

const mockActivities: never[] = []
const mockInsights = {
  pak_har_commentary: 'Steady week.',
  weekly_km_trend: [],
  avg_hr: null,
  load_change_pct: null,
}

test.describe('Weekly review on dashboard', () => {
  /**
   * Helper: intercept all backend calls the dashboard page makes.
   * The review mock is injected per-test so each test can control the status.
   */
  async function mockDashboardWithReview(
    page: import('@playwright/test').Page,
    reviewResponse: { status: number; body: unknown },
  ) {
    await page.route('http://localhost:8000/**', async (route) => {
      const url = route.request().url()

      if (url.includes('/user/me')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUser),
        })
        return
      }

      if (url.includes('/review/current')) {
        await route.fulfill({
          status: reviewResponse.status,
          contentType: 'application/json',
          body: JSON.stringify(reviewResponse.body),
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
          body: JSON.stringify({ detail: 'Not found', status: 404 }),
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

      await route.continue()
    })
  }

  test('shows review text when GET /review/current returns a valid review', async ({ page }) => {
    await mockDashboardWithReview(page, { status: 200, body: mockReview })
    await page.goto('/dashboard')

    // Dashboard must render at minimum (confirms no crash from the review call)
    await expect(page.getByText('Front Page · Weekly Edition')).toBeVisible({ timeout: 10_000 })

    // WeeklyReviewCard renders the review_text when a review is loaded.
    // This assertion will pass once the card is embedded in the dashboard.
    await expect(
      page.getByText('Three runs this week. Pace held steady.'),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('dashboard still renders when GET /review/current returns 404', async ({ page }) => {
    await mockDashboardWithReview(page, {
      status: 404,
      body: { detail: 'No review for current week', status: 404 },
    })
    await page.goto('/dashboard')

    // The dashboard must still render — a 404 on the review is not a fatal error
    await expect(page.getByText('Front Page · Weekly Edition')).toBeVisible({ timeout: 10_000 })

    // WeeklyReviewCard renders the "no review yet" empty state on 404.
    // This assertion will pass once the card is embedded in the dashboard.
    await expect(
      page.getByText("Pak Har hasn't reviewed this week yet."),
    ).toBeVisible({ timeout: 10_000 })
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
