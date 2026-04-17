// READY
// Component: PaceChart (TASK-012)
// Placeholder — recharts not installed. Replace when recharts is added to package.json.

import type { Activity } from '@/types/api'

interface PaceChartProps {
  activity: Activity
  className?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PaceChart({ activity, className = '' }: PaceChartProps) {
  return (
    <div className={`text-sm text-text-muted ${className}`}>
      Lap data unavailable.
    </div>
  )
}
