/**
 * Unit tests for apps/web/src/lib/api.ts
 *
 * Coverage:
 * - getPlans()      → GET /plan/list, returns array
 * - getPlan(id)     → GET /plan/{id}, returns single plan
 * - deletePlan(id)  → DELETE /plan/{id}, returns void
 * - exportUserData() → GET /user/export, triggers blob download via anchor click
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getPlans, getPlan, deletePlan, exportUserData } from '@/lib/api'

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function makeFetchResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const responseHeaders = new Headers({ 'Content-Type': 'application/json', ...headers })
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: responseHeaders }),
  )
}

function makeBlobResponse(status = 200, contentDisposition = '') {
  const blob = new Blob(['PK'], { type: 'application/zip' })
  // jsdom's Response does not support Blob bodies — build a plain object
  // that satisfies the interface surface used by exportUserData.
  const mockResponse = {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-disposition') return contentDisposition || null
        return null
      },
    },
    blob: () => Promise.resolve(blob),
  }
  return Promise.resolve(mockResponse as unknown as Response)
}

// ---------------------------------------------------------------------------
// Minimal TrainingPlan fixture
// ---------------------------------------------------------------------------

function makePlan(id: number) {
  return {
    id,
    week_start_date: '2026-06-09',
    created_at: '2026-06-09T05:00:00Z',
    is_active: false,
    plan_data: {},
    editor_note: '',
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('api.ts — getPlans()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls GET /plan/list and returns an array of plans', async () => {
    const plans = [makePlan(1), makePlan(2)]
    vi.mocked(fetch).mockReturnValueOnce(makeFetchResponse(plans))

    const result = await getPlans()

    expect(fetch).toHaveBeenCalledOnce()
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]]
    expect(url).toMatch(/\/plan\/list$/)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
  })
})

describe('api.ts — getPlan(id)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls GET /plan/{id} and returns the matching plan', async () => {
    const plan = makePlan(42)
    vi.mocked(fetch).mockReturnValueOnce(makeFetchResponse(plan))

    const result = await getPlan(42)

    expect(fetch).toHaveBeenCalledOnce()
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]]
    expect(url).toMatch(/\/plan\/42$/)
    expect(result.id).toBe(42)
  })
})

describe('api.ts — deletePlan(id)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls DELETE /plan/{id} and resolves without error', async () => {
    // 204 No Content — apiFetch returns undefined for 204
    vi.mocked(fetch).mockReturnValueOnce(
      Promise.resolve(new Response(null, { status: 204 })),
    )

    await expect(deletePlan(7)).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledOnce()
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/plan\/7$/)
    expect(opts.method).toBe('DELETE')
  })
})

describe('api.ts — exportUserData()', () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>
  let removeChildSpy: ReturnType<typeof vi.spyOn>
  let clickSpy: ReturnType<typeof vi.spyOn>
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())

    // Mock URL methods — jsdom may not implement createObjectURL
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)

    // Spy on anchor click so we don't trigger navigation
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined)
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('calls GET /user/export and triggers a file download via anchor click', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeBlobResponse(200, 'attachment; filename="old-legs-export-2026-06-16.zip"'),
    )

    await exportUserData()

    // fetch was called
    expect(fetch).toHaveBeenCalledOnce()
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]]
    expect(url).toMatch(/\/user\/export$/)

    // A blob URL was created and an anchor click was triggered
    expect(createObjectURLSpy).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()

    // Anchor was appended then removed
    expect(appendChildSpy).toHaveBeenCalledOnce()
    expect(removeChildSpy).toHaveBeenCalledOnce()
  })
})
