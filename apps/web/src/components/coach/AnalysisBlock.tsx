// READY
// Component: AnalysisBlock (TASK-013)
// Displays Pak Har's post-run analysis. Left accent border, plain prose.
// Empty state: "Pak Har hasn't seen this run yet." + "Get his take" button.

import { Button, Spinner } from '@/components/ui'

interface AnalysisBlockProps {
  analysis: string | null
  isLoading: boolean
  onRequest: () => void
  className?: string
}

export function AnalysisBlock({ analysis, isLoading, onRequest, className = '' }: AnalysisBlockProps) {
  if (isLoading) {
    return (
      <div className={`analysis-block flex items-center gap-3 ${className}`}>
        <Spinner size="sm" />
        <span className="text-sm text-text-muted">Pak Har is thinking.</span>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        <p className="text-sm text-text-muted">Pak Har hasn't seen this run yet.</p>
        <Button variant="ghost" size="sm" onClick={onRequest}>
          Get his take
        </Button>
      </div>
    )
  }

  const paragraphs = analysis.split('\n').filter(Boolean)

  return (
    <div className={`analysis-block ${className}`}>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="text-sm text-text-primary leading-relaxed mb-3 last:mb-0">
          {paragraph}
        </p>
      ))}
    </div>
  )
}
