// Hook: useCountUp (TASK-200)
// What it does: Counts a numeric value up from 0 → `target` over `durationMs`
//   using requestAnimationFrame and a mechanical ease-out (1 - (1-t)^2).
//   Used by stat tickers on FrontPage scoreboards and Dispatch stats strip when
//   a new dispatch lands.
//
// Reduced motion: when matchMedia('(prefers-reduced-motion: reduce)') matches,
//   the hook jumps straight to `target` with no animation.
//
// Re-runs if target changes (e.g. on activity navigation).

'use client'

import { useEffect, useState } from 'react'

export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setValue(target)
      return
    }

    // Respect prefers-reduced-motion — jump to target with no animation
    const prefersReduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduce) {
      setValue(target)
      return
    }

    let raf = 0
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // Mechanical ease-out: quick at the start, settling toward target
      const eased = 1 - (1 - t) ** 2
      setValue(target * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return value
}
