"use client";

// READY FOR QA
// Component: SettingsPaper (TASK-142)
// What was built: Full "The Desk" settings page in the tabloid newspaper layout.
//   Renders subscriber record, editor's voice selector, delivery preferences toggles,
//   cancel subscription section, sidebar stats, and colophon.
// Edge cases to test:
//   - stravaAthleteId=null renders '—' in subscriber record
//   - voice='gentle'/'standard'/'unfiltered' shows correct active state (bold border + ✓ On)
//   - onVoiceChange fires with correct VoiceLevel value
//   - onToggleDelivery fires with correct keyof DeliveryPreferences key
//   - toggle knob animates left↔right via marginLeft transition
//   - onDisconnect fires on cancel button click
//   - onNav fires with correct nav key

import React from 'react';
import {
  OL,
  Caps,
  Rule,
  Hairline,
  SectionLabel,
  Paper,
  FooterRail,
  NewspaperChrome,
} from './NewspaperChrome';

// ---------- interfaces ----------

interface UserProfile {
  name: string;
  stravaAthleteId: string | null;
  subscribedSince: string;
  timezone: string;
  preferredUnit: string;
}

interface UserStats {
  editionsReceived: number;
  dispatchesFiled: number;
  weeklyPlans: number;
  lettersExchanged: number;
}

type VoiceLevel = 'gentle' | 'standard' | 'unfiltered';

interface DeliveryPreferences {
  dispatchAfterRun: boolean;
  weeklyPlanMonday: boolean;
  weeklyReviewSunday: boolean;
  missedRunNudge: boolean;
}

interface SettingsPaperProps {
  user: UserProfile;
  stats: UserStats;
  voice: VoiceLevel;
  deliveryPrefs: DeliveryPreferences;
  onVoiceChange: (v: VoiceLevel) => void;
  onToggleDelivery: (key: keyof DeliveryPreferences) => void;
  onDisconnect: () => void;
  onNav: (key: string) => void;
}

// ---------- component ----------

export function SettingsPaper({
  user,
  stats,
  voice,
  deliveryPrefs,
  onVoiceChange,
  onToggleDelivery,
  onDisconnect,
  onNav,
}: SettingsPaperProps) {
  const voiceOptions: Array<{ opt: VoiceLevel; label: string; description: string }> = [
    { opt: 'gentle', label: 'Gentle', description: 'Mentor. Still honest. Less bite.' },
    { opt: 'standard', label: 'Standard', description: 'The default. What you signed up for.' },
    { opt: 'unfiltered', label: 'Unfiltered', description: 'No softening. Ask for it.' },
  ];

  const deliveryRows: Array<{ key: keyof DeliveryPreferences; label: string }> = [
    { key: 'dispatchAfterRun', label: 'Dispatch after every run' },
    { key: 'weeklyPlanMonday', label: 'Weekly plan on Monday 05:00' },
    { key: 'weeklyReviewSunday', label: 'Weekly review on Sunday 20:00' },
    { key: 'missedRunNudge', label: 'Missed-run nudge (gentle)' },
  ];

  const statsRows: Array<{ value: number; label: string }> = [
    { value: stats.editionsReceived, label: 'editions received' },
    { value: stats.dispatchesFiled, label: 'dispatches filed' },
    { value: stats.weeklyPlans, label: 'weekly plans' },
    { value: stats.lettersExchanged, label: 'letters exchanged' },
  ];

  return (
    <Paper width={980}>
      <NewspaperChrome
        section="The Desk · Subscriber Controls"
        big={false}
        nav={[
          { key: 'dashboard', label: 'Front Page' },
          { key: 'activities', label: 'Dispatches' },
          { key: 'plan', label: 'Plan' },
          { key: 'coach', label: 'Letters' },
          { key: 'settings', label: 'Desk' },
        ]}
        activeNav="settings"
        onNav={onNav}
      />

      {/* Page heading */}
      <div style={{ marginTop: 18 }}>
        <Caps size={10} ls={3}>Subscriber Account</Caps>
        <h1 style={{
          fontFamily: OL.display,
          fontWeight: 400,
          fontSize: 52,
          lineHeight: 0.95,
          letterSpacing: -0.7,
          margin: '6px 0 6px',
        }}>
          The Desk.
        </h1>
        <p style={{
          fontFamily: OL.body,
          fontSize: 13.5,
          lineHeight: 1.55,
          margin: 0,
          maxWidth: 560,
        }}>
          Adjust your subscription. Change what Pak Har sees. Cancel the paper — no hard feelings.
        </p>
      </div>

      {/* 2-col layout */}
      <div style={{
        marginTop: 22,
        display: 'grid',
        gridTemplateColumns: '1fr 280px',
        gap: 28,
        alignItems: 'start',
      }}>
        {/* Main column */}
        <div>
          <Rule thick />

          {/* Section 1 — Subscriber Record */}
          <section style={{ padding: '14px 0', borderBottom: `1px solid ${OL.ink}` }}>
            <SectionLabel right="read-only">Subscriber Record</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {([
                ['Name', user.name],
                ['Subscribed', user.subscribedSince],
                ['Editions received', String(stats.editionsReceived)],
                ['Strava athlete', `ID ${user.stravaAthleteId ?? '—'}`],
                ['Timezone', user.timezone],
                ['Preferred unit', user.preferredUnit],
              ] as Array<[string, string]>).map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    borderLeft: `1px solid rgba(20,18,16,0.3)`,
                    paddingLeft: 10,
                  }}
                >
                  <Caps size={8} ls={2} opacity={0.6}>{label}</Caps>
                  <div style={{ fontFamily: OL.mono, fontSize: 13, marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 2 — Editor's Voice */}
          <section style={{ padding: '14px 0', borderBottom: `1px solid ${OL.ink}` }}>
            <SectionLabel>Editor&apos;s Voice</SectionLabel>
            <p style={{
              fontFamily: OL.body,
              fontSize: 13,
              lineHeight: 1.6,
              color: OL.muted,
              maxWidth: 560,
              margin: '0 0 10px',
            }}>
              How hard Pak Har pushes in his dispatches. Not a personality change — a volume knob.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {voiceOptions.map(({ opt, label, description }) => {
                const active = voice === opt;
                return (
                  <div
                    key={opt}
                    onClick={() => onVoiceChange(opt)}
                    style={{
                      border: `${active ? 3 : 1}px solid ${OL.ink}`,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: active ? 'rgba(20,18,16,0.03)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Caps size={10} ls={2} weight={800}>{label}</Caps>
                      {active && (
                        <Caps
                          size={9}
                          ls={2}
                          opacity={1}
                          weight={800}
                          style={{ color: OL.accent }}
                        >
                          ✓ On
                        </Caps>
                      )}
                    </div>
                    <p style={{
                      fontFamily: OL.body,
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: OL.muted,
                      margin: '6px 0 0',
                    }}>
                      {description}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 3 — Delivery Preferences */}
          <section style={{ padding: '14px 0', borderBottom: `1px solid ${OL.ink}` }}>
            <SectionLabel>Delivery Preferences</SectionLabel>
            {deliveryRows.map(({ key, label }) => {
              const on = deliveryPrefs[key];
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: `1px dotted rgba(20,18,16,0.3)`,
                  }}
                >
                  <span style={{ fontFamily: OL.body, fontSize: 13 }}>{label}</span>
                  <span
                    onClick={() => onToggleDelivery(key)}
                    style={{
                      display: 'inline-block',
                      width: 44,
                      height: 20,
                      border: `1px solid ${OL.ink}`,
                      padding: 2,
                      background: on ? OL.ink : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      display: 'block',
                      width: 14,
                      height: 14,
                      background: on ? OL.paper : OL.ink,
                      marginLeft: on ? 22 : 0,
                      transition: 'margin 0.15s',
                    }} />
                  </span>
                </div>
              );
            })}
          </section>

          {/* Section 4 — Cancel the Subscription */}
          <section style={{ padding: '14px 0' }}>
            <SectionLabel>Cancel the Subscription</SectionLabel>
            <p style={{
              fontFamily: OL.body,
              fontSize: 13,
              lineHeight: 1.6,
              margin: '0 0 12px',
              maxWidth: 560,
            }}>
              Disconnect Strava and delete your data. No farewell edition. No retention dance. You come back, you come back.
            </p>
            <button
              onClick={onDisconnect}
              style={{
                background: 'transparent',
                color: OL.accent,
                border: `1px solid ${OL.accent}`,
                padding: '10px 20px',
                fontFamily: OL.sans,
                fontSize: 11,
                letterSpacing: 3,
                fontWeight: 700,
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Cancel Subscription →
            </button>
          </section>
        </div>

        {/* Right sidebar */}
        <aside style={{ borderLeft: `1px solid ${OL.ink}`, paddingLeft: 20 }}>
          <Caps size={10} ls={3}>The Paper in Numbers</Caps>
          <Hairline gap={6} />
          {statsRows.map(({ value, label }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '6px 0',
                borderBottom: `1px dotted rgba(20,18,16,0.3)`,
              }}
            >
              <span style={{ fontFamily: OL.mono, fontSize: 22, fontWeight: 700 }}>
                {value}
              </span>
              <Caps size={9} ls={2} opacity={0.6}>{label}</Caps>
            </div>
          ))}

          <div style={{ marginTop: 18 }}>
            <Caps size={10} ls={3}>Colophon</Caps>
            <Hairline gap={6} />
            <p style={{
              fontFamily: OL.body,
              fontSize: 12,
              lineHeight: 1.6,
              color: OL.muted,
              margin: '6px 0 0',
            }}>
              Old Legs Daily is typeset in Abril Fatface and Lora. Dispatches are printed by an editor named Pak Har. Built in Jakarta, 2026.
            </p>
          </div>
        </aside>
      </div>

      <FooterRail
        left="The Desk · Senayan"
        center="Page 4 · Controls"
        right="— back to the Front Page —"
      />
    </Paper>
  );
}
