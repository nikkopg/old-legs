// READY
// Component: ChatBubble (TASK-013)
// User messages right-aligned, Pak Har messages left-aligned. Plain text only.

interface ChatBubbleProps {
  message: string
  role: 'user' | 'assistant'
  timestamp?: Date
  className?: string
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function ChatBubble({ message, role, timestamp, className = '' }: ChatBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1 ${className}`}>
      {!isUser && (
        <span className="text-xs font-medium text-text-muted">Pak Har</span>
      )}
      <div
        className={[
          'max-w-[80%] rounded-sm px-4 py-3 text-sm leading-relaxed',
          isUser ? 'bg-surface-raised text-text-primary' : 'bg-surface text-text-primary',
        ].join(' ')}
      >
        {message}
      </div>
      {timestamp && (
        <span className="text-xs text-text-muted">{formatTime(timestamp)}</span>
      )}
    </div>
  )
}
