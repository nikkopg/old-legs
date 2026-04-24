import type { Activity } from '@/types/api';
import type { WeeklyKmEntry } from '@/components/redesign';

/**
 * Returns the ISO week number (1-based) for a given Date.
 * Uses the standard ISO 8601 definition: weeks start on Monday.
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to the nearest Thursday (week pivot in ISO 8601)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * Returns a unique "year-week" key (e.g. "2026-14") for ISO week grouping.
 * Handles year-boundary weeks by using the ISO week year.
 */
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Shift to nearest Thursday for correct ISO year attribution
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const isoYear = d.getUTCFullYear();
  const week = getISOWeek(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  return `${isoYear}-${String(week).padStart(2, '0')}`;
}

/**
 * Returns the ISO week key for the current week.
 */
function getCurrentWeekKey(): string {
  return getISOWeekKey(new Date());
}

/**
 * Groups activities by ISO week and returns the last 4 weeks, oldest first.
 *
 * - Weeks with no activity still appear with km: 0, runs: 0.
 * - The current week gets current: true and label "This".
 * - Previous weeks get labels "W-1", "W-2", "W-3" (relative to today).
 */
export function computeWeeklyKm(activities: Activity[]): WeeklyKmEntry[] {
  // Build a map of week-key → { km, runs }
  const weekMap = new Map<string, { km: number; runs: number }>();

  for (const activity of activities) {
    const date = new Date(activity.activity_date);
    const key = getISOWeekKey(date);
    const existing = weekMap.get(key) ?? { km: 0, runs: 0 };
    weekMap.set(key, {
      km: existing.km + activity.distance_km,
      runs: existing.runs + 1,
    });
  }

  // Build the last 4 ISO week keys, starting from 3 weeks ago up to current
  const currentKey = getCurrentWeekKey();

  // Generate the 4 week keys (current and 3 prior)
  const weekKeys: string[] = [];
  const now = new Date();
  for (let offset = 3; offset >= 0; offset--) {
    // Go back `offset` weeks from today
    const d = new Date(now);
    d.setDate(now.getDate() - offset * 7);
    weekKeys.push(getISOWeekKey(d));
  }

  return weekKeys.map((key, index): WeeklyKmEntry => {
    const offsetFromCurrent = 3 - index; // 3, 2, 1, 0
    const isCurrent = key === currentKey;
    const label = isCurrent ? 'This' : `W-${offsetFromCurrent}`;
    const data = weekMap.get(key) ?? { km: 0, runs: 0 };

    return {
      label,
      km: Math.round(data.km * 10) / 10,
      runs: data.runs,
      ...(isCurrent ? { current: true } : {}),
    };
  });
}
