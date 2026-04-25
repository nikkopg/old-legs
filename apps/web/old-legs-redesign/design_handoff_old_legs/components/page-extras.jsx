// Ancillary screens: Loading ("Pak Har is thinking"), Offline, Settings shell.
// All share the newspaper chrome.

// ---------- Loading state ----------
// Used while the LLM is generating. Feels like a newspaper "going to press".
function ThinkingPage({ onNav, context = 'dispatch' }) {
  const { useState, useEffect } = React;
  const lines = context === 'dispatch'
    ? [
      'Pulling splits from the wire...',
      'Reading the zones...',
      'Checking last week...',
      'Writing the dispatch...',
    ]
    : [
      'Reading your last four weeks...',
      'Rounding up the targets...',
      'Drafting Tuesday...',
      'Filing the plan...',
    ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => Math.min(i + 1, lines.length - 1)), 900);
    return () => clearInterval(id);
  }, []);

  return (
    <Paper width={760} screenLabel="05 Thinking">
      <NewspaperChrome
        section="Going To Press"
        big={false}
        nav={[
          { key: 'dashboard', label: 'Front Page' },
          { key: 'activities', label: 'Dispatches' },
          { key: 'plan', label: 'Plan' },
          { key: 'coach', label: 'Letters' },
          { key: 'settings', label: 'Desk' },
        ]}
        activeNav={context === 'plan' ? 'plan' : 'activities'}
        onNav={onNav}
      />

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 280px', gap: 28, alignItems: 'start' }}>
        <div>
          <Caps size={10} ls={3}>Stop Press</Caps>
          <h1 style={{
            fontFamily: OL.display, fontWeight: 400,
            fontSize: 56, lineHeight: 0.98, letterSpacing: -0.6,
            margin: '6px 0 14px',
          }}>
            Pak Har is at the typewriter.
          </h1>

          {/* Typewriter strip */}
          <div style={{ border: `1px solid ${OL.ink}`, padding: '14px 16px', background: 'rgba(20,18,16,0.02)' }}>
            {lines.map((l, i) => {
              const active = i === idx;
              const done = i < idx;
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr 80px', gap: 10, alignItems: 'center',
                  padding: '6px 0', fontFamily: OL.mono, fontSize: 13,
                  opacity: done ? 0.55 : active ? 1 : 0.3,
                }}>
                  <span style={{ fontFamily: OL.display, fontSize: 18, color: active ? OL.accent : OL.ink }}>
                    {done ? '✓' : active ? '›' : '·'}
                  </span>
                  <span>{l}<span className={active ? 'ol-cursor' : ''}>{active ? '_' : ''}</span></span>
                  <Caps size={8} ls={2} opacity={0.55}>
                    {done ? 'filed' : active ? 'writing' : 'queued'}
                  </Caps>
                </div>
              );
            })}
          </div>

          <p style={{ fontFamily: OL.body, fontSize: 13.5, lineHeight: 1.6, margin: '16px 0 0', maxWidth: 500, color: OL.muted, fontStyle: 'italic' }}>
            This usually takes twenty to forty seconds. If it takes longer, the printer is warm — that is all.
          </p>
        </div>

        {/* Sidebar: what's coming */}
        <aside style={{ borderLeft: `1px solid ${OL.ink}`, paddingLeft: 18 }}>
          <Caps size={10} ls={3}>Coming in This Edition</Caps>
          <Hairline gap={6}/>
          <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', fontFamily: OL.body, fontSize: 12.5, lineHeight: 1.7 }}>
            {context === 'dispatch' ? [
              'Pak Har\'s verdict — the headline',
              'At-a-glance summary',
              'Pace & HR chart',
              'Split table',
              'HR zones',
              'Last 4 weeks mileage',
              'Prescription for tomorrow',
            ].map(s => (
              <li key={s} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 6, borderBottom: `1px dotted ${OL.hair}`, padding: '4px 0' }}>
                <span style={{ fontFamily: OL.display, fontSize: 13 }}>§</span>
                <span>{s}</span>
              </li>
            )) : [
              'Seven days, Mon–Sun',
              'One tempo, one long',
              'Two rest days',
              'Targets in bpm',
              'Editor\'s note for context',
            ].map(s => (
              <li key={s} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 6, borderBottom: `1px dotted ${OL.hair}`, padding: '4px 0' }}>
                <span style={{ fontFamily: OL.display, fontSize: 13 }}>§</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <FooterRail
        left="The Press · Senayan"
        center="Special edition · going out"
        right="— hold the line —"
      />
    </Paper>
  );
}

// ---------- Offline state ----------
function OfflinePage({ onRetry, onNav, kind = 'api' /* api | ollama | strava */ }) {
  const copy = {
    api: {
      head: 'The presses are down.',
      deck: 'The office cannot be reached. This is not your fault. Usually not, anyway.',
      sub: 'Try again in a moment. If it persists, check that the server is running.',
      code: '503 · Service Unavailable',
    },
    ollama: {
      head: 'Pak Har is not at his desk.',
      deck: 'The editor is offline. Start him up and he will answer the wire.',
      sub: 'Make sure Ollama is running on the machine the API points to.',
      code: '502 · Bad Gateway',
    },
    strava: {
      head: 'Strava did not answer.',
      deck: 'The wire to Strava is quiet. Their outage, not ours.',
      sub: 'Refresh in a minute or two. Your data is safe.',
      code: '504 · Upstream Timeout',
    },
  }[kind];

  return (
    <Paper width={760} screenLabel="06 Offline">
      <NewspaperChrome
        section="Errata"
        big={false}
        nav={[
          { key: 'dashboard', label: 'Front Page' },
          { key: 'activities', label: 'Dispatches' },
          { key: 'plan', label: 'Plan' },
          { key: 'coach', label: 'Letters' },
          { key: 'settings', label: 'Desk' },
        ]}
        activeNav="dashboard"
        onNav={onNav}
      />

      <div style={{ marginTop: 28, border: `3px solid ${OL.ink}`, padding: '28px 32px', background: 'rgba(138,42,18,0.04)' }}>
        <Caps size={10} ls={4} opacity={1} style={{ color: OL.accent, fontWeight: 800 }}>Errata · Notice to Readers</Caps>
        <h1 style={{
          fontFamily: OL.display, fontWeight: 400,
          fontSize: 64, lineHeight: 0.98, letterSpacing: -0.8,
          margin: '10px 0 12px',
        }}>
          {copy.head}
        </h1>
        <p style={{ fontFamily: OL.body, fontSize: 16, lineHeight: 1.5, margin: '0 0 12px', maxWidth: 560 }}>
          {copy.deck}
        </p>
        <p style={{ fontFamily: OL.body, fontSize: 13.5, lineHeight: 1.6, margin: 0, maxWidth: 560, color: OL.muted, fontStyle: 'italic' }}>
          {copy.sub}
        </p>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onRetry} style={{
            background: OL.ink, color: '#fff', border: 'none',
            padding: '12px 22px', fontFamily: OL.sans, fontSize: 11, letterSpacing: 3, fontWeight: 800,
            textTransform: 'uppercase', cursor: 'pointer',
          }}>
            Retry →
          </button>
          <div style={{ fontFamily: OL.mono, fontSize: 11, letterSpacing: 2, opacity: 0.55 }}>{copy.code}</div>
        </div>
      </div>

      {/* Secondary info */}
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {[
          ['Status', 'All three services checked in 40 seconds ago.'],
          ['Cache', 'Your last successful sync is still on file.'],
          ['Support', 'If this persists, see the Desk section.'],
        ].map(([l, t]) => (
          <div key={l} style={{ borderTop: `1px solid ${OL.ink}`, paddingTop: 8 }}>
            <Caps size={9} ls={3} opacity={0.7}>{l}</Caps>
            <p style={{ fontFamily: OL.body, fontSize: 12.5, lineHeight: 1.55, margin: '6px 0 0' }}>{t}</p>
          </div>
        ))}
      </div>

      <FooterRail
        left="Errata · Senayan"
        center="Special notice"
        right="— regular edition resumes shortly —"
      />
    </Paper>
  );
}

// ---------- Settings shell ----------
function SettingsPage({ onNav, onDisconnect }) {
  return (
    <Paper width={980} screenLabel="07 Settings">
      <NewspaperChrome
        section="The Desk · Subscriber Controls"
        big={false}
        nav={[
          { key: 'dashboard', label: 'Front Page' },
          { key: 'activities', label: 'Dispatches' },
          { key: 'plan', label: 'Plan' },
          { key: 'coach', label: 'Letters' },
          { key: 'settings', label: 'Desk' },
        ]}
        activeNav="settings"
        onNav={onNav}
      />

      <div style={{ marginTop: 18 }}>
        <Caps size={10} ls={3}>Subscriber Account</Caps>
        <h1 style={{
          fontFamily: OL.display, fontWeight: 400,
          fontSize: 52, lineHeight: 0.95, letterSpacing: -0.7,
          margin: '6px 0 6px',
        }}>
          The Desk.
        </h1>
        <p style={{ fontFamily: OL.body, fontSize: 13.5, lineHeight: 1.55, margin: 0, maxWidth: 560 }}>
          Adjust your subscription. Change what Pak Har sees. Cancel the paper — no hard feelings.
        </p>
      </div>

      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 280px', gap: 28, alignItems: 'start' }}>
        {/* Main column — setting sections */}
        <div>
          <Rule thick/>

          {/* Subscriber card */}
          <section style={{ padding: '14px 0', borderBottom: `1px solid ${OL.ink}` }}>
            <SectionLabel right="read-only">Subscriber Record</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {[
                ['Name', 'Runner'],
                ['Subscribed', 'Jan 2026'],
                ['Editions received', '14'],
                ['Strava athlete', 'ID 18234901'],
                ['Timezone', 'Asia/Jakarta'],
                ['Preferred unit', 'km'],
              ].map(([l, v]) => (
                <div key={l} style={{ borderLeft: `1px solid ${OL.hair}`, paddingLeft: 10 }}>
                  <Caps size={8} ls={2} opacity={0.6}>{l}</Caps>
                  <div style={{ fontFamily: OL.mono, fontSize: 13, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Editor voice */}
          <section style={{ padding: '14px 0', borderBottom: `1px solid ${OL.ink}` }}>
            <SectionLabel>Editor's Voice</SectionLabel>
            <p style={{ fontFamily: OL.body, fontSize: 13, lineHeight: 1.6, margin: '0 0 10px', color: OL.muted, maxWidth: 560 }}>
              How hard Pak Har pushes in his dispatches. Not a personality change — a volume knob.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                ['Gentle', 'Mentor. Still honest. Less bite.', false],
                ['Standard', 'The default. What you signed up for.', true],
                ['Unfiltered', 'No softening. Ask for it.', false],
              ].map(([l, d, on]) => (
                <div key={l} style={{
                  border: `${on ? 3 : 1}px solid ${OL.ink}`,
                  padding: '10px 12px', cursor: 'pointer',
                  background: on ? 'rgba(20,18,16,0.03)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Caps size={10} ls={2} weight={800}>{l}</Caps>
                    {on && <Caps size={9} ls={2} opacity={1} style={{ color: OL.accent, fontWeight: 800 }}>✓ On</Caps>}
                  </div>
                  <p style={{ fontFamily: OL.body, fontSize: 12, lineHeight: 1.5, margin: '6px 0 0', color: OL.muted }}>{d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Notifications */}
          <section style={{ padding: '14px 0', borderBottom: `1px solid ${OL.ink}` }}>
            <SectionLabel>Delivery Preferences</SectionLabel>
            {[
              ['Dispatch after every run', true],
              ['Weekly plan on Monday 05:00', true],
              ['Weekly review on Sunday 20:00', true],
              ['Missed-run nudge (gentle)', false],
            ].map(([l, on]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px dotted ${OL.hair}` }}>
                <span style={{ fontFamily: OL.body, fontSize: 13 }}>{l}</span>
                <span style={{
                  display: 'inline-block', width: 44, height: 20,
                  border: `1px solid ${OL.ink}`, padding: 2,
                  background: on ? OL.ink : 'transparent',
                  position: 'relative',
                }}>
                  <span style={{
                    display: 'block', width: 14, height: 14,
                    background: on ? OL.paper : OL.ink,
                    marginLeft: on ? 22 : 0,
                    transition: 'margin 0.15s',
                  }}/>
                </span>
              </div>
            ))}
          </section>

          {/* Danger zone */}
          <section style={{ padding: '14px 0' }}>
            <SectionLabel>Cancel the Subscription</SectionLabel>
            <p style={{ fontFamily: OL.body, fontSize: 13, lineHeight: 1.6, margin: '0 0 12px', maxWidth: 560 }}>
              Disconnect Strava and delete your data. No farewell edition. No retention dance. You come back, you come back.
            </p>
            <button onClick={onDisconnect} style={{
              background: 'transparent', color: OL.accent,
              border: `1px solid ${OL.accent}`,
              padding: '10px 20px', fontFamily: OL.sans, fontSize: 11, letterSpacing: 3, fontWeight: 700,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Cancel Subscription →
            </button>
          </section>
        </div>

        {/* Sidebar */}
        <aside style={{ borderLeft: `1px solid ${OL.ink}`, paddingLeft: 20 }}>
          <Caps size={10} ls={3}>The Paper in Numbers</Caps>
          <Hairline gap={6}/>
          {[
            ['14', 'editions received'],
            ['12', 'dispatches filed'],
            ['3', 'weekly plans'],
            ['47', 'letters exchanged'],
          ].map(([v, l]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: `1px dotted ${OL.hair}` }}>
              <span style={{ fontFamily: OL.mono, fontSize: 22, fontWeight: 700 }}>{v}</span>
              <Caps size={9} ls={2} opacity={0.6}>{l}</Caps>
            </div>
          ))}

          <div style={{ marginTop: 18 }}>
            <Caps size={10} ls={3}>Colophon</Caps>
            <Hairline gap={6}/>
            <p style={{ fontFamily: OL.body, fontSize: 12, lineHeight: 1.6, margin: '6px 0 0', color: OL.muted }}>
              Old Legs Daily is typeset in Abril Fatface and Lora. Dispatches are printed by an editor named Pak Har. Built in Jakarta, 2026.
            </p>
          </div>
        </aside>
      </div>

      <FooterRail
        left="The Desk · Senayan"
        center="Page 4 · Controls"
        right="— back to the Front Page —"
      />
    </Paper>
  );
}

window.ThinkingPage = ThinkingPage;
window.OfflinePage = OfflinePage;
window.SettingsPage = SettingsPage;
