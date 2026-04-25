// Plan page (/plan) — weekly fixtures table. League-table style.
// 7 rows Mon–Sun. Columns: Day, Date, Session, Target, Duration, Distance, Notes.
// Today highlighted. Rest days dimmed. Header above. Editor's note below.

function PlanPage({ onNav, onOpenCoach }) {
  const today = 'Mon';
  const week = [
    { day: 'Mon', date: '13 Apr', type: 'Easy', target: 'HR <148', dur: '40 min', dist: '7.0 km', notes: 'Conversational. If you cannot talk you are running too hard.' },
    { day: 'Tue', date: '14 Apr', type: 'Tempo', target: 'HR 165–172', dur: '50 min', dist: '9.0 km', notes: '10 min warm · 3×10 @ tempo · 5 min cool. No hero splits.' },
    { day: 'Wed', date: '15 Apr', type: 'Rest', target: '—', dur: '—', dist: '—', notes: 'Walk. Stretch. Do not run.' },
    { day: 'Thu', date: '16 Apr', type: 'Easy', target: 'HR <150', dur: '35 min', dist: '6.0 km', notes: 'Recovery pace. Breathe through the nose the whole way.' },
    { day: 'Fri', date: '17 Apr', type: 'Strides', target: 'Feel', dur: '30 min', dist: '5.0 km', notes: '20 min easy + 6×20 sec strides, full recovery.' },
    { day: 'Sat', date: '18 Apr', type: 'Long', target: 'HR 150–162', dur: '95 min', dist: '14.5 km', notes: 'Start 30 sec slower than you think. Finish standing up.' },
    { day: 'Sun', date: '19 Apr', type: 'Rest', target: '—', dur: '—', dist: '—', notes: 'If you must move: walk. Coffee. Read something long.' },
  ];
  const typeTone = (t) => t === 'Tempo' || t === 'Long' ? 'critical' : t === 'Rest' ? 'neutral' : 'good';
  const totalKm = week.reduce((a, b) => a + (parseFloat(b.dist) || 0), 0);
  const totalMin = week.reduce((a, b) => a + (parseInt(b.dur) || 0), 0);

  return (
    <Paper width={980} screenLabel="03 Plan">
      <NewspaperChrome
        section="Fixtures · Week of 13–19 Apr"
        big={false}
        nav={[
          { key: 'dashboard', label: 'Front Page' },
          { key: 'activities', label: 'Dispatches' },
          { key: 'plan', label: 'Plan' },
          { key: 'coach', label: 'Letters' },
          { key: 'settings', label: 'Desk' },
        ]}
        activeNav="plan"
        onNav={onNav}
      />

      {/* Heading */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 28, marginTop: 14, alignItems: 'end' }}>
        <div>
          <Caps size={10} ls={3}>The Fixtures · Week 15</Caps>
          <h1 style={{
            fontFamily: OL.display, fontWeight: 400,
            fontSize: 56, lineHeight: 0.95, letterSpacing: -0.8,
            margin: '6px 0 6px',
          }}>
            Seven days. Five runs.<br/>One rest. No debates.
          </h1>
          <p style={{ fontFamily: OL.body, fontSize: 13.5, lineHeight: 1.55, margin: 0, maxWidth: 560 }}>
            Pak Har files Monday at dawn. The week is not a suggestion. You may re-arrange within it — you may not subtract from it.
          </p>
        </div>

        {/* Week-at-a-glance stats box */}
        <div style={{ border: `3px solid ${OL.ink}`, padding: '12px 14px', background: 'rgba(20,18,16,0.02)' }}>
          <Caps size={9} ls={3} opacity={0.7}>Week At A Glance</Caps>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginTop: 6 }}>
            {[
              ['Runs', '5'],
              ['Rest', '2'],
              ['Km', `${totalKm.toFixed(1)}`],
              ['Minutes', `${totalMin}`],
            ].map(([l, v]) => (
              <div key={l}>
                <Caps size={8} ls={2} opacity={0.6}>{l}</Caps>
                <div style={{ fontFamily: OL.mono, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixtures table */}
      <div style={{ marginTop: 22 }}>
        <Rule thick/>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '44px 92px 1fr 130px 80px 80px 2.2fr 20px',
          gap: 14, padding: '8px 4px',
          borderBottom: `1px solid ${OL.ink}`,
        }}>
          <Caps size={9} ls={2} opacity={0.7}>Day</Caps>
          <Caps size={9} ls={2} opacity={0.7}>Date</Caps>
          <Caps size={9} ls={2} opacity={0.7}>Session</Caps>
          <Caps size={9} ls={2} opacity={0.7}>Target</Caps>
          <Caps size={9} ls={2} opacity={0.7}>Duration</Caps>
          <Caps size={9} ls={2} opacity={0.7}>Distance</Caps>
          <Caps size={9} ls={2} opacity={0.7}>Instructions</Caps>
          <span/>
        </div>

        {week.map((d, i) => {
          const isToday = d.day === today;
          const isRest = d.type === 'Rest';
          return (
            <div key={d.day} style={{
              display: 'grid',
              gridTemplateColumns: '44px 92px 1fr 130px 80px 80px 2.2fr 20px',
              gap: 14, padding: '14px 4px', alignItems: 'start',
              borderBottom: i === week.length - 1 ? `3px solid ${OL.ink}` : `1px dotted ${OL.hair}`,
              background: isToday ? 'rgba(138,42,18,0.04)' : 'transparent',
              borderLeft: isToday ? `3px solid ${OL.accent}` : '3px solid transparent',
              paddingLeft: isToday ? 8 : 4,
              opacity: isRest ? 0.55 : 1,
            }}>
              <div>
                <div style={{ fontFamily: OL.display, fontSize: 28, lineHeight: 1 }}>{d.day}</div>
                {isToday && (
                  <Caps size={8} ls={2} opacity={1} style={{ color: OL.accent, fontWeight: 800, marginTop: 2, display: 'inline-block' }}>Today</Caps>
                )}
              </div>
              <div style={{ fontFamily: OL.mono, fontSize: 13, paddingTop: 6 }}>{d.date}</div>
              <div style={{ paddingTop: 4 }}>
                <ToneBadge tone={typeTone(d.type)}>{d.type}</ToneBadge>
                {!isRest && d.type === 'Tempo' && (
                  <div style={{ fontFamily: OL.body, fontSize: 11, fontStyle: 'italic', color: OL.muted, marginTop: 4 }}>
                    The week's sharp edge.
                  </div>
                )}
                {!isRest && d.type === 'Long' && (
                  <div style={{ fontFamily: OL.body, fontSize: 11, fontStyle: 'italic', color: OL.muted, marginTop: 4 }}>
                    The honest one.
                  </div>
                )}
              </div>
              <div style={{ fontFamily: OL.mono, fontSize: 12, paddingTop: 6 }}>{d.target}</div>
              <div style={{ fontFamily: OL.mono, fontSize: 13, fontWeight: 700, paddingTop: 6 }}>{d.dur}</div>
              <div style={{ fontFamily: OL.mono, fontSize: 13, paddingTop: 6 }}>{d.dist}</div>
              <div style={{ fontFamily: OL.body, fontSize: 12.5, lineHeight: 1.55, paddingTop: 4 }}>
                {d.notes}
              </div>
              <div style={{ paddingTop: 6, fontFamily: OL.display, fontSize: 18, color: isRest ? 'transparent' : OL.ink, cursor: 'pointer' }}>
                →
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '44px 92px 1fr 130px 80px 80px 2.2fr 20px',
        gap: 14, padding: '10px 4px',
        background: OL.ink, color: OL.paper, marginTop: -1,
      }}>
        <span/><span/>
        <Caps size={9} ls={3} opacity={1} style={{ color: OL.paper, fontWeight: 800 }}>Totals</Caps>
        <span/>
        <span style={{ fontFamily: OL.mono, fontSize: 13, fontWeight: 700 }}>{totalMin} min</span>
        <span style={{ fontFamily: OL.mono, fontSize: 13, fontWeight: 700 }}>{totalKm.toFixed(1)} km</span>
        <Caps size={9} ls={2} opacity={0.8} style={{ color: OL.paper }}>5 runs · 2 rest · peak Saturday</Caps>
        <span/>
      </div>

      {/* Editor's note + key */}
      <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 28, alignItems: 'start' }}>
        <div>
          <Caps size={10} ls={3}>Editor's Note</Caps>
          <Hairline gap={6}/>
          <p style={{ fontFamily: OL.body, fontSize: 13.5, lineHeight: 1.6, margin: '8px 0 0', textAlign: 'justify', hyphens: 'auto' }}>
            <span style={{
              float: 'left', fontFamily: OL.display, fontSize: 42, lineHeight: 0.9,
              paddingRight: 6, paddingTop: 2,
            }}>T</span>his plan is built on the last four weeks — your easy pace is slowing, your heart rate on easy days is climbing. That is a fatigue signal, not a fitness signal. I pulled Tuesday's tempo down ten seconds per kilometre and added a second rest day. Saturday is long but unhurried. If you nail Wednesday off the bike, you'll be fine.
          </p>
          <Caps size={9} ls={2} opacity={0.65} style={{ marginTop: 10, display: 'block' }}>
            — Pak Har · Plan filed Mon 13 Apr · 05:14
          </Caps>
        </div>

        <div>
          <Caps size={10} ls={3}>Key</Caps>
          <Hairline gap={6}/>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[
              ['critical', 'Tempo', 'Hard. Controlled. Quality is the point.'],
              ['critical', 'Long', 'The honest one. Duration > pace.'],
              ['good', 'Easy', 'Slow enough to hold a conversation.'],
              ['good', 'Strides', 'Short, sharp, full recovery.'],
              ['neutral', 'Rest', 'Walk. Stretch. Eat. Sleep.'],
            ].map(([tone, label, desc]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10, alignItems: 'start' }}>
                <ToneBadge tone={tone}>{label}</ToneBadge>
                <span style={{ fontFamily: OL.body, fontSize: 12, lineHeight: 1.5 }}>{desc}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <Caps size={10} ls={3}>Corrections</Caps>
            <Hairline gap={6}/>
            <p style={{ fontFamily: OL.body, fontSize: 12.5, lineHeight: 1.55, margin: '6px 0 0' }}>
              See an error in the plan? <a onClick={(e) => { e.preventDefault(); onOpenCoach && onOpenCoach(); }} href="#"
                style={{ fontFamily: OL.sans, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: OL.accent, borderBottom: `1px solid ${OL.accent}`, textDecoration: 'none', fontWeight: 700 }}>
                Write the editor →
              </a>
            </p>
          </div>
        </div>
      </div>

      <FooterRail
        left="Fixtures · filed Monday 05:14"
        center="Page 2 · Plan"
        right="— continued page 3: Letters to the Editor —"
      />
    </Paper>
  );
}

window.PlanPage = PlanPage;
