// Tabloid front-page index — activities list.
// Above-the-fold: today's lead. Below: previous editions as broadsheet column cards.
// Accepts onOpen(id) to navigate to the run's broadsheet.

const TAB = {
  paper: '#f4efe4',
  ink: '#141210',
  accent: '#8a2a12',
  muted: 'rgba(20,18,16,0.55)',
  // Tabloid fonts (from the tabloid pairing)
  display: '"Abril Fatface", "Playfair Display", Didot, serif',
  body: '"Lora", Georgia, serif',
  sans: '"Work Sans", "Inter", sans-serif',
  mono: '"Space Mono", "JetBrains Mono", monospace',
};

function TabMasthead({ issue }) {
  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline',
        fontFamily: TAB.sans, fontSize: 10, letterSpacing: 1,
        textTransform:'uppercase', opacity: 0.75 }}>
        <span>Vol. III · Edition No. {issue}</span>
        <span>Old Legs Daily — The Runner's Paper</span>
        <span>Mon 13 Apr 2026</span>
      </div>
      <div style={{ height: 3, background: TAB.ink, margin: '10px 0' }}/>
      <div style={{ textAlign:'center', padding:'6px 0' }}>
        <div style={{
          fontFamily: TAB.display, fontSize: 88, fontWeight: 400,
          letterSpacing: -1.5, lineHeight: 0.95, textTransform:'uppercase',
        }}>
          Old Legs
        </div>
        <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 6, marginTop: 6, opacity: 0.75, textTransform:'uppercase' }}>
          · No Cheerleading Since 1976 · Jakarta Edition ·
        </div>
      </div>
      <div style={{ height: 3, background: TAB.ink, margin: '10px 0 4px' }}/>
      <div style={{ height: 1, background: TAB.ink, margin: '0 0 14px' }}/>
    </>
  );
}

function TabSectionLabel({ children, right }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'10px 0' }}>
      <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 3, textTransform:'uppercase', opacity: 0.7, fontWeight: 600 }}>{children}</div>
      {right && <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 2, opacity: 0.55, textTransform:'uppercase' }}>{right}</div>}
    </div>
  );
}

function TabRule({ double }) {
  return (
    <>
      <div style={{ height: double ? 3 : 1, background: TAB.ink }}/>
      {double && <div style={{ height: 1, background: TAB.ink, marginTop: 3 }}/>}
    </>
  );
}

function ToneBadge({ tone, children }) {
  const bg = tone === 'critical' ? TAB.accent : tone === 'good' ? TAB.ink : 'transparent';
  const color = tone === 'critical' ? '#fff' : tone === 'good' ? '#fff' : TAB.ink;
  const border = tone === 'neutral' ? `1px solid ${TAB.ink}` : 'none';
  return (
    <span style={{
      display:'inline-block', padding:'3px 8px',
      background: bg, color, border,
      fontFamily: TAB.sans, fontSize: 9, letterSpacing: 2, fontWeight: 700, textTransform:'uppercase',
    }}>{children}</span>
  );
}

// The lead story: giant tabloid headline + stats + preview verdict
function TabLead({ a, onOpen }) {
  return (
    <div onClick={() => onOpen(a.id)} style={{
      cursor:'pointer', padding: '6px 0 14px',
      borderBottom: `3px solid ${TAB.ink}`,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 6 }}>
        <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 3, fontWeight: 700, textTransform:'uppercase' }}>
          Today's Lead · Post-Run Dispatch
        </div>
        <ToneBadge tone={a.tone}>{a.verdict_tag}</ToneBadge>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: '1.35fr 1fr', gap: 28, alignItems:'start' }}>
        <div>
          <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 2, opacity: 0.7, textTransform:'uppercase' }}>
            {a.dateShort} · {a.type} · {a.route}
          </div>
          <h1 style={{
            fontFamily: TAB.display, fontWeight: 400,
            fontSize: 64, lineHeight: 0.98, letterSpacing: -1,
            margin: '8px 0 10px', textTransform:'uppercase',
          }}>
            {a.verdict_short}
          </h1>
          <div style={{ fontFamily: TAB.body, fontSize: 14, lineHeight: 1.55, color: TAB.ink, maxWidth: 520 }}>
            Pak Har's full dispatch is inside — splits, zones, the ego surge, the Rx for tomorrow.
            &nbsp;<span style={{ color: TAB.accent, fontWeight: 700, fontFamily: TAB.sans, fontSize: 11, letterSpacing: 2, textTransform:'uppercase' }}>Read on →</span>
          </div>
        </div>

        {/* Stats column, tabloid-scoreboard style */}
        <div style={{
          border: `3px solid ${TAB.ink}`, padding: '14px 18px', background: 'rgba(20,18,16,0.02)',
        }}>
          <div style={{ fontFamily: TAB.sans, fontSize: 9, letterSpacing: 3, opacity: 0.7, textTransform:'uppercase', marginBottom: 8 }}>
            The Scoreboard
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: '10px 18px' }}>
            {[
              ['DIST', `${a.distance_km.toFixed(1)} km`],
              ['TIME', a.time],
              ['PACE', `${a.pace}/km`],
              ['AVG HR', `${a.hr} bpm`],
              ['MAX HR', `${a.max_hr} bpm`],
              ['ELEV', `+${a.elev} m`],
            ].map(([l,v]) => (
              <div key={l}>
                <div style={{ fontFamily: TAB.sans, fontSize: 8, letterSpacing: 2, opacity: 0.6, textTransform:'uppercase' }}>{l}</div>
                <div style={{ fontFamily: TAB.mono, fontSize: 20, fontWeight: 700, fontVariantNumeric:'tabular-nums', marginTop: 1 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Smaller "previous editions" entries
function TabEntry({ a, onOpen, isLast }) {
  return (
    <div onClick={() => onOpen(a.id)} style={{
      cursor:'pointer', padding: '14px 0',
      borderBottom: isLast ? 'none' : `1px solid ${TAB.ink}`,
      display:'grid', gridTemplateColumns: '76px 1fr 260px', gap: 18, alignItems:'start',
    }}>
      {/* date gutter */}
      <div>
        <div style={{ fontFamily: TAB.sans, fontSize: 9, letterSpacing: 2, opacity: 0.6, textTransform:'uppercase', fontWeight: 600 }}>
          {a.dateShort.split(' ')[0]}
        </div>
        <div style={{ fontFamily: TAB.display, fontSize: 32, fontWeight: 400, lineHeight: 1, marginTop: 2 }}>
          {a.dateShort.split(' ')[1]}
        </div>
        <div style={{ fontFamily: TAB.sans, fontSize: 9, letterSpacing: 2, opacity: 0.6, marginTop: 2, textTransform:'uppercase' }}>
          {a.dateShort.split(' ')[2]}
        </div>
      </div>

      {/* headline + tag + route */}
      <div>
        <div style={{ display:'flex', gap: 8, alignItems:'center', marginBottom: 6 }}>
          <ToneBadge tone={a.tone}>{a.verdict_tag}</ToneBadge>
          <span style={{ fontFamily: TAB.sans, fontSize: 9, letterSpacing: 2, opacity: 0.6, textTransform:'uppercase' }}>
            {a.type} · {a.route}
          </span>
        </div>
        <div style={{
          fontFamily: TAB.display, fontWeight: 400,
          fontSize: 28, lineHeight: 1.1, letterSpacing: -0.4,
          maxWidth: 540,
        }}>
          {a.verdict_short}
        </div>
        <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 2, opacity: 0.55, marginTop: 8, textTransform:'uppercase' }}>
          by Pak Har · read the dispatch →
        </div>
      </div>

      {/* stats strip */}
      <div style={{ fontFamily: TAB.mono, fontSize: 12, fontVariantNumeric:'tabular-nums', textAlign:'right' }}>
        {a.type === 'MISSED' ? (
          <div style={{ fontFamily: TAB.display, fontSize: 32, color: TAB.accent, lineHeight: 1 }}>—</div>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{a.distance_km.toFixed(1)}<span style={{ fontSize: 11, opacity: 0.6 }}> km</span></div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{a.time} · {a.pace}/km</div>
            {a.hr && <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{a.hr} bpm · +{a.elev} m</div>}
          </>
        )}
      </div>
    </div>
  );
}

function ActivitiesFrontPage({ onOpen }) {
  const A = window.ACTIVITIES;
  const lead = A[0], rest = A.slice(1);
  // weekly-totals sidebar
  const weekly = [
    { label: 'This', km: 26.8, runs: 3, current: true },
    { label: 'W-1',  km: 31.5, runs: 4 },
    { label: 'W-2',  km: 34.2, runs: 5 },
    { label: 'W-3',  km: 28.0, runs: 4 },
  ];

  return (
    <div style={{
      width: 980, background: TAB.paper, color: TAB.ink,
      padding: '28px 36px 40px', fontFamily: TAB.body, fontSize: 13, lineHeight: 1.5,
    }}>
      <TabMasthead issue={412}/>
      <TabLead a={lead} onOpen={onOpen}/>

      {/* Two columns — archive + sidebar */}
      <div style={{ display:'grid', gridTemplateColumns: '1fr 260px', gap: 28, marginTop: 22 }}>
        <div>
          <TabSectionLabel right="tap an edition to read →">
            Previous Editions
          </TabSectionLabel>
          <TabRule double/>
          <div>
            {rest.map((a, i) => (
              <TabEntry key={a.id} a={a} onOpen={onOpen} isLast={i === rest.length - 1}/>
            ))}
          </div>
        </div>

        <aside style={{ borderLeft: `1px solid ${TAB.ink}`, paddingLeft: 18 }}>
          <TabSectionLabel>The Standings</TabSectionLabel>
          <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 2, opacity: 0.7, textTransform:'uppercase', marginBottom: 6 }}>
            Weekly Mileage
          </div>
          {weekly.map((w,i)=>(
            <div key={i} style={{
              display:'grid', gridTemplateColumns:'44px 1fr 48px', alignItems:'center', gap: 8,
              margin:'5px 0', fontFamily: TAB.mono, fontSize: 11, fontVariantNumeric:'tabular-nums',
            }}>
              <span style={{ fontWeight: w.current ? 700 : 400, textTransform:'uppercase', letterSpacing: 1 }}>{w.label}</span>
              <span style={{ height: 10, background:'rgba(20,18,16,0.08)', border:`1px solid ${TAB.ink}` }}>
                <span style={{ display:'block', height:'100%', width:`${(w.km/40)*100}%`, background: w.current ? TAB.accent : TAB.ink }}/>
              </span>
              <span style={{ textAlign:'right' }}>{w.km.toFixed(1)}</span>
            </div>
          ))}
          <div style={{ fontFamily: TAB.sans, fontSize: 9, letterSpacing: 2, opacity: 0.55, marginTop: 6, textTransform:'uppercase' }}>
            3 runs · 26.8 km so far
          </div>

          <div style={{ height: 1, background: TAB.ink, opacity: 0.3, margin: '18px 0' }}/>

          <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 2, opacity: 0.7, textTransform:'uppercase', marginBottom: 6 }}>
            Notices
          </div>
          <div style={{ fontFamily: TAB.body, fontSize: 12, lineHeight: 1.55 }}>
            <p style={{ margin:'0 0 8px' }}>
              <b>Strava:</b> synced 2 min ago. Tap <span style={{ fontFamily: TAB.sans, letterSpacing: 1, fontSize: 10, textTransform:'uppercase', borderBottom: `1px solid ${TAB.ink}`, cursor:'pointer' }}>Refresh</span> for latest.
            </p>
            <p style={{ margin:'0 0 8px' }}>
              <b>This week's plan</b> is filed on page 2.
            </p>
            <p style={{ margin: 0, fontStyle:'italic', color: TAB.muted }}>
              "Besok pagi, lari lagi ya."
            </p>
          </div>

          <div style={{ height: 1, background: TAB.ink, opacity: 0.3, margin: '18px 0' }}/>

          <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 2, opacity: 0.7, textTransform:'uppercase', marginBottom: 6 }}>
            Coach on duty
          </div>
          <div style={{ fontFamily: TAB.display, fontSize: 26, lineHeight: 1, textTransform:'uppercase' }}>Pak Har</div>
          <div style={{ fontFamily: TAB.sans, fontSize: 10, letterSpacing: 2, opacity: 0.6, marginTop: 4, textTransform:'uppercase' }}>
            Senior Coach · Since 1976
          </div>
        </aside>
      </div>

      {/* Footer */}
      <div style={{ height: 3, background: TAB.ink, margin: '22px 0 4px' }}/>
      <div style={{ height: 1, background: TAB.ink, margin: '0 0 8px' }}/>
      <div style={{ display:'flex', justifyContent:'space-between', fontFamily: TAB.sans, fontSize: 9, letterSpacing: 2, opacity: 0.65, textTransform:'uppercase' }}>
        <span>Printed at Senayan · Jakarta</span>
        <span>Page 1 · Front</span>
        <span>— continued page 2: Plan for the week —</span>
      </div>
    </div>
  );
}

window.ActivitiesFrontPage = ActivitiesFrontPage;
