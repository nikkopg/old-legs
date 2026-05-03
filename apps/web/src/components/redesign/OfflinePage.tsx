"use client";

// READY FOR QA
// Component: OfflinePage (TASK-146)
// What was built: Full-page error state shown when the API, Ollama, or Strava is unreachable.
//   Three variants via 'kind' prop: 'api' (503), 'ollama' (502), 'strava' (504).
//   Each variant has distinct headline, deck copy, sub-copy, and status code text.
//   Includes a Retry button and three secondary info columns (Status, Cache, Support).
// Edge cases to test:
//   - All three kind variants render correct copy (head/deck/sub/code)
//   - onRetry fires when Retry button is clicked
//   - onNav fires when nav items are clicked
//   - activeNav is always 'dashboard' regardless of kind

import React from 'react';
import {
  OL,
  Caps,
  Paper,
  FooterRail,
  NewspaperChrome,
} from './NewspaperChrome';

interface OfflinePageProps {
  kind: 'api' | 'ollama' | 'strava';
  onRetry: () => void;
  onNav: (key: string) => void;
}

const copy = {
  api: {
    head: 'The presses are down.',
    deck: 'The office cannot be reached. This is not your fault. Usually not, anyway.',
    sub: 'Try again in a moment. If it persists, check that the server is running.',
    code: '503 · Service Unavailable',
  },
  ollama: {
    head: 'Pak Har is not at his desk.',
    deck: 'The editor is offline. Start him up and he will answer the wire.',
    sub: 'Make sure Ollama is running on the machine the API points to.',
    code: '502 · Bad Gateway',
  },
  strava: {
    head: 'Strava did not answer.',
    deck: 'The wire to Strava is quiet. Their outage, not ours.',
    sub: 'Refresh in a minute or two. Your data is safe.',
    code: '504 · Upstream Timeout',
  },
} as const;

const SECONDARY_INFO: [string, string][] = [
  ['Status', 'All three services checked in 40 seconds ago.'],
  ['Cache', 'Your last successful sync is still on file.'],
  ['Support', 'If this persists, see the Desk section.'],
];

const NAV = [
  { key: 'dashboard', label: 'Front Page' },
  { key: 'activities', label: 'Dispatches' },
  { key: 'plan', label: 'Plan' },
  { key: 'coach', label: 'Letters' },
  { key: 'settings', label: 'Desk' },
];

export function OfflinePage({ kind, onRetry, onNav }: OfflinePageProps) {
  const c = copy[kind];

  return (
    <Paper width={760} screenLabel="06 Offline">
      <NewspaperChrome
        section="Errata"
        big={false}
        nav={NAV}
        activeNav="dashboard"
        onNav={onNav}
      />

      {/* Main error box */}
      <div
        style={{
          marginTop: 28,
          border: `3px solid ${OL.ink}`,
          padding: '28px 32px',
          background: 'var(--color-accent-soft)',
        }}
      >
        <Caps
          size={10}
          ls={4}
          opacity={1}
          weight={800}
          style={{ color: OL.accent }}
        >
          Errata · Notice to Readers
        </Caps>
        <h1
          style={{
            fontFamily: OL.display,
            fontWeight: 400,
            fontSize: 64,
            lineHeight: 0.98,
            letterSpacing: -0.8,
            margin: '10px 0 12px',
          }}
        >
          {c.head}
        </h1>
        <p
          style={{
            fontFamily: OL.body,
            fontSize: 16,
            lineHeight: 1.5,
            margin: '0 0 12px',
            maxWidth: 560,
          }}
        >
          {c.deck}
        </p>
        <p
          style={{
            fontFamily: OL.body,
            fontSize: 13.5,
            lineHeight: 1.6,
            margin: 0,
            maxWidth: 560,
            color: OL.muted,
            fontStyle: 'italic',
          }}
        >
          {c.sub}
        </p>

        <div
          style={{
            marginTop: 22,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            onClick={onRetry}
            style={{
              background: OL.ink,
              color: 'var(--color-ink-on-ink)',
              border: 'none',
              padding: '12px 22px',
              fontFamily: OL.sans,
              fontSize: 11,
              letterSpacing: 3,
              fontWeight: 800,
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Retry →
          </button>
          <div
            style={{
              fontFamily: OL.mono,
              fontSize: 11,
              letterSpacing: 2,
              opacity: 0.55,
            }}
          >
            {c.code}
          </div>
        </div>
      </div>

      {/* Secondary info columns */}
      <div
        style={{
          marginTop: 24,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 20,
        }}
      >
        {SECONDARY_INFO.map(([label, text]) => (
          <div
            key={label}
            style={{ borderTop: `1px solid ${OL.ink}`, paddingTop: 8 }}
          >
            <Caps size={9} ls={3} opacity={0.7}>
              {label}
            </Caps>
            <p
              style={{
                fontFamily: OL.body,
                fontSize: 12.5,
                lineHeight: 1.55,
                margin: '6px 0 0',
              }}
            >
              {text}
            </p>
          </div>
        ))}
      </div>

      <FooterRail
        left="Errata · Senayan"
        center="Special notice"
        right="— regular edition resumes shortly —"
      />
    </Paper>
  );
}
