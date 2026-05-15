// READY FOR QA
// Feature: Activity detail page — streamed analysis tokens in Dispatch (TASK-191)
// What was built:
//   - /activities/[id] replaced analyzeActivity mutation + isAnalyzing state with useProgressStream
//   - ANALYSIS_STEPS define the 5 labeled stages (must match backend step labels exactly)
//   - AnalysisStreamComplete interface: { analysis, verdict_short, verdict_tag, tone }
//   - onComplete: sets streamedAnalysis state immediately, invalidates ['activity', id]
//   - onError: sets analysisError state
//   - analysisStreaming, analysisSteps, analysisElapsedMs, analysisError passed to Dispatch
//   - Dispatch replaces button loading state with inline progress strip while streaming
// Previous edge cases (TASK-131 + RPE wiring) still apply:
//   - Activity ID that doesn't exist (404 → "Run not found.")
//   - Activity with no analysis (Dispatch shows "Pak Har hasn't seen this run yet.")
//   - Activity with no HR data (Dispatch stats strip shows "—" for AVG HR)
//   - Non-numeric id in URL (isNaN guard prevents fetch, error state shown)
//   - 401 response on either fetch (redirect to /)
//   - API unreachable (non-401 error → "Could not load this run.")
//   - Very short run (<1km, distance_km close to 0)
//   - weeklyKm rail shows correct current week highlighted
//   - RPE save failure (silent — rpeSaveState resets to idle, optimistic UI value retained by component)
//   - RPE null (no selection) — sends rpe: null to PATCH endpoint
//   - rpeSaveState transitions: idle → saving → saved → idle (after 1500ms)
//   - trigger() called while already streaming → no-op (hook guards double-trigger)
//   - complete event → strip unmounts, analysis prose renders from streamedAnalysis immediately
//   - ['activity', id] invalidation after complete → React Query refetches, activityData takes over
//   - error event → inline error in accent + "Try again →" calls trigger()

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Dispatch } from '@/components/redesign';
import type { DispatchSplit } from '@/components/redesign/Dispatch';
import { PageLoadingSkeleton } from '@/components/redesign/PageLoadingSkeleton';
import { getActivity, getActivities, saveRpe } from '@/lib/api';
import { formatPace } from '@/lib/formatters';
import { computeWeeklyKm } from '@/lib/weeklyKm';
import { useUser } from '@/hooks/useUser';
import { useProgressStream } from '@/hooks/useProgressStream';
import type { Activity, ApiError } from '@/types/api';

// ---------------------------------------------------------------------------
// Analysis stream types
// ---------------------------------------------------------------------------

interface AnalysisStreamComplete {
  analysis: string;
  verdict_short: string | null;
  verdict_tag: string | null;
  tone: string | null;
}

const ANALYSIS_STEPS = [
  'Pulling your splits',
  'Reading the zones',
  'Checking your history',
  'Writing the dispatch',
  'Filing the verdict',
]

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
  const [streamedAnalysis, setStreamedAnalysis] = useState<AnalysisStreamComplete | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [rpeSaveState, setRpeSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const { user } = useUser();

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

  const onAnalysisComplete = useCallback(
    (data: AnalysisStreamComplete) => {
      setStreamedAnalysis(data);
      setAnalysisError(null);
      queryClient.invalidateQueries({ queryKey: ['activity', id] });
    },
    [queryClient, id],
  );

  const onAnalysisError = useCallback((message: string) => {
    setAnalysisError(message);
  }, []);

  const {
    steps: analysisSteps,
    elapsedMs: analysisElapsedMs,
    isStreaming: analysisStreaming,
    streamedText: analysisStreamedText,
    trigger: triggerAnalysis,
  } = useProgressStream<AnalysisStreamComplete>({
    url: `${apiBase}/activities/${id}/analyze`,
    method: 'POST',
    stepLabels: ANALYSIS_STEPS,
    onComplete: onAnalysisComplete,
    onError: onAnalysisError,
  });

  const handleAnalyze = useCallback(() => {
    setAnalysisError(null);
    triggerAnalysis();
  }, [triggerAnalysis]);

  async function handleRpeChange(rpe: number | null): Promise<void> {
    setRpeSaveState('saving');
    try {
      await saveRpe(id, rpe);
      await queryClient.invalidateQueries({ queryKey: ['activity', id] });
      setRpeSaveState('saved');
      setTimeout(() => setRpeSaveState('idle'), 1500);
    } catch {
      setRpeSaveState('idle');
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

  // Merge streamedAnalysis optimistic data into activity for immediate display
  const effectiveActivity = streamedAnalysis !== null && !activity.analysis
    ? {
        ...activity,
        analysis: streamedAnalysis.analysis,
        verdict_short: streamedAnalysis.verdict_short ?? activity.verdict_short,
        verdict_tag: streamedAnalysis.verdict_tag ?? activity.verdict_tag,
        tone: streamedAnalysis.tone ?? activity.tone,
      }
    : activity;

  return (
    <Dispatch
      activity={effectiveActivity}
      weeklyKm={weeklyKm}
      splits={splits}
      userMaxHr={user?.max_hr ?? user?.max_hr_observed ?? null}
      userRhr={user?.resting_hr ?? null}
      onBack={() => router.push('/activities')}
      onAnalyze={handleAnalyze}
      isAnalyzing={analysisStreaming}
      analysisSteps={analysisSteps}
      analysisElapsedMs={analysisElapsedMs}
      analysisStreamedText={analysisStreamedText}
      analysisError={analysisError}
      rpe={activity?.rpe ?? null}
      onRpeChange={handleRpeChange}
      rpeSaveState={rpeSaveState}
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
