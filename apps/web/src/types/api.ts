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
}

export interface PlanDay {
  day: string
  type: string
  description: string
  duration_minutes: number
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

export interface ApiError {
  detail: string
  status?: number
}
