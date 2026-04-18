import { test, expect } from '@playwright/test'

/**
 * Coach chat page tests (/coach)
 *
 * The coach page does not make any API call on initial load — it only calls
 * POST /coach/chat when the user submits a message.  We mock the SSE endpoint
 * with a simple streaming response.
 *
 * No auth cookie is required for these tests because the /coach page renders
 * without an initial authenticated API call.
 */

/**
 * Build a minimal SSE response body.
 * Each token is a "data: <text>\n\n" line.  The stream closes with "data: [DONE]\n\n".
 */
function buildSseBody(tokens: string[]): string {
  return [...tokens.map((t) => `data: ${t}\n\n`), 'data: [DONE]\n\n'].join('')
}

async function mockChatStream(
  page: import('@playwright/test').Page,
  tokens: string[],
  statusCode = 200,
) {
  await page.route('http://localhost:8000/coach/chat', async (route) => {
    if (statusCode !== 200) {
      await route.fulfill({
        status: statusCode,
        contentType: 'application/json',
        body: JSON.stringify({ detail: `API error ${statusCode}` }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: buildSseBody(tokens),
    })
  })
}

test.describe('Coach chat page', () => {
  test('loads /coach without crashing', async ({ page }) => {
    await page.goto('/coach')

    // PageWrapper renders a TopBar with an h1 containing "Pak Har"
    await expect(page.getByRole('heading', { name: 'Pak Har' })).toBeVisible()
  })

  test('shows the empty state prompt when there are no messages', async ({ page }) => {
    await page.goto('/coach')

    await expect(page.getByText(/ask pak har about your training/i)).toBeVisible()
  })

  test('chat input is visible and focusable', async ({ page }) => {
    await page.goto('/coach')

    const input = page.getByPlaceholder('Ask Pak Har something.')
    await expect(input).toBeVisible()
    await expect(input).toBeEnabled()

    await input.focus()
    await expect(input).toBeFocused()
  })

  test('send button is disabled when input is empty', async ({ page }) => {
    await page.goto('/coach')

    const sendButton = page.getByRole('button', { name: /send/i })
    await expect(sendButton).toBeDisabled()
  })

  test('send button is enabled when input has text', async ({ page }) => {
    await page.goto('/coach')

    const input = page.getByPlaceholder('Ask Pak Har something.')
    await input.fill('How do I build base mileage?')

    const sendButton = page.getByRole('button', { name: /send/i })
    await expect(sendButton).toBeEnabled()
  })

  test('submitting a message fires a POST /coach/chat request', async ({ page }) => {
    const tokens = ['You ', 'need ', 'to ', 'run ', 'more ', 'consistently.']
    await mockChatStream(page, tokens)

    let requestBody = ''
    page.on('request', (req) => {
      if (req.url().includes('/coach/chat')) {
        requestBody = req.postData() ?? ''
      }
    })

    await page.goto('/coach')

    const input = page.getByPlaceholder('Ask Pak Har something.')
    await input.fill('How do I get faster?')
    await page.getByRole('button', { name: /send/i }).click()

    // Wait for the streamed response to appear
    await expect(page.getByText(/consistently/i)).toBeVisible({ timeout: 10_000 })

    // Verify the request was sent with the correct message
    const parsed = JSON.parse(requestBody) as { message: string }
    expect(parsed.message).toBe('How do I get faster?')
  })

  test('streamed response tokens render in the assistant bubble', async ({ page }) => {
    const tokens = ['Add ', '10 ', 'minutes ', 'to ', 'your ', 'long ', 'run.']
    await mockChatStream(page, tokens)

    await page.goto('/coach')

    const input = page.getByPlaceholder('Ask Pak Har something.')
    await input.fill('What should I change about my training?')
    await page.getByRole('button', { name: /send/i }).click()

    // The full assembled response should appear
    await expect(page.getByText(/Add 10 minutes to your long run/i)).toBeVisible({ timeout: 10_000 })
  })

  test('input is cleared after sending a message', async ({ page }) => {
    const tokens = ['Train ', 'smarter.']
    await mockChatStream(page, tokens)

    await page.goto('/coach')

    const input = page.getByPlaceholder('Ask Pak Har something.')
    await input.fill('Any tips?')
    await page.getByRole('button', { name: /send/i }).click()

    // After submission the input should be cleared
    await expect(input).toHaveValue('')
  })

  test('shows error message in assistant bubble when Ollama is unavailable (503)', async ({ page }) => {
    await mockChatStream(page, [], 503)

    await page.goto('/coach')

    const input = page.getByPlaceholder('Ask Pak Har something.')
    await input.fill('Am I overtraining?')
    await page.getByRole('button', { name: /send/i }).click()

    // The error handling in coach/page.tsx falls back to a friendly message
    await expect(
      page.getByText(/pak har is unavailable|API error 503/i),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('shows rate limit error when /coach/chat returns 429', async ({ page }) => {
    await mockChatStream(page, [], 429)

    await page.goto('/coach')

    const input = page.getByPlaceholder('Ask Pak Har something.')
    await input.fill('Train me.')
    await page.getByRole('button', { name: /send/i }).click()

    await expect(
      page.getByText(/API error 429/i),
    ).toBeVisible({ timeout: 10_000 })
  })
})
