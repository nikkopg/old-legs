"use client";

// READY FOR QA
// Component: PlanPaper (TASK-138, updated TASK-148)
// What was built: Tabloid weekly plan layout — fixtures table, editor's note, key/corrections.
//   Uses NewspaperChrome chrome, Paper wrapper, and all shared primitives.
// Edge cases to test:
//   - plan=null + isGenerating=false shows "no plan" state with generate button
//   - plan=null + isGenerating=true shows "Filing the plan..." with blinking cursor
//   - todayDow correctly highlights one row with accent border + "Today" label
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
  isGenerating: boolean;
  onGeneratePlan: () => void;
  onOpenCoach: () => void;
  onNav: (key: string) => void;
  todayDow: string;
  realizations: Record<string, ActivityMatch | null>;
  planVerdicts?: Record<string, PlanVerdictResult | null>;
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

export function PlanPaper({
  plan,
  isGenerating,
  onGeneratePlan,
  onOpenCoach,
  onNav,
  todayDow,
  realizations,
  planVerdicts,
}: PlanPaperProps) {
  const nav = [
    { key: 'dashboard', label: 'Front Page' },
    { key: 'activities', label: 'Dispatches' },
    { key: 'plan', label: 'Plan' },
    { key: 'coach', label: 'Letters' },
    { key: 'settings', label: 'Desk' },
  ];

  const totals = plan ? deriveTotals(plan.days) : null;

  return (
    <Paper width={980} screenLabel="03 Plan">
      <NewspaperChrome
        section={`Fixtures · Week of ${plan?.dateRange ?? '—'}`}
        big={false}
        nav={nav}
        activeNav="plan"
        onNav={onNav}
      />

      {/* ---- No plan / generating states ---- */}
      {!plan && (
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          {isGenerating ? (
            <p
              style={{
                fontFamily: OL.body,
                fontSize: 16,
                fontStyle: 'italic',
                color: OL.muted,
                margin: 0,
              }}
            >
              Filing the plan
              <span className="ol-cursor" />
            </p>
          ) : (
            <>
              <p
                style={{
                  fontFamily: OL.body,
                  fontSize: 16,
                  fontStyle: 'italic',
                  color: OL.muted,
                  margin: '0 0 20px',
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
                Generate Plan
              </button>
            </>
          )}
        </div>
      )}

      {/* ---- Plan content ---- */}
      {plan && totals && (
        <>
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
                style={{
                  fontFamily: OL.body,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  margin: 0,
                  maxWidth: 560,
                }}
              >
                Pak Har files Monday at dawn. The week is not a suggestion. You may re-arrange within it — you may not subtract from it.
              </p>
            </div>

            {/* Right: Week At A Glance */}
            <div
              style={{
                border: `3px solid ${OL.ink}`,
                padding: '12px 14px',
                background: 'var(--color-paper-soft)',
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
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
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
            <Rule thick />

            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 92px 1fr 160px 160px 2fr 20px',
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
              const isToday = d.day === todayDow;
              const isRest = d.type === 'Rest';
              const isLast = i === plan.days.length - 1;
              const match: ActivityMatch | null = realizations[d.isoDate] ?? null;

              return (
                <div
                  key={d.day}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 92px 1fr 160px 160px 2fr 20px',
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
                        The week&apos;s sharp edge.
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
                        The honest one.
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
                        ) : (
                          d.notes
                        )}
                      </div>
                    );
                  })()}

                  {/* Col 7: Arrow */}
                  <div
                    style={{
                      paddingTop: 6,
                      fontFamily: OL.display,
                      fontSize: 18,
                      color: isRest ? 'transparent' : OL.ink,
                      cursor: isRest ? 'default' : 'pointer',
                    }}
                  >
                    →
                  </div>
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
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 92px 1fr 160px 160px 2fr 20px',
                  gap: 14,
                  padding: '10px 4px',
                  background: OL.ink,
                  color: OL.paper,
                  marginTop: -1,
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
                      style={{
                        fontFamily: OL.body,
                        fontSize: 13.5,
                        lineHeight: 1.6,
                        margin: '8px 0 0',
                        textAlign: 'justify',
                        hyphens: 'auto',
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
                    style={{
                      fontFamily: OL.body,
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      margin: '8px 0 0',
                      textAlign: 'justify',
                      hyphens: 'auto',
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

          {/* Regenerate */}
          <div
            style={{
              marginTop: 26,
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={onGeneratePlan}
              disabled={isGenerating}
              style={{
                fontFamily: OL.sans,
                fontSize: 11,
                letterSpacing: 3,
                textTransform: 'uppercase',
                fontWeight: 600,
                background: isGenerating ? 'var(--color-muted-soft)' : OL.ink,
                border: 'none',
                padding: '10px 20px',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                color: OL.paper,
                borderRadius: 0,
              }}
            >
              {isGenerating ? 'Filing...' : 'Regenerate Plan'}
            </button>
          </div>

          <FooterRail
            left={`Fixtures · filed ${plan.filedAt}`}
            center="Page 2 · Plan"
            right="— continued page 3: Letters to the Editor —"
          />
        </>
      )}
    </Paper>
  );
}

export default PlanPaper;
