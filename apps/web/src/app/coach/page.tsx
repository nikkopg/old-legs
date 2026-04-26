// READY FOR QA
// Feature: Coach page — ChatPaper tabloid component (TASK-141)
// What was built: /coach replaced with ChatPaper (tabloid wire-desk design).
//   All SSE streaming logic is unchanged. Store (useChatStore) persists history
//   across navigations. Messages are mapped from store shape to ChatPaper shape
//   (timestamp → createdAt ISO string).
// Edge cases to test:
//   - Streaming response renders token by token with blinking ol-cursor
//   - Ollama offline — error text appears in last assistant message, not a crash
//   - Empty input is not sendable (ChatPaper button disabled when draft is blank)
//   - Composer textarea disabled while streaming
//   - Chat history survives navigating away and back (Zustand store)
//   - Rate limit 429 — error shown in assistant message
//   - Very long response — transcript box scrolls to bottom automatically
//   - onNav routes all five nav keys to correct paths
//   - createdAt present on all messages (uses timestamp.toISOString())

'use client'

import { useRouter } from 'next/navigation'
import { ChatPaper } from '@/components/redesign/ChatPaper'
import { useChatStore } from '@/store/chat'
import { streamChat, deleteChatHistory } from '@/lib/api'
import type { ApiError } from '@/types/api'

export default function CoachPage() {
  const { messages, isStreaming, addMessage, appendToLastAssistant, setStreaming, clear } =
    useChatStore()

  const router = useRouter()

  const mappedMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    createdAt: msg.timestamp.toISOString(),
  }))

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
      if (apiErr?.status === 401) {
        router.replace('/')
        return
      }
      const errorMsg =
        apiErr?.detail ?? 'Pak Har is unavailable right now. Make sure Ollama is running.'
      appendToLastAssistant(errorMsg)
      setStreaming(false)
    }
  }

  async function handleClearSession() {
    try {
      await deleteChatHistory()
    } catch (err) {
      console.error('Failed to clear chat history on server:', err)
    }
    clear()
  }

  function onNav(key: string) {
    const routes: Record<string, string> = {
      dashboard: '/dashboard',
      activities: '/activities',
      plan: '/plan',
      coach: '/coach',
      settings: '/settings',
    }
    if (routes[key]) router.push(routes[key])
  }

  return (
    <ChatPaper
      messages={mappedMessages}
      isStreaming={isStreaming}
      onSend={handleSend}
      onNav={onNav}
      onClearSession={handleClearSession}
    />
  )
}
