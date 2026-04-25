"use client";

// READY FOR QA
// Component: NewspaperChrome + shared primitives (TASK-145)
// What was built: Design tokens (OL), primitive components (Caps, Rule, Hairline, SectionLabel,
//   MiniBar, Paper, FooterRail), and the NewspaperChrome top-rail/masthead/nav chrome used on
//   every authenticated page. ToneBadge is re-exported from its own file.
// Edge cases to test:
//   - NewspaperChrome with nav=undefined renders only top-rail + masthead (no nav strip or section row)
//   - subtitle=null hides subtitle line entirely; subtitle=undefined shows default text
//   - big=false renders 56px masthead height
//   - MiniBar clamps pct below 0 and above 100
//   - Rule thick renders 3px + gap + 1px; Rule thin renders single 1px bar
//   - Hairline strong=true renders opacity 0.5; default 0.3
//   - FooterRail renders thick Rule above + three Caps columns

import React from 'react';

// ---------- design tokens ----------

export const OL = {
  paper: '#f4efe4',
  ink: '#141210',
  accent: '#8a2a12',
  muted: 'rgba(20,18,16,0.55)',
  hair: 'rgba(20,18,16,0.3)',
  display: '"Abril Fatface", "Playfair Display", Didot, serif',
  body: '"Lora", Georgia, serif',
  sans: '"Work Sans", "Inter", sans-serif',
  mono: '"Space Mono", "JetBrains Mono", monospace',
} as const;

// ---------- primitive: Caps ----------

interface CapsProps {
  children: React.ReactNode;
  size?: number;
  ls?: number;
  weight?: number;
  opacity?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function Caps({
  children,
  size = 10,
  ls = 2,
  weight = 600,
  opacity = 0.7,
  style,
  className,
}: CapsProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: OL.sans,
        fontSize: size,
        letterSpacing: ls,
        fontWeight: weight,
        textTransform: 'uppercase',
        opacity,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ---------- primitive: Rule ----------

interface RuleProps {
  thick?: boolean;
  gap?: number;
}

export function Rule({ thick, gap = 0 }: RuleProps) {
  if (thick) {
    return (
      <div style={{ margin: gap ? `${gap}px 0` : 0 }}>
        <div style={{ height: 3, background: OL.ink }} />
        <div style={{ height: 1, background: OL.ink, marginTop: 3 }} />
      </div>
    );
  }
  return (
    <div
      style={{
        height: 1,
        background: OL.ink,
        margin: gap ? `${gap}px 0` : 0,
      }}
    />
  );
}

// ---------- primitive: Hairline ----------

interface HairlineProps {
  gap?: number;
  strong?: boolean;
}

export function Hairline({ gap = 0, strong }: HairlineProps) {
  return (
    <div
      style={{
        height: 1,
        background: OL.ink,
        opacity: strong ? 0.5 : 0.3,
        margin: gap ? `${gap}px 0` : 0,
      }}
    />
  );
}

// ---------- primitive: SectionLabel ----------

interface SectionLabelProps {
  children: React.ReactNode;
  right?: string;
  size?: number;
}

export function SectionLabel({ children, right, size = 10 }: SectionLabelProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        margin: '10px 0 8px',
      }}
    >
      <Caps size={size} ls={3}>
        {children}
      </Caps>
      {right && (
        <Caps size={9} ls={2} opacity={0.55}>
          {right}
        </Caps>
      )}
    </div>
  );
}

// ---------- primitive: MiniBar ----------

interface MiniBarProps {
  pct: number;
  accent?: boolean;
  height?: number;
  dim?: number;
}

export function MiniBar({ pct, accent, height = 10, dim = 0.08 }: MiniBarProps) {
  const clampedPct = Math.max(0, Math.min(100, pct));
  return (
    <span
      style={{
        display: 'inline-block',
        width: '100%',
        height,
        background: `rgba(20,18,16,${dim})`,
        border: `1px solid ${OL.ink}`,
        verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          width: `${clampedPct}%`,
          background: accent ? OL.accent : OL.ink,
        }}
      />
    </span>
  );
}

// ---------- primitive: Paper ----------

interface PaperProps {
  children: React.ReactNode;
  width?: number;
  style?: React.CSSProperties;
  screenLabel?: string;
}

export function Paper({ children, width = 980, style, screenLabel }: PaperProps) {
  return (
    <div
      style={{
        background: OL.paper,
        minHeight: '100vh',
      }}
    >
      <div
        data-screen-label={screenLabel}
        style={{
          maxWidth: width,
          margin: '0 auto',
          color: OL.ink,
          padding: '28px 36px 40px',
          fontFamily: OL.body,
          fontSize: 13,
          lineHeight: 1.5,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------- primitive: FooterRail ----------

interface FooterRailProps {
  left: string;
  center: string;
  right: string;
}

export function FooterRail({ left, center, right }: FooterRailProps) {
  return (
    <>
      <Rule thick gap={22} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <Caps size={9} ls={2} opacity={0.65}>
          {left}
        </Caps>
        <Caps size={9} ls={2} opacity={0.65}>
          {center}
        </Caps>
        <Caps size={9} ls={2} opacity={0.65}>
          {right}
        </Caps>
      </div>
    </>
  );
}

// ---------- ToneBadge re-export ----------

export { ToneBadge } from './ToneBadge';

// ---------- NewspaperChrome ----------

interface NavItem {
  key: string;
  label: string;
}

interface NewspaperChromeProps {
  section: string;
  issue?: number;
  date?: string;
  nav?: NavItem[];
  activeNav?: string;
  onNav?: (key: string) => void;
  big?: boolean;
  subtitle?: string | null;
}

export function NewspaperChrome({
  section,
  issue = 412,
  date = 'Mon 13 Apr 2026',
  nav,
  activeNav,
  onNav,
  big = true,
  subtitle,
}: NewspaperChromeProps) {
  return (
    <>
      {/* Top rail */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <Caps size={10} ls={2} opacity={0.75}>
          Vol. III · Edition No. {issue}
        </Caps>
        <Caps size={10} ls={2} opacity={0.75}>
          Old Legs Daily — The Runner&apos;s Paper
        </Caps>
        <Caps size={10} ls={2} opacity={0.75}>
          {date}
        </Caps>
      </div>

      <Rule thick gap={10} />

      {/* Masthead */}
      <div
        style={{
          textAlign: 'center',
          padding: big ? '6px 0 4px' : '2px 0',
        }}
      >
        <div
          style={{
            fontFamily: OL.display,
            fontWeight: 400,
            fontSize: big ? 88 : 56,
            letterSpacing: -1.5,
            lineHeight: 0.95,
            textTransform: 'uppercase',
          }}
        >
          Old Legs
        </div>
        {subtitle !== null && (
          <div style={{ marginTop: 6 }}>
            <Caps size={10} ls={6} opacity={0.75}>
              {subtitle !== undefined
                ? subtitle
                : '· No Cheerleading Since 1976 · Jakarta Edition ·'}
            </Caps>
          </div>
        )}
      </div>

      <Rule thick gap={10} />

      {/* Nav strip + section row — only rendered when nav is provided */}
      {nav && (
        <>
          <nav
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 28,
              padding: '10px 0 8px',
              flexWrap: 'wrap',
            }}
          >
            {nav.map((n) => {
              const active = n.key === activeNav;
              return (
                <a
                  key={n.key}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onNav && onNav(n.key);
                  }}
                  style={{
                    fontFamily: OL.sans,
                    fontSize: 11,
                    letterSpacing: 3,
                    textTransform: 'uppercase',
                    fontWeight: active ? 800 : 500,
                    color: OL.ink,
                    textDecoration: 'none',
                    borderBottom: active
                      ? `2px solid ${OL.accent}`
                      : '2px solid transparent',
                    paddingBottom: 3,
                    opacity: active ? 1 : 0.7,
                    cursor: 'pointer',
                  }}
                >
                  {n.label}
                </a>
              );
            })}
          </nav>

          <Hairline />

          {/* Section row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0',
              alignItems: 'baseline',
            }}
          >
            <Caps size={9} ls={3} opacity={0.55}>
              § {section}
            </Caps>
            <Caps size={9} ls={2} opacity={0.55}>
              Coach on Duty · Pak Har
            </Caps>
          </div>

          <Hairline />
        </>
      )}
    </>
  );
}
