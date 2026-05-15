"use client";

// READY FOR QA
// Component: ThinkingPage (TASK-146 + TASK-200 animation upgrade)
// What was built: Full-page loading state shown while Ollama generates a dispatch or plan.
//   Renders NewspaperChrome with section "Going To Press", a typewriter strip that advances
//   through steps, and a sidebar listing what's coming in this edition.
//
//   TASK-200: Accepts optional `steps` prop (ProgressStep[] from useProgressStream).
//   When provided, the step list is driven by real SSE progress instead of the 900ms timer fallback.
//   Each line uses .ol-tw-line class for the staggered fade-up entrance (animation-delay
//   set inline at i * 150ms). The active step's mono caret blinks via .ol-cursor.
//
//   Two contexts: 'dispatch' (activeNav='activities') and 'plan' (activeNav='plan').
// Edge cases to test:
//   - steps prop provided: drives step display directly (status mapped to pending/running/done)
//   - steps prop omitted: falls back to fake 900ms interval over the context's default labels
//   - Context 'dispatch' shows dispatch sidebar items
//   - Context 'plan' shows plan sidebar items
//   - prefers-reduced-motion: .ol-tw-line animation disabled; lines appear immediately
//   - Step index clamps at steps.length - 1 (never overflows)
//   - Interval is cleared on unmount (no memory leak)
//   - ol-cursor class is applied only to the active/running step
//   - Done steps show opacity 0.55, active=1, queued=0.3

import React, { useState, useEffect } from 'react';
import {
  OL,
  Caps,
  Hairline,
  Paper,
  FooterRail,
  NewspaperChrome,
} from './NewspaperChrome';
import type { ProgressStep } from '@/hooks/useProgressStream';

interface ThinkingPageProps {
  context: 'dispatch' | 'plan';
  onNav: (key: string) => void;
  /** Real progress steps from useProgressStream. If omitted, falls back to a 900ms interval. */
  steps?: ProgressStep[];
}

const DISPATCH_STEPS = [
  'Pulling splits from the wire...',
  'Reading the zones...',
  'Checking last week...',
  'Writing the dispatch...',
];

const PLAN_STEPS = [
  'Reading your last four weeks...',
  'Rounding up the targets...',
  'Drafting Tuesday...',
  'Filing the plan...',
];

const DISPATCH_ITEMS = [
  "Pak Har's verdict — the headline",
  'At-a-glance summary',
  'Pace & HR chart',
  'Split table',
  'HR zones',
  'Last 4 weeks mileage',
  'Prescription for tomorrow',
];

const PLAN_ITEMS = [
  'Seven days, Mon–Sun',
  'One tempo, one long',
  'Two rest days',
  'Targets in bpm',
  "Editor's note for context",
];

const NAV = [
  { key: 'dashboard', label: 'Front Page' },
  { key: 'activities', label: 'Dispatches' },
  { key: 'plan', label: 'Plan' },
  { key: 'coach', label: 'Letters' },
  { key: 'settings', label: 'Desk' },
];

export function ThinkingPage({ context, onNav, steps: realSteps }: ThinkingPageProps) {
  const fallbackLabels = context === 'dispatch' ? DISPATCH_STEPS : PLAN_STEPS;
  const sidebarItems = context === 'dispatch' ? DISPATCH_ITEMS : PLAN_ITEMS;
  const activeNav = context === 'plan' ? 'plan' : 'activities';

  // Fallback timer-driven mode used when no real progress is plumbed through.
  const [fakeIdx, setFakeIdx] = useState(0);
  useEffect(() => {
    if (realSteps && realSteps.length > 0) return;
    const id = setInterval(() => {
      setFakeIdx((i) => Math.min(i + 1, fallbackLabels.length - 1));
    }, 900);
    return () => clearInterval(id);
  }, [realSteps, fallbackLabels.length]);

  // Unified step view — derived from either the real stream or the fake interval.
  type DisplayStep = { label: string; status: 'pending' | 'running' | 'done' };
  const displaySteps: DisplayStep[] = realSteps && realSteps.length > 0
    ? realSteps
    : fallbackLabels.map((label, i) => ({
        label,
        status: i < fakeIdx ? 'done' : i === fakeIdx ? 'running' : 'pending',
      }));

  return (
    <Paper width={760} screenLabel="05 Thinking">
      <NewspaperChrome
        section="Going To Press"
        big={false}
        nav={NAV}
        activeNav={activeNav}
        onNav={onNav}
      />

      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          gap: 28,
          alignItems: 'start',
        }}
      >
        {/* Left column */}
        <div>
          <Caps size={10} ls={3}>Stop Press</Caps>
          <h1
            style={{
              fontFamily: OL.display,
              fontWeight: 400,
              fontSize: 56,
              lineHeight: 0.98,
              letterSpacing: -0.6,
              margin: '6px 0 14px',
            }}
          >
            Pak Har is at the typewriter.
          </h1>

          {/* Typewriter strip */}
          <div
            style={{
              border: `1px solid ${OL.ink}`,
              padding: '14px 16px',
              background: 'var(--color-paper-soft)',
            }}
          >
            {displaySteps.map((step, i) => {
              const active = step.status === 'running';
              const done = step.status === 'done';
              return (
                <div
                  key={step.label}
                  className="ol-tw-line"
                  style={{
                    animationDelay: `${i * 150}ms`,
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr 80px',
                    gap: 10,
                    alignItems: 'center',
                    padding: '6px 0',
                    fontFamily: OL.mono,
                    fontSize: 13,
                    opacity: done ? 0.55 : active ? 1 : 0.3,
                  }}
                >
                  <span
                    style={{
                      fontFamily: OL.display,
                      fontSize: 18,
                      color: active ? OL.accent : OL.ink,
                    }}
                  >
                    {done ? '✓' : active ? '›' : '·'}
                  </span>
                  <span>
                    {step.label}
                    {active && <span className="ol-cursor">_</span>}
                  </span>
                  <Caps size={8} ls={2} opacity={0.55}>
                    {done ? 'filed' : active ? 'writing' : 'queued'}
                  </Caps>
                </div>
              );
            })}
          </div>

          <p
            style={{
              fontFamily: OL.body,
              fontSize: 13.5,
              lineHeight: 1.6,
              margin: '16px 0 0',
              maxWidth: 500,
              color: OL.muted,
              fontStyle: 'italic',
            }}
          >
            This usually takes twenty to forty seconds. If it takes longer, the
            printer is warm — that is all.
          </p>
        </div>

        {/* Right sidebar */}
        <aside style={{ borderLeft: `1px solid ${OL.ink}`, paddingLeft: 18 }}>
          <Caps size={10} ls={3}>Coming in This Edition</Caps>
          <Hairline gap={6} />
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '6px 0 0',
              fontFamily: OL.body,
              fontSize: 12.5,
              lineHeight: 1.7,
            }}
          >
            {sidebarItems.map((item) => (
              <li
                key={item}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '14px 1fr',
                  gap: 6,
                  borderBottom: `1px dotted var(--color-hairline)`,
                  padding: '4px 0',
                }}
              >
                <span style={{ fontFamily: OL.display, fontSize: 13 }}>§</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <FooterRail
        left="The Press · Senayan"
        center="Special edition · going out"
        right="— hold the line —"
      />
    </Paper>
  );
}
