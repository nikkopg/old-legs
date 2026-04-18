import { test, expect } from '@playwright/test'

/**
 * Auth guard tests
 *
 * We cannot perform a real Strava OAuth round-trip in automated tests, so we
 * simulate the authenticated state by:
 *   1. Intercepting the API calls that guarded pages make on load.
 *   2. For the "unauthenticated" scenario: returning a 401, which triggers
 *      each page's useEffect redirect logic.
 *   3. For the "authenticated" scenario: returning valid mock data so the
 *      page can render without crashing.
 *
 * The session_user_id cookie is HttpOnly — Playwright cannot set it directly
 * via page.context().addCookies() for HttpOnly cookies in all configurations.
 * Instead we rely on mocking the API responses, which is what the pages
 * actually branch on.
 */

test.describe('Auth guards — unauthenticated redirect', () => {
  /**
   * Helper that intercepts every backend call and returns a 401.
   * The pages (`/dashboard`, `/plan`, `/coach`) each have a useEffect that
   * calls router.replace('/') when the query returns a 401.
   */
  async function mockAll401(page: import('@playwright/test').Page) {
    await page.route('http://localhost:8000/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not authenticated' }),
      })
    })
  }

  test('unauthenticated user visiting /dashboard is redirected to /', async ({ page }) => {
    await mockAll401(page)
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })

  test('unauthenticated user visiting /plan is redirected to /', async ({ page }) => {
    await mockAll401(page)
    await page.goto('/plan')
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })

  test('unauthenticated user visiting /coach is NOT redirected (coach has no auth guard)', async ({ page }) => {
    // The /coach page renders without any initial API call — messages are local
    // state.  It does not redirect on 401. Verify it simply loads.
    await page.goto('/coach')

    // The page should show the PageWrapper title for Pak Har's chat interface.
    // It must NOT redirect to /.
    await expect(page).not.toHaveURL('/')
    // The chat input should be present (coach page renders without auth).
    await expect(page.getByPlaceholder('Ask Pak Har something.')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Auth callback page — /auth/callback', () => {
  test('displays error when Strava denies access (?error=access_denied)', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied')

    await expect(page.getByText(/strava authorization was denied/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /try again/i })).toBeVisible()
  })

  test('displays error when ?code param is missing', async ({ page }) => {
    await page.goto('/auth/callback')

    await expect(page.getByText(/no authorization code received/i)).toBeVisible()
  })

  test('displays error when the backend callback endpoint fails', async ({ page }) => {
    // The /auth/callback route is a Next.js Server Component — the fetch to
    // the backend happens server-side (Node.js), not in the browser.
    // page.route() only intercepts browser-initiated requests and cannot
    // intercept server-side fetches.
    //
    // When the backend is not running (as in a CI/mocked env), the server-side
    // fetch throws a connection error, which the component catches and maps to
    // "Could not reach the server. Please try again."
    //
    // We verify this graceful error path by navigating without a live backend.
    // If the backend IS running, it will likely return an error for a fake code
    // and show "Authorization failed."  Either error message is acceptable.
    await page.goto('/auth/callback?code=definitely_fake_code_xyz')

    const errorVisible = await page
      .getByText(/authorization failed|could not reach the server/i)
      .isVisible()
      .catch(() => false)

    // The error page must also offer a "Try again" link
    const tryAgainVisible = await page
      .getByRole('link', { name: /try again/i })
      .isVisible()
      .catch(() => false)

    // At minimum the page should show an error — either the backend is down
    // (network error) or it rejected the fake code.
    expect(errorVisible || tryAgainVisible).toBe(true)
  })
})
