// Direction 1 — Receipt / thermal printout
// Monospace everything. Dot-matrix rule lines (rows of em-dashes).
// Cream paper, black ink, one iron-oxide accent on the verdict stamp.
// Chart = ASCII pace ladder per user's chart pick.

const receiptStyles = {
  paper: {
    width: 560,
    background: '#f3ece0',
    color: '#1a1410',
    fontFamily: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
    fontSize: 13,
    lineHeight: 1.55,
    padding: '36px 40px 56px',
    position: 'relative',
    // soft paper texture via layered noise + micro-perforation top/bottom
    backgroundImage: `
      repeating-linear-gradient(90deg, rgba(0,0,0,0.018) 0 1px, transparent 1px 3px),
      radial-gradient(circle at 20% 10%, rgba(0,0,0,0.02), transparent 40%),
      radial-gradient(circle at 80% 90%, rgba(0,0,0,0.02), transparent 40%)
    `,
  },
  hr: { color: '#1a1410', opacity: 0.55, letterSpacing: 0, margin: '8px 0', whiteSpace: 'pre' },
  small: { fontSize: 11, opacity: 0.7 },
  accent: '#8a2a12',
};

function ReceiptRule({ ch = '-' }) {
  return <div style={receiptStyles.hr}>{ch.repeat(56)}</div>;
}

function ReceiptRow({ label, value, bold }) {
  const pad = Math.max(1, 36 - label.length - String(value).length);
  return (
    <div style={{ whiteSpace: 'pre', fontWeight: bold ? 700 : 400 }}>
      {label}{' '.repeat(pad)}{value}
    </div>
  );
}

function ReceiptAsciiPace({ splits }) {
  const maxW = 22;
  // normalize pace: slowest ≈ full bar, fastest ≈ shorter — but show effort drift with longer bars = slower
  const parsed = splits.map(s => {
    const [m, sec] = s.pace.split(':').map(Number);
    return m * 60 + sec;
  });
  const min = Math.min(...parsed), max = Math.max(...parsed);
  return (
    <div style={{ whiteSpace: 'pre', lineHeight: 1.5 }}>
      {splits.map((s, i) => {
        const secs = parsed[i];
        const filled = Math.round(((secs - min) / (max - min)) * maxW);
        const bar = '█'.repeat(filled) + '░'.repeat(maxW - filled);
        const km = String(s.km).padStart(2, ' ');
        return (
          <div key={i} style={{
            color: s.pace === '5:12' || s.hr >= 175 ? receiptStyles.accent : 'inherit',
          }}>
            KM{km}  {s.pace}  {bar}  {String(s.hr).padStart(3)}bpm
          </div>
        );
      })}
    </div>
  );
}

function ReceiptHRZones({ zones }) {
  const maxW = 28;
  return (
    <div style={{ whiteSpace: 'pre' }}>
      {zones.map((z, i) => {
        const filled = Math.round((z.pct / 40) * maxW);
        return (
          <div key={i}>
            {z.z} {z.range.padEnd(9)} {('█'.repeat(filled) + '·'.repeat(Math.max(0, maxW - filled))).padEnd(maxW)} {String(z.min).padStart(2)}min {String(z.pct).padStart(2)}%
          </div>
        );
      })}
    </div>
  );
}

function ReceiptWeekBars({ weeks }) {
  const max = Math.max(...weeks.map(w => w.km));
  return (
    <div style={{ whiteSpace: 'pre' }}>
      {weeks.map((w, i) => {
        const filled = Math.round((w.km / max) * 24);
        return (
          <div key={i} style={{ color: w.current ? receiptStyles.accent : 'inherit' }}>
            {w.label.padEnd(5)} {('▌'.repeat(filled)).padEnd(24)} {w.km.toFixed(1)}km / {w.runs} runs
          </div>
        );
      })}
    </div>
  );
}

function ReceiptDirection() {
  const R = window.RUN, V = window.PAK_HAR_VERDICT;
  return (
    <div style={receiptStyles.paper}>
      {/* top perforation */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 10,
        backgroundImage: 'radial-gradient(circle, #0000 2px, #f3ece0 2.5px)',
        backgroundSize: '14px 10px',
        backgroundPosition: '0 -4px',
      }} />

      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <div style={{ letterSpacing: 6, fontSize: 11, opacity: 0.75 }}>OLD LEGS · KOPERASI LARI</div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, marginTop: 6 }}>RUN RECEIPT</div>
        <div style={{ ...receiptStyles.small, marginTop: 2 }}>No. 000412 · Coach on duty: PAK HAR</div>
      </div>

      <ReceiptRule ch="=" />

      <ReceiptRow label="DATE" value={R.date} />
      <ReceiptRow label="START" value={R.startTime} />
      <ReceiptRow label="ROUTE" value={R.route} />
      <ReceiptRow label="CONDITIONS" value={R.weather} />
      <ReceiptRow label="TITLE" value={R.title.toUpperCase()} />

      <ReceiptRule />

      <ReceiptRow label="DISTANCE" value={`${R.distance_km.toFixed(2)} km`} bold />
      <ReceiptRow label="MOVING TIME" value={R.moving_time} bold />
      <ReceiptRow label="AVG PACE" value={`${R.avg_pace} /km`} bold />
      <ReceiptRow label="AVG HR" value={`${R.avg_hr} bpm`} />
      <ReceiptRow label="MAX HR" value={`${R.max_hr} bpm`} />
      <ReceiptRow label="CADENCE" value={`${R.cadence} spm`} />
      <ReceiptRow label="ELEV GAIN" value={`${R.elev_gain} m`} />

      <ReceiptRule />

      <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.75, margin: '4px 0 8px' }}>
        SPLITS · PACE × EFFORT
      </div>
      <ReceiptAsciiPace splits={R.splits} />

      <ReceiptRule />

      <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.75, margin: '4px 0 8px' }}>
        HEART RATE ZONES · {R.moving_time}
      </div>
      <ReceiptHRZones zones={R.hr_zones} />

      <ReceiptRule />

      <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.75, margin: '4px 0 8px' }}>
        LAST 4 WEEKS
      </div>
      <ReceiptWeekBars weeks={R.weeks} />

      <ReceiptRule ch="=" />

      {/* Verdict — stamp + body */}
      <div style={{ position: 'relative', marginTop: 10 }}>
        <div style={{
          position: 'absolute', top: -4, right: -6,
          transform: 'rotate(-6deg)',
          border: `2.5px solid ${receiptStyles.accent}`,
          color: receiptStyles.accent,
          padding: '6px 10px',
          fontSize: 14, fontWeight: 700, letterSpacing: 3,
          opacity: 0.88,
        }}>{V.stamp}</div>

        <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.75, marginBottom: 6 }}>
          COACH'S NOTE
        </div>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
          {V.headline}
        </div>
        {V.body.map((p, i) => (
          <p key={i} style={{ margin: '0 0 10px', maxWidth: 480 }}>{p}</p>
        ))}
        <div style={{ marginTop: 14, ...receiptStyles.small }}>
          — {V.byline}
        </div>
      </div>

      <ReceiptRule ch="-" />

      <div style={{ textAlign: 'center', ...receiptStyles.small, marginTop: 12 }}>
        *** {V.dispatch} ***
      </div>
      <div style={{ textAlign: 'center', ...receiptStyles.small, marginTop: 6, opacity: 0.55 }}>
        SIMPAN STRUK INI · KEEP THIS SLIP
      </div>

      {/* bottom perforation */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 10,
        backgroundImage: 'radial-gradient(circle, #0000 2px, #f3ece0 2.5px)',
        backgroundSize: '14px 10px',
        backgroundPosition: '0 4px',
      }} />
    </div>
  );
}

window.ReceiptDirection = ReceiptDirection;
