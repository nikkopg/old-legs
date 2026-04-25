// Landing page — simple. Pre-auth.
// Just: masthead, tagline, connect button. About-the-editor is moved post-login.

function LandingPage({ onConnect, connectingState = 'idle' /* idle | connecting | error */ }) {
  return (
    <div data-screen-label="01 Landing" style={{
      width: 760, background: OL.paper, color: OL.ink,
      padding: '60px 48px 48px', fontFamily: OL.body,
      minHeight: 620, display: 'flex', flexDirection: 'column',
    }}>
      {/* Top rail */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Caps size={10} ls={2} opacity={0.75}>Vol. I · Issue No. 1</Caps>
        <Caps size={10} ls={2} opacity={0.75}>The Runner's Paper</Caps>
        <Caps size={10} ls={2} opacity={0.75}>Jakarta Edition</Caps>
      </div>
      <Rule thick gap={12}/>

      {/* Centered content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 0' }}>
        {/* Masthead */}
        <div style={{
          fontFamily: OL.display, fontWeight: 400,
          fontSize: 108, letterSpacing: -2, lineHeight: 0.9, textTransform: 'uppercase',
        }}>
          Old Legs
        </div>

        {/* Tagline */}
        <p style={{
          fontFamily: OL.sans, fontSize: 13, fontWeight: 500,
          letterSpacing: 4, textTransform: 'uppercase',
          lineHeight: 1.8, margin: '28px 0 0',
          maxWidth: 540,
        }}>
          He's 70. He's already lapped you.<br/>
          <span style={{ color: OL.accent }}>And he has thoughts.</span>
        </p>

        {/* Connect button */}
        <div style={{ marginTop: 40, minWidth: 300 }}>
          {connectingState === 'idle' && (
            <button onClick={onConnect} style={{
              background: OL.accent, color: '#fff', border: 'none',
              padding: '16px 40px', fontFamily: OL.sans, fontSize: 12, letterSpacing: 3, fontWeight: 700,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Connect Strava →
            </button>
          )}
          {connectingState === 'connecting' && (
            <div style={{
              border: `1px solid ${OL.ink}`, padding: '14px 28px', display: 'inline-block',
              fontFamily: OL.mono, fontSize: 12, letterSpacing: 2,
            }}>
              Opening Strava<span className="ol-cursor">_</span>
            </div>
          )}
          {connectingState === 'error' && (
            <div style={{ maxWidth: 360, margin: '0 auto' }}>
              <div style={{ border: `1px solid ${OL.accent}`, padding: '10px 14px', background: 'rgba(138,42,18,0.06)', textAlign: 'left' }}>
                <Caps size={9} ls={2} style={{ color: OL.accent, fontWeight: 800 }} opacity={1}>Errata</Caps>
                <div style={{ fontFamily: OL.body, fontSize: 13, lineHeight: 1.4, marginTop: 4 }}>
                  Strava did not answer. Try once more.
                </div>
              </div>
              <button onClick={onConnect} style={{
                marginTop: 10, background: OL.ink, color: '#fff', border: 'none',
                padding: '14px 36px', fontFamily: OL.sans, fontSize: 11, letterSpacing: 3, fontWeight: 700,
                textTransform: 'uppercase', cursor: 'pointer',
              }}>
                Retry →
              </button>
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Caps size={9} ls={2} opacity={0.55}>Read-only access · Free · 1 minute</Caps>
          </div>
        </div>
      </div>

      {/* Bottom rail */}
      <Rule thick gap={0}/>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
        <Caps size={9} ls={2} opacity={0.6}>Printed at Senayan · Jakarta</Caps>
        <Caps size={9} ls={2} opacity={0.6}>— filed daily, rain or otherwise —</Caps>
      </div>
    </div>
  );
}

window.LandingPage = LandingPage;
