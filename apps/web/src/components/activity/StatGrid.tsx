// READY
// Component: StatGrid (TASK-012)
// Shows 4-5 stats from an Activity in a responsive grid. Monospace numbers.

import type { Activity } from '@/types/api'
import { formatDistance, formatDuration, formatPace } from '@/lib/formatters'

interface StatGridProps {
  activity: Activity
  className?: string
}

interface StatItemProps {
  label: string
  value: string
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-muted uppercase tracking-wide">{label}</span>
      <span className="font-mono text-xl text-text-primary">{value}</span>
    </div>
  )
}

export function StatGrid({ activity, className = '' }: StatGridProps) {
  const stats: StatItemProps[] = [
    { label: 'Distance', value: formatDistance(activity.distance_km) },
    { label: 'Pace', value: `${formatPace(activity.average_pace_min_per_km)} /km` },
    { label: 'Time', value: formatDuration(activity.moving_time_seconds) },
    { label: 'Elevation', value: `${activity.elevation_gain_m} m` },
  ]

  if (activity.average_hr !== null) {
    stats.push({ label: 'Avg HR', value: `${activity.average_hr} bpm` })
  }

  return (
    <div className={`grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 ${className}`}>
      {stats.map((stat) => (
        <StatItem key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </div>
  )
}
