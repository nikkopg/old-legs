// READY
// Component: ChatInput (TASK-013)
// Textarea + Send button. Enter sends, Shift+Enter newlines. Disabled while streaming.

'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui'

interface ChatInputProps {
  onSend: (message: string) => void
  isStreaming: boolean
  className?: string
}

export function ChatInput({ onSend, isStreaming, className = '' }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const trimmed = value.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  return (
    <div className={`flex gap-3 items-end border-t border-border pt-4 ${className}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={isStreaming}
        rows={1}
        placeholder="Ask Pak Har something."
        className={[
          'flex-1 resize-none bg-surface rounded-sm px-4 py-2.5 text-sm text-text-primary',
          'placeholder:text-text-muted border border-border outline-none',
          'focus:border-accent transition-colors overflow-hidden',
          'disabled:opacity-50',
        ].join(' ')}
      />
      <Button
        onClick={handleSend}
        disabled={!value.trim() || isStreaming}
        variant="primary"
        size="md"
      >
        Send
      </Button>
    </div>
  )
}
