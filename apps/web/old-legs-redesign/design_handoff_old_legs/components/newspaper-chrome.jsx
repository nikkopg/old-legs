// Shared newspaper primitives — tokens, rules, chrome, badges, bars.
// All pages import this. Keeps the vocabulary tight.

const OL = {
  paper: '#f4efe4',
  ink: '#141210',
  accent: '#8a2a12',
  muted: 'rgba(20,18,16,0.55)',
  hair: 'rgba(20,18,16,0.3)',
  display: '"Abril Fatface", "Playfair Display", Didot, serif',
  body: '"Lora", Georgia, serif',
  sans: '"Work Sans", "Inter", sans-serif',
  mono: '"Space Mono", "JetBrains Mono", monospace',
};

// ---------- type helpers ----------
function Caps({ children, size = 10, ls = 2, weight = 600, style, opacity = 0.7 }) {
  return (
    <span style={{
      fontFamily: OL.sans, fontSize: size, letterSpacing: ls, fontWeight: weight,
      textTransform: 'uppercase', opacity, ...style,
    }}>{children}</span>
  );
}

function Rule({ thick, gap = 0 }) {
  if (thick) return (
    <div style={{ margin: gap ? `${gap}px 0` : 0 }}>
      <div style={{ height: 3, background: OL.ink }}/>
      <div style={{ height: 1, background: OL.ink, marginTop: 3 }}/>
    </div>
  );
  return <div style={{ height: 1, background: OL.ink, margin: gap ? `${gap}px 0` : 0 }}/>;
}

function Hairline({ gap = 0, strong }) {
  return <div style={{
    height: 1, background: OL.ink,
    opacity: strong ? 0.5 : 0.3,
    margin: gap ? `${gap}px 0` : 0,
  }}/>;
}

function SectionLabel({ children, right, size = 10 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '10px 0 8px' }}>
      <Caps size={size} ls={3}>{children}</Caps>
      {right && <Caps size={9} ls={2} opacity={0.55}>{right}</Caps>}
    </div>
  );
}

function ToneBadge({ tone = 'neutral', children }) {
  const bg = tone === 'critical' ? OL.accent : tone === 'good' ? OL.ink : 'transparent';
  const color = tone === 'neutral' ? OL.ink : '#fff';
  const border = tone === 'neutral' ? `1px solid ${OL.ink}` : 'none';
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px',
      background: bg, color, border,
      fontFamily: OL.sans, fontSize: 9, letterSpacing: 2, fontWeight: 700, textTransform: 'uppercase',
    }}>{children}</span>
  );
}

// ---------- shared masthead chrome ----------
// Top rail + masthead + nav strip. Used on every page so the whole app reads as one paper.
function NewspaperChrome({ section, issue = 412, date = 'Mon 13 Apr 2026', nav, activeNav, onNav, big = true, subtitle }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Caps size={10} ls={2} opacity={0.75}>Vol. III · Edition No. {issue}</Caps>
        <Caps size={10} ls={2} opacity={0.75}>Old Legs Daily — The Runner's Paper</Caps>
        <Caps size={10} ls={2} opacity={0.75}>{date}</Caps>
      </div>
      <Rule thick gap={10}/>
      <div style={{ textAlign: 'center', padding: big ? '6px 0 4px' : '2px 0' }}>
        <div style={{
          fontFamily: OL.display, fontWeight: 400,
          fontSize: big ? 88 : 56,
          letterSpacing: -1.5, lineHeight: 0.95, textTransform: 'uppercase',
        }}>Old Legs</div>
        {subtitle !== null && (
          <div style={{ marginTop: 6 }}>
            <Caps size={10} ls={6} opacity={0.75}>
              {subtitle || '· No Cheerleading Since 1976 · Jakarta Edition ·'}
            </Caps>
          </div>
        )}
      </div>
      <Rule thick gap={10}/>
      {nav && (
        <>
          <nav style={{ display: 'flex', justifyContent: 'center', gap: 28, padding: '10px 0 8px', flexWrap: 'wrap' }}>
            {nav.map(n => {
              const active = n.key === activeNav;
              return (
                <a key={n.key}
                  onClick={(e) => { e.preventDefault(); onNav && onNav(n.key); }}
                  href="#"
                  style={{
                    fontFamily: OL.sans, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase',
                    fontWeight: active ? 800 : 500,
                    color: OL.ink, textDecoration: 'none',
                    borderBottom: active ? `2px solid ${OL.accent}` : '2px solid transparent',
                    paddingBottom: 3,
                    opacity: active ? 1 : 0.7,
                    cursor: 'pointer',
                  }}>{n.label}</a>
              );
            })}
          </nav>
          <Hairline/>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', alignItems: 'baseline' }}>
            <Caps size={9} ls={3} opacity={0.55}>§ {section}</Caps>
            <Caps size={9} ls={2} opacity={0.55}>Coach on Duty · Pak Har</Caps>
          </div>
          <Hairline/>
        </>
      )}
    </>
  );
}

// ---------- paper frame (centered sheet on dark page) ----------
function Paper({ width = 980, children, style, screenLabel }) {
  return (
    <div data-screen-label={screenLabel} style={{
      width, background: OL.paper, color: OL.ink,
      padding: '28px 36px 40px', fontFamily: OL.body, fontSize: 13, lineHeight: 1.5,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ---------- paper footer rail ----------
function FooterRail({ left, center, right }) {
  return (
    <>
      <Rule thick gap={22}/>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <Caps size={9} ls={2} opacity={0.65}>{left}</Caps>
        <Caps size={9} ls={2} opacity={0.65}>{center}</Caps>
        <Caps size={9} ls={2} opacity={0.65}>{right}</Caps>
      </div>
    </>
  );
}

// ---------- mini horizontal bar (weekly mileage / zones) ----------
function MiniBar({ pct, width = '100%', accent, height = 10, dim = 0.08 }) {
  return (
    <span style={{
      display: 'inline-block', width, height,
      background: `rgba(20,18,16,${dim})`, border: `1px solid ${OL.ink}`,
      verticalAlign: 'middle',
    }}>
      <span style={{
        display: 'block', height: '100%',
        width: `${Math.max(0, Math.min(100, pct))}%`,
        background: accent ? OL.accent : OL.ink,
      }}/>
    </span>
  );
}

window.OL = OL;
window.Caps = Caps;
window.Rule = Rule;
window.Hairline = Hairline;
window.SectionLabel = SectionLabel;
window.ToneBadge = ToneBadge;
window.NewspaperChrome = NewspaperChrome;
window.Paper = Paper;
window.FooterRail = FooterRail;
window.MiniBar = MiniBar;
