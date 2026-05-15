"use client";

// READY FOR QA
// Component: StravaConnectedStamp (TASK-200)
// What was built: Brief success page shown after Strava OAuth completes successfully,
//   before redirecting to /dashboard. ~1.4s hold (340ms stamp land + 360ms shake + 700ms breath).
//   Tabloid styled. Centered headline + bordered "On File" stamp that lands with overshoot,
//   parent shakes one frame after.
//
// Used by: app/auth/connected page (or wherever OAuth success lands client-side)
//
// Edge cases to test:
//   - Reduced motion: stamp shows immediately, no shake, no overshoot
//   - onDone fires once after the animation completes (or immediately under reduced motion)
//   - Subscriber number formats correctly for both small and large IDs

import { useEffect, useRef } from 'react';
import { OL, Caps } from './NewspaperChrome';

interface StravaConnectedStampProps {
  subscriberNumber: string | number;
  date: string;            // e.g. "15 May 2026"
  onDone: () => void;
  /** ms to hold before firing onDone. Default 1400. */
  holdMs?: number;
}

export function StravaConnectedStamp({
  subscriberNumber,
  date,
  onDone,
  holdMs = 1400,
}: StravaConnectedStampProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Trigger the parent shake right after the stamp lands (240ms delay built into CSS).
  // Then fire onDone after the full hold so the user has a beat to read the stamp.
  useEffect(() => {
    if (typeof window === 'undefined') {
      onDone();
      return;
    }
    const prefersReduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t1 = window.setTimeout(() => {
      if (!prefersReduce) stageRef.current?.classList.add('ol-stamp-shake');
    }, 240);
    const t2 = window.setTimeout(() => onDone(), prefersReduce ? 200 : holdMs);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone, holdMs]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-frame)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
      }}
    >
      <div
        ref={stageRef}
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--color-paper)',
          color: 'var(--color-ink)',
          border: `1px solid ${OL.ink}`,
          padding: '40px 32px 36px',
          textAlign: 'center',
          fontFamily: OL.body,
        }}
      >
        <Caps size={10} ls={3} opacity={0.7}>The Office · 06:42 WIB</Caps>

        <h1
          style={{
            fontFamily: OL.display,
            fontSize: 40,
            lineHeight: 1,
            margin: '12px 0 6px',
            letterSpacing: '-0.02em',
          }}
        >
          Welcome to Old Legs.
        </h1>

        <p
          style={{
            fontFamily: OL.body,
            fontSize: 14,
            color: OL.muted,
            margin: '0 0 28px',
          }}
        >
          Strava is connected. Your runs will start filing here.
        </p>

        {/* The stamp */}
        <div
          className="ol-stamp-land"
          style={{
            display: 'inline-block',
            border: `3px solid ${OL.accent}`,
            color: OL.accent,
            padding: '12px 22px',
            fontFamily: OL.sans,
            fontSize: 14,
            letterSpacing: 4,
            fontWeight: 800,
            textTransform: 'uppercase' as const,
          }}
        >
          On File
          <span
            style={{
              display: 'block',
              fontSize: 9,
              letterSpacing: 2,
              fontWeight: 600,
              opacity: 0.85,
              marginTop: 4,
            }}
          >
            Sub. No. {subscriberNumber} · {date}
          </span>
        </div>

        <p
          style={{
            fontFamily: OL.body,
            fontSize: 12,
            color: OL.muted,
            margin: '28px 0 0',
            fontStyle: 'italic',
          }}
        >
          Pak Har will read your last four weeks while you're shown around.
        </p>
      </div>
    </div>
  );
}
