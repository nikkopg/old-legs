// READY FOR QA
// Component: FrontPage (TASK-128)
// What was built: Tabloid newspaper front page — activities list styled as a broadsheet front page.
//   Lead story = most recent activity, previous editions = all subsequent activities.
//   Sidebar shows weekly mileage standings and notices.
// Edge cases to test:
//   - Empty activities array: shows "No editions yet." in lead area, no previous editions list
//   - Single activity: lead renders, no previous editions section content (shows "No previous editions.")
//   - Activity with distance_km === 0 (MISSED): stats col shows "—" in accent
//   - Activity with no HR data: HR and max HR stats show "—"
//   - weeklyKm array ordering: oldest should be W-3, newest should be "This"
//   - lastSyncedAt null: shows "synced recently"
//   - Long verdict_short text wrapping in lead headline and edition rows

'use client';

import type { Activity } from '@/types/api';
import { ToneBadge } from './ToneBadge';
import { NewspaperChrome, Paper } from './NewspaperChrome';

export interface WeeklyKmEntry {
  label: string; // "This", "W-1", "W-2", "W-3"
  km: number;
  runs: number;
  current?: boolean;
}

export interface FrontPageProps {
  activities: Activity[];
  weeklyKm: WeeklyKmEntry[];
  lastSyncedAt?: string | null;
  onActivityClick: (id: number) => void;
  onRefreshSync: () => void;
  onNav?: (key: string) => void;
  isSyncing?: boolean;
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
} {
  const date = new Date(isoString);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const daysFull = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  const monthsFull = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const dow = days[date.getDay()];
  const day = String(date.getDate());
  const mon = months[date.getMonth()];
  const full = `${daysFull[date.getDay()]} ${date.getDate()} ${monthsFull[date.getMonth()]} ${date.getFullYear()}`;
  return { dow, day, mon, full };
}

function inferTone(activity: Activity): 'critical' | 'good' | 'neutral' {
  if (activity.tone === 'critical' || activity.tone === 'good' || activity.tone === 'neutral') {
    return activity.tone;
  }
  return 'neutral';
}

function inferVerdictTag(activity: Activity): string {
  if (activity.verdict_tag) {
    return activity.verdict_tag;
  }
  if (activity.name?.toUpperCase().includes('MISSED')) {
    return 'NO SHOW';
  }
  return '—';
}

function getVerdictHeadline(activity: Activity): string {
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

function timeAgo(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

// ---- Sub-components ----

function DoubleRule() {
  return (
    <div>
      <div className="border-t-[3px] border-[var(--color-ink)]" />
      <div className="border-t border-[var(--color-ink)] mt-[3px]" />
    </div>
  );
}

// ---- Main component ----

export function FrontPage({
  activities,
  weeklyKm,
  lastSyncedAt,
  onActivityClick,
  onRefreshSync,
  onNav,
  isSyncing = false,
}: FrontPageProps) {
  const lead = activities[0] ?? null;
  const previousEditions = activities.slice(1);

  // Current week entry for footer stats
  const currentWeek = weeklyKm.find((w) => w.current);

  return (
    <Paper width={980}>

        <NewspaperChrome
          section="Dispatches · The Editions"
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

        {/* Lead story */}
        {lead === null ? (
          <div className="py-10 mt-5 text-center">
            <div className="font-display text-[44px] uppercase leading-none tracking-[-0.03em]">
              No editions yet. Connect Strava and run.
            </div>
          </div>
        ) : (
          <div className="pb-[14px] mt-5 border-b-[3px] border-[var(--color-ink)] cursor-pointer" onClick={() => onActivityClick(lead.id)}>
            {/* Lead header row */}
            <div className="flex justify-between items-center mb-3">
              <span className="font-sans text-[10px] uppercase tracking-widest opacity-70">
                Today&#39;s Lead · Post-Run Dispatch
              </span>
              <ToneBadge tone={inferTone(lead)}>{inferVerdictTag(lead)}</ToneBadge>
            </div>

            {/* Lead 2-col grid */}
            <div className="grid grid-cols-[1.35fr_1fr] gap-7">
              {/* Left col */}
              <div>
                <div className="font-sans text-[9px] uppercase tracking-widest opacity-60 mb-2">
                  {(() => {
                    const d = formatActivityDate(lead.activity_date);
                    return `${d.dow} ${d.day} ${d.mon} · ${lead.name}`;
                  })()}
                </div>
                <div className="font-display text-[64px] leading-none tracking-[-0.03em] mb-3">
                  {toSentenceCase(getVerdictHeadline(lead))}
                </div>
                <div className="font-body text-[14px] leading-relaxed mb-3">
                  Pak Har&#39;s full dispatch is inside — splits, zones, the detail.{' '}
                  <span className="text-[var(--color-accent)] font-sans text-[11px] font-bold uppercase tracking-[0.125rem]">
                    Read on →
                  </span>
                </div>
              </div>

              {/* Right col — Scoreboard */}
              <div className="border-[3px] border-[var(--color-ink)] p-[14px_18px] bg-[var(--color-paper-soft)]">
                <div className="font-sans text-[9px] uppercase tracking-[0.2em] opacity-60 mb-3">
                  The Scoreboard
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    ['DIST', `${lead.distance_km.toFixed(1)} km`],
                    ['TIME', formatMovingTime(lead.moving_time_seconds)],
                    ['PACE', `${formatPace(lead.average_pace_min_per_km)}/km`],
                    ['AVG HR', lead.average_hr !== null ? `${lead.average_hr} bpm` : '—'],
                    ['MAX HR', lead.max_hr !== null ? `${lead.max_hr} bpm` : '—'],
                    ['ELEV', `+${lead.elevation_gain_m}m`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="font-sans text-[8px] uppercase tracking-widest opacity-60">
                        {label}
                      </div>
                      <div
                        className="text-[20px] font-bold leading-none mt-0.5"
                        style={{ fontFamily: 'var(--font-mono-tabloid)', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two-column section */}
        <div className="flex gap-7 mt-6">

          {/* Main column — Previous editions */}
          <div className="flex-1">
            <div className="flex justify-between items-baseline mb-1">
              <span className="font-sans text-[10px] uppercase tracking-widest font-semibold">
                Previous Editions
              </span>
              <span className="font-sans text-[9px] uppercase tracking-widest opacity-55">
                tap an edition to read →
              </span>
            </div>

            {/* Double rule */}
            <div className="mt-1 mb-0">
              <DoubleRule />
            </div>

            {/* Previous editions list */}
            {previousEditions.length === 0 ? (
              <p className="font-body italic text-[13px] opacity-60 py-6">
                No previous editions.
              </p>
            ) : (
              <div>
                {previousEditions.map((activity) => {
                  const d = formatActivityDate(activity.activity_date);
                  const isMissed = activity.distance_km === 0;
                  const tone = inferTone(activity);
                  const tag = inferVerdictTag(activity);
                  const headline = getVerdictHeadline(activity);

                  return (
                    <div
                      key={activity.id}
                      className="grid grid-cols-[76px_1fr_260px] gap-[18px] py-3.5 border-b border-[var(--color-ink)] last:border-b-0 cursor-pointer hover:bg-[var(--color-paper-soft)] transition-colors"
                      onClick={() => onActivityClick(activity.id)}
                    >
                      {/* Date gutter */}
                      <div className="flex flex-col items-center text-center">
                        <span className="font-sans text-[9px] uppercase tracking-widest opacity-60">
                          {d.dow}
                        </span>
                        <span className="font-display text-[32px] leading-none">
                          {d.day}
                        </span>
                        <span className="font-sans text-[9px] uppercase tracking-widest opacity-60">
                          {d.mon}
                        </span>
                      </div>

                      {/* Headline col */}
                      <div>
                        <div className="flex items-center flex-wrap gap-1">
                          <ToneBadge tone={tone}>{tag}</ToneBadge>
                          <span className="font-sans text-[9px] uppercase tracking-widest opacity-60 ml-2 inline">
                            {activity.name}
                          </span>
                        </div>
                        <div className="font-display text-[28px] leading-[1.1] tracking-[-0.015em] mt-1 mb-1">
                          {toSentenceCase(headline)}
                        </div>
                        <div className="font-sans text-[10px] uppercase tracking-widest opacity-55">
                          by Pak Har · read the dispatch →
                        </div>
                      </div>

                      {/* Stats col */}
                      <div className="text-right" style={{ fontFamily: 'var(--font-mono-tabloid)', fontVariantNumeric: 'tabular-nums' }}>
                        {isMissed ? (
                          <div className="font-display text-[32px] text-[var(--color-accent)]">—</div>
                        ) : (
                          <>
                            <div className="text-[20px] font-bold">
                              {activity.distance_km.toFixed(1)}
                              <span className="text-[11px] font-normal opacity-60"> km</span>
                            </div>
                            <div className="text-[13px] mt-[2px]">
                              {formatMovingTime(activity.moving_time_seconds)} · {formatPace(activity.average_pace_min_per_km)}/km
                            </div>
                            {(activity.average_hr !== null || activity.elevation_gain_m > 0) && (
                              <div className="text-[11px] opacity-65 mt-[2px]">
                                {activity.average_hr !== null ? `${activity.average_hr} bpm` : '—'} · +{activity.elevation_gain_m} m
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="w-[260px] shrink-0 border-l border-[var(--color-ink)] pl-[18px]">
            {/* The Standings */}
            <div className="font-sans text-[10px] uppercase tracking-[0.2em] font-bold">
              The Standings
            </div>
            <div className="font-sans text-[9px] uppercase tracking-widest opacity-60 mb-3">
              Weekly Mileage
            </div>

            {/* Bar chart rows — oldest first: W-3, W-2, W-1, This */}
            {[...weeklyKm].reverse().map((entry) => (
              <div
                key={entry.label}
                className="grid grid-cols-[44px_1fr_48px] gap-2 items-center mb-2"
              >
                <span
                  className={`font-sans text-[10px] uppercase tracking-[0.05em] ${entry.current ? 'font-bold' : ''}`}
                >
                  {entry.label}
                </span>
                <div className="h-[10px] bg-[var(--color-paper-soft-3)] border border-[var(--color-ink)] relative">
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${Math.min((entry.km / 40) * 100, 100)}%`,
                      backgroundColor: entry.current ? 'var(--color-accent)' : 'var(--color-ink)',
                    }}
                  />
                </div>
                <span
                  className="text-[11px] text-right"
                  style={{ fontFamily: 'var(--font-mono-tabloid)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {entry.km.toFixed(1)}
                </span>
              </div>
            ))}

            {/* Standings footer */}
            <div className="font-sans text-[9px] uppercase tracking-widest opacity-55 mt-2 mb-4">
              {currentWeek
                ? `${currentWeek.runs} runs · ${currentWeek.km.toFixed(1)} km so far`
                : '—'}
            </div>

            {/* Hairline */}
            <div className="border-t border-[var(--color-hairline)] my-4" />

            {/* Notices */}
            <div className="font-sans text-[10px] uppercase tracking-[0.2em] font-bold mb-2">
              Notices
            </div>
            <div className="font-body text-[12px] leading-relaxed space-y-2">
              <p>
                Strava: synced {lastSyncedAt ? timeAgo(lastSyncedAt) : 'recently'}.{' '}
                <button
                  onClick={isSyncing ? undefined : onRefreshSync}
                  disabled={isSyncing}
                  className="font-sans text-[10px] uppercase tracking-widest underline decoration-[var(--color-ink)] cursor-pointer disabled:opacity-40 disabled:cursor-default"
                >
                  {isSyncing ? 'Syncing_' : 'Tap Refresh for latest'}
                </button>
              </p>
              <p>This week&#39;s plan is filed on page 2.</p>
              <p>
                <em className="opacity-55">&#34;Besok pagi, lari lagi ya.&#34;</em>
              </p>
            </div>

            {/* Hairline */}
            <div className="border-t border-[var(--color-hairline)] my-4" />

            {/* Coach on Duty */}
            <div className="font-sans text-[10px] uppercase tracking-[0.2em] font-bold mb-1">
              Coach on Duty
            </div>
            <div className="font-display text-[26px] uppercase leading-none">
              Pak Har
            </div>
            <div className="font-sans text-[10px] uppercase tracking-widest opacity-60 mt-1">
              Senior Coach · Since 1976
            </div>
          </aside>
        </div>

        {/* Footer rail */}
        <div className="flex justify-between items-baseline mt-8 pt-3 border-t border-[var(--color-ink)] font-sans text-[10px] uppercase tracking-widest opacity-70">
          <span>Filed at Braga · Bandung</span>
          <span>&#34;Besok pagi, lari lagi ya.&#34;</span>
          <span>— continued page 2: Plan for the week —</span>
        </div>
    </Paper>
  );
}

export default FrontPage;
