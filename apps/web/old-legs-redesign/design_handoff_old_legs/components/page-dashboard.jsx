// Dashboard (/dashboard) — broadsheet front page.
// Lead = Today's session / weekly stats hero.
// Sidebar = Today's plan card + Standings + Notices.
// Below-fold = Last run snapshot with link to dispatch.
// Op-Ed = 6-week insights columnist piece.

function DashboardPage({ onNav, onOpenRun, onOpenPlan, onOpenCoach }) {
  // Mock data shaped like /dashboard returns
  const weekly = { totalKm: 26.8, totalRuns: 3, totalTimeSec: 2 * 3600 + 32 * 60, target: 35 };
  const today = { type: 'easy', duration_minutes: 40, target_hr: 148, description: '40 min easy. Conversational. Stop if you cannot talk.' };
  const lastRun = {
    id: 'r-000412', date: 'Sun 12 Apr', title: 'Sunday Easy', route: 'Senayan loop × 2',
    distance_km: 10.4, time: '58:12', pace: '5:36', avg_hr: 162,
    tone: 'critical', tag: 'PACED POORLY',
    oneLiner: 'You went out too hard. Again.',
    snippet: 'First kilometre 5:12 on an easy day. What were you training for, the bus?',
  };
  const insights = {
    trend: [22.4, 28.0, 31.5, 34.2, 26.8], // last 5 weeks
    avgHr: 164, loadChange: -17, // %
  };

  const fmtTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 60);
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };

  return (
    <Paper width={980} screenLabel="02 Dashboard">
      <NewspaperChrome
        section="Front Page · Weekly Edition"
        big nav={[
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
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 28, marginTop: 20, alignItems: 'start' }}>
        {/* LEAD — weekly stats hero */}
        <article>
          <Caps size={10} ls={3}>Today's Lead · Week of 7–13 Apr</Caps>
          <h1 style={{
            fontFamily: OL.display, fontWeight: 400,
            fontSize: 60, lineHeight: 0.96, letterSpacing: -0.8,
            margin: '8px 0 10px',
          }}>
            Three runs in and the week is already thin.
          </h1>
          <div style={{ fontFamily: OL.body, fontSize: 14, lineHeight: 1.6, maxWidth: 560 }}>
            You are at <b>26.8 km</b> with the target sitting at <b>35</b>. Thursday's rain cost you a session. The math is tight but not impossible — one honest long run on Saturday closes the gap. Do not borrow Sunday's plan to pay for it.
          </div>

          {/* Stat strip — the scoreboard */}
          <div style={{
            marginTop: 16, border: `3px solid ${OL.ink}`, padding: '14px 18px',
            background: 'rgba(20,18,16,0.02)',
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 18px',
          }}>
            {[
              ['This Week', `${weekly.totalKm.toFixed(1)}`, 'km of 35'],
              ['Runs', String(weekly.totalRuns), 'of 5 planned'],
              ['Time on Feet', fmtTime(weekly.totalTimeSec), 'minutes'],
              ['Week Completion', `${Math.round((weekly.totalKm / weekly.target) * 100)}%`, 'target'],
            ].map(([l, v, sub], i) => (
              <div key={i}>
                <Caps size={8} ls={2} opacity={0.6}>{l}</Caps>
                <div style={{ fontFamily: OL.mono, fontSize: 26, fontWeight: 700, marginTop: 2, lineHeight: 1 }}>{v}</div>
                <Caps size={8} ls={2} opacity={0.55} style={{ marginTop: 4, display: 'inline-block' }}>{sub}</Caps>
              </div>
            ))}
          </div>

          {/* Weekly progress bar */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Caps size={9} ls={3} opacity={0.7}>Progress to Target</Caps>
              <span style={{ fontFamily: OL.mono, fontSize: 11, opacity: 0.7 }}>26.8 / 35.0 km</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <MiniBar pct={(26.8 / 35) * 100} height={14} accent/>
            </div>
          </div>
        </article>

        {/* SIDEBAR */}
        <aside style={{ borderLeft: `1px solid ${OL.ink}`, paddingLeft: 20 }}>
          {/* Today card */}
          <Caps size={10} ls={3}>On the Schedule Today</Caps>
          <Hairline gap={6}/>
          <div style={{
            border: `3px solid ${OL.ink}`, padding: '12px 14px', marginTop: 8,
            background: 'rgba(138,42,18,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Caps size={9} ls={3} opacity={0.7}>Mon 13 Apr</Caps>
              <ToneBadge tone="critical">{today.type.toUpperCase()}</ToneBadge>
            </div>
            <div style={{
              fontFamily: OL.display, fontSize: 34, lineHeight: 1, letterSpacing: -0.3,
              textTransform: 'uppercase', margin: '6px 0 4px',
            }}>
              {today.duration_minutes} minutes,<br/>under {today.target_hr} bpm.
            </div>
            <p style={{ fontFamily: OL.body, fontSize: 13, lineHeight: 1.55, margin: '8px 0 0' }}>
              {today.description}
            </p>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <a onClick={(e) => { e.preventDefault(); onOpenPlan && onOpenPlan(); }} href="#"
                style={{ fontFamily: OL.sans, fontSize: 10, letterSpacing: 2, fontWeight: 700, color: OL.accent, textTransform: 'uppercase', textDecoration: 'none', borderBottom: `1px solid ${OL.accent}` }}>
                See the full week →
              </a>
              <Caps size={9} ls={2} opacity={0.55}>Filed 05:14</Caps>
            </div>
          </div>

          {/* Standings */}
          <div style={{ marginTop: 20 }}>
            <Caps size={10} ls={3}>The Standings</Caps>
            <Caps size={9} ls={2} opacity={0.6} style={{ display: 'block', marginTop: 2 }}>Weekly Mileage · last 4 weeks</Caps>
            <Hairline gap={6}/>
            {[
              { label: 'This', km: 26.8, current: true },
              { label: 'W-1', km: 31.5 },
              { label: 'W-2', km: 34.2 },
              { label: 'W-3', km: 28.0 },
            ].map((w, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '44px 1fr 56px', gap: 8, alignItems: 'center',
                margin: '5px 0', fontFamily: OL.mono, fontSize: 11,
              }}>
                <Caps size={10} ls={1} weight={w.current ? 700 : 400} opacity={w.current ? 1 : 0.75}>{w.label}</Caps>
                <MiniBar pct={(w.km / 40) * 100} accent={w.current}/>
                <span style={{ textAlign: 'right' }}>{w.km.toFixed(1)}</span>
              </div>
            ))}
          </div>

          {/* Notices */}
          <div style={{ marginTop: 20 }}>
            <Caps size={10} ls={3}>Notices</Caps>
            <Hairline gap={6}/>
            <p style={{ fontFamily: OL.body, fontSize: 12.5, lineHeight: 1.6, margin: '6px 0 8px' }}>
              <b>Strava:</b> synced 4 min ago.
            </p>
            <p style={{ fontFamily: OL.body, fontSize: 12.5, lineHeight: 1.6, margin: '0 0 8px' }}>
              <b>Pak Har</b> has not filed on Saturday's run yet.{' '}
              <a onClick={(e) => { e.preventDefault(); onOpenRun && onOpenRun('r-000411'); }} href="#"
                style={{ fontFamily: OL.sans, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: OL.accent, borderBottom: `1px solid ${OL.accent}`, textDecoration: 'none' }}>Request dispatch →</a>
            </p>
            <p style={{ fontFamily: OL.body, fontSize: 12.5, lineHeight: 1.55, margin: 0, fontStyle: 'italic', color: OL.muted }}>
              "Besok pagi, lari lagi ya."
            </p>
          </div>
        </aside>
      </div>

      {/* BELOW THE FOLD — last run snapshot */}
      <div style={{ marginTop: 28 }}>
        <Rule thick/>
        <SectionLabel right="tap to read the dispatch →">Below the Fold · Last Run</SectionLabel>
        <Hairline/>

        <article onClick={() => onOpenRun && onOpenRun(lastRun.id)} style={{
          cursor: 'pointer', padding: '14px 0',
          display: 'grid', gridTemplateColumns: '90px 1fr 260px', gap: 20, alignItems: 'start',
        }}>
          {/* date block */}
          <div>
            <Caps size={9} ls={2} opacity={0.6}>{lastRun.date.split(' ')[0]}</Caps>
            <div style={{ fontFamily: OL.display, fontSize: 54, fontWeight: 400, lineHeight: 1 }}>{lastRun.date.split(' ')[1]}</div>
            <Caps size={9} ls={2} opacity={0.6}>{lastRun.date.split(' ')[2]}</Caps>
          </div>

          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <ToneBadge tone={lastRun.tone}>{lastRun.tag}</ToneBadge>
              <Caps size={9} ls={2} opacity={0.6}>easy · {lastRun.route}</Caps>
            </div>
            <h2 style={{ fontFamily: OL.display, fontSize: 34, fontWeight: 400, lineHeight: 1.05, letterSpacing: -0.4, margin: '0 0 8px' }}>
              {lastRun.oneLiner}
            </h2>
            <p style={{ fontFamily: OL.body, fontSize: 13.5, lineHeight: 1.6, margin: 0, maxWidth: 520 }}>
              <span style={{
                float: 'left', fontFamily: OL.display, fontSize: 32, lineHeight: 0.9,
                paddingRight: 5, paddingTop: 2,
              }}>{lastRun.snippet.charAt(0)}</span>{lastRun.snippet.slice(1)} {' '}
              <span style={{ color: OL.accent, fontWeight: 700, fontFamily: OL.sans, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Read on →</span>
            </p>
            <Caps size={9} ls={2} opacity={0.55} style={{ marginTop: 10, display: 'inline-block' }}>
              by Pak Har · filed Sun 12 Apr · 07:48
            </Caps>
          </div>

          {/* mini stat box */}
          <div style={{ border: `1px solid ${OL.ink}`, padding: '10px 14px' }}>
            <Caps size={8} ls={3} opacity={0.6}>Box Score</Caps>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginTop: 6 }}>
              {[
                ['DIST', `${lastRun.distance_km.toFixed(1)} km`],
                ['TIME', lastRun.time],
                ['PACE', `${lastRun.pace}/km`],
                ['AVG HR', `${lastRun.avg_hr} bpm`],
              ].map(([l, v]) => (
                <div key={l}>
                  <Caps size={7} ls={2} opacity={0.55}>{l}</Caps>
                  <div style={{ fontFamily: OL.mono, fontSize: 15, fontWeight: 700 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>

      {/* OP-ED — 6-week insights */}
      <div style={{ marginTop: 28 }}>
        <Rule thick/>
        <SectionLabel right="columnist · weekly">Opinion · The Arc</SectionLabel>
        <Hairline/>

        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 28, marginTop: 14, alignItems: 'start' }}>
          <div>
            <Caps size={9} ls={3} opacity={0.7}>by Pak Har — 6-Week Column</Caps>
            <h2 style={{ fontFamily: OL.display, fontSize: 36, fontWeight: 400, lineHeight: 1.05, letterSpacing: -0.4, margin: '6px 0 10px', fontStyle: 'italic' }}>
              The curve is real. So is the drop.
            </h2>
            <p style={{ fontFamily: OL.body, fontSize: 13.5, lineHeight: 1.65, margin: '0 0 10px', textAlign: 'justify', hyphens: 'auto' }}>
              Six weeks ago you ran 22 kilometres. Four weeks ago, 34. This week, twenty-seven. That is not a collapse; that is a Thursday and a head cold. But the shape of the month tells me something your weekly total does not — you are getting tired before you are getting fit.
            </p>
            <p style={{ fontFamily: OL.body, fontSize: 13.5, lineHeight: 1.65, margin: 0, textAlign: 'justify', hyphens: 'auto' }}>
              Average heart rate is creeping up at the same pace. That is the quiet signal. Sleep better this week. Eat the carbs you are pretending not to eat. The long run is still on Saturday.
            </p>
            <div style={{
              borderTop: `2px solid ${OL.accent}`, borderBottom: `2px solid ${OL.accent}`,
              padding: '10px 0', margin: '14px 0',
            }}>
              <p style={{
                margin: 0, fontFamily: OL.display, fontSize: 22, lineHeight: 1.1,
                letterSpacing: -0.2, textAlign: 'center', fontStyle: 'italic', color: OL.accent,
              }}>
                "You are getting tired before you are getting fit."
              </p>
            </div>
            <Caps size={9} ls={2} opacity={0.65} style={{ display: 'block', textAlign: 'right' }}>
              — Pak Har · 6-Week Column · filed Monday
            </Caps>
          </div>

          {/* Sparkline + key numbers */}
          <div>
            <Caps size={9} ls={3} opacity={0.7}>Supporting Figures</Caps>
            <Hairline gap={6}/>
            <div style={{ border: `1px solid ${OL.ink}`, padding: '12px 14px', marginTop: 6 }}>
              <Caps size={8} ls={2} opacity={0.6}>Weekly Kilometres · 6 weeks</Caps>
              <svg width="100%" height="90" viewBox="0 0 340 90" style={{ display: 'block', marginTop: 8 }}>
                {/* baseline */}
                <line x1="0" y1="70" x2="340" y2="70" stroke={OL.ink} strokeWidth="0.5" opacity="0.4"/>
                {/* bars */}
                {[22.4, 28.0, 31.5, 34.2, 26.8, 0].map((v, i) => {
                  const h = (v / 40) * 60;
                  const x = 12 + i * 55;
                  const isCurrent = i === 4;
                  return (
                    <g key={i}>
                      <rect x={x} y={70 - h} width={40} height={h} fill={isCurrent ? OL.accent : OL.ink}/>
                      <text x={x + 20} y={86} textAnchor="middle"
                        style={{ fontFamily: OL.sans, fontSize: 9, letterSpacing: 1, fill: OL.ink, opacity: 0.7, textTransform: 'uppercase' }}>
                        {['W-5', 'W-4', 'W-3', 'W-2', 'This', 'Plan'][i]}
                      </text>
                      <text x={x + 20} y={65 - h} textAnchor="middle"
                        style={{ fontFamily: OL.mono, fontSize: 9, fill: OL.ink }}>
                        {v > 0 ? v.toFixed(0) : '—'}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: `1px dotted ${OL.hair}`, paddingTop: 10 }}>
                <div>
                  <Caps size={8} ls={2} opacity={0.6}>Avg HR · 6w</Caps>
                  <div style={{ fontFamily: OL.mono, fontSize: 22, fontWeight: 700 }}>{insights.avgHr}<span style={{ fontSize: 11, opacity: 0.6 }}> bpm</span></div>
                  <Caps size={8} ls={2} opacity={0.55}>up 4 from last month</Caps>
                </div>
                <div>
                  <Caps size={8} ls={2} opacity={0.6}>Load · vs peak</Caps>
                  <div style={{ fontFamily: OL.mono, fontSize: 22, fontWeight: 700, color: OL.accent }}>{insights.loadChange}%</div>
                  <Caps size={8} ls={2} opacity={0.55}>since w-2 peak</Caps>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Caps size={9} ls={2} opacity={0.6}>Questions?</Caps>
              <a onClick={(e) => { e.preventDefault(); onOpenCoach && onOpenCoach(); }} href="#"
                style={{ fontFamily: OL.sans, fontSize: 11, letterSpacing: 3, fontWeight: 700, color: OL.accent, textTransform: 'uppercase', textDecoration: 'none', borderBottom: `1px solid ${OL.accent}` }}>
                Write to the editor →
              </a>
            </div>
          </div>
        </div>
      </div>

      <FooterRail
        left="Filed at Senayan · Jakarta"
        center="Page 1 · Front"
        right="— continued page 2: Plan for the week —"
      />
    </Paper>
  );
}

window.DashboardPage = DashboardPage;
