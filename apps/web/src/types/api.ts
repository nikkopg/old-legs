// READY FOR QA
// Feature: TypeScript API types (TASK-018)
// What was built: Full typed interfaces matching all backend Pydantic schemas
// Edge cases to test:
//   - Activity with no HR data (average_hr, max_hr are null)
//   - Activity with no analysis (analysis, analysis_generated_at are null)
//   - TrainingPlan pak_har_notes values may be null per day
//   - User with no avatar (avatar_url is null)

export interface User {
  id: number
  name: string
  avatar_url: string | null
  strava_athlete_id: string
  created_at: string
  updated_at: string
}

export interface ActivityStreams {
  n: number
  time: number[]
  dist: number[]
  vel: number[]
  hr: number[] | null
  cad: number[] | null
  alt: number[] | null
  grade: number[] | null
  latlng: [number, number][] | null
}

export interface Activity {
  id: number
  user_id: number
  strava_activity_id: string
  name: string
  distance_km: number
  moving_time_seconds: number
  average_pace_min_per_km: number
  average_hr: number | null
  max_hr: number | null
  elevation_gain_m: number
  activity_date: string
  analysis: string | null
  analysis_generated_at: string | null
  sync_status: string
  created_at: string
  updated_at: string
  rpe: number | null
  verdict_short?: string | null
  verdict_tag?: string | null
  tone?: 'critical' | 'good' | 'neutral' | null
  splits: Array<{
    km: number
    moving_time: number
    distance: number
    avg_speed_ms: number
    hr: number | null
    cad: number | null
    elev: number | null
  }> | null
  streams: ActivityStreams | Record<string, never> | null
}

export interface PlanDay {
  day: string
  type: string
  description: string
  duration_minutes: number
  target?: string | null
}

export interface TrainingPlan {
  id: number
  user_id: number
  week_start_date: string
  plan_data: Record<string, PlanDay>
  pak_har_notes: Record<string, string | null>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ActivityListResponse {
  items: Activity[]
  total: number
  page: number
  per_page: number
}

export interface Insights {
  weeks_analyzed: number
  avg_weekly_km: number
  avg_pace_min_per_km: number
  pace_trend: 'improving' | 'declining' | 'stable'
  consistency_pct: number
  pak_har_commentary: string
  generated_at: string
}

export interface WeeklyReview {
  id: number
  user_id: number
  week_start_date: string
  planned_runs: number
  actual_runs: number
  review_text: string
  created_at: string
}

export interface ApiError {
  detail: string
  status?: number
}

export type GoalEvent =
  | 'general_fitness'
  | '5k'
  | '10k'
  | 'half_marathon'
  | 'marathon'
  | 'ultra'

export interface UserProfile {
  id: number
  name: string
  avatar_url: string | null
  strava_athlete_id: string
  onboarding_completed: boolean
  weekly_km_target: number | null
  days_available: number | null
  available_days: string[] | null
  biggest_struggle: string | null
  resting_hr: number | null
  max_hr: number | null
  max_hr_observed: number | null
  total_activities: number
  total_distance_km: number
  weeks_on_plan: number
  goal_event: GoalEvent | null
  race_date: string | null
  auto_plan_enabled: boolean
  auto_review_enabled: boolean
  created_at: string
  updated_at: string
}

export interface OnboardingRequest {
  weekly_km_target: number
  days_available: number
  available_days?: string[] | null
  biggest_struggle: string
  resting_hr?: number | null
  max_hr?: number | null
  goal_event?: GoalEvent | null
  race_date?: string | null
  auto_plan_enabled?: boolean
  auto_review_enabled?: boolean
}

export interface OnboardingResponse {
  message: string
}
