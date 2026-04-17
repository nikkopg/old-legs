// READY
// Component: WeeklyPlanGrid (TASK-014)
// 7-day training plan grid. Today highlighted with accent border.
// Mobile: vertical stack. Desktop: 7 columns.

import { Badge } from '@/components/ui'
import type { PlanDay, TrainingPlan } from '@/types/api'

interface WeeklyPlanGridProps {
  plan: TrainingPlan
  className?: string
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
}

type BadgeVariant = 'success' | 'accent' | 'muted' | 'neutral'
const TYPE_BADGE: Record<string, BadgeVariant> = {
  easy: 'success',
  tempo: 'accent',
  long: 'accent',
  rest: 'muted',
  cross: 'neutral',
}

function DayCard({
  dayName,
  planDay,
  note,
  isToday,
}: {
  dayName: string
  planDay: PlanDay | undefined
  note: string | null | undefined
  isToday: boolean
}) {
  const isRest = !planDay || planDay.type === 'rest'
  const badgeVariant: BadgeVariant = planDay ? (TYPE_BADGE[planDay.type] ?? 'neutral') : 'muted'

  return (
    <div
      className={[
        'flex flex-col gap-2 p-4 rounded-sm bg-surface border',
        isToday ? 'border-accent' : 'border-border',
        isRest ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium ${isToday ? 'text-accent' : 'text-text-muted'}`}>
          {DAY_SHORT[dayName] ?? dayName}
        </span>
        {planDay && (
          <Badge variant={badgeVariant}>{planDay.type}</Badge>
        )}
      </div>

      {planDay && !isRest && (
        <>
          {planDay.duration_minutes > 0 && (
            <span className="font-mono text-sm text-text-primary">
              {planDay.duration_minutes} min
            </span>
          )}
          <p className="text-xs text-text-muted leading-relaxed">{planDay.description}</p>
        </>
      )}

      {note && (
        <p className="text-xs text-text-muted border-l-2 border-accent pl-2 leading-relaxed mt-1">
          {note}
        </p>
      )}
    </div>
  )
}

export function WeeklyPlanGrid({ plan, className = '' }: WeeklyPlanGridProps) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  return (
    <div className={`grid grid-cols-1 md:grid-cols-7 gap-3 ${className}`}>
      {DAY_ORDER.map((dayName) => (
        <DayCard
          key={dayName}
          dayName={dayName}
          planDay={plan.plan_data[dayName]}
          note={plan.pak_har_notes[dayName]}
          isToday={dayName === today}
        />
      ))}
    </div>
  )
}
