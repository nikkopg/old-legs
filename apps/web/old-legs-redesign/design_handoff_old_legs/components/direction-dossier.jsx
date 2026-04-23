// Direction 3 — Field notebook / coach's dossier
// Graph-paper substrate, typewriter overlay, carbon-copy feel.
// Stamped VERDICT in iron-oxide. Taped-on data cards. Handwritten margin notes.

const dossierStyles = {
  paper: {
    width: 720,
    background: '#ece6d4',
    color: '#1a1a1a',
    fontFamily: '"Special Elite", "Courier Prime", "Courier New", ui-monospace, monospace',
    padding: '32px 36px 44px',
    position: 'relative',
    // graph paper: 16px grid + darker every 4
    backgroundImage: `
      linear-gradient(rgba(30,30,30,0.10) 1px, transparent 1px),
      linear-gradient(90deg, rgba(30,30,30,0.10) 1px, transparent 1px),
      linear-gradient(rgba(30,30,30,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(30,30,30,0.05) 1px, transparent 1px)
    `,
    backgroundSize: '64px 64px, 64px 64px, 16px 16px, 16px 16px',
    lineHeight: 1.5,
    fontSize: 13,
  },
  accent: '#9a2a12',
  ink: '#1a1a1a',
};

function DossierLabel({ children }) {
  return (
    <div style={{
      fontFamily: '"Helvetica Neue", Inter, system-ui, sans-serif',
      fontSize: 9, letterSpacing: 3, textTransform: 'uppercase',
      opacity: 0.7, marginBottom: 4,
    }}>{children}</div>
  );
}

// Small SVG pace line on graph paper — hand-annotated
function DossierPaceLine({ splits }) {
  const W = 620, H = 130, pad = { l: 30, r: 16, t: 14, b: 24 };
  const parsed = splits.map(s => { const [m,sec] = s.pace.split(':').map(Number); return m*60+sec; });
  const min = Math.min(...parsed) - 2, max = Math.max(...parsed) + 2;
  const x = i => pad.l + i * ((W-pad.l-pad.r)/(splits.length-1));
  const y = v => pad.t + ((v-min)/(max-min)) * (H-pad.t-pad.b);
  const d = parsed.map((v,i)=>`${i===0?'M':'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:'block' }}>
      {/* axis */}
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H-pad.b} stroke={dossierStyles.ink} strokeWidth="0.8"/>
      <line x1={pad.l} y1={H-pad.b} x2={W-pad.r} y2={H-pad.b} stroke={dossierStyles.ink} strokeWidth="0.8"/>
      {/* pace line — drawn slightly wobbly */}
      <path d={d} fill="none" stroke={dossierStyles.ink} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" style={{ filter: 'url(#wobble)' }} />
      {parsed.map((v,i)=>(
        <circle key={i} cx={x(i)} cy={y(v)} r="2.2" fill={dossierStyles.ink}/>
      ))}
      {/* circle + arrow on km 1 */}
      <circle cx={x(0)} cy={y(parsed[0])} r="9" fill="none" stroke={dossierStyles.accent} strokeWidth="1.4"/>
      <path d={`M${x(0)+12},${y(parsed[0])-18} L${x(0)+10},${y(parsed[0])-2}`} stroke={dossierStyles.accent} strokeWidth="1.2" fill="none" markerEnd="url(#arr)"/>
      <text x={x(0)+14} y={y(parsed[0])-22} fontFamily='"Caveat","Kalam",cursive' fontSize="16" fill={dossierStyles.accent}>too fast</text>
      {/* circle on km 10 */}
      <circle cx={x(9)} cy={y(parsed[9])} r="9" fill="none" stroke={dossierStyles.accent} strokeWidth="1.4"/>
      <text x={x(9)-14} y={y(parsed[9])-12} textAnchor="end" fontFamily='"Caveat","Kalam",cursive' fontSize="16" fill={dossierStyles.accent}>ego</text>
      {/* x labels */}
      {splits.map((s,i)=>(
        <text key={i} x={x(i)} y={H-8} textAnchor="middle" fontSize="9" fontFamily="Courier New, monospace" fill={dossierStyles.ink}>{s.km}</text>
      ))}
      <defs>
        <marker id="arr" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill={dossierStyles.accent}/>
        </marker>
        <filter id="wobble"><feTurbulence baseFrequency="0.02" numOctaves="2"/><feDisplacementMap in="SourceGraphic" scale="1.2"/></filter>
      </defs>
    </svg>
  );
}

function DossierDirection() {
  const R = window.RUN, V = window.PAK_HAR_VERDICT;
  return (
    <div style={dossierStyles.paper}>
      {/* Top-right stamp */}
      <div style={{
        position: 'absolute', top: 24, right: 28,
        transform: 'rotate(6deg)',
        border: `3px double ${dossierStyles.accent}`,
        color: dossierStyles.accent,
        padding: '8px 14px', textAlign: 'center',
        fontFamily: '"Helvetica Neue", Inter, sans-serif',
        fontWeight: 800, letterSpacing: 2, fontSize: 12,
        lineHeight: 1.1,
        opacity: 0.9,
      }}>
        {V.stamp}<br/>
        <span style={{ fontSize: 8, letterSpacing: 1, fontWeight: 600, opacity: 0.8 }}>
          FILED 12 APR 2026
        </span>
      </div>

      {/* Masthead */}
      <div>
        <div style={{ fontFamily: '"Helvetica Neue", Inter, sans-serif', fontSize: 9, letterSpacing: 4, opacity: 0.75 }}>OLD LEGS · COACH'S DOSSIER · DOC-000412</div>
        <div style={{ fontFamily: '"Special Elite", "Courier Prime", monospace', fontSize: 32, fontWeight: 700, letterSpacing: -0.5, marginTop: 6, lineHeight: 1 }}>
          POST-RUN DEBRIEF
        </div>
        <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
          SUBJECT: runner &nbsp;|&nbsp; COACH: Pak Har &nbsp;|&nbsp; {R.date} · {R.startTime} WIB &nbsp;|&nbsp; {R.route}
        </div>
        <div style={{ height: 2, background: dossierStyles.ink, margin: '12px 0 18px', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 1, background: dossierStyles.ink, opacity: 0.5 }}/>
        </div>
      </div>

      {/* Row: big stats card (taped) + weekly card */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{
          background: '#faf6eb',
          border: `1px solid ${dossierStyles.ink}`,
          padding: '14px 18px',
          position: 'relative',
          boxShadow: '2px 3px 0 rgba(0,0,0,0.08)',
        }}>
          {/* masking tape */}
          <div style={{ position:'absolute', top:-10, left:20, width:64, height:18, background:'rgba(220,200,120,0.55)', transform:'rotate(-3deg)', boxShadow:'0 1px 3px rgba(0,0,0,0.12)' }}/>
          <DossierLabel>Exhibit A · The Numbers</DossierLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 18px', marginTop: 6 }}>
            {[
              ['DISTANCE', `${R.distance_km.toFixed(2)} km`],
              ['TIME', R.moving_time],
              ['AVG PACE', `${R.avg_pace}/km`],
              ['AVG HR', `${R.avg_hr} bpm`],
              ['MAX HR', `${R.max_hr} bpm`],
              ['CADENCE', `${R.cadence} spm`],
              ['ELEV GAIN', `+${R.elev_gain} m`],
              ['WEATHER', '27°C · humid'],
              ['TITLE', R.title],
            ].map(([l,v]) => (
              <div key={l}>
                <div style={{ fontFamily: '"Helvetica Neue", Inter, sans-serif', fontSize: 8, letterSpacing: 2, opacity: 0.65 }}>{l}</div>
                <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 18, fontWeight: 600, fontVariantNumeric:'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: '#faf6eb',
          border: `1px solid ${dossierStyles.ink}`,
          padding: '14px 18px',
          position: 'relative',
          boxShadow: '2px 3px 0 rgba(0,0,0,0.08)',
        }}>
          <div style={{ position:'absolute', top:-10, right:24, width:56, height:16, background:'rgba(220,200,120,0.55)', transform:'rotate(4deg)', boxShadow:'0 1px 3px rgba(0,0,0,0.12)' }}/>
          <DossierLabel>Exhibit B · Last 4 weeks</DossierLabel>
          <div style={{ marginTop: 6 }}>
            {R.weeks.map((w,i)=>(
              <div key={i} style={{ display:'grid', gridTemplateColumns:'42px 1fr 72px', alignItems:'center', gap:10, margin:'5px 0', fontFamily:'"JetBrains Mono", monospace', fontSize: 11 }}>
                <span style={{ fontWeight: w.current ? 700 : 400 }}>{w.label}</span>
                <span style={{ height: 10, background: 'rgba(0,0,0,0.06)', border:`1px solid ${dossierStyles.ink}` }}>
                  <span style={{ display:'block', height:'100%', width:`${(w.km/40)*100}%`, background: w.current ? dossierStyles.accent : dossierStyles.ink }}/>
                </span>
                <span style={{ textAlign:'right' }}>{w.km.toFixed(1)}km/{w.runs}</span>
              </div>
            ))}
          </div>
          <div style={{ fontFamily:'"Caveat","Kalam",cursive', fontSize: 18, color: dossierStyles.accent, marginTop: 10, transform:'rotate(-1deg)' }}>
            ↑ fewer runs, lower volume.
          </div>
        </div>
      </div>

      {/* Pace chart card */}
      <div style={{
        background: '#faf6eb',
        border: `1px solid ${dossierStyles.ink}`,
        padding: '12px 16px 6px',
        marginBottom: 20,
        position: 'relative',
        boxShadow: '2px 3px 0 rgba(0,0,0,0.08)',
      }}>
        <div style={{ position:'absolute', top:-10, left:'40%', width:70, height:18, background:'rgba(220,200,120,0.55)', transform:'rotate(-2deg)', boxShadow:'0 1px 3px rgba(0,0,0,0.12)' }}/>
        <DossierLabel>Exhibit C · Pace per km (annotated by coach)</DossierLabel>
        <DossierPaceLine splits={R.splits}/>
      </div>

      {/* Row: splits table + HR zones */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div>
          <DossierLabel>Exhibit D · Splits log</DossierLabel>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'"JetBrains Mono", monospace', fontSize: 11, fontVariantNumeric:'tabular-nums' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${dossierStyles.ink}` }}>
                {['KM','PACE','HR','CAD','ELEV'].map(h => (
                  <th key={h} style={{ textAlign:'right', padding:'3px 6px', fontFamily:'"Helvetica Neue", Inter, sans-serif', fontSize: 9, letterSpacing: 2, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {R.splits.map((s,i)=>(
                <tr key={i} style={{ borderBottom: '1px dashed rgba(0,0,0,0.2)' }}>
                  <td style={{ textAlign:'right', padding:'3px 6px' }}>{s.km}</td>
                  <td style={{ textAlign:'right', padding:'3px 6px', color: (i===0||i===9) ? dossierStyles.accent : 'inherit', fontWeight: (i===0||i===9)?700:400 }}>{s.pace}</td>
                  <td style={{ textAlign:'right', padding:'3px 6px' }}>{s.hr}</td>
                  <td style={{ textAlign:'right', padding:'3px 6px' }}>{s.cad}</td>
                  <td style={{ textAlign:'right', padding:'3px 6px' }}>+{s.elev}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <DossierLabel>Exhibit E · HR zones ({R.moving_time})</DossierLabel>
          {R.hr_zones.map((z,i)=>(
            <div key={i} style={{ display:'grid', gridTemplateColumns:'28px 64px 1fr 60px', alignItems:'center', gap: 8, margin: '6px 0', fontFamily:'"JetBrains Mono", monospace', fontSize: 11 }}>
              <span style={{ fontFamily:'"Helvetica Neue", Inter, sans-serif', fontSize:10, fontWeight:700 }}>{z.z}</span>
              <span style={{ opacity: 0.6, fontSize: 10 }}>{z.range}</span>
              <span style={{ height: 10, background: 'rgba(0,0,0,0.06)', border:`1px solid ${dossierStyles.ink}` }}>
                <span style={{ display:'block', height:'100%', width:`${(z.pct/40)*100}%`, background: i>=3 ? dossierStyles.accent : dossierStyles.ink, opacity: i>=3 ? 0.88 : 0.85 }}/>
              </span>
              <span style={{ textAlign:'right', fontSize: 10 }}>{z.min}m·{z.pct}%</span>
            </div>
          ))}
          <div style={{ fontFamily:'"Caveat","Kalam",cursive', fontSize: 18, color: dossierStyles.accent, marginTop: 8, transform:'rotate(0.5deg)' }}>
            ↑ 45% in Z4+. Not easy.
          </div>
        </div>
      </div>

      {/* Verdict block — typed memo */}
      <div style={{
        background: 'rgba(250,246,235,0.85)',
        border: `1.5px solid ${dossierStyles.ink}`,
        padding: '18px 22px 20px',
        position: 'relative',
      }}>
        <div style={{ position:'absolute', top:-10, left:28, width:80, height:18, background:'rgba(220,200,120,0.55)', transform:'rotate(-2deg)', boxShadow:'0 1px 3px rgba(0,0,0,0.12)' }}/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <DossierLabel>MEMO · From the desk of Pak Har</DossierLabel>
          <div style={{ fontFamily:'"Helvetica Neue", Inter, sans-serif', fontSize: 9, letterSpacing: 2, opacity: 0.6 }}>{V.byline.toUpperCase()}</div>
        </div>
        <div style={{
          fontFamily: '"Special Elite", "Courier Prime", monospace',
          fontSize: 20, fontWeight: 700, lineHeight: 1.2, margin: '4px 0 12px',
        }}>
          {V.headline}
        </div>
        {V.body.map((p,i)=>(
          <p key={i} style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.6, fontFamily:'"Special Elite", "Courier Prime", monospace' }}>{p}</p>
        ))}
        <div style={{ borderTop: `1px dashed ${dossierStyles.ink}`, marginTop: 14, paddingTop: 10, display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
          <div style={{ fontFamily:'"Caveat","Kalam",cursive', fontSize: 28, color: dossierStyles.ink, lineHeight:1, transform:'rotate(-2deg)' }}>
            Pak Har
          </div>
          <div style={{ fontFamily:'"Helvetica Neue", Inter, sans-serif', fontSize: 9, letterSpacing: 2, opacity: 0.55, textAlign:'right' }}>
            "Besok pagi, lari lagi ya."<br/>
            (tomorrow morning, run again.)
          </div>
        </div>
      </div>
    </div>
  );
}

window.DossierDirection = DossierDirection;
