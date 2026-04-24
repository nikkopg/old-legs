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

import type { Activity } from '@/types/api';
import type { WeeklyKmEntry } from './FrontPage';

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
  return `“${second.trim()}”`;
}

function getAnalysisParagraphs(analysis: string): string[] {
  const rawParas = analysis.split(/\n\n|\n/).filter((p) => p.trim().length > 0);
  return rawParas;
}

// ---- Sub-components ----

function ThickRule({ className = '' }: { className?: string }) {
  return <div className={`border-t-[3px] border-[#141210] ${className}`} />;
}

function Hairline({ className = '' }: { className?: string }) {
  return <div className={`border-t border-[rgba(20,18,16,0.35)] ${className}`} />;
}

// ---- Main component ----

export function Dispatch({ activity, weeklyKm, splits, onBack }: DispatchProps) {
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

  return (
    <div className="min-h-screen bg-[#1a1612] flex justify-center items-start py-10 px-5">
      <div className="w-[760px] max-w-full">

        {/* Back button */}
        <button
          onClick={onBack}
          className="text-[rgba(244,239,228,0.6)] hover:text-[#f4efe4] font-sans text-[10px] uppercase tracking-widest cursor-pointer mb-4 inline-block transition-colors"
        >
          ← Back to editions
        </button>

        {/* Paper */}
        <div className="bg-[#f4efe4] text-[#141210] w-full px-9 pt-7 pb-12">

          {/* Top rail */}
          <div className="flex justify-between items-baseline text-[10px] font-sans font-medium uppercase tracking-widest opacity-75 pb-2">
            <span>Vol. III · Edition No. 412</span>
            <span>Old Legs Daily · Post-Run Dispatch</span>
            <span>{dateInfo.full}</span>
          </div>

          {/* Thick rule */}
          <ThickRule className="my-[10px]" />

          {/* Masthead */}
          <div className="text-center py-[6px]">
            <div className="font-display text-[64px] uppercase tracking-[-0.04em] leading-none">
              The Old Legs
            </div>
            <div className="font-sans text-[10px] tracking-[0.375em] uppercase opacity-60 mt-1">
              · No Cheerleading Since 1976 ·
            </div>
          </div>

          {/* Thick rule */}
          <ThickRule className="my-[10px]" />

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
            <div className="border-l border-[rgba(20,18,16,0.4)] pl-4">
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

          {/* Pace chart placeholder */}
          <div className="border border-[#141210] p-3 bg-[rgba(20,18,16,0.015)] my-5">
            <div className="font-sans text-[10px] uppercase tracking-widest opacity-70 mb-2">
              PACE PER KILOMETRE
            </div>
            <div className="font-body text-[12px] italic opacity-55">
              Lap data unavailable — splits sync coming in a future update.
            </div>
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
                <p className="font-body italic text-[13px] opacity-60">
                  Pak Har hasn&#39;t seen this run yet.
                </p>
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
                    <div className="border-y-2 border-[#8a2a12] py-[10px] my-4 font-display text-[20px] italic text-center text-[#8a2a12]">
                      {pullQuote}
                    </div>
                  )}

                  {/* Sign-off */}
                  <div className="font-sans text-[9px] uppercase tracking-widest opacity-70 text-right mt-4">
                    — PAK HAR · POST-RUN DISPATCH
                  </div>
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
                    <tr className="border-b border-[#141210]">
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
                          className="border-b border-dotted border-[rgba(20,18,16,0.3)]"
                        >
                          <td className="text-right py-[2px] px-[6px]">{split.km}</td>
                          <td
                            className={`text-right py-[2px] px-[6px] ${paceAccent ? 'text-[#8a2a12] font-bold' : ''}`}
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
                  <div className="h-[10px] bg-[rgba(20,18,16,0.08)] border border-[rgba(20,18,16,0.3)] relative">
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${Math.min((entry.km / 40) * 100, 100)}%`,
                        backgroundColor: entry.current ? '#8a2a12' : '#141210',
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
            <span>Filed at Senayan · Jakarta</span>
            <span>&#34;Besok pagi, lari lagi ya.&#34;</span>
            <span>— continued page 2: Plan for the week —</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dispatch;
