import { test, expect } from '@playwright/test'
import type { Activity } from '../../src/types/api'

/**
 * Dashboard page tests (/dashboard)
 *
 * All tests mock the GET /activities endpoint so we never need a live backend
 * or a real Strava session.  The mock data is typed to match the Activity
 * schema from apps/web/src/types/api.ts.
 */

// Minimal valid Activity fixture
const MOCK_ACTIVITY: Activity = {
  id: 1,
  user_id: 42,
  strava_activity_id: 'strava-001',
  name: 'Morning Run',
  distance_km: 8.4,
  moving_time_seconds: 2880,
  average_pace_min_per_km: 5.71,
  average_hr: 152,
  max_hr: 174,
  elevation_gain_m: 45,
  activity_date: '2026-04-15T06:30:00',
  analysis: null,
  analysis_generated_at: null,
  sync_status: 'synced',
  created_at: '2026-04-15T07:00:00',
  updated_at: '2026-04-15T07:00:00',
}

const MOCK_ACTIVITY_NO_HR: Activity = {
  ...MOCK_ACTIVITY,
  id: 2,
  name: 'Easy Recovery',
  average_hr: null,
  max_hr: null,
}

async function mockActivities(
  page: import('@playwright/test').Page,
  activities: Activity[],
) {
  await page.route('http://localhost:8000/activities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(activities),
    })
  })
}

test.describe('Dashboard page', () => {
  test('renders page title and nav when activities are returned', async ({ page }) => {
    await mockActivities(page, [MOCK_ACTIVITY])
    await page.goto('/dashboard')

    // PageWrapper renders the page title "Your runs"
    await expect(page.getByText('Your runs')).toBeVisible()
  })

  test('renders activity cards when the API returns activities', async ({ page }) => {
    await mockActivities(page, [MOCK_ACTIVITY])
    await page.goto('/dashboard')

    // The ActivityCard renders the activity name
    await expect(page.getByText('Morning Run')).toBeVisible()
  })

  test('renders empty state when no activities are returned', async ({ page }) => {
    await mockActivities(page, [])
    await page.goto('/dashboard')

    await expect(page.getByText(/no runs synced yet/i)).toBeVisible()
  })

  test('renders multiple activity cards for multiple activities', async ({ page }) => {
    await mockActivities(page, [MOCK_ACTIVITY, MOCK_ACTIVITY_NO_HR])
    await page.goto('/dashboard')

    await expect(page.getByText('Morning Run')).toBeVisible()
    await expect(page.getByText('Easy Recovery')).toBeVisible()
  })

  test('shows an error message when the API returns a 500', async ({ page }) => {
    await page.route('http://localhost:8000/activities', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal server error' }),
      })
    })

    await page.goto('/dashboard')

    await expect(page.getByText(/could not load runs/i)).toBeVisible()
  })

  test('shows three loading skeletons during the loading state', async ({ page }) => {
    // Delay the API response so we can catch the loading skeleton
    await page.route('http://localhost:8000/activities', async (route) => {
      await new Promise((res) => setTimeout(res, 300))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_ACTIVITY]),
      })
    })

    await page.goto('/dashboard')

    // Three skeleton divs are rendered during loading (animate-pulse class)
    const skeletons = page.locator('.animate-pulse')
    await expect(skeletons.first()).toBeVisible()
  })

  test('redirects to / when the API returns 401', async ({ page }) => {
    await page.route('http://localhost:8000/activities', async (route) => {
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
