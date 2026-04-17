// READY FOR QA
// Feature: Pak Har chat page (TASK-022)
// What was built: /coach — full-height chat interface with SSE streaming from /coach/chat
// Edge cases to test:
//   - Streaming response renders token by token with blinking cursor (|)
//   - Ollama offline — error message shown in chat bubble (not a page crash)
//   - Empty input is not sendable (button disabled)
//   - ChatInput disabled while streaming
//   - Chat history persists across page navigations (Zustand store)
//   - Rate limit 429 — error shown in assistant bubble
//   - Very long Pak Har response — page scrolls to bottom

'use client'

import { useEffect, useRef } from 'react'
import { PageWrapper } from '@/components/layout'
import { ChatBubble, ChatInput } from '@/components/coach'
import { useChatStore } from '@/store/chat'
import { streamChat } from '@/lib/api'
import type { ApiError } from '@/types/api'

const PLACEHOLDER_USER_NAME = 'Runner'
const PLACEHOLDER_AVATAR_URL = null

export default function CoachPage() {
  const { messages, isStreaming, addMessage, appendToLastAssistant, setStreaming } =
    useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(text: string) {
    addMessage({ role: 'user', content: text, timestamp: new Date() })
    addMessage({ role: 'assistant', content: '', timestamp: new Date() })
    setStreaming(true)

    try {
      await streamChat(
        text,
        (chunk) => appendToLastAssistant(chunk),
        () => setStreaming(false),
      )
    } catch (err) {
      const apiErr = err as ApiError
      const errorMsg =
        apiErr?.detail ?? 'Pak Har is unavailable right now. Make sure Ollama is running.'
      appendToLastAssistant(errorMsg)
      setStreaming(false)
    }
  }

  return (
    <PageWrapper
      userName={PLACEHOLDER_USER_NAME}
      avatarUrl={PLACEHOLDER_AVATAR_URL}
      pageTitle="Pak Har"
    >
      <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4">
          {messages.length === 0 && (
            <p className="text-sm text-text-muted">Ask Pak Har about your training.</p>
          )}
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1
            const showCursor = isLast && msg.role === 'assistant' && isStreaming
            return (
              <ChatBubble
                key={i}
                role={msg.role}
                message={msg.content + (showCursor ? '|' : '')}
                timestamp={msg.timestamp}
              />
            )
          })}
          <div ref={bottomRef} />
        </div>

        <ChatInput onSend={handleSend} isStreaming={isStreaming} />
      </div>
    </PageWrapper>
  )
}
