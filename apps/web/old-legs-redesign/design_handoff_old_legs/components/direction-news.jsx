// Direction 2 — Newsprint broadsheet (font-pairing parameterized)
// Accepts a `pairing` prop with: { displaySerif, bodySerif, sans, mono, label, sub }

const NEWS_PAIRINGS = {
  // Baseline — current ship.
  current: {
    label: 'Current — Playfair + Georgia',
    sub: 'High-contrast didone masthead, trusty reading serif, Helvetica caps.',
    displaySerif: '"Playfair Display", "Didot", Georgia, serif',
    bodySerif: '"Source Serif Pro", "Iowan Old Style", Georgia, serif',
    sans: '"Helvetica Neue", "Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
    masthead: { size: 56, weight: 900, tracking: -1.5 },
    headline: { size: 40, weight: 800, tracking: -0.5, lineHeight: 1.02 },
  },
  // Editorial, considered — Mark Manson book-cover territory.
  editorial: {
    label: 'Editorial — Fraunces + IBM Plex',
    sub: 'Warm 19th-century masthead with a modern-humanist body. Pulls Pak Har toward book-jacket territory.',
    displaySerif: '"Fraunces", "Recoleta", Georgia, serif',
    bodySerif: '"Fraunces", "Iowan Old Style", Georgia, serif',
    sans: '"IBM Plex Sans", "Inter", system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
    masthead: { size: 62, weight: 900, tracking: -2, fontStyle: 'italic' },
    headline: { size: 40, weight: 700, tracking: -0.6, lineHeight: 1.02 },
  },
  // Harder-edged — the op-ed columnist who will roast you.
  opinion: {
    label: 'Opinion — Cormorant + Inter',
    sub: 'Tall Garamond-flavoured display with quiet grotesk. Sharp byline voice, easy to read long-form.',
    displaySerif: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
    bodySerif: '"EB Garamond", Georgia, serif',
    sans: '"Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
    masthead: { size: 64, weight: 700, tracking: -2, fontStyle: 'italic' },
    headline: { size: 42, weight: 700, tracking: -0.8, lineHeight: 1.0 },
  },
  // Oldest-school — 1920s sports pages, tabloid energy.
  tabloid: {
    label: 'Tabloid — Abril + Work Sans',
    sub: 'Heavy condensed display, blocky body. Loud, earned. Reads like a matchday paper.',
    displaySerif: '"Abril Fatface", "Playfair Display", Didot, serif',
    bodySerif: '"Lora", Georgia, serif',
    sans: '"Work Sans", "Inter", sans-serif',
    mono: '"Space Mono", "JetBrains Mono", monospace',
    masthead: { size: 64, weight: 400, tracking: -1.5, textTransform: 'uppercase' },
    headline: { size: 44, weight: 400, tracking: -0.5, lineHeight: 1.0 },
  },
  // Typewriter-forward — Pak Har's memo voice on the front page.
  typewriter: {
    label: 'Typewriter — Instrument + Special Elite',
    sub: 'Big editorial masthead over a typewritten body. The dispatch feels physically typed.',
    displaySerif: '"Instrument Serif", "Fraunces", Georgia, serif',
    bodySerif: '"Special Elite", "Courier Prime", "Courier New", monospace',
    sans: '"Inter Tight", "Inter", system-ui, sans-serif',
    mono: '"Special Elite", "Courier Prime", monospace',
    masthead: { size: 62, weight: 400, tracking: -2, fontStyle: 'italic' },
    headline: { size: 38, weight: 400, tracking: -0.3, lineHeight: 1.05 },
  },
  // Modern sports brand — where most fitness apps wish they looked.
  modern: {
    label: 'Modern — GT Sectra (Recoleta) + Inter',
    sub: 'Contemporary serif with calligraphic bite. Closer to Substack-era editorial.',
    displaySerif: '"Recoleta", "Fraunces", Georgia, serif',
    bodySerif: '"Source Serif Pro", Georgia, serif',
    sans: '"Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
    masthead: { size: 58, weight: 800, tracking: -2 },
    headline: { size: 40, weight: 700, tracking: -0.8, lineHeight: 1.02 },
  },
};

const ACCENT = '#8a2a12';
const INK = '#141210';
const PAPER = '#f4efe4';

function NewsPacePlot({ splits, bodyFont, monoFont }) {
  const W = 680, H = 150, pad = { l: 38, r: 20, t: 18, b: 24 };
  const parsed = splits.map(s => { const [m, sec] = s.pace.split(':').map(Number); return m*60+sec; });
  const min = Math.min(...parsed) - 4, max = Math.max(...parsed) + 4;
  const x = i => pad.l + i * ((W - pad.l - pad.r) / (splits.length - 1));
  const y = v => pad.t + ((v - min) / (max - min)) * (H - pad.t - pad.b);
  const d = parsed.map((v, i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const hrs = splits.map(s => s.hr);
  const hmin = Math.min(...hrs) - 4, hmax = Math.max(...hrs) + 4;
  const yh = v => pad.t + ((hmax - v)/(hmax - hmin)) * (H-pad.t-pad.b);
  const hrD = hrs.map((v,i)=>`${i===0?'M':'L'}${x(i).toFixed(1)},${yh(v).toFixed(1)}`).join(' ');
  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:'block' }}>
      {[0,1,2,3].map(i => (
        <line key={i} x1={pad.l} y1={pad.t + i*(H-pad.t-pad.b)/3} x2={W-pad.r} y2={pad.t + i*(H-pad.t-pad.b)/3}
              stroke={INK} strokeWidth="0.4" strokeDasharray="1 3" opacity="0.5"/>
      ))}
      <path d={d} fill="none" stroke={INK} strokeWidth="1.2" strokeLinejoin="round"/>
      {parsed.map((v,i)=>(
        <circle key={i} cx={x(i)} cy={y(v)} r={i===0||i===9?3:1.8} fill={i===0||i===9?ACCENT:INK}/>
      ))}
      <path d={hrD} fill="none" stroke={INK} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.55"/>
      {splits.map((s,i)=>(
        <text key={i} x={x(i)} y={H-6} textAnchor="middle" fontFamily={monoFont} fontSize="9" fill={INK}>{s.km}</text>
      ))}
      <text x={pad.l-6} y={y(Math.min(...parsed))+3} textAnchor="end" fontFamily={monoFont} fontSize="9" fill={INK}>{fmt(Math.min(...parsed))}</text>
      <text x={pad.l-6} y={y(Math.max(...parsed))+3} textAnchor="end" fontFamily={monoFont} fontSize="9" fill={INK}>{fmt(Math.max(...parsed))}</text>
      <line x1={x(0)} y1={y(parsed[0])} x2={x(0)} y2={pad.t-4} stroke={ACCENT} strokeWidth="0.8"/>
      <text x={x(0)+4} y={pad.t-6} fontFamily={bodyFont} fontSize="10" fontStyle="italic" fill={ACCENT}>too hard, too early</text>
      <line x1={x(9)} y1={y(parsed[9])} x2={x(9)} y2={pad.t-4} stroke={ACCENT} strokeWidth="0.8"/>
      <text x={x(9)-4} y={pad.t-6} textAnchor="end" fontFamily={bodyFont} fontSize="10" fontStyle="italic" fill={ACCENT}>ego surge</text>
    </svg>
  );
}

function NewsDirection({ pairingKey = 'current' }) {
  const R = window.RUN, V = window.PAK_HAR_VERDICT;
  const P = NEWS_PAIRINGS[pairingKey] || NEWS_PAIRINGS.current;

  const paper = {
    width: 760, background: PAPER, color: INK,
    fontFamily: P.bodySerif, padding: '28px 36px 48px',
    lineHeight: 1.45, fontSize: 13, position: 'relative',
  };
  const caps = { fontFamily: P.sans, textTransform: 'uppercase', letterSpacing: 1 };
  const mono = { fontFamily: P.mono, fontVariantNumeric: 'tabular-nums' };

  const NewsStat = ({ label, value, unit }) => (
    <div>
      <div style={{ ...caps, fontSize: 9, opacity: 0.7 }}>{label}</div>
      <div style={{ ...mono, fontSize: 28, lineHeight: 1, marginTop: 4, fontWeight: 600 }}>
        {value}{unit && <span style={{ fontSize: 12, marginLeft: 3, opacity: 0.6 }}>{unit}</span>}
      </div>
    </div>
  );

  return (
    <div style={paper}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', ...caps, fontSize: 10, opacity: 0.75 }}>
        <span>Vol. III · Edition No. 412</span>
        <span>Old Legs Daily · Post-Run Dispatch</span>
        <span>{R.date}</span>
      </div>
      <div style={{ height: 3, background: INK, margin: '10px 0' }}/>
      <div style={{ textAlign:'center', padding: '6px 0' }}>
        <div style={{
          fontFamily: P.displaySerif,
          fontSize: P.masthead.size, fontWeight: P.masthead.weight,
          letterSpacing: P.masthead.tracking, lineHeight: 0.95,
          fontStyle: P.masthead.fontStyle || 'normal',
          textTransform: P.masthead.textTransform || 'none',
        }}>
          The Old Legs
        </div>
        <div style={{ ...caps, fontSize: 10, letterSpacing: 6, marginTop: 6, opacity: 0.75 }}>
          · No Cheerleading Since 1976 ·
        </div>
      </div>
      <div style={{ height: 3, background: INK, margin: '10px 0' }}/>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 240px', gap: 24, marginTop: 14 }}>
        <div>
          <div style={{ ...caps, fontSize: 10, opacity: 0.7 }}>FRONT PAGE · VERDICT</div>
          <h1 style={{
            fontFamily: P.displaySerif,
            fontSize: P.headline.size, lineHeight: P.headline.lineHeight,
            margin: '6px 0 8px', fontWeight: P.headline.weight,
            letterSpacing: P.headline.tracking,
            fontStyle: P.headline.fontStyle || 'normal',
          }}>
            {V.headline}
          </h1>
          <div style={{ ...caps, fontSize: 10, opacity: 0.65 }}>
            BY PAK HAR · SENIOR COACH · FILED 07:48 WIB
          </div>
        </div>
        <div style={{ borderLeft: '1px solid rgba(20,18,16,0.4)', paddingLeft: 18 }}>
          <div style={{ ...caps, fontSize: 9, opacity: 0.7, marginBottom: 6 }}>AT A GLANCE</div>
          <div style={{ fontFamily: P.bodySerif, fontSize: 12, lineHeight: 1.5 }}>
            A ten-kilometre Sunday easy run in Jakarta that was not, in fact, easy. First kilometre 5:12.
            Heart rate drifting into Z4 by km 7. Third run of the week — the lowest count this month.
          </div>
        </div>
      </div>

      <div style={{ margin: '18px 0 10px' }}>
        <div style={{ height: 1, background: 'rgba(20,18,16,0.35)', margin: '6px 0' }}/>
        <div style={{ ...caps, fontSize: 9, opacity: 0.7, padding: '2px 0' }}>THE NUMBERS · SUNDAY EASY · SENAYAN LOOP × 2 · 27°C HUMID</div>
        <div style={{ height: 1, background: 'rgba(20,18,16,0.35)', margin: '6px 0' }}/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 14, margin: '10px 0 18px' }}>
        <NewsStat label="Distance" value={R.distance_km.toFixed(2)} unit="km"/>
        <NewsStat label="Time" value={R.moving_time}/>
        <NewsStat label="Avg Pace" value={R.avg_pace} unit="/km"/>
        <NewsStat label="Avg HR" value={R.avg_hr} unit="bpm"/>
        <NewsStat label="Cadence" value={R.cadence} unit="spm"/>
        <NewsStat label="Elev" value={`+${R.elev_gain}`} unit="m"/>
      </div>

      <div style={{ border: `1px solid ${INK}`, padding: '10px 12px 4px', background: 'rgba(20,18,16,0.015)' }}>
        <div style={{ ...caps, fontSize: 9, opacity: 0.7, marginBottom: 4 }}>PACE PER KILOMETRE ———— HR (DASHED)</div>
        <NewsPacePlot splits={R.splits} bodyFont={P.bodySerif} monoFont={P.mono}/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.15fr 1fr', gap: 28, marginTop: 20 }}>
        <div>
          <div style={{ ...caps, fontSize: 9, opacity: 0.7 }}>PAK HAR'S DISPATCH</div>
          <div style={{ height: 1, background: 'rgba(20,18,16,0.35)', margin: '6px 0' }}/>
          <p style={{ margin: '6px 0 10px', fontSize: 13.5, lineHeight: 1.55, textAlign:'justify', hyphens:'auto' }}>
            <span style={{
              float:'left', fontFamily: P.displaySerif, fontSize: 46, lineHeight: 0.9,
              paddingRight: 6, paddingTop: 2, fontWeight: P.headline.weight,
            }}>
              {V.body[0][0]}
            </span>
            {V.body[0].slice(1)}
          </p>
          {V.body.slice(1).map((p,i)=>(
            <p key={i} style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.55, textAlign:'justify', hyphens:'auto' }}>{p}</p>
          ))}
          <div style={{
            borderTop: `2px solid ${ACCENT}`, borderBottom: `2px solid ${ACCENT}`,
            padding: '10px 0', margin: '14px 0 6px',
            fontFamily: P.displaySerif,
            fontSize: 20, fontStyle:'italic', lineHeight: 1.3,
            color: ACCENT, textAlign:'center',
          }}>
            {V.pull}
          </div>
          <div style={{ ...caps, fontSize: 9, opacity: 0.7, textAlign:'right', marginTop: 6 }}>— PAK HAR · POST-RUN DISPATCH</div>
        </div>
        <div>
          <div style={{ ...caps, fontSize: 9, opacity: 0.7 }}>SPLITS · BY THE NUMBERS</div>
          <div style={{ height: 1, background: 'rgba(20,18,16,0.35)', margin: '6px 0' }}/>
          <table style={{ ...mono, width:'100%', borderCollapse:'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${INK}` }}>
                {['KM','PACE','HR','CAD','Δ ELEV'].map(h=>(
                  <th key={h} style={{ textAlign:'right', padding:'3px 6px', ...caps, fontSize: 9, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {R.splits.map((s,i)=>(
                <tr key={i} style={{ borderBottom: '1px dotted rgba(20,18,16,0.3)' }}>
                  <td style={{ textAlign:'right', padding:'2px 6px' }}>{s.km}</td>
                  <td style={{ textAlign:'right', padding:'2px 6px', color: (i===0||i===9)?ACCENT:'inherit', fontWeight: (i===0||i===9)?700:400 }}>{s.pace}</td>
                  <td style={{ textAlign:'right', padding:'2px 6px' }}>{s.hr}</td>
                  <td style={{ textAlign:'right', padding:'2px 6px' }}>{s.cad}</td>
                  <td style={{ textAlign:'right', padding:'2px 6px' }}>+{s.elev}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ ...caps, fontSize: 9, opacity: 0.7, marginTop: 16 }}>HEART RATE ZONES</div>
          <div style={{ height: 1, background: 'rgba(20,18,16,0.35)', margin: '6px 0' }}/>
          {R.hr_zones.map((z,i)=>(
            <div key={i} style={{ display:'grid', gridTemplateColumns:'28px 60px 1fr 40px', alignItems:'center', gap:8, margin:'4px 0', fontSize:11 }}>
              <div style={{ ...caps, fontWeight: 700, fontSize: 10 }}>{z.z}</div>
              <div style={{ ...mono, opacity: 0.7, fontSize: 10 }}>{z.range}</div>
              <div style={{ height: 8, background: 'rgba(20,18,16,0.08)', border: '1px solid rgba(20,18,16,0.3)' }}>
                <div style={{ height:'100%', width:`${(z.pct/40)*100}%`, background: i>=3?ACCENT:INK, opacity: i>=3?0.85:0.78 }}/>
              </div>
              <div style={{ ...mono, textAlign:'right', fontSize: 10 }}>{z.min}m · {z.pct}%</div>
            </div>
          ))}

          <div style={{ ...caps, fontSize: 9, opacity: 0.7, marginTop: 16 }}>LAST 4 WEEKS · KM</div>
          <div style={{ height: 1, background: 'rgba(20,18,16,0.35)', margin: '6px 0' }}/>
          {R.weeks.map((w,i)=>(
            <div key={i} style={{ display:'grid', gridTemplateColumns:'44px 1fr 90px', alignItems:'center', gap:8, margin:'4px 0', fontSize: 11 }}>
              <div style={{ ...caps, fontSize: 10, fontWeight: w.current?800:500 }}>{w.label}</div>
              <div style={{ height: 10, background: 'rgba(20,18,16,0.08)', border:'1px solid rgba(20,18,16,0.3)' }}>
                <div style={{ height:'100%', width:`${(w.km/40)*100}%`, background: w.current?ACCENT:INK }}/>
              </div>
              <div style={{ ...mono, textAlign:'right', fontSize: 11 }}>{w.km.toFixed(1)}km · {w.runs} runs</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 3, background: INK, margin: '10px 0' }}/>
      <div style={{ display:'flex', justifyContent:'space-between', ...caps, fontSize: 9, opacity: 0.65, marginTop: 4 }}>
        <span>Filed at Senayan · Jakarta</span>
        <span>"Besok pagi, lari lagi ya."</span>
        <span>— continued page 2: Plan for the week —</span>
      </div>
    </div>
  );
}

window.NewsDirection = NewsDirection;
window.NEWS_PAIRINGS = NEWS_PAIRINGS;
