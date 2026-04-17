import { create } from 'zustand'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatStore {
  messages: ChatMessage[]
  isStreaming: boolean
  addMessage: (message: ChatMessage) => void
  appendToLastAssistant: (chunk: string) => void
  setStreaming: (streaming: boolean) => void
  clear: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  appendToLastAssistant: (chunk) =>
    set((state) => {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant') {
        messages[messages.length - 1] = { ...last, content: last.content + chunk }
      }
      return { messages }
    }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  clear: () => set({ messages: [], isStreaming: false }),
}))
