'use client'

import Link from 'next/link'
import { Card } from '@/components/ui'
import { formatDate, formatDistance, formatDuration, formatPace } from '@/lib/formatters'
import type { Activity } from '@/types/api'

interface ActivityCardProps {
  activity: Activity
}

export function ActivityCard({ activity }: ActivityCardProps) {
  return (
    <Link href={`/activities/${activity.id}`} className="block">
      <Card hover>
        <div className="flex items-start justify-between gap-4">
          {/* Left: name + date */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-primary truncate">
              {activity.name}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {formatDate(activity.activity_date)}
            </p>
          </div>

          {/* Right: stats in monospace */}
          <div className="font-stats text-right shrink-0">
            <div className="flex gap-4 text-sm text-primary">
              <span>{formatDistance(activity.distance_km)}</span>
              <span>{formatPace(activity.average_pace_min_per_km)} /km</span>
              <span>{formatDuration(activity.moving_time_seconds)}</span>
            </div>
            {activity.average_hr !== null && (
              <p className="text-xs text-muted mt-0.5">
                {activity.average_hr} bpm avg
                {activity.max_hr !== null && ` · ${activity.max_hr} max`}
              </p>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
