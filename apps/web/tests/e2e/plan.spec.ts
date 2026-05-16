import { test, expect } from '@playwright/test'

/**
 * Plan page tests
 *
 * Verifies that PlanPaper renders the fixtures table when a plan is returned,
 * shows the empty state when no plan exists (404), and redirects on 401.
 *
 * TASK-201-D3: next-week flow tests appended below the original describe block.
 * Tests cover: next-week captions, section label, replace-confirmation modal
 * (dismiss and confirm paths), and SSE generation trigger.
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
    await expect(page.getByRole('button', { name: /file (this|next) week/i })).toBeVisible()
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

// ---------------------------------------------------------------------------
// TASK-201-D3: Next-week flow tests
//
// These tests exercise the GET /plan/next-target integration: caption copy,
// section label, button label, and the replace-confirmation modal.
//
// All API calls are mocked via page.route(). The helper mockNextWeekEndpoints()
// intercepts every backend call the plan page makes, including the new
// /plan/next-target endpoint that the original mockPlanEndpoints() does not cover.
// ---------------------------------------------------------------------------

// A minimal next-target fixture for "already ran this week → next week" scenario.
// week_start_date is a Monday so date formatting is deterministic.
const nextTargetAlreadyRan = {
  week_start_date: '2026-05-18',
  is_next_week: true,
  reason: 'already_ran_this_week' as const,
  replaces_active_plan: false,
}

// Next-target fixture for the weekend scenario.
const nextTargetWeekend = {
  week_start_date: '2026-05-18',
  is_next_week: true,
  reason: 'weekend' as const,
  replaces_active_plan: false,
}

// Next-target fixture that triggers the replace-confirmation modal.
// is_next_week=false + replaces_active_plan=true means there is an existing
// active plan for the current resolved target week.
const nextTargetReplaces = {
  week_start_date: '2026-04-28',
  is_next_week: false,
  reason: 'current_week' as const,
  replaces_active_plan: true,
}

// Minimal SSE payload returned when POST /plan/generate is mocked.
// The complete event carries the same plan shape that the page expects from
// the SSE stream; we supply a bare-minimum plan so onComplete() succeeds.
const sseCompletePlan = {
  id: 99,
  user_id: 1,
  week_start_date: '2026-05-18',
  plan_data: {},
  pak_har_notes: {},
  is_active: true,
  created_at: '2026-05-18T06:00:00Z',
  updated_at: '2026-05-18T06:00:00Z',
}

const sseCompleteBody = `data: ${JSON.stringify({
  type: 'complete',
  data: { plan: sseCompletePlan, is_next_week: true, target_week_reason: 'already_ran_this_week' },
})}\n\n`

test.describe('Plan page — next-week flow (TASK-201-D3)', () => {
  /**
   * Unified route interceptor for the plan page.
   *
   * Handles all five endpoints the page calls on mount:
   *   GET /user/me
   *   GET /plan/current
   *   GET /activities
   *   GET /plan/next-target
   *   GET /activities/{id}/plan-verdict  (matched by substring; returns 404)
   *
   * Individual tests override plan/next-target and plan/current responses via
   * the respective parameters.
   */
  async function mockNextWeekEndpoints(
    page: import('@playwright/test').Page,
    opts: {
      planResponse: { status: number; body: unknown }
      nextTargetResponse: { status: number; body: unknown }
    },
  ) {
    await page.route('http://localhost:8000/**', async (route) => {
      const url = route.request().url()

      if (url.includes('/user/me')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
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
          }),
        })
        return
      }

      if (url.includes('/plan/next-target')) {
        await route.fulfill({
          status: opts.nextTargetResponse.status,
          contentType: 'application/json',
          body: JSON.stringify(opts.nextTargetResponse.body),
        })
        return
      }

      if (url.includes('/plan/current')) {
        await route.fulfill({
          status: opts.planResponse.status,
          contentType: 'application/json',
          body: JSON.stringify(opts.planResponse.body),
        })
        return
      }

      if (url.includes('/plan-verdict')) {
        // Per-day verdict endpoint — not needed for these tests; return 404.
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Not found', status: 404 }),
        })
        return
      }

      if (url.includes('/activities')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
        return
      }

      await route.continue()
    })
  }

  // -------------------------------------------------------------------------
  // Test 1: Caption — already_ran_this_week
  // -------------------------------------------------------------------------

  test('shows "already trained" caption and "File next week" button when reason=already_ran_this_week', async ({
    page,
  }) => {
    await mockNextWeekEndpoints(page, {
      planResponse: { status: 404, body: { detail: 'No active plan found', status: 404 } },
      nextTargetResponse: { status: 200, body: nextTargetAlreadyRan },
    })

    await page.goto('/plan')

    // Caption rendered by PlanPaper:
    //   "You've already trained this week. Plan starts ${monDate}."
    // where monDate = new Date('2026-05-18T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    // = "18 May" (en-GB, UTC).
    await expect(
      page.getByText(/already trained this week/i),
    ).toBeVisible({ timeout: 10_000 })

    // Button label when is_next_week=true (CSS uppercases but DOM text is mixed case).
    await expect(
      page.getByRole('button', { name: /file next week['']s plan/i }),
    ).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Test 2: Caption — weekend
  // -------------------------------------------------------------------------

  test('shows "weekend" caption and "File next week" button when reason=weekend', async ({
    page,
  }) => {
    await mockNextWeekEndpoints(page, {
      planResponse: { status: 404, body: { detail: 'No active plan found', status: 404 } },
      nextTargetResponse: { status: 200, body: nextTargetWeekend },
    })

    await page.goto('/plan')

    // Caption: "It's the weekend. This plan runs from ${monDate}."
    await expect(
      page.getByText(/it['']s the weekend/i),
    ).toBeVisible({ timeout: 10_000 })

    await expect(
      page.getByRole('button', { name: /file next week['']s plan/i }),
    ).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Test 3: Section label "Next Edition" when is_next_week=true
  // -------------------------------------------------------------------------

  test('section label shows "Next Edition" when is_next_week=true', async ({ page }) => {
    await mockNextWeekEndpoints(page, {
      planResponse: { status: 404, body: { detail: 'No active plan found', status: 404 } },
      nextTargetResponse: { status: 200, body: nextTargetAlreadyRan },
    })

    await page.goto('/plan')

    // NewspaperChrome renders the section prop as "§ Next Edition · Week of ..."
    // in a Caps element. We match on the partial text "Next Edition".
    await expect(page.getByText(/Next Edition/)).toBeVisible({ timeout: 10_000 })
  })

  // -------------------------------------------------------------------------
  // Test 4: Replace-confirmation modal — appears and can be dismissed
  // -------------------------------------------------------------------------

  test('replace-confirmation modal appears and is dismissed by "Keep it"', async ({
    page,
  }) => {
    // Track whether POST /plan/generate was ever called so we can assert it was NOT.
    let generateCallCount = 0

    await mockNextWeekEndpoints(page, {
      // Plan exists — required for replaces_active_plan=true to be meaningful.
      planResponse: { status: 200, body: mockPlan },
      nextTargetResponse: { status: 200, body: nextTargetReplaces },
    })

    // Intercept the generate endpoint after the base routes are set up.
    // page.route() stacks — more-specific patterns added later take precedence
    // only when using route.continue() in the wildcard; here we keep it simple
    // by matching the generate path directly before the wildcard handler sees it.
    await page.route('http://localhost:8000/plan/generate', async (route) => {
      if (route.request().method() === 'POST') {
        generateCallCount += 1
        // Respond with a minimal SSE complete event so the page doesn't hang.
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseCompleteBody,
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/plan')

    // Wait for the plan table to load (plan exists, so the fixtures table renders).
    await expect(page.getByText('Seven days. The plan is filed.')).toBeVisible({ timeout: 10_000 })

    // Click the generate button — should open the modal because replaces_active_plan=true.
    const generateBtn = page.getByRole('button', { name: /file this week['']s plan/i })
    await generateBtn.click()

    // Modal heading should be visible.
    await expect(
      page.getByText(/there['']s already a plan for this week/i),
    ).toBeVisible({ timeout: 5_000 })

    // Click "Keep it" — modal should dismiss.
    await page.getByRole('button', { name: /keep it/i }).click()

    // Modal heading should be gone.
    await expect(
      page.getByText(/there['']s already a plan for this week/i),
    ).not.toBeVisible()

    // POST /plan/generate must NOT have been called.
    expect(generateCallCount).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Test 5: Replace-confirmation modal — confirm triggers generation
  // -------------------------------------------------------------------------

  test('replace-confirmation modal "Replace it" triggers POST /plan/generate', async ({
    page,
  }) => {
    let generateCallCount = 0

    await mockNextWeekEndpoints(page, {
      planResponse: { status: 200, body: mockPlan },
      nextTargetResponse: { status: 200, body: nextTargetReplaces },
    })

    // Set up the generate mock before navigation so it is registered in time.
    await page.route('http://localhost:8000/plan/generate', async (route) => {
      if (route.request().method() === 'POST') {
        generateCallCount += 1
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseCompleteBody,
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/plan')

    // Wait for the plan table to confirm the page loaded.
    await expect(page.getByText('Seven days. The plan is filed.')).toBeVisible({ timeout: 10_000 })

    // Click generate → modal opens.
    await page.getByRole('button', { name: /file this week['']s plan/i }).click()
    await expect(
      page.getByText(/there['']s already a plan for this week/i),
    ).toBeVisible({ timeout: 5_000 })

    // Click "Replace it" → modal closes, generation is triggered.
    await page.getByRole('button', { name: /replace it/i }).click()

    // Modal must dismiss.
    await expect(
      page.getByText(/there['']s already a plan for this week/i),
    ).not.toBeVisible()

    // POST /plan/generate must have been called exactly once.
    // useProgressStream fires the fetch on trigger() — give it a moment to execute.
    await page.waitForTimeout(500)
    expect(generateCallCount).toBe(1)
  })
})
