// READY FOR QA
// Feature: useDashboard hook (TASK-114)
// What was built:
//   Composes three parallel queries — activities, current plan, auth status — into a
//   single hook that drives the weekly hub dashboard. Derives the following client-side:
//     - weeklyStats: total km, total runs, and total time for the current Mon–Sun window
//     - todayPlan: the PlanDay entry for today (null if no plan or today is a rest day)
//     - lastRun: the most recent Activity object (null if no activities)
//     - isUnauthorized: boolean used by the page to trigger redirect
// Edge cases to test:
//   - No activities at all (lastRun null, weeklyStats all zero)
//   - No plan (todayPlan null — hub still renders without plan section)
//   - Activities exist but none fall in the current week (weeklyStats all zero)
//   - today is Sunday (week boundary — Mon start edge case)
//   - 401 on any sub-query sets isUnauthorized true
//   - API unreachable (isError true, clear error message surfaced)
//   - Plan day key casing: plan_data keys are lowercase day names ("monday", "tuesday", …)

import { useQuery } from '@tanstack/react-query'
import { getActivities, getCurrentPlan } from '@/lib/api'
import type { Activity, ApiError, PlanDay, TrainingPlan } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUnauthorizedError(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 401 || apiErr?.detail === 'Not authenticated'
}

function isNotFoundError(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 404
}

/**
 * Returns the Monday of the current week at 00:00:00 local time.
 * JS Date.getDay() returns 0=Sunday … 6=Saturday.
 */
function getWeekStart(): Date {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day // shift to Monday
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getTodayDayName(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
}

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

export interface WeeklyStats {
  totalKm: number
  totalRuns: number
  totalTimeSeconds: number
}

export interface DashboardData {
  weeklyStats: WeeklyStats
  todayPlan: PlanDay | null
  lastRun: Activity | null
  plan: TrainingPlan | null
  isLoading: boolean
  isError: boolean
  isUnauthorized: boolean
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboard(): DashboardData {
  const {
    data: activities,
    isLoading: activitiesLoading,
    isError: activitiesError,
    error: activitiesErr,
  } = useQuery<Activity[], ApiError>({
    queryKey: ['activities'],
    queryFn: getActivities,
    retry: (failureCount, err) => {
      if (isUnauthorizedError(err)) return false
      return failureCount < 2
    },
  })

  const {
    data: plan,
    isLoading: planLoading,
    isError: planError,
    error: planErr,
  } = useQuery<TrainingPlan, ApiError>({
    queryKey: ['plan', 'current'],
    queryFn: getCurrentPlan,
    retry: (failureCount, err) => {
      // 404 means no plan yet — not a real error, don't retry
      if (isUnauthorizedError(err) || isNotFoundError(err)) return false
      return failureCount < 2
    },
  })

  // --- Derive weekly stats ---
  const weekStart = getWeekStart()
  const weeklyStats: WeeklyStats = { totalKm: 0, totalRuns: 0, totalTimeSeconds: 0 }

  if (activities) {
    for (const activity of activities) {
      const activityDate = new Date(activity.activity_date)
      if (activityDate >= weekStart) {
        weeklyStats.totalKm += activity.distance_km
        weeklyStats.totalRuns += 1
        weeklyStats.totalTimeSeconds += activity.moving_time_seconds
      }
    }
    weeklyStats.totalKm = Math.round(weeklyStats.totalKm * 10) / 10
  }

  // --- Derive today's plan day ---
  const todayKey = getTodayDayName()
  const todayPlan: PlanDay | null = plan?.plan_data[todayKey] ?? null

  // --- Most recent run (activities are returned newest-first from the API) ---
  const lastRun: Activity | null = activities?.[0] ?? null

  // --- Auth / error state ---
  const unauthorized =
    isUnauthorizedError(activitiesErr) || isUnauthorizedError(planErr)

  // planError is not a real error when it is 404 — filter it out
  const realPlanError = planError && !isNotFoundError(planErr)

  const isError = (activitiesError && !isUnauthorizedError(activitiesErr)) || realPlanError

  return {
    weeklyStats,
    todayPlan,
    lastRun,
    plan: plan ?? null,
    isLoading: activitiesLoading || planLoading,
    isError: isError ?? false,
    isUnauthorized: unauthorized,
  }
}
