"use client";

// READY FOR QA
// Component: DashboardPaper (TASK-188 — inline SSE progress strip for review generation)
// What was built:
//   - New props: reviewStreaming, reviewSteps, reviewElapsedMs (from useProgressStream)
//   - Removed prop: reviewGenerating (replaced by reviewStreaming)
//   - ReviewProgressStrip sub-component renders while reviewStreaming=true
//     · step list: pending (·, opacity 0.4) / running (›, full opacity, ol-cursor) / done (✓)
//     · elapsed timer top-right (Space Mono 10px, M:SS format)
//     · border 1px solid var(--color-ink), padding 12px 14px, Space Mono font
//   - When reviewStreaming ends and weeklyReview is set → strip unmounts, prose renders
//   - Error state → "Pak Har could not file this week." + "Try again →" calls onGenerateReview
// Previous edge cases (TASK-184) still apply:
//   - weeklyReview != null → "Filed week of X" metadata + review_text paragraphs (split \n\n)
//   - weeklyReview == null → heroHeadline() formula + "No weekly assessment yet" link
//   - weeklyReview.verdict_tag != null → ToneBadge rendered above headline
//   - weeklyReview.headline != null → Abril Fatface 36px headline
// Previous edge cases (TASK-136) still apply:
//   - todayPlan=null shows "No plan filed yet." fallback
//   - lastRun=null shows "No run dispatched yet." fallback
//   - lastRun.avgHr=null shows "—" in Box Score
//   - onOpenRun, onOpenPlan, onNav callbacks fire correctly

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
  ToneBadge,
} from './NewspaperChrome';
import type { WeeklyReview } from '@/types/api';
import type { ProgressStep } from '@/hooks/useProgressStream';
import { useWindowWidth } from '@/hooks/useWindowWidth';

// ---------- interfaces ----------

interface WeeklyStats {
  totalKm: number;
  totalRuns: number;
  totalTimeSec: number;
  plannedRuns: number | null;
}

interface TodayPlan {
  type: string;
  durationMinutes: number;
  targetHr: number;
  description: string;
  date: string;
}

interface LastRun {
  id: number;
  date: string;
  title: string;
  route: string;
  distanceKm: number;
  time: string;
  pace: string;
  avgHr: number | null;
  tone: 'critical' | 'good' | 'neutral';
  verdictTag: string;
  verdictShort: string;
  analysisSnippet: string | null;
}

interface DashboardPaperProps {
  weeklyStats: WeeklyStats;
  todayPlan: TodayPlan | null;
  lastRun: LastRun | null;
  lastSyncedAt: string | null;
  weeklyReview: WeeklyReview | null;
  onGenerateReview: () => void;
  reviewStreaming: boolean;
  reviewStreamedText: string;
  reviewHeadlineStreamedText?: string;
  reviewSteps: ProgressStep[];
  reviewElapsedMs: number;
  reviewError: string | null;
  onOpenRun: (id: number) => void;
  onOpenPlan: () => void;
  onNav: (key: string) => void;
  justOnboarded?: boolean;
}

// ---------- helpers ----------

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s - h * 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function typeTone(type: string): 'critical' | 'good' | 'neutral' {
  if (type === 'tempo' || type === 'long') return 'critical';
  if (type === 'easy' || type === 'strides') return 'good';
  return 'neutral';
}

function weekDateRange(): string {
  const now = new Date();
  // Get Monday of current week
  const day = now.getDay(); // 0 = Sunday
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mon.getDate()}–${sun.getDate()} ${months[sun.getMonth()]}`;
}

function fmtSyncedAt(raw: string | null): string {
  if (!raw) return 'unknown';
  // If it's already a human-readable string, return it
  // Otherwise try to parse as ISO date
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function heroHeadline(stats: WeeklyStats): string {
  const { totalKm, totalRuns } = stats;
  if (totalRuns === 0) return 'No runs filed yet this week.';
  if (totalKm < 5) return 'Week is thin. Pick it up.';
  return `${totalKm.toFixed(1)} km in. ${totalRuns} run${totalRuns === 1 ? '' : 's'} filed.`;
}

function fmtWeekOf(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ---------- ReviewProgressStrip ----------

function fmtElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface ReviewProgressStripProps {
  steps: ProgressStep[];
  elapsedMs: number;
}

function ReviewProgressStrip({ steps, elapsedMs }: ReviewProgressStripProps) {
  return (
    <div
      style={{
        display: 'inline-block',
        marginTop: 10,
        border: `1px solid var(--color-ink)`,
        padding: '12px 14px',
        fontFamily: OL.mono,
        minWidth: 280,
        position: 'relative',
      }}
    >
      {/* Elapsed timer top-right */}
      <span
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          fontSize: 10,
          fontFamily: OL.mono,
          opacity: 0.55,
        }}
      >
        {fmtElapsed(elapsedMs)}
      </span>

      {/* Step list */}
      <div style={{ paddingRight: 40 }}>
        {steps.map((step) => {
          const isPending = step.status === 'pending';
          const isRunning = step.status === 'running';
          const isDone = step.status === 'done';

          const prefix = isDone ? '✓' : isRunning ? '›' : '·';

          return (
            <div
              key={step.label}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
                fontSize: 11,
                lineHeight: 1.7,
                opacity: isPending ? 0.4 : 1,
                color: isDone ? OL.muted : 'inherit',
              }}
            >
              <span style={{ width: 10, flexShrink: 0 }}>{prefix}</span>
              <span>
                {step.label}
                {isRunning && <span className="ol-cursor">_</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- component ----------

function extractStage5Text(raw: string): string {
  const lines = raw.split('\n')
  const cutoff = lines.findIndex(l => l.startsWith('TAG:') || l.startsWith('TONE:'))
  return (cutoff === -1 ? lines : lines.slice(0, cutoff)).join('\n').trim()
}

export function DashboardPaper({
  weeklyStats,
  todayPlan,
  lastRun,
  lastSyncedAt,
  weeklyReview,
  onGenerateReview,
  reviewStreaming,
  reviewStreamedText = '',
  reviewHeadlineStreamedText = '',
  reviewSteps,
  reviewElapsedMs,
  reviewError,
  onOpenRun,
  onOpenPlan,
  onNav,
  justOnboarded = false,
}: DashboardPaperProps) {
  const { totalKm, totalRuns, totalTimeSec, plannedRuns } = weeklyStats;
  const width = useWindowWidth();
  const isMobile = width < 640;

  // Parse lastRun date parts
  const lastRunParts = lastRun ? lastRun.date.split(' ') : [];
  const lastRunDow = lastRunParts[0] ?? '';
  const lastRunDay = lastRunParts[1] ?? '';
  const lastRunMonth = lastRunParts[2] ?? '';

  return (
    <Paper width={980} screenLabel="02 Dashboard">
      <NewspaperChrome
        section="Front Page · Weekly Edition"
        big={true}
        nav={[
          { key: 'dashboard', label: 'Front Page' },
          { key: 'activities', label: 'Dispatches' },
          { key: 'plan', label: 'Plan' },
          { key: 'coach', label: 'Letters' },
          { key: 'settings', label: 'Desk' },
        ]}
        activeNav="dashboard"
        onNav={onNav}
      />

      {/* ABOVE THE FOLD — lead + sidebar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.55fr 1fr',
          gap: 28,
          marginTop: 20,
          alignItems: 'start',
        }}
      >
        {/* LEAD */}
        <article>
          <Caps size={10} ls={3}>
            Today&apos;s Lead · Week of {weekDateRange()}
          </Caps>

          {weeklyReview ? (
            <>
              {weeklyReview.verdict_tag !== null && (
                <div style={{ marginTop: 8, marginBottom: 6 }}>
                  <ToneBadge tone={weeklyReview.tone ?? 'neutral'}>
                    {weeklyReview.verdict_tag}
                  </ToneBadge>
                </div>
              )}
              {reviewStreaming && reviewHeadlineStreamedText.length > 0 ? (
                <h2
                  style={{
                    fontFamily: OL.display,
                    fontWeight: 400,
                    fontSize: 36,
                    lineHeight: 1.05,
                    letterSpacing: -0.3,
                    margin: '8px 0 10px',
                  }}
                >
                  {extractStage5Text(reviewHeadlineStreamedText)}
                  <span className="ol-cursor">_</span>
                </h2>
              ) : weeklyReview.headline !== null ? (
                <h2
                  style={{
                    fontFamily: OL.display,
                    fontWeight: 400,
                    fontSize: 36,
                    lineHeight: 1.05,
                    letterSpacing: -0.3,
                    margin: '8px 0 10px',
                  }}
                >
                  {weeklyReview.headline}
                </h2>
              ) : null}
              <Caps
                size={9}
                ls={2}
                opacity={0.6}
                style={{ display: 'block', marginTop: weeklyReview.headline !== null || weeklyReview.verdict_tag !== null ? 0 : 8, marginBottom: 6 }}
              >
                Filed week of {fmtWeekOf(weeklyReview.week_start_date)}
              </Caps>
              {reviewStreaming ? (
                <>
                  {reviewStreamedText.length > 0 && reviewStreamedText.split('\n\n').filter(Boolean).map((para, i, arr) => {
                    const isLast = i === arr.length - 1;
                    const filingStep = reviewSteps.find((s) => s.label === 'Filing the headline');
                    const filingStarted = filingStep !== undefined && filingStep.status !== 'pending';
                    return (
                      <p key={i} style={{ fontFamily: OL.body, fontSize: 14, lineHeight: 1.6, maxWidth: 560, margin: '0 0 10px' }}>
                        {para}
                        {isLast && !filingStarted && <span className="ol-cursor">_</span>}
                        {isLast && filingStarted && (
                          <span style={{ display: 'block', marginTop: 8, fontFamily: OL.mono, fontSize: 10, opacity: 0.55 }}>
                            Filing the headline...
                          </span>
                        )}
                      </p>
                    );
                  })}
                  <ReviewProgressStrip steps={reviewSteps} elapsedMs={reviewElapsedMs} />
                </>
              ) : (
                <>
                  <div style={{ fontFamily: OL.body, fontSize: 14, lineHeight: 1.6, maxWidth: 560 }}>
                    {weeklyReview.review_text.split('\n\n').filter(Boolean).map((para, i) => (
                      <p key={i} style={{ margin: '0 0 10px' }}>{para}</p>
                    ))}
                  </div>
                  {reviewError ? (
                    <div style={{ marginTop: 10, fontFamily: OL.body, fontSize: 13 }}>
                      <span style={{ color: OL.accent }}>Pak Har could not file this week.</span>
                      {' '}
                      <a href="#" onClick={(e) => { e.preventDefault(); onGenerateReview(); }} style={{ color: OL.accent, fontStyle: 'italic', textDecoration: 'none', cursor: 'pointer' }}>
                        Try again →
                      </a>
                    </div>
                  ) : (
                    <a href="#" onClick={(e) => { e.preventDefault(); onGenerateReview(); }} style={{ fontFamily: OL.body, fontSize: 13, fontStyle: 'italic', color: OL.accent, cursor: 'pointer', textDecoration: 'none' }}>
                      Refresh his take →
                    </a>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <h1
                style={{
                  fontFamily: OL.display,
                  fontWeight: 400,
                  fontSize: 60,
                  lineHeight: 0.96,
                  letterSpacing: -0.8,
                  margin: '8px 0 10px',
                }}
              >
                {heroHeadline(weeklyStats)}
              </h1>
              <div
                style={{
                  fontFamily: OL.body,
                  fontSize: 14,
                  lineHeight: 1.6,
                  maxWidth: 560,
                }}
              >
                <b>{totalKm.toFixed(1)} km</b> across{' '}
                {totalRuns} run{totalRuns === 1 ? '' : 's'} filed so far this week.
              </div>
              {reviewStreaming ? (
                <>
                  {reviewStreamedText.length > 0 && reviewStreamedText.split('\n\n').filter(Boolean).map((para, i, arr) => {
                    const isLast = i === arr.length - 1;
                    const filingStep = reviewSteps.find((s) => s.label === 'Filing the headline');
                    const filingStarted = filingStep !== undefined && filingStep.status !== 'pending';
                    return (
                      <p key={i} style={{ fontFamily: OL.body, fontSize: 14, lineHeight: 1.6, maxWidth: 560, margin: '0 0 10px' }}>
                        {para}
                        {isLast && !filingStarted && <span className="ol-cursor">_</span>}
                        {isLast && filingStarted && (
                          <span style={{ display: 'block', marginTop: 8, fontFamily: OL.mono, fontSize: 10, opacity: 0.55 }}>
                            Filing the headline...
                          </span>
                        )}
                      </p>
                    );
                  })}
                  <ReviewProgressStrip steps={reviewSteps} elapsedMs={reviewElapsedMs} />
                </>
              ) : reviewError ? (
                <div style={{ marginTop: 10, fontFamily: OL.body, fontSize: 13 }}>
                  <span style={{ color: OL.accent }}>Pak Har could not file this week.</span>
                  {' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); onGenerateReview(); }} style={{ color: OL.accent, fontStyle: 'italic', textDecoration: 'none', cursor: 'pointer' }}>
                    Try again →
                  </a>
                </div>
              ) : (
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onGenerateReview(); }}
                  style={{ display: 'inline-block', marginTop: 10, fontFamily: OL.body, fontSize: 13, fontStyle: 'italic', color: OL.accent, cursor: 'pointer', textDecoration: 'none' }}
                >
                  No weekly assessment yet. File this week →
                </a>
              )}
            </>
          )}

        </article>

        {/* SIDEBAR */}
        <aside style={{ borderLeft: `1px solid ${OL.ink}`, paddingLeft: 20 }}>
          {/* Today card */}
          <Caps size={10} ls={3}>
            On the Schedule Today
          </Caps>
          <Hairline gap={6} />

          {todayPlan ? (
            <div
              style={{
                border: `3px solid ${OL.ink}`,
                padding: '12px 14px',
                marginTop: 8,
                background: 'var(--color-accent-soft)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Caps size={9} ls={3} opacity={0.7}>
                  {todayPlan.date}
                </Caps>
                <ToneBadge tone={typeTone(todayPlan.type)}>
                  {todayPlan.type.toUpperCase()}
                </ToneBadge>
              </div>
              <div
                style={{
                  fontFamily: OL.display,
                  fontSize: 34,
                  lineHeight: 1,
                  letterSpacing: -0.3,
                  textTransform: 'uppercase',
                  margin: '6px 0 4px',
                }}
              >
                {todayPlan.durationMinutes} minutes,
                <br />
                under {todayPlan.targetHr} bpm.
              </div>
              <p
                style={{
                  fontFamily: OL.body,
                  fontSize: 13,
                  lineHeight: 1.55,
                  margin: '8px 0 0',
                }}
              >
                {todayPlan.description}
              </p>
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenPlan();
                  }}
                  style={{
                    fontFamily: OL.sans,
                    fontSize: 10,
                    letterSpacing: 2,
                    fontWeight: 700,
                    color: OL.accent,
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    borderBottom: `1px solid ${OL.accent}`,
                  }}
                >
                  See the full week →
                </a>
                <Caps size={9} ls={2} opacity={0.55}>
                  Filed today
                </Caps>
              </div>
            </div>
          ) : (
            <p
              style={{
                fontFamily: OL.body,
                fontSize: 13,
                lineHeight: 1.55,
                fontStyle: 'italic',
                color: OL.muted,
                marginTop: 8,
              }}
            >
              No plan filed yet.
            </p>
          )}

          {/* Standings */}
          <div style={{ marginTop: 20 }}>
            <Caps size={10} ls={3}>
              The Standings
            </Caps>
            <Caps
              size={9}
              ls={2}
              opacity={0.6}
              style={{ display: 'block', marginTop: 2 }}
            >
              Weekly Mileage · last 4 weeks
            </Caps>
            <Hairline gap={6} />
            <Caps size={9} ls={2} opacity={0.5} style={{ display: 'block', marginTop: 6, fontStyle: 'italic' }}>
              Standings unavailable
            </Caps>
          </div>

          {/* Notices */}
          <div style={{ marginTop: 20 }}>
            <Caps size={10} ls={3}>
              Notices
            </Caps>
            <Hairline gap={6} />
            <p
              style={{
                fontFamily: OL.body,
                fontSize: 12.5,
                lineHeight: 1.6,
                margin: '6px 0 8px',
              }}
            >
              <b>Strava:</b> synced {fmtSyncedAt(lastSyncedAt)}.
            </p>
            <p
              style={{
                fontFamily: OL.body,
                fontSize: 12.5,
                lineHeight: 1.55,
                margin: 0,
                fontStyle: 'italic',
                color: OL.muted,
              }}
            >
              &ldquo;Besok pagi, lari lagi ya.&rdquo;
            </p>
          </div>
        </aside>
      </div>

      {/* SCOREBOARD — full width below two-column grid */}
      <div
        style={{
          marginTop: 20,
          border: `3px solid ${OL.ink}`,
          padding: '14px 18px',
          background: 'var(--color-paper-soft)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px 18px',
        }}
      >
        {(
          [
            ['This Week', `${totalKm.toFixed(1)} km`, 'total distance'],
            ['Runs', plannedRuns !== null ? `${totalRuns} / ${plannedRuns}` : String(totalRuns), 'this week'],
            ['Time on Feet', fmtTime(totalTimeSec), 'total duration'],
          ] as [string, string, string][]
        ).map(([label, value, sub]) => (
          <div key={label}>
            <Caps size={8} ls={2} opacity={0.6}>
              {label}
            </Caps>
            <div
              style={{
                fontFamily: OL.mono,
                fontSize: 26,
                fontWeight: 700,
                marginTop: 2,
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <Caps
              size={8}
              ls={2}
              opacity={0.55}
              style={{ marginTop: 4, display: 'inline-block' }}
            >
              {sub}
            </Caps>
          </div>
        ))}
      </div>

      {/* BELOW THE FOLD — last run snapshot */}
      <div style={{ marginTop: 28 }}>
        <Rule thick />
        <SectionLabel right="tap to read the dispatch →">
          Below the Fold · Last Run
        </SectionLabel>
        <Hairline />

        {lastRun ? (
          <article
            onClick={() => onOpenRun(lastRun.id)}
            style={{
              cursor: 'pointer',
              padding: '14px 0',
              display: 'grid',
              gridTemplateColumns: '90px 1fr 260px',
              gap: 20,
              alignItems: 'start',
            }}
          >
            {/* Date block */}
            <div>
              <Caps size={9} ls={2} opacity={0.6}>
                {lastRunDow}
              </Caps>
              <div
                style={{
                  fontFamily: OL.display,
                  fontSize: 54,
                  fontWeight: 400,
                  lineHeight: 1,
                }}
              >
                {lastRunDay}
              </div>
              <Caps size={9} ls={2} opacity={0.6}>
                {lastRunMonth}
              </Caps>
            </div>

            {/* Content */}
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <ToneBadge tone={lastRun.tone}>{lastRun.verdictTag}</ToneBadge>
                <Caps size={9} ls={2} opacity={0.6}>
                  {lastRun.route}
                </Caps>
              </div>
              <h2
                style={{
                  fontFamily: OL.display,
                  fontSize: 34,
                  fontWeight: 400,
                  lineHeight: 1.05,
                  letterSpacing: -0.4,
                  margin: '0 0 8px',
                }}
              >
                {lastRun.verdictShort}
              </h2>
              {lastRun.analysisSnippet ? (
                <p
                  style={{
                    fontFamily: OL.body,
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    margin: 0,
                    maxWidth: 520,
                  }}
                >
                  <span
                    style={{
                      float: 'left',
                      fontFamily: OL.display,
                      fontSize: 32,
                      lineHeight: 0.9,
                      paddingRight: 5,
                      paddingTop: 2,
                    }}
                  >
                    {lastRun.analysisSnippet.charAt(0)}
                  </span>
                  {lastRun.analysisSnippet.slice(1)}{' '}
                  <span
                    style={{
                      color: OL.accent,
                      fontWeight: 700,
                      fontFamily: OL.sans,
                      fontSize: 11,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                    }}
                  >
                    Read on →
                  </span>
                </p>
              ) : (
                <p
                  style={{
                    fontFamily: OL.body,
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    margin: 0,
                    color: OL.muted,
                    fontStyle: 'italic',
                  }}
                >
                  Pak Har hasn&apos;t filed on this run yet.{' '}
                  <span
                    style={{
                      color: OL.accent,
                      fontWeight: 700,
                      fontFamily: OL.sans,
                      fontSize: 11,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                    }}
                  >
                    Read on →
                  </span>
                </p>
              )}
              <Caps
                size={9}
                ls={2}
                opacity={0.55}
                style={{ marginTop: 10, display: 'inline-block' }}
              >
                by Pak Har · filed {lastRun.date}
              </Caps>
            </div>

            {/* Mini stat box */}
            <div style={{ border: `1px solid ${OL.ink}`, padding: '10px 14px' }}>
              <Caps size={8} ls={3} opacity={0.6}>
                Box Score
              </Caps>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px 12px',
                  marginTop: 6,
                }}
              >
                {(
                  [
                    ['DIST', `${lastRun.distanceKm.toFixed(1)} km`],
                    ['TIME', lastRun.time],
                    ['PACE', `${lastRun.pace}/km`],
                    ['AVG HR', lastRun.avgHr !== null ? `${lastRun.avgHr} bpm` : '—'],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label}>
                    <Caps size={7} ls={2} opacity={0.55}>
                      {label}
                    </Caps>
                    <div
                      style={{
                        fontFamily: OL.mono,
                        fontSize: 15,
                        fontWeight: 700,
                      }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ) : justOnboarded ? (
          <div style={{ padding: '14px 0' }}>
            <div style={{
              fontFamily: OL.mono,
              fontSize: 11,
              letterSpacing: 2,
              textTransform: 'uppercase',
              opacity: 0.7,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span className="ol-cursor">_</span>
              PULLING YOUR RUNS FROM STRAVA...
            </div>
          </div>
        ) : (
          <p
            style={{
              fontFamily: OL.body,
              fontSize: 13.5,
              fontStyle: 'italic',
              color: OL.muted,
              padding: '14px 0',
            }}
          >
            No run dispatched yet.
          </p>
        )}
      </div>

      <FooterRail
        left="Filed at Braga · Bandung"
        center="Page 1 · Front"
        right="— continued page 2: Plan for the week —"
      />
    </Paper>
  );
}

export default DashboardPaper;
