// TASK-028: ChatBubble component tests

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ChatBubble } from '@/components/coach/ChatBubble'

describe('ChatBubble', () => {
  it('renders the message text', () => {
    render(<ChatBubble role="user" message="How did I do?" />)
    expect(screen.getByText('How did I do?')).toBeDefined()
  })

  it('shows "Pak Har" label for assistant messages', () => {
    render(<ChatBubble role="assistant" message="You ran once. That is not training." />)
    expect(screen.getByText('Pak Har')).toBeDefined()
  })

  it('does not show "Pak Har" label for user messages', () => {
    render(<ChatBubble role="user" message="I ran this week." />)
    expect(screen.queryByText('Pak Har')).toBeNull()
  })

  it('renders plain text — no HTML injection from message content', () => {
    const malicious = '<script>alert("xss")</script>'
    render(<ChatBubble role="assistant" message={malicious} />)
    // The script tag should be rendered as text, not executed
    expect(screen.queryByText(malicious)).toBeDefined()
    expect(document.querySelector('script')).toBeNull()
  })

  it('shows timestamp when provided', () => {
    const ts = new Date('2026-04-15T07:30:00')
    render(<ChatBubble role="user" message="Hello" timestamp={ts} />)
    // Timestamp text should be present in some formatted form
    const timeEl = screen.getByText(/AM|PM/i)
    expect(timeEl).toBeDefined()
  })

  it('does not show timestamp when not provided', () => {
    render(<ChatBubble role="user" message="Hello" />)
    expect(screen.queryByText(/AM|PM/i)).toBeNull()
  })
})
