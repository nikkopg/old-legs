"use client";

// READY FOR QA
// Component: DashboardPaper (TASK-136)
// What was built: Tabloid dashboard front-page layout — above-the-fold hero + sidebar,
//   below-the-fold last run snapshot, op-ed insights column.
// Edge cases to test:
//   - todayPlan=null shows "No plan filed yet." fallback
//   - lastRun=null shows "No run dispatched yet." fallback
//   - insights=null shows "No column yet." fallback
//   - weeklyStats.totalKm < targetKm*0.5 → headline "Week is thin. Pick it up."
//   - weeklyStats.totalKm >= targetKm → headline "Target met. Don't stop now."
//   - lastRun.avgHr=null shows "—" in Box Score
//   - insights.weeklyKmTrend with fewer than 6 items renders without crashing
//   - insights.avgHr=null and loadChangePct=null show "—" in key numbers
//   - onOpenRun, onOpenPlan, onOpenCoach, onNav callbacks fire correctly

import React from 'react';
import {
  OL,
  Caps,
  Rule,
  Hairline,
  SectionLabel,
  MiniBar,
  Paper,
  FooterRail,
  NewspaperChrome,
  ToneBadge,
} from './NewspaperChrome';

// ---------- interfaces ----------

interface WeeklyStats {
  totalKm: number;
  totalRuns: number;
  totalTimeSec: number;
  targetKm: number;
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

interface InsightsData {
  commentary: string;
  weeklyKmTrend: number[];
  avgHr: number | null;
  loadChangePct: number | null;
}

interface DashboardPaperProps {
  weeklyStats: WeeklyStats;
  todayPlan: TodayPlan | null;
  lastRun: LastRun | null;
  insights: InsightsData | null;
  lastSyncedAt: string | null;
  onOpenRun: (id: number) => void;
  onOpenPlan: () => void;
  onOpenCoach: () => void;
  onNav: (key: string) => void;
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
  const { totalKm, targetKm } = stats;
  if (totalKm < targetKm * 0.5) return 'Week is thin. Pick it up.';
  if (totalKm >= targetKm) return 'Target met. Don\'t stop now.';
  return `${totalKm.toFixed(1)} km in. ${(targetKm - totalKm).toFixed(1)} to go.`;
}

function opEdHeadline(commentary: string): string {
  const firstLine = commentary.split('\n\n')[0].split('.')[0].trim();
  if (firstLine.length > 0 && firstLine.length < 80) return firstLine + '.';
  return 'The arc tells a story.';
}

// ---------- component ----------

export function DashboardPaper({
  weeklyStats,
  todayPlan,
  lastRun,
  insights,
  lastSyncedAt,
  onOpenRun,
  onOpenPlan,
  onOpenCoach,
  onNav,
}: DashboardPaperProps) {
  const { totalKm, totalRuns, totalTimeSec, targetKm } = weeklyStats;
  const completionPct = targetKm > 0 ? (totalKm / targetKm) * 100 : 0;

  // Parse lastRun date parts
  const lastRunParts = lastRun ? lastRun.date.split(' ') : [];
  const lastRunDow = lastRunParts[0] ?? '';
  const lastRunDay = lastRunParts[1] ?? '';
  const lastRunMonth = lastRunParts[2] ?? '';

  // Op-ed paragraphs
  const opEdParagraphs = insights ? insights.commentary.split('\n\n').filter(Boolean) : [];
  const pullQuote = opEdParagraphs.length >= 2 ? opEdParagraphs[1] : null;

  // Bar chart for insights
  const trend = insights ? insights.weeklyKmTrend : [];
  const maxTrend = trend.length > 0 ? Math.max(...trend, 1) : 40;
  const chartLabels = ['W-5', 'W-4', 'W-3', 'W-2', 'W-1', 'This'];
  // Align trend values to last N slots of chartLabels (up to 6)
  const chartSlots = 6;
  const chartData: (number | null)[] = Array(chartSlots).fill(null);
  for (let i = 0; i < Math.min(trend.length, chartSlots); i++) {
    chartData[chartSlots - Math.min(trend.length, chartSlots) + i] = trend[i];
  }

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
          gridTemplateColumns: '1.55fr 1fr',
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
            You are at <b>{totalKm.toFixed(1)} km</b> with the target sitting at{' '}
            <b>{targetKm}</b>.{' '}
            {totalRuns} run{totalRuns === 1 ? '' : 's'} filed so far this week.
          </div>

          {/* Scoreboard */}
          <div
            style={{
              marginTop: 16,
              border: `3px solid ${OL.ink}`,
              padding: '14px 18px',
              background: 'rgba(20,18,16,0.02)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '10px 18px',
            }}
          >
            {(
              [
                ['This Week', totalKm.toFixed(1), `km of ${targetKm}`],
                ['Runs', String(totalRuns), 'this week'],
                ['Time on Feet', fmtTime(totalTimeSec), 'minutes'],
                ['Week Completion', `${Math.round(completionPct)}%`, 'target'],
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

          {/* Progress bar */}
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <Caps size={9} ls={3} opacity={0.7}>
                Progress to Target
              </Caps>
              <span
                style={{
                  fontFamily: OL.mono,
                  fontSize: 11,
                  opacity: 0.7,
                }}
              >
                {totalKm.toFixed(1)} / {targetKm.toFixed(1)} km
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <MiniBar pct={completionPct} accent height={14} />
            </div>
          </div>
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
                background: 'rgba(138,42,18,0.04)',
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

      {/* OP-ED — 6-week insights */}
      <div style={{ marginTop: 28 }}>
        <Rule thick />
        <SectionLabel right="columnist · weekly">Opinion · The Arc</SectionLabel>
        <Hairline />

        {insights ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.15fr 1fr',
              gap: 28,
              marginTop: 14,
              alignItems: 'start',
            }}
          >
            {/* Column prose */}
            <div>
              <Caps size={9} ls={3} opacity={0.7}>
                by Pak Har — 6-Week Column
              </Caps>
              <h2
                style={{
                  fontFamily: OL.display,
                  fontSize: 36,
                  fontWeight: 400,
                  lineHeight: 1.05,
                  letterSpacing: -0.4,
                  margin: '6px 0 10px',
                  fontStyle: 'italic',
                }}
              >
                {opEdHeadline(insights.commentary)}
              </h2>
              {opEdParagraphs.map((para, i) => (
                <p
                  key={i}
                  style={{
                    fontFamily: OL.body,
                    fontSize: 13.5,
                    lineHeight: 1.65,
                    margin: i < opEdParagraphs.length - 1 ? '0 0 10px' : 0,
                    textAlign: 'justify',
                    hyphens: 'auto',
                  }}
                >
                  {para}
                </p>
              ))}
              {pullQuote && (
                <div
                  style={{
                    borderTop: `2px solid ${OL.accent}`,
                    borderBottom: `2px solid ${OL.accent}`,
                    padding: '10px 0',
                    margin: '14px 0',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontFamily: OL.display,
                      fontSize: 22,
                      lineHeight: 1.1,
                      letterSpacing: -0.2,
                      textAlign: 'center',
                      fontStyle: 'italic',
                      color: OL.accent,
                    }}
                  >
                    &ldquo;{pullQuote.length > 120 ? pullQuote.slice(0, 120) + '…' : pullQuote}&rdquo;
                  </p>
                </div>
              )}
              <Caps
                size={9}
                ls={2}
                opacity={0.65}
                style={{ display: 'block', textAlign: 'right' }}
              >
                — Pak Har · 6-Week Column
              </Caps>
            </div>

            {/* Supporting figures */}
            <div>
              <Caps size={9} ls={3} opacity={0.7}>
                Supporting Figures
              </Caps>
              <Hairline gap={6} />
              <div
                style={{
                  border: `1px solid ${OL.ink}`,
                  padding: '12px 14px',
                  marginTop: 6,
                }}
              >
                <Caps size={8} ls={2} opacity={0.6}>
                  Weekly Kilometres · {trend.length} week{trend.length !== 1 ? 's' : ''}
                </Caps>
                <svg
                  width="100%"
                  height="90"
                  viewBox="0 0 340 90"
                  style={{ display: 'block', marginTop: 8 }}
                >
                  {/* baseline */}
                  <line
                    x1="0"
                    y1="70"
                    x2="340"
                    y2="70"
                    stroke={OL.ink}
                    strokeWidth="0.5"
                    opacity="0.4"
                  />
                  {chartData.map((v, i) => {
                    if (v === null) return null;
                    const h = (v / (maxTrend * 1.1)) * 60;
                    const x = 12 + i * 55;
                    const isCurrent = i === chartSlots - 1;
                    return (
                      <g key={i}>
                        <rect
                          x={x}
                          y={70 - h}
                          width={40}
                          height={h}
                          fill={isCurrent ? OL.accent : OL.ink}
                        />
                        <text
                          x={x + 20}
                          y={86}
                          textAnchor="middle"
                          style={{
                            fontFamily: OL.sans,
                            fontSize: 9,
                            letterSpacing: 1,
                            fill: OL.ink,
                            opacity: 0.7,
                            textTransform: 'uppercase',
                          }}
                        >
                          {chartLabels[i]}
                        </text>
                        <text
                          x={x + 20}
                          y={65 - h}
                          textAnchor="middle"
                          style={{
                            fontFamily: OL.mono,
                            fontSize: 9,
                            fill: OL.ink,
                          }}
                        >
                          {v > 0 ? v.toFixed(0) : '—'}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div
                  style={{
                    marginTop: 10,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    borderTop: `1px dotted ${OL.hair}`,
                    paddingTop: 10,
                  }}
                >
                  <div>
                    <Caps size={8} ls={2} opacity={0.6}>
                      Avg HR · 6w
                    </Caps>
                    <div
                      style={{
                        fontFamily: OL.mono,
                        fontSize: 22,
                        fontWeight: 700,
                      }}
                    >
                      {insights.avgHr !== null ? (
                        <>
                          {insights.avgHr}
                          <span style={{ fontSize: 11, opacity: 0.6 }}> bpm</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                    <Caps size={8} ls={2} opacity={0.55}>
                      6-week average
                    </Caps>
                  </div>
                  <div>
                    <Caps size={8} ls={2} opacity={0.6}>
                      Load · vs peak
                    </Caps>
                    <div
                      style={{
                        fontFamily: OL.mono,
                        fontSize: 22,
                        fontWeight: 700,
                        color: insights.loadChangePct !== null ? OL.accent : undefined,
                      }}
                    >
                      {insights.loadChangePct !== null
                        ? `${insights.loadChangePct > 0 ? '+' : ''}${insights.loadChangePct}%`
                        : '—'}
                    </div>
                    <Caps size={8} ls={2} opacity={0.55}>
                      since peak week
                    </Caps>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Caps size={9} ls={2} opacity={0.6}>
                  Questions?
                </Caps>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenCoach();
                  }}
                  style={{
                    fontFamily: OL.sans,
                    fontSize: 11,
                    letterSpacing: 3,
                    fontWeight: 700,
                    color: OL.accent,
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    borderBottom: `1px solid ${OL.accent}`,
                  }}
                >
                  Write to the editor →
                </a>
              </div>
            </div>
          </div>
        ) : (
          <p
            style={{
              fontFamily: OL.body,
              fontSize: 13.5,
              fontStyle: 'italic',
              color: OL.muted,
              marginTop: 14,
            }}
          >
            No column yet. Generate insights to file the arc.
          </p>
        )}
      </div>

      <FooterRail
        left="Filed at Senayan · Jakarta"
        center="Page 1 · Front"
        right="— continued page 2: Plan for the week —"
      />
    </Paper>
  );
}

export default DashboardPaper;
