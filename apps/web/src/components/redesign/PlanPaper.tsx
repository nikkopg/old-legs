"use client";

// READY FOR QA
// Component: PlanPaper (TASK-138, updated TASK-148, TASK-189, TASK-201-F2/F3)
// What was built: Tabloid weekly plan layout — fixtures table, editor's note, key/corrections.
//   Uses NewspaperChrome chrome, Paper wrapper, and all shared primitives.
//   TASK-189: replaced isGenerating boolean with isStreaming+steps+elapsedMs from useProgressStream.
//   TASK-201-F2: dynamic button label (File this/next week's plan) + pre-generate caption from nextTarget.reason
//   TASK-201-F3: section label "Next Edition" when isNextWeek=true; today-row suppressed for future week
// Edge cases to test:
//   - plan=null + isStreaming=false shows "no plan" state with generate button
//   - plan=null + isStreaming=true shows inline SSE progress strip (5 steps, elapsed timer)
//   - streamError non-null shows inline error in accent + retry link
//   - todayDow correctly highlights one row with accent border + "Today" label
//   - isNextWeek=true: no today accent row on any day; section label shows "Next Edition"
//   - nextTarget reason="weekend": caption shows "It's the weekend. This plan runs from..."
//   - nextTarget reason="already_ran_this_week": caption shows "You've already trained this week..."
//   - nextTarget reason="current_week": caption shows date range only
//   - nextTarget=undefined: button shows "File this week's plan", no caption
//   - Rest rows are dimmed (opacity 0.55) and arrow col is transparent
//   - Last table row gets 3px bottom border; others get 1px dotted
//   - Totals row derives run/rest counts and peak day label from plan.days
//   - editorNote split on \n\n renders each paragraph separately; first para gets drop cap
//   - Header h1 derives copy from run-day count (5 runs → special copy, else generic)
//   - REALIZATION cell: shows actual distance+duration if activity matched; "—" if not
//   - REST day where user ran anyway: data shown with small "RAN" caps label in accent
//   - INSTRUCTION/VERDICT: shows verdictShort+ToneBadge when realization exists, else notes

import React from 'react';
import {
  OL,
  Caps,
  Rule,
  Hairline,
  Paper,
  FooterRail,
  NewspaperChrome,
  ToneBadge,
} from './NewspaperChrome';
import type { ProgressStep } from '@/hooks/useProgressStream';
import type { PlanNextTarget } from '@/types/api';

// ---------- local type alias ----------

type ToneBadgeTone = 'critical' | 'good' | 'neutral';

// ---------- interfaces ----------

interface PlanDay {
  day: string;
  date: string;
  isoDate: string;       // YYYY-MM-DD for realization matching
  type: string;
  target: string;        // real data from backend (TASK-147)
  durationMin: string;
  notes: string;
}

interface ActivityMatch {
  activityId: number;
  distanceKm: number;
  durationMin: number;
  verdictShort: string | null;
  verdictTag: string | null;
  tone: 'critical' | 'good' | 'neutral' | null;
}

interface TrainingPlan {
  days: PlanDay[];
  weekLabel: string;
  dateRange: string;
  editorNote: string;
  filedAt: string;
}

interface PlanVerdictResult {
  verdict_short: string | null;
  verdict_tag: string | null;
  tone: string | null;
}

interface PlanPaperProps {
  plan: TrainingPlan | null;
  /** Replaces the old isGenerating boolean — true while the SSE stream is open. */
  isStreaming: boolean;
  /** Step labels + statuses from useProgressStream. */
  steps: ProgressStep[];
  /** Elapsed milliseconds since the stream started. */
  elapsedMs: number;
  /** Non-null when the stream emitted an error event. */
  streamError?: string | null;
  onGeneratePlan: () => void;
  onOpenCoach: () => void;
  onNav: (key: string) => void;
  todayDow: string;
  realizations: Record<string, ActivityMatch | null>;
  planVerdicts?: Record<string, PlanVerdictResult | null>;
  /** Metadata from GET /plan/next-target — drives button label, caption, section header. */
  nextTarget?: PlanNextTarget | null;
  /** True when the resolved target week is next week (not the current week). */
  isNextWeek?: boolean;
  /** Watch sync props */
  onSyncToWatch?: () => void;
  syncState?: 'idle' | 'syncing' | 'done' | 'error';
  syncResults?: Record<string, string>;
  hasConnectedWatch?: boolean;
}

// ---------- helpers ----------

function typeTone(t: string): 'critical' | 'good' | 'neutral' {
  if (t === 'Tempo' || t === 'Long' || t === 'Interval') return 'critical';
  if (t === 'Easy' || t === 'Strides') return 'good';
  return 'neutral';
}

function deriveTotals(days: PlanDay[]): { totalMin: number; runCount: number; restCount: number; peakDay: string } {
  let totalMin = 0;
  let runCount = 0;
  let restCount = 0;
  let peakMin = 0;
  let peakDay = '';

  for (const d of days) {
    const min = parseInt(d.durationMin) || 0;
    totalMin += min;
    if (d.type === 'Rest') {
      restCount += 1;
    } else {
      runCount += 1;
      if (min > peakMin) {
        peakMin = min;
        peakDay = d.day;
      }
    }
  }

  return { totalMin, runCount, restCount, peakDay };
}

function deriveH1(runCount: number): string {
  if (runCount === 5) {
    return 'Seven days. Five runs.\nOne rest. No debates.';
  }
  return 'Seven days. The plan is filed.';
}

// ---------- component ----------

// ---------- helpers: date formatting for next-target preview ----------

function formatWeekRange(mondayIso: string): string {
  const mon = new Date(mondayIso + 'T00:00:00')
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(mon)} – ${fmt(sun)}`
}

function isoDatePlusDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function PlanPaper({
  plan,
  isStreaming,
  steps,
  elapsedMs,
  streamError,
  onGeneratePlan,
  onOpenCoach,
  onNav,
  todayDow,
  realizations,
  planVerdicts,
  nextTarget,
  isNextWeek = false,
  onSyncToWatch,
  syncState = 'idle',
  syncResults = {},
  hasConnectedWatch = false,
}: PlanPaperProps) {
  const nav = [
    { key: 'dashboard', label: 'Front Page' },
    { key: 'activities', label: 'Dispatches' },
    { key: 'plan', label: 'Plan' },
    { key: 'coach', label: 'Letters' },
    { key: 'settings', label: 'Desk' },
  ];

  const totals = plan ? deriveTotals(plan.days) : null;

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Section label: use plan dateRange when plan exists, else derive from nextTarget
  const sectionDateRange = plan?.dateRange
    ?? (nextTarget ? formatWeekRange(nextTarget.week_start_date) : '—')
  const sectionLabel = isNextWeek
    ? `Next Edition · Week of ${sectionDateRange}`
    : `Fixtures · Week of ${sectionDateRange}`

  // Generate button label
  const generateButtonLabel = isNextWeek ? "File next week's plan" : "File this week's plan"

  // Pre-generation caption derived from nextTarget.reason
  let preGenerateCaption: string | null = null
  if (nextTarget) {
    const monDate = isoDatePlusDays(nextTarget.week_start_date, 0)
    const sunDate = isoDatePlusDays(nextTarget.week_start_date, 6)
    if (nextTarget.reason === 'weekend') {
      preGenerateCaption = `It's the weekend. This plan runs from ${monDate}.`
    } else if (nextTarget.reason === 'already_ran_this_week') {
      preGenerateCaption = `You've already trained this week. Plan starts ${monDate}.`
    } else {
      preGenerateCaption = `Week of ${monDate} – ${sunDate}.`
    }
  }

  return (
    <Paper width={980} screenLabel="03 Plan">
      <NewspaperChrome
        section={sectionLabel}
        big={false}
        nav={nav}
        activeNav="plan"
        onNav={onNav}
      />

      {/* ---- No plan / generating / error states ---- */}
      {!plan && (
        <div style={{ marginTop: 40 }}>
          {isStreaming ? (
            /* Inline SSE progress strip */
            <div
              className="ol-paper-drop"
              style={{
                border: `1px solid ${OL.ink}`,
                padding: '12px 14px 0',
                fontFamily: OL.mono,
                position: 'relative',
              }}
            >
              {/* Elapsed time top-right */}
              <span
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 14,
                  fontFamily: OL.mono,
                  fontSize: 11,
                  color: OL.muted,
                }}
              >
                {String(Math.floor(elapsedMs / 60000)).padStart(1, '0')}:
                {String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')}
              </span>
              {steps.map((s) => (
                <div
                  key={s.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 4,
                    fontSize: 12,
                    color: s.status === 'pending' ? OL.muted : OL.ink,
                  }}
                >
                  <span
                    key={s.status}
                    className={s.status === 'done' ? 'ol-check-pop' : undefined}
                    style={{ width: 12, display: 'inline-block', textAlign: 'center' }}
                  >
                    {s.status === 'done' ? '✓' : s.status === 'running' ? '›' : '·'}
                  </span>
                  <span
                    key={s.label + s.status}
                    className={s.status === 'running' ? 'ol-tw-line' : undefined}
                    style={{
                      opacity: s.status === 'running' ? 0 : 1,
                    }}
                  >
                    {s.label}
                    {s.status === 'running' && <span className="ol-cursor" />}
                  </span>
                </div>
              ))}
              {/* Progress bar — grows as steps complete */}
              {(() => {
                const total = steps.length;
                const done = steps.filter(s => s.status === 'done').length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <div style={{ margin: '10px -14px 0', height: 3, background: 'var(--color-hairline)' }}>
                    <div
                      className="ol-weekly-fill"
                      style={{
                        height: '100%',
                        background: OL.accent,
                        ['--ol-fill-target' as string]: `${pct}%`,
                      }}
                    />
                  </div>
                );
              })()}
            </div>
          ) : streamError ? (
            /* Inline error state */
            <div style={{ textAlign: 'center' }}>
              <p
                style={{
                  fontFamily: OL.body,
                  fontSize: 14,
                  color: OL.accent,
                  margin: '0 0 12px',
                }}
              >
                {streamError}
              </p>
              <button
                onClick={onGeneratePlan}
                style={{
                  fontFamily: OL.sans,
                  fontSize: 11,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  background: 'transparent',
                  border: `1px solid ${OL.accent}`,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  color: OL.accent,
                  borderRadius: 0,
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            /* Default no-plan state */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <p
                style={{
                  fontFamily: OL.body,
                  fontSize: 16,
                  fontStyle: 'italic',
                  color: OL.muted,
                  margin: 0,
                }}
              >
                No plan yet. Pak Har will build one when he&apos;s seen enough of your runs.
              </p>
              <button
                onClick={onGeneratePlan}
                style={{
                  fontFamily: OL.sans,
                  fontSize: 11,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  background: OL.ink,
                  border: 'none',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  color: OL.paper,
                  borderRadius: 0,
                }}
              >
                {generateButtonLabel}
              </button>
              {preGenerateCaption && (
                <span
                  style={{
                    fontFamily: OL.mono,
                    fontSize: 11,
                    color: OL.muted,
                    opacity: 0.6,
                  }}
                >
                  {preGenerateCaption}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- Plan content ---- */}
      {plan && totals && (
        <div
          key={plan.filedAt}
          style={{
            opacity: isStreaming ? 0.35 : 1,
            transition: 'opacity 400ms ease',
          }}
        >
          {/* Heading */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 260px',
              gap: 28,
              marginTop: 14,
              alignItems: 'end',
            }}
          >
            {/* Left: week label + h1 + tagline */}
            <div>
              <Caps size={10} ls={3}>The Fixtures · {plan.weekLabel}</Caps>
              <h1
                className="ol-masthead-settle"
                style={{
                  fontFamily: OL.display,
                  fontWeight: 400,
                  fontSize: 56,
                  lineHeight: 0.95,
                  letterSpacing: -0.8,
                  margin: '6px 0 6px',
                }}
              >
                {deriveH1(totals.runCount).split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <br />}
                    {line}
                  </React.Fragment>
                ))}
              </h1>
              <p
                className="ol-fade-up"
                style={{
                  fontFamily: OL.body,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  margin: 0,
                  maxWidth: 560,
                  animationDelay: '240ms',
                }}
              >
                Pak Har files Monday at dawn. The week is not a suggestion. You may re-arrange within it — you may not subtract from it.
              </p>
            </div>

            {/* Right: Week At A Glance */}
            <div
              className="ol-paper-drop"
              style={{
                border: `3px solid ${OL.ink}`,
                padding: '12px 14px',
                background: 'var(--color-paper-soft)',
                animationDelay: '120ms',
              }}
            >
              <Caps size={9} ls={3} opacity={0.7}>Week At A Glance</Caps>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 14px',
                  marginTop: 6,
                }}
              >
                {([
                  ['Runs', String(totals.runCount)],
                  ['Rest', String(totals.restCount)],
                  ['Minutes', String(totals.totalMin)],
                ] as [string, string][]).map(([label, value], statIdx) => (
                  <div key={label} className="ol-fade-up" style={{ animationDelay: `${280 + statIdx * 60}ms` }}>
                    <Caps size={8} ls={2} opacity={0.6}>{label}</Caps>
                    <div
                      style={{
                        fontFamily: OL.mono,
                        fontSize: 22,
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Fixtures table */}
          <div style={{ marginTop: 22 }}>
            <Rule thick className="ol-rail-stretch" />

            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 92px 1fr 160px 160px 2fr',
                gap: 14,
                padding: '8px 4px',
                borderBottom: `1px solid ${OL.ink}`,
              }}
            >
              {['Day', 'Date', 'Session', 'Target', 'Realization', 'Instruction / Verdict'].map(
                (col) => (
                  <Caps key={col} size={9} ls={2} opacity={0.7}>
                    {col}
                  </Caps>
                )
              )}
              <span />
            </div>

            {/* Data rows */}
            {plan.days.map((d, i) => {
              // Suppress today treatment for future-week plans
              const isToday = !isNextWeek && d.day === todayDow;
              const isRest = d.type === 'Rest';
              const isLast = i === plan.days.length - 1;
              const match: ActivityMatch | null = realizations[d.isoDate] ?? null;

              return (
                <div
                  key={d.day}
                  className="ol-fade-up"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 92px 1fr 160px 160px 2fr',
                    gap: 14,
                    padding: '14px 4px',
                    paddingLeft: isToday ? 8 : 4,
                    alignItems: 'start',
                    borderBottom: isLast
                      ? `3px solid ${OL.ink}`
                      : `1px dotted var(--color-hairline)`,
                    borderLeft: isToday ? `3px solid ${OL.accent}` : '3px solid transparent',
                    background: isToday ? 'var(--color-accent-soft)' : 'transparent',
                    opacity: isRest ? 0.55 : 1,
                    animationDelay: `${i * 45}ms`,
                  }}
                >
                  {/* Col 1: Day */}
                  <div>
                    <div
                      style={{
                        fontFamily: OL.display,
                        fontSize: 28,
                        lineHeight: 1,
                      }}
                    >
                      {d.day}
                    </div>
                    {isToday && (
                      <Caps
                        size={8}
                        ls={2}
                        opacity={1}
                        weight={800}
                        style={{
                          color: OL.accent,
                          marginTop: 2,
                          display: 'inline-block',
                        }}
                      >
                        Today
                      </Caps>
                    )}
                  </div>

                  {/* Col 2: Date */}
                  <div
                    style={{
                      fontFamily: OL.mono,
                      fontSize: 13,
                      paddingTop: 6,
                    }}
                  >
                    {d.date}
                  </div>

                  {/* Col 3: Session */}
                  <div style={{ paddingTop: 4 }}>
                    <ToneBadge tone={typeTone(d.type)}>{d.type}</ToneBadge>
                    {!isRest && d.type === 'Tempo' && (
                      <div
                        style={{
                          fontFamily: OL.body,
                          fontSize: 11,
                          fontStyle: 'italic',
                          color: OL.muted,
                          marginTop: 4,
                        }}
                      >
                        Hard. Controlled.
                      </div>
                    )}
                    {!isRest && d.type === 'Long' && (
                      <div
                        style={{
                          fontFamily: OL.body,
                          fontSize: 11,
                          fontStyle: 'italic',
                          color: OL.muted,
                          marginTop: 4,
                        }}
                      >
                        Duration over pace.
                      </div>
                    )}
                  </div>

                  {/* Col 4: Target */}
                  <div
                    style={{
                      fontFamily: OL.mono,
                      fontSize: 13,
                      paddingTop: 6,
                    }}
                  >
                    {d.target || '—'}
                  </div>

                  {/* Col 5: Realization */}
                  <div style={{ paddingTop: 6 }}>
                    {match ? (
                      <>
                        {isRest && (
                          <Caps
                            size={8}
                            ls={2}
                            opacity={1}
                            style={{
                              color: OL.accent,
                              display: 'block',
                              marginBottom: 3,
                            }}
                          >
                            Ran
                          </Caps>
                        )}
                        <div
                          style={{
                            fontFamily: OL.mono,
                            fontSize: 13,
                            fontWeight: 700,
                            lineHeight: 1.2,
                          }}
                        >
                          {match.distanceKm.toFixed(1)} km
                        </div>
                        <div
                          style={{
                            fontFamily: OL.mono,
                            fontSize: 11,
                            color: OL.muted,
                            lineHeight: 1.2,
                            marginTop: 2,
                          }}
                        >
                          {match.durationMin} min
                        </div>
                      </>
                    ) : (
                      <span
                        style={{
                          fontFamily: OL.body,
                          fontSize: 12,
                          fontStyle: 'italic',
                          color: OL.muted,
                        }}
                      >
                        —
                      </span>
                    )}
                  </div>

                  {/* Col 6: Instruction / Verdict */}
                  {(() => {
                    const planVerdict = planVerdicts?.[d.isoDate] ?? null;
                    return (
                      <div
                        style={{
                          fontFamily: OL.body,
                          fontSize: 12.5,
                          lineHeight: 1.55,
                          paddingTop: 4,
                        }}
                      >
                        {planVerdict?.verdict_short ? (
                          <>
                            <div>{planVerdict.verdict_short}</div>
                            {planVerdict.verdict_tag && (
                              <div style={{ marginTop: 4 }}>
                                <ToneBadge tone={(planVerdict.tone ?? 'neutral') as ToneBadgeTone}>
                                  {planVerdict.verdict_tag}
                                </ToneBadge>
                              </div>
                            )}
                          </>
                        ) : match?.verdictShort ? (
                          <>
                            <div>{match.verdictShort}</div>
                            {match.verdictTag && match.tone && (
                              <div style={{ marginTop: 4 }}>
                                <ToneBadge tone={match.tone}>{match.verdictTag}</ToneBadge>
                              </div>
                            )}
                          </>
                        ) : !isRest && !match && d.isoDate < todayIso ? (
                          <>
                            <div style={{ opacity: 0.7 }}>No run logged.</div>
                            <div style={{ marginTop: 4 }}>
                              <ToneBadge tone="critical">NO SHOW</ToneBadge>
                            </div>
                          </>
                        ) : (
                          d.notes
                        )}
                      </div>
                    );
                  })()}

                </div>
              );
            })}
          </div>

          {/* Totals row */}
          {(() => {
            const actualTotalMin = plan.days.reduce((sum, d) => {
              const match = realizations[d.isoDate] ?? null;
              return sum + (match ? match.durationMin : 0);
            }, 0);
            return (
              <div
                className="ol-fade-up"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 92px 1fr 160px 160px 2fr',
                  gap: 14,
                  padding: '10px 4px',
                  background: OL.ink,
                  color: OL.paper,
                  marginTop: -1,
                  animationDelay: '360ms',
                }}
              >
                <span />
                <span />
                <Caps
                  size={9}
                  ls={3}
                  opacity={1}
                  weight={800}
                  style={{ color: OL.paper }}
                >
                  Totals
                </Caps>
                {/* Col 4: TARGET total */}
                <span
                  style={{
                    fontFamily: OL.mono,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {totals.totalMin} min
                </span>
                {/* Col 5: REALIZATION total */}
                <span
                  style={{
                    fontFamily: OL.mono,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {actualTotalMin > 0 ? `${actualTotalMin} min` : '—'}
                </span>
                <Caps
                  size={9}
                  ls={2}
                  opacity={0.8}
                  style={{ color: OL.paper }}
                >
                  {totals.runCount} runs · {totals.restCount} rest · peak {totals.peakDay}
                </Caps>
                <span />
              </div>
            );
          })()}

          {/* Editor's note + key */}
          <div
            style={{
              marginTop: 26,
              display: 'grid',
              gridTemplateColumns: '1.3fr 1fr',
              gap: 28,
              alignItems: 'start',
            }}
          >
            {/* Left: Editor's Note */}
            <div>
              <Caps size={10} ls={3}>Editor&apos;s Note</Caps>
              <Hairline gap={6} />
              {plan.editorNote.split('\n\n').map((para, i) => {
                if (i === 0) {
                  const firstChar = para.charAt(0);
                  const rest = para.slice(1);
                  return (
                    <p
                      key={i}
                      className="ol-tw-line"
                      style={{
                        opacity: 0,
                        fontFamily: OL.body,
                        fontSize: 13.5,
                        lineHeight: 1.6,
                        margin: '8px 0 0',
                        textAlign: 'justify',
                        hyphens: 'auto',
                        animationDelay: `${420 + i * 120}ms`,
                      }}
                    >
                      <span
                        style={{
                          float: 'left',
                          fontFamily: OL.display,
                          fontSize: 42,
                          lineHeight: 0.9,
                          paddingRight: 6,
                          paddingTop: 2,
                        }}
                      >
                        {firstChar}
                      </span>
                      {rest}
                    </p>
                  );
                }
                return (
                  <p
                    key={i}
                    className="ol-tw-line"
                    style={{
                      opacity: 0,
                      fontFamily: OL.body,
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      margin: '8px 0 0',
                      textAlign: 'justify',
                      hyphens: 'auto',
                      animationDelay: `${420 + i * 120}ms`,
                    }}
                  >
                    {para}
                  </p>
                );
              })}
              <Caps
                size={9}
                ls={2}
                opacity={0.65}
                style={{ marginTop: 10, display: 'block' }}
              >
                — Pak Har · Plan filed {plan.filedAt}
              </Caps>
            </div>

            {/* Right: Key + Corrections */}
            <div>
              <Caps size={10} ls={3}>Key</Caps>
              <Hairline gap={6} />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {([
                  ['critical', 'Tempo', 'Hard. Controlled. Quality is the point.'],
                  ['critical', 'Long', 'The honest one. Duration > pace.'],
                  ['good', 'Easy', 'Slow enough to hold a conversation.'],
                  ['good', 'Strides', 'Short, sharp, full recovery.'],
                  ['neutral', 'Rest', 'Walk. Stretch. Eat. Sleep.'],
                ] as [ToneBadgeTone, string, string][]).map(([tone, label, desc]) => (
                  <div
                    key={label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '80px 1fr',
                      gap: 10,
                      alignItems: 'start',
                    }}
                  >
                    <ToneBadge tone={tone}>{label}</ToneBadge>
                    <span
                      style={{
                        fontFamily: OL.body,
                        fontSize: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      {desc}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <Caps size={10} ls={3}>Corrections</Caps>
                <Hairline gap={6} />
                <p
                  style={{
                    fontFamily: OL.body,
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    margin: '6px 0 0',
                  }}
                >
                  See an error in the plan?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenCoach();
                    }}
                    style={{
                      fontFamily: OL.sans,
                      fontSize: 10,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      color: OL.accent,
                      borderBottom: `1px solid ${OL.accent}`,
                      textDecoration: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Write the editor →
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Regenerate + Sync to Watch */}
          <div
            style={{
              marginTop: 26,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              alignItems: 'center',
            }}
          >
            {/* Discoverability link when no watch connected but plan exists */}
            {!hasConnectedWatch && plan && (
              <span style={{ fontFamily: OL.mono, fontSize: 11, color: OL.muted }}>
                <a href="/settings" style={{ color: OL.muted }}>Connect a watch in Settings</a> to sync plans.
              </span>
            )}
            {/* Sync to Watch button + results */}
            {hasConnectedWatch && plan && onSyncToWatch && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
                <button
                  onClick={onSyncToWatch}
                  disabled={syncState === 'syncing'}
                  style={{
                    fontFamily: OL.mono,
                    fontSize: 11,
                    letterSpacing: 2,
                    background: 'transparent',
                    border: `1px solid ${OL.ink}`,
                    padding: '10px 20px',
                    cursor: syncState === 'syncing' ? 'not-allowed' : 'pointer',
                    color: OL.ink,
                    borderRadius: 0,
                  }}
                >
                  {syncState === 'syncing' ? 'Syncing...' : 'Sync to Watch'}
                </button>
                {syncState === 'done' && (
                  <div style={{ fontFamily: OL.mono, fontSize: 12, marginTop: 8, textAlign: 'right' }}>
                    {Object.entries(syncResults).map(([platform, result]) => (
                      <div key={platform} style={{ color: result === 'pushed' ? OL.ink : OL.accent }}>
                        {platform}: {result === 'pushed' ? 'On your watch.' : `✗ ${result}`}
                      </div>
                    ))}
                  </div>
                )}
                {syncState === 'error' && (
                  <div style={{ fontFamily: OL.mono, fontSize: 12, color: OL.accent, marginTop: 8, textAlign: 'right' }}>
                    Sync failed — check Watch Integration in Settings.
                  </div>
                )}
              </div>
            )}
            {isStreaming && (
              /* Compact progress strip when plan already exists and regenerating */
              <div
                className="ol-paper-drop"
                style={{
                  border: `1px solid ${OL.ink}`,
                  padding: '8px 12px',
                  fontFamily: OL.mono,
                  fontSize: 11,
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                  color: OL.muted,
                }}
              >
                {steps.map((s) => (
                  <span key={s.label + s.status} style={{ color: s.status === 'pending' ? OL.muted : OL.ink }}>
                    {s.status === 'done' ? (
                      <span key={s.label + '-done'} className="ol-check-pop" style={{ marginRight: 4 }}>✓</span>
                    ) : (
                      <span className={s.status === 'running' ? 'ol-tw-line' : undefined} style={{ marginRight: 4 }}>
                        {s.status === 'running' ? '›' : '·'}
                      </span>
                    )}
                    {s.label}
                    {s.status === 'running' && <span className="ol-cursor" />}
                  </span>
                ))}
                <span style={{ marginLeft: 8, color: OL.muted }}>
                  {String(Math.floor(elapsedMs / 60000)).padStart(1, '0')}:
                  {String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')}
                </span>
              </div>
            )}
            <button
              onClick={onGeneratePlan}
              disabled={isStreaming}
              style={{
                fontFamily: OL.sans,
                fontSize: 11,
                letterSpacing: 3,
                textTransform: 'uppercase',
                fontWeight: 600,
                background: isStreaming ? 'var(--color-muted-soft)' : OL.ink,
                border: 'none',
                padding: '10px 20px',
                cursor: isStreaming ? 'not-allowed' : 'pointer',
                color: OL.paper,
                borderRadius: 0,
              }}
            >
              {isStreaming ? 'Filing...' : generateButtonLabel}
            </button>
          </div>

          <FooterRail
            left={`Fixtures · filed ${plan.filedAt}`}
            center="Page 2 · Plan"
            right="— continued page 3: Letters to the Editor —"
          />
        </div>
      )}
    </Paper>
  );
}

export default PlanPaper;
