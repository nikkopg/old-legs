// Coach chat (/coach) — wire-service teletype.
// Narrow paper width. Monospace. Fixed-column. Timestamped. Each exchange is a dispatch.
// Real-time feel: streaming cursor on last assistant line, SEND button = PUNCH.

function CoachPage({ onNav }) {
  const { useState, useEffect, useRef } = React;

  // Seed history to show the metaphor
  const [history, setHistory] = useState([
    { role: 'user',      ts: '06:48:02', text: 'How was my pace on the long run Saturday?' },
    { role: 'assistant', ts: '06:48:04', text: 'Too even. 5:52 for the first kilometre, 5:51 for the last. A long run is not a tempo. You were supposed to feel like you could do two more. Could you?' },
    { role: 'user',      ts: '06:49:17', text: 'Not really. My legs felt heavy after km 10.' },
    { role: 'assistant', ts: '06:49:19', text: 'Then you have your answer. Start thirty seconds slower next Saturday. Negative-split the second half by fifteen. This is not a negotiation.' },
  ]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const inputRef = useRef(null);
  const endRef = useRef(null);

  // Fake streaming response for demo
  function send() {
    if (!draft.trim() || streaming) return;
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8);
    const msg = { role: 'user', ts, text: draft.trim() };
    setHistory(h => [...h, msg]);
    setDraft('');
    setStreaming(true);

    // Pick a canned reply based on a crude keyword check — stays in voice
    const reply = pickReply(msg.text);
    const rts = new Date(Date.now() + 2000).toTimeString().slice(0, 8);

    // Stream word by word
    setHistory(h => [...h, { role: 'assistant', ts: rts, text: '' }]);
    let i = 0;
    const words = reply.split(' ');
    const id = setInterval(() => {
      if (i >= words.length) { clearInterval(id); setStreaming(false); return; }
      setHistory(h => {
        const last = h[h.length - 1];
        const next = { ...last, text: (last.text ? last.text + ' ' : '') + words[i] };
        return [...h.slice(0, -1), next];
      });
      i++;
    }, 80);
  }

  function pickReply(q) {
    const s = q.toLowerCase();
    if (s.includes('rest') || s.includes('tired')) return 'Good. You noticed. Take Wednesday as written. Sleep by 22:00. Do not move the long run forward.';
    if (s.includes('marathon') || s.includes('race')) return 'A race is not the training. The training is the race. Show me twelve good weeks and we will talk about a date.';
    if (s.includes('pace') || s.includes('slow')) return 'If it feels slow, it is the right pace. If it feels comfortable, it is too fast. Your easy days have been too fast for a month.';
    return 'You know the answer. Run easier on easy days. Sleep. Eat the carbs. File the question again when you have tried for a week and it still bothers you.';
  }

  useEffect(() => {
    endRef.current?.scrollTo?.({ top: 99999, behavior: 'smooth' });
  }, [history]);

  const mono = OL.mono;
  const lineW = 68; // characters per teletype line — sets column width feel

  return (
    <Paper width={760} screenLabel="04 Coach">
      <NewspaperChrome
        section="Letters to the Editor · Wire Desk"
        big={false}
        nav={[
          { key: 'dashboard', label: 'Front Page' },
          { key: 'activities', label: 'Dispatches' },
          { key: 'plan', label: 'Plan' },
          { key: 'coach', label: 'Letters' },
          { key: 'settings', label: 'Desk' },
        ]}
        activeNav="coach"
        onNav={onNav}
      />

      {/* Teletype strip header */}
      <div style={{ marginTop: 14 }}>
        <Caps size={10} ls={3}>Teletype · Direct to the Editor</Caps>
        <Hairline gap={6}/>
        <div style={{
          border: `1px solid ${OL.ink}`,
          padding: '10px 14px',
          background: 'rgba(20,18,16,0.02)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <Caps size={9} ls={2} opacity={0.7}>Wire: OLD-LEGS / PAK-HAR</Caps>
          <Caps size={9} ls={2} opacity={0.7}>
            <span style={{ color: streaming ? OL.accent : 'inherit', fontWeight: streaming ? 800 : 600 }}>
              ● {streaming ? 'ON THE LINE' : 'OPEN'}
            </span>
          </Caps>
          <Caps size={9} ls={2} opacity={0.7}>Jakarta · GMT+7</Caps>
        </div>
      </div>

      {/* Transcript — feels like a telex roll */}
      <div ref={endRef} style={{
        marginTop: 0,
        background: OL.paper,
        border: `1px solid ${OL.ink}`,
        borderTop: 'none',
        padding: '18px 20px 14px',
        fontFamily: mono, fontSize: 13, lineHeight: 1.6,
        minHeight: 380, maxHeight: 420, overflowY: 'auto',
        position: 'relative',
      }}>
        {/* Teletype tick marks in gutter */}
        <div style={{
          position: 'absolute', left: 6, top: 12, bottom: 12, width: 6,
          borderLeft: `1px dashed ${OL.hair}`,
        }}/>

        {history.map((m, i) => (
          <TeletypeLine key={i} m={m} streaming={streaming && i === history.length - 1 && m.role === 'assistant'} lineW={lineW}/>
        ))}
      </div>

      {/* Composer — the punch key */}
      <div style={{
        border: `1px solid ${OL.ink}`, borderTop: 'none',
        padding: '12px 14px',
        display: 'grid', gridTemplateColumns: '72px 1fr 100px', gap: 10, alignItems: 'stretch',
      }}>
        <div style={{ fontFamily: OL.mono, fontSize: 11, alignSelf: 'center' }}>
          <Caps size={9} ls={2} opacity={0.6}>Sender</Caps>
          <div style={{ fontFamily: OL.mono, fontSize: 13, fontWeight: 700, marginTop: 2 }}>YOU</div>
        </div>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type your message. Enter to send."
          disabled={streaming}
          rows={2}
          style={{
            fontFamily: OL.mono, fontSize: 13, lineHeight: 1.5,
            padding: 8, border: `1px dashed ${OL.ink}`, background: 'transparent',
            resize: 'none', outline: 'none', color: OL.ink,
          }}
        />
        <button
          onClick={send}
          disabled={streaming || !draft.trim()}
          style={{
            background: (streaming || !draft.trim()) ? 'transparent' : OL.accent,
            color: (streaming || !draft.trim()) ? OL.ink : '#fff',
            border: `1px solid ${(streaming || !draft.trim()) ? OL.ink : OL.accent}`,
            fontFamily: OL.sans, fontSize: 10, letterSpacing: 3, fontWeight: 800,
            textTransform: 'uppercase', cursor: (streaming || !draft.trim()) ? 'default' : 'pointer',
            opacity: (streaming || !draft.trim()) ? 0.5 : 1,
          }}
        >
          Punch<br/>Send ↵
        </button>
      </div>

      {/* Below the transcript — wire desk notes */}
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 28, alignItems: 'start' }}>
        <div>
          <Caps size={10} ls={3}>Wire Desk Notes</Caps>
          <Hairline gap={6}/>
          <p style={{ fontFamily: OL.body, fontSize: 12.5, lineHeight: 1.6, margin: '6px 0 0' }}>
            The editor reads every message. He replies when he replies. Do not send the same question twice — he will notice.
          </p>
          <p style={{ fontFamily: OL.body, fontSize: 12.5, lineHeight: 1.6, margin: '6px 0 0' }}>
            For post-run analysis, file from the Dispatch page. For the week ahead, see the Plan. For everything else, punch send.
          </p>
        </div>

        <div>
          <Caps size={10} ls={3}>Useful Signals</Caps>
          <Hairline gap={6}/>
          <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', fontFamily: OL.mono, fontSize: 11, lineHeight: 1.8 }}>
            {[
              ['TRAIN?', 'ask about a specific session'],
              ['PACE?', 'ask about your easy / long / tempo pace'],
              ['REST?', 'tell him you are tired'],
              ['RACE?', 'ask about a goal race'],
            ].map(([k, v]) => (
              <li key={k} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8, borderBottom: `1px dotted ${OL.hair}`, padding: '3px 0' }}>
                <b>{k}</b>
                <span style={{ fontFamily: OL.body, fontSize: 12, color: OL.muted }}>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <FooterRail
        left="Wire Desk · Senayan"
        center="Page 3 · Letters"
        right="— replies go out on the hour —"
      />
    </Paper>
  );
}

// A single teletype line — "FROM: YOU 06:48:02 …" with word-wrap and underscoring.
function TeletypeLine({ m, streaming, lineW }) {
  const from = m.role === 'user' ? 'YOU' : 'PAK';
  const accentColor = m.role === 'assistant' ? OL.ink : OL.muted;
  const barColor = m.role === 'assistant' ? OL.accent : OL.ink;

  return (
    <div style={{ marginBottom: 14, paddingLeft: 14, position: 'relative' }}>
      <div style={{
        position: 'absolute', left: 0, top: 4, bottom: 4, width: 3,
        background: barColor,
      }}/>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontFamily: OL.mono, fontSize: 11, letterSpacing: 1, fontWeight: 700 }}>
          {m.ts}
        </span>
        <span style={{ fontFamily: OL.mono, fontSize: 11, letterSpacing: 3, opacity: 0.7 }}>
          FROM: {from}
        </span>
        <span style={{ flex: 1, borderBottom: `1px dotted ${OL.hair}`, transform: 'translateY(-4px)' }}/>
        <span style={{ fontFamily: OL.mono, fontSize: 10, letterSpacing: 2, opacity: 0.55 }}>
          {m.role === 'assistant' ? 'EDITOR' : 'SUBSCRIBER'}
        </span>
      </div>
      <div style={{
        fontFamily: OL.mono, fontSize: 13, lineHeight: 1.6,
        marginTop: 4, color: accentColor,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        <span style={{ opacity: 0.5 }}>{`>`} </span>
        {m.text}
        {streaming && <span className="ol-cursor">_</span>}
      </div>
    </div>
  );
}

window.CoachPage = CoachPage;
