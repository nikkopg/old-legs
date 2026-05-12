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
import type { Activity, ActivityStreams } from '@/types/api';
import type { WeeklyKmEntry } from './FrontPage';
import { NewspaperChrome } from './NewspaperChrome';

export interface DispatchSplit {
  km: number;
  pace: string;
  hr: number | null;
  cad: number | null;
  elev: number | null;
  movingTime?: number;
}

export interface DispatchProps {
  activity: Activity & {
    verdict_short?: string | null;
  };
  weeklyKm: WeeklyKmEntry[];
  splits?: DispatchSplit[];
  userMaxHr?: number | null;
  onBack: () => void;
  onNav?: (key: string) => void;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
}

// ---- Streams chart helpers ----

interface StreamChartPoint {
  /** cumulative distance in metres from start */
  distM: number;
  /** pace in min/km */
  paceMinPerKm: number;
  hr: number | null;
  cad: number | null;
  alt: number | null;
}

function streamsToChartPoints(streams: ActivityStreams): StreamChartPoint[] {
  const points: StreamChartPoint[] = [];
  for (let i = 0; i < streams.n; i++) {
    const vel = streams.vel[i];
    // Guard against zero / near-zero velocity (stopped or GPS artefact)
    const paceMinPerKm = vel > 0.1 ? 1000 / (vel * 60) : 0;
    points.push({
      distM: streams.dist[i],
      paceMinPerKm,
      hr: streams.hr ? streams.hr[i] : null,
      cad: streams.cad ? streams.cad[i] * 2 : null,
      alt: streams.alt ? streams.alt[i] : null,
    });
  }
  return points;
}

/** Returns true when streams data is present (not null, not the {} sentinel) */
function hasValidStreams(streams: Activity['streams']): streams is ActivityStreams {
  return streams !== null && Object.keys(streams).length > 0;
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

// ---- HR Zone helpers ----

const HR_ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;

interface HrZoneResult {
  label: string;
  seconds: number;
  pct: number;
}

function computeHrZones(splits: DispatchSplit[], maxHr: number): HrZoneResult[] {
  if (maxHr <= 0) return HR_ZONE_LABELS.map((label) => ({ label, seconds: 0, pct: 0 }));
  const totals = [0, 0, 0, 0, 0];
  let total = 0;
  for (const s of splits) {
    if (s.hr === null || s.movingTime === undefined) continue;
    const pct = s.hr / maxHr;
    let zone = 0;
    if (pct >= 0.9) zone = 4;
    else if (pct >= 0.8) zone = 3;
    else if (pct >= 0.7) zone = 2;
    else if (pct >= 0.6) zone = 1;
    totals[zone] += s.movingTime;
    total += s.movingTime;
  }
  return HR_ZONE_LABELS.map((label, i) => ({
    label,
    seconds: totals[i],
    pct: total > 0 ? totals[i] / total : 0,
  }));
}

/**
 * Compute HR zones from per-second (downsampled) streams data.
 * Uses `streams.time` to derive exact duration per point.
 * Zones: Z1 <60%, Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 ≥90% of maxHr.
 */
function computeHrZonesFromStreams(streams: ActivityStreams, maxHr: number): HrZoneResult[] {
  if (maxHr <= 0) return HR_ZONE_LABELS.map((label) => ({ label, seconds: 0, pct: 0 }));
  // streams.hr is guaranteed non-null by the caller's type guard
  const hrArr = streams.hr as number[];
  const timeArr = streams.time;
  // Average stride duration — used as fallback for the last point
  const avgStride = streams.n > 1 ? timeArr[streams.n - 1] / (streams.n - 1) : 1;

  const totals = [0, 0, 0, 0, 0];
  let total = 0;

  for (let i = 0; i < streams.n; i++) {
    const hr = hrArr[i];
    if (hr === null || hr === undefined) continue;
    // Duration this sample represents (seconds)
    const duration = i < streams.n - 1 ? timeArr[i + 1] - timeArr[i] : avgStride;
    if (duration <= 0) continue;

    const pct = hr / maxHr;
    let zone = 0;
    if (pct >= 0.9) zone = 4;
    else if (pct >= 0.8) zone = 3;
    else if (pct >= 0.7) zone = 2;
    else if (pct >= 0.6) zone = 1;
    totals[zone] += duration;
    total += duration;
  }

  return HR_ZONE_LABELS.map((label, i) => ({
    label,
    seconds: Math.round(totals[i]),
    pct: total > 0 ? totals[i] / total : 0,
  }));
}

/** Returns true when streams data has valid HR array (not null, not empty sentinel) */
function hasValidStreamsHr(streams: Activity['streams']): streams is ActivityStreams & { hr: number[] } {
  return (
    streams !== null &&
    Object.keys(streams).length > 0 &&
    (streams as ActivityStreams).hr !== null
  );
}

function formatZoneTime(seconds: number): string {
  if (seconds === 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m${s > 0 ? ` ${s}s` : ''}`;
}

// ---- Main component ----

export function Dispatch({ activity, weeklyKm, splits, userMaxHr, onBack, onNav, onAnalyze, isAnalyzing }: DispatchProps) {
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

  // Compute average cadence — streams first (×2 to convert half-cadence), splits fallback
  let avgCad: number | null = null;
  if (hasValidStreams(activity.streams) && activity.streams.cad !== null) {
    const cadArr = activity.streams.cad as number[];
    const nonNull = cadArr.filter((v): v is number => v !== null && v !== undefined);
    if (nonNull.length > 0) {
      avgCad = Math.round((nonNull.reduce((a, b) => a + b, 0) / nonNull.length) * 2);
    }
  } else if (hasSplits) {
    const cadValues = splits!
      .map((s) => s.cad)
      .filter((v): v is number => v !== null);
    if (cadValues.length > 0) {
      avgCad = Math.round(cadValues.reduce((a, b) => a + b, 0) / cadValues.length);
    }
  }

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
                value: avgCad !== null ? String(avgCad) : '—',
                unit: avgCad !== null ? 'spm' : '',
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

            {(() => {
              // ---- Determine data source: streams (hi-res) or splits (fallback) ----
              const useStreams = hasValidStreams(activity.streams);

              // When neither streams nor splits are available, show placeholder
              if (!useStreams && !hasSplits) {
                return (
                  <div className="font-body text-[12px] italic opacity-55">
                    Lap data unavailable — splits sync coming in a future update.
                  </div>
                );
              }

              // ---- Build unified chart points ----
              // Each point: { x (SVG domain value), paceMinPerKm, hr, cad, alt }
              // For streams: x = distM (metres).  For splits: x = km index (0-based integer).

              interface UnifiedPoint {
                x: number;            // domain x value
                paceMinPerKm: number;
                hr: number | null;
                cad: number | null;
                alt: number | null;
              }

              let chartPoints: UnifiedPoint[];
              let xAxisLabels: { x: number; label: string }[];
              let showPaceDots: boolean;

              if (useStreams) {
                const streamPts = streamsToChartPoints(activity.streams as ActivityStreams);
                // Filter out stopped/zero-pace points to keep the pace line clean
                const validPts = streamPts.filter((p) => p.paceMinPerKm > 0 && p.paceMinPerKm < 30);
                chartPoints = validPts.map((p) => ({
                  x: p.distM,
                  paceMinPerKm: p.paceMinPerKm,
                  hr: p.hr,
                  cad: p.cad,
                  alt: p.alt,
                }));

                // X-axis: km markers every step metres
                const totalDistM = chartPoints.length > 0 ? chartPoints[chartPoints.length - 1].x : 0;
                const step = Math.max(1, Math.ceil(totalDistM / 5000)) * 1000;
                const kmMarkers: { x: number; label: string }[] = [];
                for (let m = step; m <= totalDistM; m += step) {
                  kmMarkers.push({ x: m, label: String(Math.round(m / 1000)) });
                }
                xAxisLabels = kmMarkers;
                showPaceDots = false; // too many points at hi-res
              } else {
                const splitData = splits!;
                chartPoints = splitData.map((s, i) => ({
                  x: i,
                  paceMinPerKm: parsePaceToSeconds(s.pace) / 60,
                  hr: s.hr,
                  cad: s.cad,
                  alt: s.elev,
                }));
                xAxisLabels = splitData.map((s, i) => ({ x: i, label: String(s.km) }));
                showPaceDots = true;
              }

              // ---- Chart viewport constants ----
              const W = 600;
              const H = 140;
              const padTop = 10;
              const padRight = 42;
              const padBottom = 24;
              const padLeft = 38;
              const chartX0 = padLeft;
              const chartX1 = W - padRight;
              const chartY0 = padTop;
              const chartY1 = H - padBottom;

              const n = chartPoints.length;

              // Domain extents for x
              const xMin = chartPoints.length > 0 ? chartPoints[0].x : 0;
              const xMax = chartPoints.length > 0 ? chartPoints[n - 1].x : 1;
              const xRange = xMax - xMin;

              // SVG x coordinate from domain value
              const xSvg = (domainX: number): number => {
                if (xRange === 0) return (chartX0 + chartX1) / 2;
                return chartX0 + ((domainX - xMin) / xRange) * (chartX1 - chartX0);
              };

              // Pace range (in seconds for consistency with parsePaceToSeconds)
              const paceSecs = chartPoints.map((p) => p.paceMinPerKm * 60);
              const minPace = Math.min(...paceSecs);
              const maxPace = Math.max(...paceSecs);
              const paceRange = maxPace - minPace;

              // SVG y coordinate for pace (inverted: faster = higher = smaller y)
              const yPace = (sec: number): number => {
                if (paceRange === 0) return (chartY0 + chartY1) / 2;
                return chartY0 + ((sec - minPace) / paceRange) * (chartY1 - chartY0);
              };

              // Pace polyline points
              const pacePoints = chartPoints
                .map((p) => `${xSvg(p.x)},${yPace(p.paceMinPerKm * 60)}`)
                .join(' ');

              // Average pace reference line — use authoritative Strava value so the
              // dashed line and left Y-axis "avg" label match the stats strip exactly.
              // A simple mean over downsampled stream points would be wrong because each
              // point covers a different actual duration.
              const avgPaceSec = activity.average_pace_min_per_km * 60;
              const avgY = yPace(avgPaceSec);

              // Overlay values
              const overlayValues: Record<OverlayKey, (number | null)[]> = {
                hr: chartPoints.map((p) => p.hr),
                elev: chartPoints.map((p) => p.alt),
                cad: chartPoints.map((p) => p.cad),
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
                    currentSegment.push(`${xSvg(chartPoints[i].x)},${yOverlay(v)}`);
                  }
                }
                if (currentSegment.length > 0) {
                  segments.push(currentSegment.join(' '));
                }
                return segments;
              };

              // Overlay dot positions (only rendered for low-res splits)
              const buildOverlayDots = (key: OverlayKey): { x: number; y: number }[] => {
                if (!showPaceDots) return [];
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
                  .map((v, i) => (v !== null ? { x: xSvg(chartPoints[i].x), y: yOverlay(v) } : null))
                  .filter((d): d is { x: number; y: number } => d !== null);
              };

              const overlaySegments = activeOverlay ? buildOverlaySegments(activeOverlay) : [];
              const overlayDots = activeOverlay ? buildOverlayDots(activeOverlay) : [];

              const overlayLabelMap: Record<OverlayKey, string> = {
                hr: 'HR · BPM',
                elev: 'ELEV · m',
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
                    overflow="visible"
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

                    {/* Overlay dots (splits mode only) */}
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

                    {/* Pace dots (splits mode only — too many to render at hi-res) */}
                    {showPaceDots && chartPoints.map((p, i) => (
                      <circle
                        key={i}
                        cx={xSvg(p.x)}
                        cy={yPace(p.paceMinPerKm * 60)}
                        r="3"
                        fill="var(--color-ink)"
                      />
                    ))}

                    {/* X-axis labels */}
                    {xAxisLabels.map((lbl) => (
                      <text
                        key={lbl.label}
                        x={xSvg(lbl.x)}
                        y={H - 6}
                        textAnchor="middle"
                        fontFamily="var(--font-mono-tabloid)"
                        fontSize="9"
                        fill="var(--color-ink)"
                        opacity="0.6"
                      >
                        {lbl.label}
                      </text>
                    ))}

                    {/* Left Y-axis — pace labels (min, avg, max) */}
                    {(() => {
                      const leftLabels: { y: number; label: string; opacity: number }[] = [
                        { y: yPace(minPace), label: formatPace(minPace / 60), opacity: 0.65 },
                        { y: avgY,           label: formatPace(avgPaceSec / 60), opacity: 0.45 },
                        { y: yPace(maxPace), label: formatPace(maxPace / 60), opacity: 0.65 },
                      ];
                      return leftLabels.map(({ y, label, opacity }, idx) => (
                        <g key={idx}>
                          <line
                            x1={chartX0 - 2}
                            y1={y}
                            x2={chartX0}
                            y2={y}
                            stroke="var(--color-ink)"
                            strokeWidth="1"
                            opacity="0.4"
                          />
                          <text
                            x={chartX0 - 4}
                            y={y}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fontFamily="var(--font-mono-tabloid)"
                            fontSize="8"
                            fill="var(--color-ink)"
                            opacity={opacity}
                          >
                            {label}
                          </text>
                        </g>
                      ));
                    })()}

                    {/* Right Y-axis — overlay labels (min, mid, max) — only when overlay active */}
                    {(() => {
                      if (!activeOverlay || overlayDisabled[activeOverlay]) return null;
                      const vals = overlayValues[activeOverlay];
                      const nonNull = vals.filter((v): v is number => v !== null);
                      if (nonNull.length === 0) return null;
                      const minVal = Math.min(...nonNull);
                      const maxVal = Math.max(...nonNull);
                      const range = maxVal - minVal;
                      // Use the activity's authoritative average where available so the
                      // mid label reflects the true mean, not a geometric midpoint.
                      let midVal: number;
                      if (activeOverlay === 'hr' && activity.average_hr !== null && activity.average_hr !== undefined) {
                        midVal = activity.average_hr;
                      } else if (activeOverlay === 'cad' && avgCad !== null) {
                        midVal = avgCad;
                      } else {
                        midVal = (minVal + maxVal) / 2; // fallback for elevation or when averages unavailable
                      }

                      const yOverlayAxis = (v: number): number => {
                        if (range === 0) return (chartY0 + chartY1) / 2;
                        return chartY1 - ((v - minVal) / range) * (chartY1 - chartY0);
                      };

                      const fmtOverlayLabel = (v: number): string => {
                        if (activeOverlay === 'elev') {
                          return v >= 0 ? `+${Math.round(v)}` : String(Math.round(v));
                        }
                        return String(Math.round(v));
                      };

                      const rightLabels: { y: number; label: string; opacity: number }[] = [
                        { y: yOverlayAxis(maxVal), label: fmtOverlayLabel(maxVal), opacity: 0.65 },
                        { y: yOverlayAxis(midVal), label: fmtOverlayLabel(midVal), opacity: 0.45 },
                        { y: yOverlayAxis(minVal), label: fmtOverlayLabel(minVal), opacity: 0.65 },
                      ];

                      return rightLabels.map(({ y, label, opacity }, idx) => (
                        <g key={idx}>
                          <line
                            x1={chartX1}
                            y1={y}
                            x2={chartX1 + 2}
                            y2={y}
                            stroke="var(--color-accent)"
                            strokeWidth="1"
                            opacity="0.4"
                          />
                          <text
                            x={chartX1 + 4}
                            y={y}
                            textAnchor="start"
                            dominantBaseline="middle"
                            fontFamily="var(--font-mono-tabloid)"
                            fontSize="8"
                            fill="var(--color-accent)"
                            opacity={opacity}
                          >
                            {label}
                          </text>
                        </g>
                      ));
                    })()}

                    {/* Min/max markers on pace line */}
                    {(() => {
                      if (n < 3) return null;
                      const skipCount = Math.max(1, Math.floor(n * 0.03));
                      const searchSlice = paceSecs.slice(skipCount, n - skipCount);
                      if (searchSlice.length === 0) return null;

                      let minIdx = skipCount;
                      let maxIdx = skipCount;
                      for (let i = skipCount + 1; i < n - skipCount; i++) {
                        if (paceSecs[i] < paceSecs[minIdx]) minIdx = i;
                        if (paceSecs[i] > paceSecs[maxIdx]) maxIdx = i;
                      }

                      // minPaceIdx = fastest (low seconds) → near top of chart (low cy)
                      // maxPaceIdx = slowest (high seconds) → near bottom of chart (high cy)
                      const markers: { idx: number; label: string; isMin: boolean }[] = [];
                      markers.push({ idx: minIdx, label: formatPace(paceSecs[minIdx] / 60), isMin: true });
                      if (maxIdx !== minIdx) {
                        markers.push({ idx: maxIdx, label: formatPace(paceSecs[maxIdx] / 60), isMin: false });
                      }

                      return markers.map(({ idx, label, isMin }, mi) => {
                        const cx = xSvg(chartPoints[idx].x);
                        const cy = yPace(paceSecs[idx]);
                        const clampedX = Math.max(chartX0 + 4, Math.min(chartX1 - 4, cx));
                        // isMin = fastest pace = near top → leader goes UP; leader end at y=3, label at y=2
                        // !isMin = slowest pace = near bottom → leader goes DOWN; leader end at chartY1+3, label at chartY1+11
                        const leaderEndY = isMin ? 3 : chartY1 + 3;
                        const labelY = isMin ? 2 : chartY1 + 11;
                        // Leader starts from circle edge toward label
                        const leaderStartY = isMin ? cy - 3 : cy + 3;
                        // Dynamic text anchor to prevent clipping near edges
                        const leftThreshold = chartX0 + (chartX1 - chartX0) * 0.25;
                        const rightThreshold = chartX0 + (chartX1 - chartX0) * 0.75;
                        const paceAnchor = clampedX < leftThreshold ? 'start' : clampedX > rightThreshold ? 'end' : 'middle';
                        return (
                          <g key={mi}>
                            {/* Leader line */}
                            <line
                              x1={clampedX}
                              y1={leaderStartY}
                              x2={clampedX}
                              y2={leaderEndY}
                              stroke="var(--color-ink)"
                              strokeWidth="0.75"
                              strokeDasharray="2 2"
                              opacity="0.5"
                            />
                            {/* Circle marker stays on the data point */}
                            <circle cx={cx} cy={cy} r="3" fill="var(--color-ink)" />
                            <text
                              x={clampedX}
                              y={labelY}
                              textAnchor={paceAnchor}
                              dominantBaseline="auto"
                              fontFamily="var(--font-mono-tabloid)"
                              fontSize="8"
                              fill="var(--color-ink)"
                              opacity="0.9"
                            >
                              {label}
                            </text>
                          </g>
                        );
                      });
                    })()}

                    {/* Min/max markers on overlay line */}
                    {(() => {
                      if (!activeOverlay || overlayDisabled[activeOverlay]) return null;
                      if (n < 3) return null;
                      const skipCount = Math.max(1, Math.floor(n * 0.03));
                      const vals = overlayValues[activeOverlay];
                      const nonNull = vals.filter((v): v is number => v !== null);
                      if (nonNull.length === 0) return null;

                      const oMinVal = Math.min(...nonNull);
                      const oMaxVal = Math.max(...nonNull);
                      const oRange = oMaxVal - oMinVal;

                      const yOverlayMark = (v: number): number => {
                        if (oRange === 0) return (chartY0 + chartY1) / 2;
                        return chartY1 - ((v - oMinVal) / oRange) * (chartY1 - chartY0);
                      };

                      const fmtOverlayMark = (v: number): string => {
                        if (activeOverlay === 'elev') {
                          return v >= 0 ? `+${Math.round(v)}` : String(Math.round(v));
                        }
                        return String(Math.round(v));
                      };

                      let oMinIdx = -1;
                      let oMaxIdx = -1;
                      for (let i = skipCount; i < n - skipCount; i++) {
                        const v = vals[i];
                        if (v === null) continue;
                        if (oMinIdx === -1 || v < (vals[oMinIdx] as number)) oMinIdx = i;
                        if (oMaxIdx === -1 || v > (vals[oMaxIdx] as number)) oMaxIdx = i;
                      }

                      if (oMinIdx === -1) return null;

                      const overlayMarkers: { idx: number; label: string }[] = [];
                      overlayMarkers.push({ idx: oMinIdx, label: fmtOverlayMark(vals[oMinIdx] as number) });
                      if (oMaxIdx !== oMinIdx) {
                        overlayMarkers.push({ idx: oMaxIdx, label: fmtOverlayMark(vals[oMaxIdx] as number) });
                      }

                      return overlayMarkers.map(({ idx, label }, mi) => {
                        const cx = xSvg(chartPoints[idx].x);
                        const cy = yOverlayMark(vals[idx] as number);
                        const clampedX = Math.max(chartX0 + 4, Math.min(chartX1 - 4, cx));
                        // oMaxIdx = highest overlay value = near top of chart (low cy) → leader UP
                        // oMinIdx = lowest overlay value = near bottom of chart (high cy) → leader DOWN
                        const isMax = idx === oMaxIdx;
                        const leaderEndY = isMax ? 3 : chartY1 + 3;
                        const labelY = isMax ? 2 : chartY1 + 11;
                        const leaderStartY = isMax ? cy - 3 : cy + 3;
                        // Dynamic text anchor to prevent clipping near edges
                        const leftThreshold = chartX0 + (chartX1 - chartX0) * 0.25;
                        const rightThreshold = chartX0 + (chartX1 - chartX0) * 0.75;
                        const overlayAnchor = clampedX < leftThreshold ? 'start' : clampedX > rightThreshold ? 'end' : 'middle';
                        return (
                          <g key={mi}>
                            {/* Leader line */}
                            <line
                              x1={clampedX}
                              y1={leaderStartY}
                              x2={clampedX}
                              y2={leaderEndY}
                              stroke="var(--color-accent)"
                              strokeWidth="0.75"
                              strokeDasharray="2 2"
                              opacity="0.5"
                            />
                            {/* Circle marker stays on the data point */}
                            <circle cx={cx} cy={cy} r="3" fill="var(--color-accent)" />
                            <text
                              x={clampedX}
                              y={labelY}
                              textAnchor={overlayAnchor}
                              dominantBaseline="auto"
                              fontFamily="var(--font-mono-tabloid)"
                              fontSize="8"
                              fill="var(--color-accent)"
                              opacity="0.9"
                            >
                              {label}
                            </text>
                          </g>
                        );
                      });
                    })()}
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
              {!hasSplits && !hasValidStreamsHr(activity.streams) ? (
                <p className="font-body italic text-[12px] opacity-55">
                  HR zones unavailable — no splits data.
                </p>
              ) : userMaxHr == null ? (
                <p className="font-body italic text-[12px] opacity-55">
                  Set your max HR in Settings to see HR zones.
                </p>
              ) : (() => {
                const zones = hasValidStreamsHr(activity.streams)
                  ? computeHrZonesFromStreams(activity.streams, userMaxHr)
                  : computeHrZones(splits ?? [], userMaxHr);
                const hasAnyHrData = zones.some((z) => z.seconds > 0);
                if (!hasAnyHrData) {
                  return (
                    <p className="font-body italic text-[12px] opacity-55">
                      HR zones unavailable — no HR data in splits.
                    </p>
                  );
                }
                return (
                  <div className="space-y-[5px]" style={{ fontFamily: 'var(--font-mono-tabloid)', fontVariantNumeric: 'tabular-nums' }}>
                    {zones.map((zone, i) => (
                      <div key={zone.label} className="grid grid-cols-[24px_1fr_52px] items-center gap-2">
                        <div className="font-sans text-[9px] uppercase tracking-widest font-semibold opacity-70">
                          {zone.label}
                        </div>
                        <div className="h-[8px] bg-[var(--color-paper-soft-3)] border border-[var(--color-hairline)] relative">
                          <div
                            className="absolute inset-y-0 left-0"
                            style={{
                              width: `${zone.pct * 100}%`,
                              backgroundColor: i >= 3 ? 'var(--color-accent)' : 'var(--color-ink)',
                            }}
                          />
                        </div>
                        <div className="text-right text-[10px]">
                          {formatZoneTime(zone.seconds)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

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
