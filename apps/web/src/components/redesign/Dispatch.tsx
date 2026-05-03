// READY FOR QA
// Component: Dispatch (TASK-130)
// What was built: Tabloid broadsheet post-run analysis detail view.
//   Shows Pak Har's verdict headline, stats strip, pace chart placeholder, dispatch prose with drop cap,
//   splits table, HR zones placeholder, and weekly mileage rail.
// Edge cases to test:
//   - analysis is null: prose area shows "Pak Har hasn't seen this run yet."
//   - splits prop is undefined or empty: shows "Splits unavailable" message; HR zones also unavailable
//   - First and last split km pace cells rendered in accent/bold
//   - Drop cap CSS class applied only to first paragraph
//   - Pull-quote extracted from 2nd sentence of analysis (split on ".")
//   - activity.verdict_short present: used as headline; absent: falls back to first sentence of analysis, then name
//   - Cadence null: stats strip shows "—"
//   - Time extraction from activity_date for WIB byline

'use client';

import { useState } from 'react';
import type React from 'react';
import type { Activity } from '@/types/api';
import type { WeeklyKmEntry } from './FrontPage';
import { NewspaperChrome } from './NewspaperChrome';

export interface DispatchSplit {
  km: number;
  pace: string;
  hr: number | null;
  cad: number | null;
  elev: number | null;
}

export interface DispatchProps {
  activity: Activity & {
    verdict_short?: string | null;
  };
  weeklyKm: WeeklyKmEntry[];
  splits?: DispatchSplit[];
  onBack: () => void;
  onNav?: (key: string) => void;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
}

// ---- Helper functions ----

function formatMovingTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function formatPace(minPerKm: number): string {
  const totalSeconds = Math.round(minPerKm * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatActivityDate(isoString: string): {
  dow: string;
  day: string;
  mon: string;
  full: string;
  time: string;
} {
  const date = new Date(isoString);
  const daysFull = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsFull = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return {
    dow: days[date.getDay()],
    day: String(date.getDate()),
    mon: months[date.getMonth()],
    full: `${daysFull[date.getDay()]} ${date.getDate()} ${monthsFull[date.getMonth()]} ${date.getFullYear()}`,
    time: `${hh}:${min}`,
  };
}

function getVerdictHeadline(activity: DispatchProps['activity']): string {
  if (activity.verdict_short) return activity.verdict_short;
  if (activity.analysis) {
    const first = activity.analysis.split(/[.!?]/)[0];
    if (first.trim()) return first.trim();
  }
  return activity.name;
}

function toSentenceCase(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function getPullQuote(analysis: string): string {
  const sentences = analysis.split(/(?<=[.!?])\s+/);
  const second = sentences[1] ?? sentences[0] ?? '';
  return `"${second.trim()}"`;
}

function getAnalysisParagraphs(analysis: string): string[] {
  const rawParas = analysis.split(/\n\n|\n/).filter((p) => p.trim().length > 0);
  return rawParas;
}

function parsePaceToSeconds(pace: string): number {
  const parts = pace.split(':');
  if (parts.length !== 2) return 0;
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  return minutes * 60 + seconds;
}

// ---- Sub-components ----

function ThickRule({ className = '' }: { className?: string }) {
  return <div className={`border-t-[3px] border-[var(--color-ink)] ${className}`} />;
}

function Hairline({ className = '' }: { className?: string }) {
  return <div className={`border-t border-[var(--color-hairline-strong)] ${className}`} />;
}

// ---- Main component ----

export function Dispatch({ activity, weeklyKm, splits, onBack, onNav, onAnalyze, isAnalyzing }: DispatchProps) {
  const dateInfo = formatActivityDate(activity.activity_date);
  const headline = getVerdictHeadline(activity);
  const paragraphs = activity.analysis ? getAnalysisParagraphs(activity.analysis) : [];
  const pullQuote = activity.analysis && paragraphs.length >= 2
    ? getPullQuote(activity.analysis)
    : null;

  // At-a-glance: first 2 sentences
  const atAGlance = activity.analysis
    ? (() => {
        const sentences = activity.analysis.split(/(?<=[.!?])\s+/);
        return sentences.slice(0, 2).join(' ');
      })()
    : null;

  const currentWeek = weeklyKm.find((w) => w.current);

  const hasSplits = splits !== undefined && splits.length > 0;

  type OverlayKey = 'hr' | 'elev' | 'cad';
  const [activeOverlay, setActiveOverlay] = useState<OverlayKey | null>(null);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }} className="px-9 pt-7 pb-12">

        <NewspaperChrome
          section="Dispatch · Run Detail"
          big={false}
          nav={[
            { key: 'dashboard', label: 'Front Page' },
            { key: 'activities', label: 'Dispatches' },
            { key: 'plan', label: 'Plan' },
            { key: 'coach', label: 'Letters' },
            { key: 'settings', label: 'Desk' },
          ]}
          activeNav="activities"
          onNav={onNav ?? (() => {})}
        />

        {/* Paper */}
        <div>

          {/* Headline block */}
          <div className="grid grid-cols-[1fr_240px] gap-6 my-5">
            <div>
              <div className="font-sans text-[10px] uppercase tracking-widest opacity-70 mb-2">
                FRONT PAGE · VERDICT
              </div>
              <h1 className="font-display text-[44px] leading-[1.1] tracking-[-0.015em] mb-3">
                {toSentenceCase(headline)}
              </h1>
              <div className="font-sans text-[10px] uppercase tracking-widest opacity-70">
                BY PAK HAR · SENIOR COACH · FILED {dateInfo.time} WIB
              </div>
            </div>
            <div className="border-l border-[var(--color-hairline-strong)] pl-4">
              <div className="font-sans text-[10px] uppercase tracking-widest opacity-70 mb-2">
                AT A GLANCE
              </div>
              <div className="font-body text-[12px] leading-relaxed">
                {atAGlance ?? "Pak Har hasn&#39;t analyzed this run yet."}
              </div>
            </div>
          </div>

          {/* Numbers strip — hairlines + label */}
          <Hairline className="my-[6px]" />
          <div className="font-sans text-[10px] uppercase tracking-widest opacity-70 py-2">
            THE NUMBERS · {activity.name} · {dateInfo.full}
          </div>
          <Hairline className="my-[6px]" />

          {/* Stats strip */}
          <div className="grid grid-cols-6 gap-3 my-5">
            {[
              { label: 'DIST', value: activity.distance_km.toFixed(2), unit: 'km' },
              { label: 'TIME', value: formatMovingTime(activity.moving_time_seconds), unit: '' },
              { label: 'AVG PACE', value: formatPace(activity.average_pace_min_per_km), unit: '/km' },
              {
                label: 'AVG HR',
                value: activity.average_hr !== null ? String(activity.average_hr) : '—',
                unit: activity.average_hr !== null ? 'bpm' : '',
              },
              {
                label: 'CADENCE',
                value: '—',
                unit: '',
              },
              { label: 'ELEV', value: `+${activity.elevation_gain_m}`, unit: 'm' },
            ].map(({ label, value, unit }) => (
              <div key={label}>
                <div className="font-sans text-[9px] uppercase tracking-widest opacity-70 mb-1">
                  {label}
                </div>
                <div
                  className="text-[28px] font-bold leading-none"
                  style={{ fontFamily: 'var(--font-mono-tabloid)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {value}
                  {unit && (
                    <span className="font-sans text-[12px] font-normal opacity-60 ml-[3px]">
                      {unit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pace chart */}
          <div
            style={{
              border: '1px solid var(--color-ink)',
              padding: '12px 16px',
              background: 'var(--color-paper-soft)',
              margin: '20px 0',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                opacity: 0.7,
                marginBottom: 8,
              }}
            >
              PACE PER KILOMETRE
            </div>

            {!hasSplits ? (
              <div className="font-body text-[12px] italic opacity-55">
                Lap data unavailable — splits sync coming in a future update.
              </div>
            ) : (() => {
              // ---- Chart calculations ----
              const splitData = splits!;

              // Parse pace values
              const paceSeconds = splitData.map((s) => parsePaceToSeconds(s.pace));
              const minPace = Math.min(...paceSeconds);
              const maxPace = Math.max(...paceSeconds);
              const paceRange = maxPace - minPace;

              // Chart viewport constants
              const W = 600;
              const H = 140;
              const padTop = 10;
              const padRight = 10;
              const padBottom = 24;
              const padLeft = 10;
              const chartX0 = padLeft;
              const chartX1 = W - padRight;
              const chartY0 = padTop;
              const chartY1 = H - padBottom;

              const n = splitData.length;

              // X position for each split (evenly spaced)
              const xPos = (i: number): number => {
                if (n === 1) return (chartX0 + chartX1) / 2;
                return chartX0 + (i / (n - 1)) * (chartX1 - chartX0);
              };

              // Y position for pace (inverted: faster = higher = smaller y)
              const yPace = (sec: number): number => {
                if (paceRange === 0) return (chartY0 + chartY1) / 2;
                return chartY0 + ((sec - minPace) / paceRange) * (chartY1 - chartY0);
              };

              // Pace polyline points
              const pacePoints = splitData
                .map((s, i) => `${xPos(i)},${yPace(parsePaceToSeconds(s.pace))}`)
                .join(' ');

              // Average pace reference line
              const avgPaceSec = paceSeconds.reduce((a, b) => a + b, 0) / n;
              const avgY = yPace(avgPaceSec);

              // Overlay values
              const overlayValues: Record<OverlayKey, (number | null)[]> = {
                hr: splitData.map((s) => s.hr),
                elev: splitData.map((s) => s.elev),
                cad: splitData.map((s) => s.cad),
              };

              // Check which overlays are entirely null (disabled)
              const overlayDisabled: Record<OverlayKey, boolean> = {
                hr: overlayValues.hr.every((v) => v === null),
                elev: overlayValues.elev.every((v) => v === null),
                cad: overlayValues.cad.every((v) => v === null),
              };

              // Build overlay polyline segments (break at nulls)
              const buildOverlaySegments = (key: OverlayKey): string[] => {
                const vals = overlayValues[key];
                const nonNull = vals.filter((v): v is number => v !== null);
                if (nonNull.length === 0) return [];
                const minVal = Math.min(...nonNull);
                const maxVal = Math.max(...nonNull);
                const range = maxVal - minVal;

                const yOverlay = (v: number): number => {
                  if (range === 0) return (chartY0 + chartY1) / 2;
                  return chartY1 - ((v - minVal) / range) * (chartY1 - chartY0);
                };

                const segments: string[] = [];
                let currentSegment: string[] = [];

                for (let i = 0; i < n; i++) {
                  const v = vals[i];
                  if (v === null) {
                    if (currentSegment.length > 0) {
                      segments.push(currentSegment.join(' '));
                      currentSegment = [];
                    }
                  } else {
                    currentSegment.push(`${xPos(i)},${yOverlay(v)}`);
                  }
                }
                if (currentSegment.length > 0) {
                  segments.push(currentSegment.join(' '));
                }
                return segments;
              };

              // Overlay dot positions
              const buildOverlayDots = (key: OverlayKey): { x: number; y: number }[] => {
                const vals = overlayValues[key];
                const nonNull = vals.filter((v): v is number => v !== null);
                if (nonNull.length === 0) return [];
                const minVal = Math.min(...nonNull);
                const maxVal = Math.max(...nonNull);
                const range = maxVal - minVal;

                const yOverlay = (v: number): number => {
                  if (range === 0) return (chartY0 + chartY1) / 2;
                  return chartY1 - ((v - minVal) / range) * (chartY1 - chartY0);
                };

                return vals
                  .map((v, i) => (v !== null ? { x: xPos(i), y: yOverlay(v) } : null))
                  .filter((d): d is { x: number; y: number } => d !== null);
              };

              const overlaySegments = activeOverlay ? buildOverlaySegments(activeOverlay) : [];
              const overlayDots = activeOverlay ? buildOverlayDots(activeOverlay) : [];

              const overlayLabelMap: Record<OverlayKey, string> = {
                hr: 'HR · BPM',
                elev: 'ELEV · Δm',
                cad: 'CAD · SPM',
              };

              const overlayButtonLabels: Record<OverlayKey, string> = {
                hr: 'HR',
                elev: 'ELEVATION',
                cad: 'CADENCE',
              };

              return (
                <>
                  {/* Legend */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      marginBottom: 6,
                      alignItems: 'center',
                    }}
                  >
                    {/* Pace legend item */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{
                          height: 2,
                          width: 16,
                          background: 'var(--color-ink)',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono-tabloid)',
                          fontSize: 9,
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.05em',
                          color: 'var(--color-ink)',
                        }}
                      >
                        PACE
                      </span>
                    </div>

                    {/* Active overlay legend item */}
                    {activeOverlay && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="16" height="6" style={{ overflow: 'visible' }}>
                          <line
                            x1="0"
                            y1="3"
                            x2="16"
                            y2="3"
                            stroke="var(--color-accent)"
                            strokeWidth="1.5"
                            strokeDasharray="4 3"
                          />
                        </svg>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono-tabloid)',
                            fontSize: 9,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.05em',
                            color: 'var(--color-accent)',
                          }}
                        >
                          {overlayLabelMap[activeOverlay]}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* SVG chart */}
                  <svg
                    width="100%"
                    height={H}
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="none"
                    style={{ display: 'block' }}
                  >
                    {/* Average pace reference line */}
                    <line
                      x1={chartX0}
                      y1={avgY}
                      x2={chartX1}
                      y2={avgY}
                      stroke="var(--color-ink)"
                      strokeWidth="1"
                      strokeDasharray="4 3"
                      opacity="0.3"
                    />

                    {/* Overlay polylines */}
                    {overlaySegments.map((pts, idx) => (
                      <polyline
                        key={idx}
                        points={pts}
                        stroke="var(--color-accent)"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        fill="none"
                        strokeLinejoin="round"
                      />
                    ))}

                    {/* Overlay dots */}
                    {overlayDots.map((dot, idx) => (
                      <circle
                        key={idx}
                        cx={dot.x}
                        cy={dot.y}
                        r="2.5"
                        fill="var(--color-accent)"
                      />
                    ))}

                    {/* Pace polyline */}
                    <polyline
                      points={pacePoints}
                      stroke="var(--color-ink)"
                      strokeWidth="2"
                      fill="none"
                      strokeLinejoin="round"
                    />

                    {/* Pace dots */}
                    {splitData.map((s, i) => (
                      <circle
                        key={s.km}
                        cx={xPos(i)}
                        cy={yPace(parsePaceToSeconds(s.pace))}
                        r="3"
                        fill="var(--color-ink)"
                      />
                    ))}

                    {/* X-axis labels */}
                    {splitData.map((s, i) => (
                      <text
                        key={s.km}
                        x={xPos(i)}
                        y={H - 6}
                        textAnchor="middle"
                        fontFamily="var(--font-mono-tabloid)"
                        fontSize="9"
                        fill="var(--color-ink)"
                        opacity="0.6"
                      >
                        {s.km}
                      </text>
                    ))}
                  </svg>

                  {/* Toggle buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {(['hr', 'elev', 'cad'] as OverlayKey[]).map((key) => {
                      const isActive = activeOverlay === key;
                      const isDisabled = overlayDisabled[key];

                      let buttonStyle: React.CSSProperties;
                      if (isDisabled) {
                        buttonStyle = {
                          border: '1px solid var(--color-paper-soft-3)',
                          background: 'transparent',
                          color: 'var(--color-hairline)',
                          cursor: 'not-allowed',
                        };
                      } else if (isActive) {
                        buttonStyle = {
                          border: '1px solid var(--color-ink)',
                          background: 'var(--color-ink)',
                          color: 'var(--color-ink-on-ink)',
                          cursor: 'pointer',
                        };
                      } else {
                        buttonStyle = {
                          border: '1px solid var(--color-hairline-strong)',
                          background: 'transparent',
                          color: 'var(--color-muted)',
                          cursor: 'pointer',
                        };
                      }

                      return (
                        <button
                          key={key}
                          disabled={isDisabled}
                          onClick={() => {
                            if (!isDisabled) {
                              setActiveOverlay(isActive ? null : key);
                            }
                          }}
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 9,
                            letterSpacing: '0.1em',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '5px 10px',
                            ...buttonStyle,
                          }}
                        >
                          {overlayButtonLabels[key]}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Two-column body */}
          <div className="grid grid-cols-[1.15fr_1fr] gap-7 mt-5">

            {/* Left — Dispatch prose */}
            <div>
              <div className="font-sans text-[9px] uppercase tracking-widest opacity-70">
                PAK HAR&#39;S DISPATCH
              </div>
              <Hairline className="my-[6px]" />

              {activity.analysis === null || paragraphs.length === 0 ? (
                <>
                  <p className="font-body italic text-[13px] opacity-60">
                    Pak Har hasn&#39;t seen this run yet.
                  </p>
                  {onAnalyze && (
                    <button
                      onClick={onAnalyze}
                      disabled={isAnalyzing}
                      style={{
                        marginTop: 12,
                        background: isAnalyzing ? 'transparent' : 'var(--color-ink)',
                        color: isAnalyzing ? 'var(--color-ink)' : 'var(--color-ink-on-ink)',
                        border: '1px solid var(--color-ink)',
                        padding: '10px 24px',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 11,
                        letterSpacing: 3,
                        fontWeight: 700,
                        textTransform: 'uppercase' as const,
                        cursor: isAnalyzing ? 'default' : 'pointer',
                        opacity: isAnalyzing ? 0.5 : 1,
                      }}
                    >
                      {isAnalyzing ? 'Filing dispatch_' : 'Get his take →'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* First paragraph with drop cap */}
                  <p className="dispatch-drop-cap font-body text-[13px] leading-relaxed text-justify hyphens-auto mt-[6px] mb-[10px]">
                    {paragraphs[0]}
                  </p>

                  {/* Remaining paragraphs */}
                  {paragraphs.slice(1).map((para, i) => (
                    <p
                      key={i}
                      className="font-body text-[13px] leading-relaxed text-justify hyphens-auto mb-[10px]"
                    >
                      {para}
                    </p>
                  ))}

                  {/* Pull-quote after 2nd paragraph */}
                  {pullQuote !== null && (
                    <div className="border-y-2 border-[var(--color-accent)] py-[10px] my-4 font-display text-[20px] italic text-center text-[var(--color-accent)]">
                      {pullQuote}
                    </div>
                  )}

                  {/* Sign-off */}
                  <div className="font-sans text-[9px] uppercase tracking-widest opacity-70 text-right mt-4">
                    — PAK HAR · POST-RUN DISPATCH
                  </div>

                  {/* Regenerate button */}
                  {onAnalyze && (
                    <div className="text-right mt-3">
                      <button
                        onClick={onAnalyze}
                        disabled={isAnalyzing}
                        style={{
                          background: isAnalyzing ? 'transparent' : 'var(--color-ink)',
                          color: isAnalyzing ? 'var(--color-ink)' : 'var(--color-ink-on-ink)',
                          border: '1px solid var(--color-ink)',
                          padding: '10px 24px',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 11,
                          letterSpacing: 3,
                          fontWeight: 700,
                          textTransform: 'uppercase' as const,
                          cursor: isAnalyzing ? 'default' : 'pointer',
                          opacity: isAnalyzing ? 0.5 : 1,
                        }}
                      >
                        {isAnalyzing ? 'Filing dispatch_' : 'Refresh his take →'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right — Supporting data */}
            <div>
              {/* Splits */}
              <div className="font-sans text-[9px] uppercase tracking-widest opacity-70">
                SPLITS · BY THE NUMBERS
              </div>
              <Hairline className="my-[6px]" />

              {!hasSplits ? (
                <p className="font-body italic text-[12px] opacity-55">
                  Splits unavailable — lap data not yet synced.
                </p>
              ) : (
                <table
                  className="w-full border-collapse text-[11px]"
                  style={{ fontFamily: 'var(--font-mono-tabloid)', fontVariantNumeric: 'tabular-nums' }}
                >
                  <thead>
                    <tr className="border-b border-[var(--color-ink)]">
                      {['KM', 'PACE', 'HR', 'CAD', 'Δ ELEV'].map((h) => (
                        <th
                          key={h}
                          className="text-right py-[3px] px-[6px] font-sans text-[9px] uppercase tracking-widest font-semibold"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {splits.map((split, i) => {
                      const isFirst = i === 0;
                      const isLast = i === splits.length - 1;
                      const paceAccent = isFirst || isLast;
                      return (
                        <tr
                          key={split.km}
                          className="border-b border-dotted border-[var(--color-hairline)]"
                        >
                          <td className="text-right py-[2px] px-[6px]">{split.km}</td>
                          <td
                            className={`text-right py-[2px] px-[6px] ${paceAccent ? 'text-[var(--color-accent)] font-bold' : ''}`}
                          >
                            {split.pace}
                          </td>
                          <td className="text-right py-[2px] px-[6px]">
                            {split.hr !== null ? split.hr : '—'}
                          </td>
                          <td className="text-right py-[2px] px-[6px]">
                            {split.cad !== null ? split.cad : '—'}
                          </td>
                          <td className="text-right py-[2px] px-[6px]">
                            {split.elev !== null ? (split.elev >= 0 ? `+${split.elev}` : split.elev) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* HR Zones */}
              <div className="font-sans text-[9px] uppercase tracking-widest opacity-70 mt-4">
                HEART RATE ZONES
              </div>
              <Hairline className="my-[6px]" />
              <p className="font-body italic text-[12px] opacity-55">
                HR zones unavailable — no splits data.
              </p>

              {/* Weekly km rail */}
              <div className="font-sans text-[9px] uppercase tracking-widest opacity-70 mt-4">
                LAST 4 WEEKS · KM
              </div>
              <Hairline className="my-[6px]" />
              {weeklyKm.map((entry) => (
                <div
                  key={entry.label}
                  className="grid grid-cols-[44px_1fr_90px] items-center gap-2 my-1"
                >
                  <div
                    className={`font-sans text-[10px] uppercase ${entry.current ? 'font-bold' : 'font-medium'}`}
                  >
                    {entry.label}
                  </div>
                  <div className="h-[10px] bg-[var(--color-paper-soft-3)] border border-[var(--color-hairline)] relative">
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${Math.min((entry.km / 40) * 100, 100)}%`,
                        backgroundColor: entry.current ? 'var(--color-accent)' : 'var(--color-ink)',
                      }}
                    />
                  </div>
                  <div
                    className="text-right text-[11px]"
                    style={{ fontFamily: 'var(--font-mono-tabloid)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {entry.km.toFixed(1)}km · {entry.runs} runs
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Thick rule */}
          <ThickRule className="mt-[10px]" />

          {/* Footer rail */}
          <div className="flex justify-between items-baseline mt-3 font-sans text-[10px] uppercase tracking-widest opacity-70">
            <span>Filed at Braga · Bandung</span>
            <span>&#34;Besok pagi, lari lagi ya.&#34;</span>
            <span>— continued page 2: Plan for the week —</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dispatch;
