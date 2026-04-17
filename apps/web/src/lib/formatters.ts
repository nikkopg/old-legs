/**
 * formatPace — converts decimal minutes-per-km to "M:SS"
 * e.g. 5.714 → "5:43"
 */
export function formatPace(minPerKm: number): string {
  const minutes = Math.floor(minPerKm)
  const seconds = Math.round((minPerKm - minutes) * 60)
  // Handle rounding up to 60 seconds
  if (seconds === 60) {
    return `${minutes + 1}:00`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * formatDuration — converts seconds to "H:MM:SS" or "M:SS" if under 1 hour
 * e.g. 3600 → "1:00:00", 325 → "5:25"
 */
export function formatDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * formatDate — formats ISO date string to "Mon 14 Apr"
 * e.g. "2026-04-15T07:30:00" → "Wed 15 Apr"
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * formatDistance — rounds to 1 decimal and appends " km"
 * e.g. 10.512 → "10.5 km"
 */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} km`
}
