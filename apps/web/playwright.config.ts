import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration for Old Legs.
 *
 * Tests mock all external services (Strava OAuth, backend API) via page.route().
 * No live backend or Strava account is needed to run these tests.
 *
 * To run:   npx playwright test
 * With UI:  npx playwright test --ui
 * Report:   npx playwright show-report
 */

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * webServer: Playwright will start Next.js dev server automatically if it's
   * not already running. Comment this out if you prefer to start `npm run dev`
   * yourself before running tests.
   */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
