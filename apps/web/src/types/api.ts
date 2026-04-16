// API types — filled in TASK-018 once all backend endpoints are finalized

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
