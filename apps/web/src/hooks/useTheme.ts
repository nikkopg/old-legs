// Hook: useTheme (TASK-XXX)
// What it does: Reads/writes the tabloid theme. State machine = 'light' | 'dark'.
//   - On mount, reads localStorage.theme (set by the SSR init script in app/layout.tsx).
//   - On set, writes data-theme="dark" on <html> (or removes it for light) AND persists.
//   - Default for new users (no localStorage entry) = 'light'. We do NOT auto-flip on
//     prefers-color-scheme. If product wants that later, add it here behind a flag.
// SSR safety:
//   - Initial state is 'light' so the server-rendered HTML is deterministic.
//   - The inline init script in app/layout.tsx applies data-theme BEFORE hydration,
//     so dark users see no flash. The first useEffect below resyncs React state
//     with whatever the script applied.

'use client'

import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function readStored(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function applyToDom(theme: Theme) {
  if (typeof document === 'undefined') return
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  // Always start as 'light' to match SSR. Resync from localStorage on mount.
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    setThemeState(readStored())
  }, [])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    applyToDom(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage unavailable (private mode, etc) — DOM change still applies for the session
    }
  }

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return { theme, setTheme, toggle }
}
