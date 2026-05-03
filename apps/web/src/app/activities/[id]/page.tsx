// READY FOR QA
// Feature: Activity detail page — Dispatch tabloid view (TASK-131)
// What was built:
//   - /activities/[id] replaced with the Dispatch tabloid broadsheet component
//   - Fetches single activity via GET /activities/{id} in parallel with all activities
//   - Computes weeklyKm (last 4 ISO weeks, oldest-first) from the activity list
//   - Passes activity, weeklyKm, splits (undefined — placeholder shown), and onBack to <Dispatch>
//   - Loading state: dark frame with animated paper block (no spinner)
//   - 404 error state: "Run not found."
//   - Other error states: "Could not load this run."
//   - 401 redirects to /
// Edge cases to test:
//   - Activity ID that doesn't exist (404 → "Run not found.")
//   - Activity with no analysis (Dispatch shows "Pak Har hasn't seen this run yet.")
//   - Activity with no HR data (Dispatch stats strip shows "—" for AVG HR)
//   - Non-numeric id in URL (isNaN guard prevents fetch, error state shown)
//   - 401 response on either fetch (redirect to /)
//   - API unreachable (non-401 error → "Could not load this run.")
//   - Very short run (<1km, distance_km close to 0)
//   - weeklyKm rail shows correct current week highlighted

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Dispatch } from '@/components/redesign';
import type { DispatchSplit } from '@/components/redesign/Dispatch';
import { PageLoadingSkeleton } from '@/components/redesign/PageLoadingSkeleton';
import { getActivity, getActivities, analyzeActivity } from '@/lib/api';
import { formatPace } from '@/lib/formatters';
import { computeWeeklyKm } from '@/lib/weeklyKm';
import { useUser } from '@/hooks/useUser';
import type { Activity, ApiError } from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUnauthorized(err: unknown): boolean {
  const apiErr = err as ApiError;
  return apiErr?.status === 401 || apiErr?.detail === 'Not authenticated';
}

function isNotFound(err: unknown): boolean {
  const apiErr = err as ApiError;
  return apiErr?.status === 404;
}

// ---------------------------------------------------------------------------
// Loading / Error skeletons
// ---------------------------------------------------------------------------

function LoadingState() {
  return <PageLoadingSkeleton />;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }} className="px-9 pt-7 pb-12">
        <p className="font-body italic text-[13px] opacity-60">{message}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const { user } = useUser();

  async function handleAnalyze(): Promise<void> {
    setIsAnalyzing(true);
    try {
      await analyzeActivity(id);
      await queryClient.invalidateQueries({ queryKey: ['activity', id] });
    } finally {
      setIsAnalyzing(false);
    }
  }

  const {
    data: activity,
    isLoading: activityLoading,
    isError: activityError,
    error: activityErr,
  } = useQuery<Activity, ApiError>({
    queryKey: ['activity', id],
    queryFn: () => getActivity(id),
    enabled: !isNaN(id),
    retry: (failureCount, err) => {
      if (isUnauthorized(err) || isNotFound(err)) return false;
      return failureCount < 2;
    },
  });

  const {
    data: activities,
    isLoading: activitiesLoading,
    isError: activitiesError,
    error: activitiesErr,
  } = useQuery<Activity[], ApiError>({
    queryKey: ['activities'],
    queryFn: getActivities,
    enabled: !isNaN(id),
    retry: (failureCount, err) => {
      if (isUnauthorized(err)) return false;
      return failureCount < 2;
    },
  });

  // Redirect to login on 401 from either fetch
  useEffect(() => {
    if (activityError && activityErr && isUnauthorized(activityErr)) {
      router.replace('/');
    }
    if (activitiesError && activitiesErr && isUnauthorized(activitiesErr)) {
      router.replace('/');
    }
  }, [activityError, activityErr, activitiesError, activitiesErr, router]);

  // --- Invalid id ---
  if (isNaN(id)) {
    return <ErrorState message="Run not found." />;
  }

  // --- Loading ---
  if (activityLoading || activitiesLoading) {
    return <LoadingState />;
  }

  // --- 401 (redirect already triggered via useEffect — show nothing) ---
  if (activityError && isUnauthorized(activityErr)) {
    return null;
  }
  if (activitiesError && isUnauthorized(activitiesErr)) {
    return null;
  }

  // --- 404 ---
  if (activityError && isNotFound(activityErr)) {
    return <ErrorState message="Run not found." />;
  }

  // --- Other errors ---
  if (activityError || activitiesError) {
    return <ErrorState message="Could not load this run." />;
  }

  // --- Data ready ---
  if (!activity) {
    return <ErrorState message="Run not found." />;
  }

  const weeklyKm = computeWeeklyKm(activities ?? []);

  const splits: DispatchSplit[] | undefined = activity.splits
    ? activity.splits.map((s) => ({
        km: s.km,
        pace: formatPace(1000 / (s.avg_speed_ms * 60)),
        hr: s.hr !== null ? Math.round(s.hr) : null,
        cad: s.cad !== null ? Math.round(s.cad * 2) : null,
        elev: s.elev !== null ? Math.round(s.elev) : null,
        movingTime: s.moving_time,
      }))
    : undefined;

  return (
    <Dispatch
      activity={activity}
      weeklyKm={weeklyKm}
      splits={splits}
      userMaxHr={user?.max_hr ?? null}
      onBack={() => router.push('/activities')}
      onAnalyze={handleAnalyze}
      isAnalyzing={isAnalyzing}
      onNav={(key) => {
        const routes: Record<string, string> = {
          dashboard: '/dashboard',
          activities: '/activities',
          plan: '/plan',
          coach: '/coach',
          settings: '/settings',
        };
        if (routes[key]) router.push(routes[key]);
      }}
    />
  );
}
