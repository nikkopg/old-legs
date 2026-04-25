"use client";

// READY FOR QA
// Component: ChatPaper (TASK-140)
// What was built: Wire-service teletype coach chat page. Monospace transcript with
//   timestamped messages, left accent bar per message, status strip, composer with
//   "Punch / Send ↵" button, wire desk notes, and useful signals reference.
// Edge cases to test:
//   - Empty messages array renders transcript box with no content (just the gutter tick)
//   - isStreaming=true shows "ON THE LINE" status, disables textarea + button
//   - isStreaming=false shows "OPEN" status, enables textarea + button
//   - Button active only when draft has non-whitespace text and not streaming
//   - Shift+Enter adds newline; Enter alone submits
//   - Scroll-to-bottom fires on every messages update
//   - createdAt omitted → timestamp slot renders empty string (no crash)
//   - Long messages wrap correctly with pre-wrap + break-word
//   - ol-cursor class blink animation requires .ol-cursor definition in globals.css
//     (keyframes + animation: blink 1s step-start infinite). Not yet present — add to globals.css.

import React, { useEffect, useRef, useState } from 'react';
import {
  NewspaperChrome,
  Paper,
  Caps,
  Hairline,
  FooterRail,
  OL,
} from './NewspaperChrome';

// ---------- types ----------

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string; // ISO timestamp, optional
}

export interface ChatPaperProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onNav: (key: string) => void;
}

// ---------- helpers ----------

function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return '';
  }
}

// ---------- TeletypeLine ----------

interface TeletypeLineProps {
  message: ChatMessage;
  isStreamingThisLine: boolean;
}

function TeletypeLine({ message, isStreamingThisLine }: TeletypeLineProps) {
  const isAssistant = message.role === 'assistant';
  const barColor = isAssistant ? OL.accent : OL.ink;
  const textColor = isAssistant ? OL.ink : OL.muted;
  const from = isAssistant ? 'PAK' : 'YOU';
  const role = isAssistant ? 'EDITOR' : 'SUBSCRIBER';
  const ts = formatTimestamp(message.createdAt);

  return (
    <div style={{ marginBottom: 14, paddingLeft: 14, position: 'relative' }}>
      {/* Left accent bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 4,
          bottom: 4,
          width: 3,
          background: barColor,
        }}
      />

      {/* Header row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <span
          style={{
            fontFamily: OL.mono,
            fontSize: 11,
            letterSpacing: 1,
            fontWeight: 700,
          }}
        >
          {ts}
        </span>
        <span
          style={{
            fontFamily: OL.mono,
            fontSize: 11,
            letterSpacing: 3,
            opacity: 0.7,
          }}
        >
          FROM: {from}
        </span>
        <span
          style={{
            flex: 1,
            borderBottom: `1px dotted rgba(20,18,16,0.3)`,
            transform: 'translateY(-4px)',
          }}
        />
        <span
          style={{
            fontFamily: OL.mono,
            fontSize: 10,
            letterSpacing: 2,
            opacity: 0.55,
          }}
        >
          {role}
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          fontFamily: OL.mono,
          fontSize: 13,
          lineHeight: 1.6,
          marginTop: 4,
          color: textColor,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <span style={{ opacity: 0.5 }}>{`> `}</span>
        {message.content}
        {isStreamingThisLine && <span className="ol-cursor">_</span>}
      </div>
    </div>
  );
}

// ---------- ChatPaper ----------

export function ChatPaper({ messages, isStreaming, onSend, onNav }: ChatPaperProps) {
  const [draft, setDraft] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setDraft('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isButtonActive = draft.trim().length > 0 && !isStreaming;

  return (
    <Paper width={760} screenLabel="04 Coach">
      {/* Chrome */}
      <NewspaperChrome
        section="Letters to the Editor · Wire Desk"
        big={false}
        nav={[
          { key: 'dashboard', label: 'Front Page' },
          { key: 'activities', label: 'Dispatches' },
          { key: 'plan', label: 'Plan' },
          { key: 'coach', label: 'Letters' },
          { key: 'settings', label: 'Desk' },
        ]}
        activeNav="coach"
        onNav={onNav}
      />

      {/* Wire status bar */}
      <div style={{ marginTop: 14 }}>
        <Caps size={10} ls={3}>Teletype · Direct to the Editor</Caps>
        <Hairline gap={6} />
        <div
          style={{
            border: `1px solid ${OL.ink}`,
            padding: '10px 14px',
            background: 'rgba(20,18,16,0.02)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Caps size={9} ls={2} opacity={0.7}>
            Wire: OLD-LEGS / PAK-HAR
          </Caps>

          {/* Status indicator */}
          <Caps size={9} ls={2} opacity={isStreaming ? 1 : 0.7}>
            <span
              style={{
                color: isStreaming ? OL.accent : 'inherit',
                fontWeight: isStreaming ? 800 : 600,
              }}
            >
              {isStreaming ? '● ON THE LINE' : '● OPEN'}
            </span>
          </Caps>

          <Caps size={9} ls={2} opacity={0.7}>
            Jakarta · GMT+7
          </Caps>
        </div>
      </div>

      {/* Transcript */}
      <div
        ref={transcriptRef}
        style={{
          background: OL.paper,
          border: `1px solid ${OL.ink}`,
          borderTop: 'none',
          padding: '18px 20px 14px',
          fontFamily: OL.mono,
          fontSize: 13,
          lineHeight: 1.6,
          minHeight: 380,
          maxHeight: 420,
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Gutter tick line */}
        <div
          style={{
            position: 'absolute',
            left: 6,
            top: 12,
            bottom: 12,
            width: 6,
            borderLeft: '1px dashed rgba(20,18,16,0.3)',
          }}
        />

        {messages.map((m, i) => (
          <TeletypeLine
            key={i}
            message={m}
            isStreamingThisLine={
              isStreaming && i === messages.length - 1 && m.role === 'assistant'
            }
          />
        ))}
      </div>

      {/* Composer */}
      <div
        style={{
          border: `1px solid ${OL.ink}`,
          borderTop: 'none',
          padding: '12px 14px',
          display: 'grid',
          gridTemplateColumns: '72px 1fr 100px',
          gap: 10,
          alignItems: 'stretch',
        }}
      >
        {/* Left cell — sender label */}
        <div style={{ alignSelf: 'center' }}>
          <Caps size={9} ls={2} opacity={0.6}>
            Sender
          </Caps>
          <div
            style={{
              fontFamily: OL.mono,
              fontSize: 13,
              fontWeight: 700,
              marginTop: 2,
            }}
          >
            YOU
          </div>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message. Enter to send."
          disabled={isStreaming}
          rows={2}
          style={{
            fontFamily: OL.mono,
            fontSize: 13,
            lineHeight: 1.5,
            padding: 8,
            border: `1px dashed ${OL.ink}`,
            background: 'transparent',
            resize: 'none',
            outline: 'none',
            color: OL.ink,
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!isButtonActive}
          style={{
            background: isButtonActive ? OL.accent : 'transparent',
            color: isButtonActive ? '#fff' : OL.ink,
            border: `1px solid ${isButtonActive ? OL.accent : OL.ink}`,
            fontFamily: OL.sans,
            fontSize: 10,
            letterSpacing: 3,
            fontWeight: 800,
            textTransform: 'uppercase',
            cursor: isButtonActive ? 'pointer' : 'default',
            opacity: isButtonActive ? 1 : 0.5,
            borderRadius: 0,
          }}
        >
          Punch
          <br />
          Send ↵
        </button>
      </div>

      {/* Below transcript — wire desk notes + useful signals */}
      <div
        style={{
          marginTop: 22,
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 28,
          alignItems: 'start',
        }}
      >
        {/* Wire Desk Notes */}
        <div>
          <Caps size={10} ls={3}>Wire Desk Notes</Caps>
          <Hairline gap={6} />
          <p
            style={{
              fontFamily: OL.body,
              fontSize: 12.5,
              lineHeight: 1.6,
              margin: '6px 0 0',
            }}
          >
            The editor reads every message. He replies when he replies. Do not
            send the same question twice — he will notice.
          </p>
          <p
            style={{
              fontFamily: OL.body,
              fontSize: 12.5,
              lineHeight: 1.6,
              margin: '6px 0 0',
            }}
          >
            For post-run analysis, file from the Dispatch page. For the week
            ahead, see the Plan. For everything else, punch send.
          </p>
        </div>

        {/* Useful Signals */}
        <div>
          <Caps size={10} ls={3}>Useful Signals</Caps>
          <Hairline gap={6} />
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 6 }}>
            {(
              [
                ['TRAIN?', 'ask about a specific session'],
                ['PACE?', 'ask about your easy / long / tempo pace'],
                ['REST?', 'tell him you are tired'],
                ['RACE?', 'ask about a goal race'],
              ] as [string, string][]
            ).map(([key, value]) => (
              <li
                key={key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 1fr',
                  gap: 8,
                  borderBottom: '1px dotted rgba(20,18,16,0.3)',
                  padding: '3px 0',
                }}
              >
                <span
                  style={{
                    fontFamily: OL.mono,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {key}
                </span>
                <span
                  style={{
                    fontFamily: OL.body,
                    fontSize: 12,
                    color: OL.muted,
                  }}
                >
                  {value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer */}
      <FooterRail
        left="Wire Desk · Senayan"
        center="Page 3 · Letters"
        right="— replies go out on the hour —"
      />
    </Paper>
  );
}
