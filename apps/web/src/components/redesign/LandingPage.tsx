"use client";

// READY FOR QA
// Component: LandingPage (TASK-144)
// What was built: Pre-auth landing page. No NewspaperChrome, no nav. The outer container
//   IS the paper (760px, OL.paper bg). Three connectState variants:
//   - 'idle': accent CTA button "Connect Strava →"
//   - 'connecting': inline-block Space Mono text with ol-cursor
//   - 'error': bordered error box with Errata label + retry button
//   Top rail has three Caps items. Bottom rail has thick Rule + two Caps items.
// Edge cases to test:
//   - connectState defaults to 'idle' when not provided
//   - onConnect fires on both the idle button and the error retry button
//   - All three connectState variants render correct UI
//   - No NewspaperChrome, no nav — standalone page

import React from 'react';
import { OL, Caps, Rule } from './NewspaperChrome';

type ConnectState = 'idle' | 'connecting' | 'error';

interface LandingPageProps {
  onConnect: () => void;
  connectState?: ConnectState;
}

export function LandingPage({ onConnect, connectState = 'idle' }: LandingPageProps) {
  return (
    <div
      style={{
        background: OL.paper,
        color: OL.ink,
        fontFamily: OL.body,
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
    <div
      style={{
        width: '100%',
        maxWidth: 760,
        padding: '60px 48px 48px',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}
    >
      {/* Top rail */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <Caps size={10} ls={2} opacity={0.75}>Vol. I · Issue No. 1</Caps>
        <Caps size={10} ls={2} opacity={0.75}>The Runner&apos;s Paper</Caps>
        <Caps size={10} ls={2} opacity={0.75}>Bandung Edition</Caps>
      </div>

      <Rule thick gap={12} />

      {/* Centered content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          padding: '40px 0',
        }}
      >
        {/* Masthead */}
        <div
          style={{
            fontFamily: OL.display,
            fontWeight: 400,
            fontSize: 108,
            letterSpacing: -2,
            lineHeight: 0.9,
            textTransform: 'uppercase',
          }}
        >
          Old Legs
        </div>

        {/* Tagline */}
        <p
          style={{
            fontFamily: OL.sans,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: 4,
            textTransform: 'uppercase',
            lineHeight: 1.8,
            margin: '28px 0 0',
            maxWidth: 540,
          }}
        >
          He&apos;s 70. He&apos;s already lapped you.
          <br />
          <span style={{ color: OL.accent }}>And he has thoughts.</span>
        </p>

        {/* CTA block */}
        <div style={{ marginTop: 40, minWidth: 300 }}>
          {connectState === 'idle' && (
            <button
              onClick={onConnect}
              style={{
                background: OL.accent,
                color: 'var(--color-ink-on-ink)',
                border: 'none',
                padding: '16px 40px',
                fontFamily: OL.sans,
                fontSize: 12,
                letterSpacing: 3,
                fontWeight: 700,
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Connect Strava →
            </button>
          )}

          {connectState === 'connecting' && (
            <div
              style={{
                border: `1px solid ${OL.ink}`,
                padding: '14px 28px',
                display: 'inline-block',
                fontFamily: OL.mono,
                fontSize: 12,
                letterSpacing: 2,
              }}
            >
              Opening Strava<span className="ol-cursor">_</span>
            </div>
          )}

          {connectState === 'error' && (
            <div style={{ maxWidth: 360, margin: '0 auto' }}>
              <div
                style={{
                  border: `1px solid ${OL.accent}`,
                  padding: '10px 14px',
                  background: 'var(--color-accent-soft-2)',
                  textAlign: 'left',
                }}
              >
                <Caps
                  size={9}
                  ls={2}
                  opacity={1}
                  weight={800}
                  style={{ color: OL.accent }}
                >
                  Errata
                </Caps>
                <div
                  style={{
                    fontFamily: OL.body,
                    fontSize: 13,
                    lineHeight: 1.4,
                    marginTop: 4,
                  }}
                >
                  Strava did not answer. Try once more.
                </div>
              </div>
              <button
                onClick={onConnect}
                style={{
                  marginTop: 10,
                  background: OL.ink,
                  color: 'var(--color-ink-on-ink)',
                  border: 'none',
                  padding: '14px 36px',
                  fontFamily: OL.sans,
                  fontSize: 11,
                  letterSpacing: 3,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Retry →
              </button>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Caps size={9} ls={2} opacity={0.55}>
              Read-only access · Free · 1 minute
            </Caps>
          </div>
        </div>
      </div>

      {/* Bottom rail */}
      <Rule thick gap={0} />
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Caps size={9} ls={2} opacity={0.6}>
          Printed at Braga · Bandung
        </Caps>
        <Caps size={9} ls={2} opacity={0.6}>
          — filed daily, rain or otherwise —
        </Caps>
      </div>
    </div>
    </div>
  );
}
