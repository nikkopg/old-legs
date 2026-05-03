import { test, expect } from '@playwright/test'

/**
 * Settings page tests
 *
 * Verifies the SettingsPaper renders when authenticated, redirects on 401,
 * and that the Reset Pak Har's Context two-step confirmation flow works.
 *
 * API calls are fully mocked via page.route() — no live backend required.
 */

// Both queries the settings page fires: GET /auth/strava/status and GET /user/me
const mockAuthStatus = { connected: true, message: 'Connected' }

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

test.describe('Settings page', () => {
  /**
   * Helper: intercept all backend calls for the settings page.
   * Settings fires GET /auth/strava/status and GET /user/me.
   */
  async function mockSettings(page: import('@playwright/test').Page) {
    await page.route('http://localhost:8000/**', async (route) => {
      const url = route.request().url()

      if (url.includes('/auth/strava/status')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAuthStatus),
        })
        return
      }

      if (url.includes('/user/me')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUser),
        })
        return
      }

      await route.continue()
    })
  }

  test('renders "The Desk." heading when authenticated', async ({ page }) => {
    await mockSettings(page)
    await page.goto('/settings')

    // SettingsPaper renders an h1 with exactly "The Desk."
    await expect(page.getByRole('heading', { name: 'The Desk.' })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('redirects to / when GET /auth/strava/status returns 401', async ({ page }) => {
    await page.route('http://localhost:8000/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not authenticated' }),
      })
    })

    await page.goto('/settings')
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })

  test('Reset Context: first click reveals the confirm/cancel step', async ({ page }) => {
    await mockSettings(page)
    await page.goto('/settings')

    // Wait for the page heading to confirm the page is loaded
    await expect(page.getByRole('heading', { name: 'The Desk.' })).toBeVisible({
      timeout: 10_000,
    })

    // Step 1 — idle state: the initial reset button is visible
    // SettingsPaper renders "Reset Pak Har's Context →" when resetContextState === 'idle'
    const resetBtn = page.getByRole('button', { name: /reset pak har.*context/i })
    await expect(resetBtn).toBeVisible()

    // Click it — the page transitions to 'confirming' state
    await resetBtn.click()

    // Step 2 — confirming state: "Confirm Reset →" button and "Cancel" link appear
    await expect(page.getByRole('button', { name: /confirm reset/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^cancel$/i })).toBeVisible()

    // The original reset button should no longer be rendered in 'idle' form
    await expect(
      page.getByText('This wipes all of Pak Har'),
    ).toBeVisible()
  })
})
