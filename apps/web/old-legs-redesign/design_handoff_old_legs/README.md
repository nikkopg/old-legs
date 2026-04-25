# Old Legs — Design Handoff

A tabloid-newspaper aesthetic for the Old Legs running coach app, built around Pak Har's unsparing voice. Seven screens are designed in this bundle:

1. **Landing** (`/`) — minimal pre-auth: masthead, tagline, Connect Strava
2. **Dashboard** (`/dashboard`) — broadsheet front page: weekly hero, today sidebar, last-run below the fold, op-ed insights column
3. **Activities — Front Page** (`/activities`) — tabloid front page listing all runs with a lead story and previous editions
4. **Dispatch — Activity detail** (`/activities/[id]`) — broadsheet post-run analysis: masthead, headline verdict, stats strip, pace chart, Pak Har prose, splits, HR zones, weekly rail
5. **Plan** (`/plan`) — weekly fixtures table, league-table style, today highlighted
6. **Coach chat** (`/coach`) — wire-service teletype: monospace, timestamped, streaming
7. **Settings — The Desk** (`/settings`) — subscriber controls + voice toggle + cancellation
8. *(Plus state screens)*: Pak Har thinking (loading), Errata (offline / API down / Ollama down / Strava down), Connect Strava idle / connecting / error

The design locks in the **Tabloid font pairing** (Abril Fatface / Lora / Work Sans / Space Mono) after exploring six alternatives. Pak Har is the only coach in v1.

---

## About the design files

The HTML files in this bundle are **design references** built with inline React + Babel. They are not production code to copy directly. The job is to recreate them in the existing **Next.js 16 / Tailwind v4** codebase under `apps/web/`, using the project's established patterns (`@/components/ui` primitives, `@/lib/formatters`, the existing route structure under `/activities`, `/dashboard`, `/plan`, `/coach`).

## Fidelity

**High-fidelity.** Exact colors, typography, spacing, and copy tone are final. Layouts are pixel-precise at the widths given. The developer should match these one-to-one using Tailwind utilities and CSS variables.

## Files

| File | What it is |
|---|---|
| **`Old Legs - More Pages.html`** | **Main prototype.** Landing + Dashboard + Plan + Coach + Settings + state screens. Use the Tweaks panel (bottom right) to switch pages. **Start here.** |
| `Old Legs - Front Page.html` | Activities list (Front Page) with click-through to Dispatch. |
| `Old Legs - Post-Run Analysis.html` | Early exploration — 3 directions (Receipt, Broadsheet, Dossier). For reference only. |
| `Old Legs - Broadsheet Font Pairings.html` | 6 font pairings on the broadsheet. Shows why Tabloid was chosen. |
| `components/newspaper-chrome.jsx` | **Shared primitives.** Tokens (`OL`), `<NewspaperChrome>`, `<Paper>`, `<Caps>`, `<Rule>`, `<Hairline>`, `<SectionLabel>`, `<ToneBadge>`, `<MiniBar>`, `<FooterRail>`. **Read this first.** |
| `components/page-landing.jsx` | Landing page. |
| `components/page-dashboard.jsx` | Dashboard page (broadsheet). |
| `components/page-plan.jsx` | Plan page (fixtures table). |
| `components/page-coach.jsx` | Coach chat (teletype). Includes streaming logic. |
| `components/page-extras.jsx` | Thinking, Offline, Settings. |
| `components/activities-frontpage.jsx` | Activities list (tabloid front page). |
| `components/direction-news.jsx` | Dispatch (post-run detail). `pairingKey="tabloid"` is the shipped variant. |
| `components/activity-feed.jsx` | Fake activity feed data — shape matches `@/types/api` `Activity`. |
| `components/run-data.jsx` | Fake detail-run data + Pak Har verdict copy. |

---

## Design tokens

### Color

| Token | Hex | Usage |
|---|---|---|
| `paper` | `#f4efe4` | Page background (all paper surfaces) |
| `ink` | `#141210` | Primary text, rule lines, bar fills, hard borders |
| `accent` | `#8a2a12` | Iron-oxide red. **Used sparingly**: tone-critical badges, ego-surge annotations, Z4/Z5 HR bars, current-week rail, "read on →" hotspots, today-highlighted plan row, errata callouts |
| `muted` | `rgba(20,18,16,0.55)` | Secondary metadata, italic asides |
| `hairline` | `rgba(20,18,16,0.3)` | Thin column rules, dotted dividers |
| `data-fill-bg` | `rgba(20,18,16,0.08)` | Unfilled portion of mini bar charts |
| `dark-frame` | `#1a1612` | Page frame outside the paper |

The orange `#e06c2a` in the existing `globals.css` is **retired** for these screens — it reads generic fitness-app. Replace with `#8a2a12`.

### Typography

Pairing: **Tabloid**. Load from Google Fonts:

- `Abril Fatface` (display — masthead + all headlines)
- `Lora` (body serif — paragraph prose, at-a-glance copy)
- `Work Sans` 400/500/600/700/800 (sans — all-caps labels, badges, bylines, metadata, nav)
- `Space Mono` 400/700 (mono — numbers everywhere; teletype transcript)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Lora:ital,wght@0,400;0,700;1,400;1,700&family=Work+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

Tailwind v4 theme:

```css
@theme inline {
  --color-paper: #f4efe4;
  --color-ink: #141210;
  --color-accent: #8a2a12;
  --color-muted: rgba(20,18,16,0.55);
  --color-hairline: rgba(20,18,16,0.3);
  --color-frame: #1a1612;
  --font-display: "Abril Fatface", "Playfair Display", Didot, serif;
  --font-body: "Lora", Georgia, serif;
  --font-sans: "Work Sans", "Inter", sans-serif;
  --font-mono: "Space Mono", "JetBrains Mono", monospace;
}
```

### Type scale

| Purpose | Family | Size | Weight | Tracking | Case |
|---|---|---|---|---|---|
| Landing masthead | display | 108 | 400 | -2 | uppercase |
| Page masthead (chrome) | display | 88 / 56 | 400 | -1.5 | uppercase |
| Lead headline (verdict) | display | 64 | 400 | -1 | uppercase |
| Broadsheet/dashboard h1 | display | 56–60 | 400 | -0.6 to -0.8 | sentence |
| Section headline (h2) | display | 34–38 | 400 | -0.4 | sentence (italic for op-ed) |
| Prev-edition headline | display | 28 | 400 | -0.4 | **sentence** (not uppercase) |
| Big stat number | mono | 26–28 | 700 | — | — |
| Medium stat number | mono | 20–22 | 700 | — | — |
| Body prose | body | 13–14 | 400 | — | sentence |
| At-a-glance / sidebar copy | body | 12–12.5 | 400 | — | sentence |
| Section labels | sans | 10 | 600–700 | 3 | uppercase |
| Metadata / bylines | sans | 9–10 | 500–700 | 2 | uppercase |
| Tone badge text | sans | 9 | 700 | 2 | uppercase |
| Teletype text | mono | 13 | 400 | — | sentence |
| Teletype timestamp/header | mono | 11 | 700 | 1–3 | mixed |

Mono uses `font-variant-numeric: tabular-nums`.

### Spacing & structure

- Page frame: `#1a1612` background, 40px top/bottom, 20px sides, flex-justify center, align-start
- Paper widths:
  - Landing: **760px**, padding `60px 48px 48px`
  - Dashboard: **980px**, padding `28px 36px 40px`
  - Activities Front Page: **980px**
  - Dispatch: **760px**, padding `28px 36px 48px`
  - Plan: **980px**
  - Coach: **760px** (narrow, telex-roll feel)
  - Settings: **980px**
  - Thinking / Offline: **760px**
- Column gap between paper content and sidebar: 28px
- Rules: **1px** hairline, **3px** thick. Double-rule = 3px + (3px gap) + 1px
- Border radius: **0** everywhere
- Drop shadows: **none**
- Bordered callouts: `1px solid ink` (default) or `3px solid ink` (scoreboard/today/subscription)

---

## Shared chrome — `<NewspaperChrome>`

Used on every page after Landing. Renders top rail + masthead + (optional) navigation strip + section indicator. Props:

```ts
{
  section: string;                 // e.g. "Front Page · Weekly Edition"
  issue?: number;                  // edition number, default 412
  date?: string;                   // default "Mon 13 Apr 2026"
  big?: boolean;                   // big masthead (88px) vs small (56px)
  subtitle?: string | null;        // pass null to hide subtitle line
  nav?: { key: string; label: string }[] | null;
  activeNav?: string;
  onNav?: (key: string) => void;
}
```

Standard nav array:

```js
[
  { key: 'dashboard',  label: 'Front Page' },
  { key: 'activities', label: 'Dispatches' },
  { key: 'plan',       label: 'Plan' },
  { key: 'coach',      label: 'Letters' },
  { key: 'settings',   label: 'Desk' },
]
```

The labels (Front Page / Dispatches / Plan / Letters / Desk) are the **paper voice** — keep them, do not switch to literal route names.

Active nav item: weight 800, opacity 1, accent-colored 2px bottom border. Inactive: weight 500, opacity 0.7, transparent border. Underline on hover.

Below the nav: a hairline, then a 6px-padded section-indicator row showing `§ {section}` on the left and `Coach on Duty · Pak Har` on the right (both Work Sans 9 caps opacity 0.55), then another hairline.

---

## Tone Badge component

Props: `tone: 'critical' | 'good' | 'neutral'`, children.

- Padding: `3px 8px`
- Work Sans 9px, letter-spacing 2, weight 700, uppercase
- `critical`: bg `#8a2a12`, text `#fff`, no border
- `good`: bg `#141210`, text `#fff`, no border
- `neutral`: transparent bg, `1px solid #141210`, text ink

Used labels include: `PACED POORLY`, `HELD THE LINE`, `ON PLAN`, `FUELING`, `RESTRAINED`, `FADED LATE`, `STEADY`, `NO SHOW`, plus plan-row types `EASY`, `TEMPO`, `LONG`, `STRIDES`, `REST`.

---

## Screen 1 — Landing (`/`)

**Purpose:** First impression before the user connects Strava. **Minimal.** No bio, no sales copy, no inside-this-edition list.

### Layout

760px paper, `padding: 60px 48px 48px`, `min-height: 620`, flex-column.

1. **Top rail** — 3-column flex-between, all Work Sans 10 caps opacity 0.75:
   - Left: `Vol. I · Issue No. 1`
   - Center: `The Runner's Paper`
   - Right: `Jakarta Edition`
2. Thick rule (3px ink + 3px gap + 1px ink)
3. **Centered content** (flex 1, justify-center, padding 40px 0):
   - Masthead `Old Legs` — Abril 108px, weight 400, letter-spacing -2, line-height 0.9, uppercase
   - 28px gap
   - **Tagline** — Work Sans 13px, weight 500, letter-spacing 4, uppercase, line-height 1.8, max-width 540, two lines:
     - `He's 70. He's already lapped you.`
     - `And he has thoughts.` ← **accent color**
   - 40px gap
   - **Connect Strava button** (idle state):
     - Background `#8a2a12`, text white, no border
     - Padding `16px 40px`
     - Work Sans 12px, letter-spacing 3, weight 700, uppercase
     - Label: `Connect Strava →`
   - 14px gap
   - Helper line: `Read-only access · Free · 1 minute` (Work Sans 9 caps opacity 0.55)
4. Thick rule
5. **Bottom rail** — 2-column flex-between Work Sans 9 caps opacity 0.6:
   - Left: `Printed at Senayan · Jakarta`
   - Right: `— filed daily, rain or otherwise —`

### Connect-Strava states

Implemented as a single component prop `connectingState: 'idle' | 'connecting' | 'error'`.

- **idle** — accent button described above
- **connecting** — replace button with `1px solid ink` chip, padding `14px 28px`, Space Mono 12 letter-spacing 2, text `Opening Strava` followed by a blinking cursor (`_` underscore, `1s steps(2) infinite` blink)
- **error** — show errata box: `1px solid accent`, padding `10px 14px`, bg `rgba(138,42,18,0.06)`. Header `Errata` (Work Sans 9 caps weight 800 accent), body `Strava did not answer. Try once more.` (Lora 13). Below it: a black `Retry →` button (bg ink, text white, Work Sans 11 letter-spacing 3 weight 700)

---

## Screen 2 — Dashboard (`/dashboard`)

**Purpose:** Weekly hub — the home page after login. Reads as a broadsheet front page with multiple articles.

**Width:** 980px. Big masthead. Standard nav with `dashboard` active.

### Above the fold — 2-column grid `1.55fr / 1fr`, gap 28

#### Left — Lead article

- Section label `Today's Lead · Week of {range}`
- **h1** — Abril 60, sentence case: e.g. `Three runs in and the week is already thin.`
- Body Lora 14, max-width 560, with bold key numbers inline
- **Scoreboard strip** (`3px solid ink`, padding `14px 18px`, bg `rgba(20,18,16,0.02)`) — 4-column grid:
  - This Week (km of target) / Runs (of planned) / Time on Feet / Week Completion (%)
  - Per cell: Work Sans 8 caps label · Space Mono 26px 700 value · Work Sans 8 caps subtitle
- **Progress to Target** bar (full-width, 14px tall, accent fill, ink border)

#### Right — Sidebar (left border 1px ink, padding-left 20)

- **On the Schedule Today** card (`3px solid ink`, padding `12px 14px`, bg `rgba(138,42,18,0.04)`)
  - Header row: date + critical-tone session-type badge (e.g. `EASY`)
  - Big copy: Abril 34 uppercase, e.g. `40 minutes, under 148 bpm.`
  - Body Lora 13: full description
  - Footer row: `See the full week →` link (accent, underline) + `Filed 05:14`
- **The Standings** — Weekly Mileage, 4 rows (This / W-1 / W-2 / W-3), grid `44 / 1fr / 56`. Current week: bold label, accent bar fill.
- **Notices** — 3 short paragraphs (Lora 12.5):
  - `Strava: synced 4 min ago.`
  - `Pak Har has not filed on Saturday's run yet. Request dispatch →` (accent CTA)
  - Italic muted: `"Besok pagi, lari lagi ya."`

### Below the fold — Last Run

Section: thick rule, `Below the Fold · Last Run` (right hint: `tap to read the dispatch →`), hairline.

Article (clickable, navigates to `/activities/{id}`): 3-column grid `90 / 1fr / 260`, gap 20.

- **Date block** (90px): DOW caps · Abril 54 day · MON caps
- **Body** (1fr):
  - Tone badge + metadata caps line
  - h2 Abril 34 sentence: Pak Har one-liner verdict
  - Lora 13.5 snippet with **drop cap** (Abril 32, line-height 0.9, padding-right 5, padding-top 2). Trailing `Read on →` accent hotspot.
  - Footer caps: `by Pak Har · filed Sun 12 Apr · 07:48`
- **Box Score** (right, `1px solid ink`, padding `10px 14px`): 2×2 grid of DIST/TIME/PACE/AVG HR — Work Sans 7 caps label + Space Mono 15 700 value

### Op-Ed — The Arc (6-week column)

Section: thick rule, `Opinion · The Arc` (right hint: `columnist · weekly`), hairline.

2-column grid `1.15fr / 1fr`, gap 28.

#### Left — column

- Caps byline: `by Pak Har — 6-Week Column`
- h2 Abril 36 italic sentence: e.g. `The curve is real. So is the drop.`
- 2 paragraphs justified Lora 13.5
- **Pull quote** between top + bottom 2px accent borders, Abril 22 italic accent, centered: e.g. `"You are getting tired before you are getting fit."`
- Right-aligned sign-off caps

#### Right — Supporting Figures

`1px solid ink` card. Inside:

- Caps label `Weekly Kilometres · 6 weeks`
- **SVG bar chart** 340×90:
  - Baseline at y=70, ink 0.5 stroke 0.4 opacity
  - 6 bars width 40, x-step 55, height `(km/40)*60`. Bar 5 (current week) is accent; the rest are ink. Bar 6 is the planned week — height 0, label "Plan", value `—`.
  - Label below each bar (Work Sans 9 caps opacity 0.7): `W-5 W-4 W-3 W-2 This Plan`
  - Value above each bar (Space Mono 9 ink, kilometre count or `—`)
- 2-column footer with **Avg HR · 6w** and **Load · vs peak** stats (Space Mono 22 700; load number is accent)
- Below the card, a CTA: `Write to the editor →` (accent caps link)

### Footer rail

`Filed at Senayan · Jakarta` / `Page 1 · Front` / `— continued page 2: Plan for the week —`

### Data integration

Existing dashboard endpoints already deliver weekly stats, today's plan, last run, weekly review (op-ed), and 6-week insights. The mock layout maps 1:1 onto those payloads. The op-ed prose comes from the existing `WeeklyReviewCard` LLM call — render the body as 2 paragraphs and pick a single sentence as the pull quote (or have the LLM emit a `pull_quote` field).

---

## Screen 3 — Activities Front Page (`/activities`)

*(Already documented in detail in the Files note above; see `Old Legs - Front Page.html` and `components/activities-frontpage.jsx`.)*

**Width:** 980px. Tabloid front page with a giant lead story (today's run) above the fold and previous editions below — each row a 3-column grid `76 / 1fr / 260` with date gutter, sentence-case Abril 28 headline, and right-aligned mono stats. Sidebar = Standings + Notices + Coach on Duty.

**Important previously-corrected detail:** previous-edition headlines are **sentence case** (not uppercase). Only the lead story headline is uppercase.

Click any row → `/activities/{id}`.

---

## Screen 4 — Dispatch (`/activities/[id]`)

*(Already documented in detail; see `Old Legs - Post-Run Analysis.html` and `components/direction-news.jsx` with `pairingKey="tabloid"`.)*

**Width:** 760px. Broadsheet detail with masthead, headline + at-a-glance, stats strip, pace chart, drop-capped prose with pull-quote, splits table, HR zones, weekly rail. Read-only.

---

## Screen 5 — Plan (`/plan`)

**Purpose:** This week's training fixtures, league-table style.

**Width:** 980px. Small masthead. Standard nav with `plan` active.

### Layout

1. **Header row** — 2-column grid `1fr / 260`, align-end
   - **Left:** caps `The Fixtures · Week 15`, h1 Abril 56 sentence (`Seven days. Five runs. / One rest. No debates.`), Lora 13.5 deck max-width 560
   - **Right:** Week At A Glance box (`3px solid ink`, padding `12px 14px`, bg `rgba(20,18,16,0.02)`) with 2×2 grid: Runs / Rest / Km / Minutes (Space Mono 22 700)

2. **Fixtures table** — thick rule on top.

   **Header row** (`8px 4px` padding, 1px ink bottom border): grid `44 / 92 / 1fr / 130 / 80 / 80 / 2.2fr / 20`, gap 14. Columns: `Day / Date / Session / Target / Duration / Distance / Instructions / →`. All headers Work Sans 9 caps opacity 0.7.

   **7 day rows** (Mon–Sun):
   - Same 8-column grid, padding `14px 4px`, dotted hairline bottom (last row: 3px ink)
   - **Today row:** bg `rgba(138,42,18,0.04)`, 3px accent left border (replace transparent border on others), 8px left padding instead of 4
   - **Rest rows:** opacity 0.55
   - Day cell: Abril 28 day label + caps "Today" (accent) underneath if applicable
   - Date: Space Mono 13
   - Session: Tone badge (Easy/Strides → good · Tempo/Long → critical · Rest → neutral). Tempo and Long rows include an italic Lora 11 muted descriptor: `The week's sharp edge.` / `The honest one.`
   - Target: Space Mono 12 (e.g. `HR <148`, `HR 165–172`)
   - Duration: Space Mono 13 700
   - Distance: Space Mono 13
   - Instructions: Lora 12.5 (full sentences in voice)
   - `→` cell: Abril 18 ink (transparent for rest days), cursor pointer

3. **Totals row** — same grid, bg `#141210`, color `#f4efe4`, padding `10px 4px`, marginTop `-1`. Cells: empty / empty / `Totals` (caps Paper 9 letter-spacing 3 weight 800) / empty / `{totalMin} min` / `{totalKm} km` / `5 runs · 2 rest · peak Saturday` (caps Paper 9 opacity 0.8) / empty.

4. **Editor's Note + Key** — 2-column grid `1.3fr / 1fr`, gap 28
   - Left: caps `Editor's Note` + hairline + drop-capped Lora 13.5 paragraph (justified) + sign-off `— Pak Har · Plan filed Mon 13 Apr · 05:14`
   - Right: caps `Key` + hairline + 5-row grid `80 / 1fr` of `<ToneBadge>` + Lora 12 description; below it, caps `Corrections` + a `Write the editor →` accent link

5. **Footer rail** — `Fixtures · filed Monday 05:14` / `Page 2 · Plan` / `— continued page 3: Letters to the Editor —`

### Data integration

Maps to the existing weekly plan endpoint (returns 7 day-objects). Add a `descriptor` optional field for Tempo/Long rows if you want server-driven tag lines.

---

## Screen 6 — Coach chat (`/coach`)

**Purpose:** Real-time chat with Pak Har, framed as a teletype wire to the editor.

**Width:** 760px (narrow on purpose — telex roll). Small masthead. Standard nav with `coach` active.

### Layout

1. **Heading strip:** caps `Teletype · Direct to the Editor`, hairline.
2. **Wire status bar** (`1px solid ink`, padding `10px 14px`, bg `rgba(20,18,16,0.02)`, flex-between):
   - Left: caps `Wire: OLD-LEGS / PAK-HAR`
   - Center: caps status `● OPEN` (when idle) or `● ON THE LINE` (when streaming, accent + weight 800)
   - Right: caps `Jakarta · GMT+7`
3. **Transcript** (scrollable, 380–420px tall, `1px solid ink` no top border, padding `18px 20px 14px`, bg paper).
   - 1px dashed hairline gutter on the very left (6px from edge, top 12, bottom 12)
   - One **TeletypeLine** per message (see component below)
4. **Composer** (`1px solid ink` no top border, padding `12px 14px`, grid `72 / 1fr / 100`, gap 10):
   - Left: caps `Sender` + `YOU` (Space Mono 13 700)
   - Center: textarea, dashed-ink border, transparent bg, Space Mono 13, 2 rows, no resize. Enter sends; Shift+Enter inserts newline.
   - Right: **Punch / Send ↵** button. When enabled (text present, not streaming): bg accent, white text. Disabled: transparent, opacity 0.5, ink border.
5. **Below:** 2-column grid `1.2fr / 1fr`, gap 28
   - Left: caps `Wire Desk Notes` + 2 short Lora 12.5 paragraphs explaining the metaphor
   - Right: caps `Useful Signals` + 4-row hint table (Space Mono 11 keyword / Lora 12 muted description): `TRAIN?`, `PACE?`, `REST?`, `RACE?`
6. **Footer rail:** `Wire Desk · Senayan` / `Page 3 · Letters` / `— replies go out on the hour —`

### `<TeletypeLine>` component

Renders one message with a hard left bar (3px), a header row, and the message body.

- Container: `marginBottom: 14`, `paddingLeft: 14`, position relative
- **Left bar:** absolute, left 0, top 4 bottom 4, width 3
  - User: ink
  - Assistant: accent
- **Header row** (flex baseline, gap 10):
  - Timestamp (Space Mono 11 letter-spacing 1 weight 700) — e.g. `06:48:02`
  - `FROM: YOU` or `FROM: PAK` (Space Mono 11 letter-spacing 3 opacity 0.7)
  - Spacer with bottom dotted hairline (translate-y -4)
  - Right tag (Space Mono 10 letter-spacing 2 opacity 0.55) — `SUBSCRIBER` or `EDITOR`
- **Message body** (Space Mono 13, line-height 1.6, marginTop 4, color ink for assistant / muted for user):
  - Prefix `> ` at opacity 0.5
  - Text (preserves `\n`, breaks long words)
  - If currently streaming: trailing blinking cursor `_` (CSS class `.ol-cursor`)

### Streaming behavior

- On send: append a user message with current `HH:MM:SS`, clear draft, set `streaming=true`
- Append an empty assistant message stamped 2s in the future
- Word-by-word fill at ~80ms per word until reply complete, then `streaming=false`
- Auto-scroll transcript to bottom on every update
- The mock canned-replies a one-liner — production wires to the existing `/coach` SSE stream and replaces the canned `pickReply()` logic

### CSS — blinking cursor

```css
.ol-cursor { display: inline-block; width: 8px; margin-left: 2px;
  animation: olblink 1s steps(2, end) infinite; }
@keyframes olblink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
```

### Data integration

The existing `/coach` SSE endpoint already streams tokens. Map:

- Each `delta` → append to last assistant message's text
- Each `done` → set `streaming=false`, finalize timestamp
- The thinking/typing indicator (`On the Line`) is driven by `streaming` boolean — no extra endpoint needed

---

## Screen 7 — Settings · The Desk (`/settings`)

**Purpose:** Subscriber controls — voice toggle, delivery preferences, account info, cancel/disconnect.

**Width:** 980px. Small masthead. Standard nav with `settings` active.

### Layout

1. **Heading:** caps `Subscriber Account` · h1 Abril 52 `The Desk.` · Lora 13.5 deck
2. **2-column grid `1fr / 280`, gap 28** below a thick rule

#### Main column — 4 sections, each separated by 1px ink

**Subscriber Record** (read-only): 3-column grid of label/value pairs (Work Sans 8 caps label / Space Mono 13 value), each cell with a 1px hairline left border and 10px padding. Values: Name, Subscribed (month), Editions received, Strava athlete (ID), Timezone, Preferred unit.

**Editor's Voice** — 3-column grid of voice cards, each a 1px (or 3px when active) ink-bordered box, padding `10px 12px`:

- `Gentle` — `Mentor. Still honest. Less bite.`
- `Standard` — `The default. What you signed up for.` ← default ON
- `Unfiltered` — `No softening. Ask for it.`

Active card: 3px border, bg `rgba(20,18,16,0.03)`, header includes `✓ On` (accent caps weight 800).

**Delivery Preferences** — 4 toggle rows (text + custom 44×20 toggle):

- Dispatch after every run · ON
- Weekly plan on Monday 05:00 · ON
- Weekly review on Sunday 20:00 · ON
- Missed-run nudge (gentle) · OFF

Toggle: `1px solid ink`, padding 2. Inner 14×14 swatch, ink-on-paper when off, paper-on-ink when on, margin-left 0 → 22 with a 0.15s transition.

**Cancel the Subscription** — danger zone. Lora 13 explanatory paragraph + button: transparent bg, accent border + accent text, padding `10px 20px`, Work Sans 11 letter-spacing 3 weight 700, label `Cancel Subscription →`. Confirms via a modal in production.

#### Sidebar (280px, left border 1px ink, padding-left 20)

- **The Paper in Numbers** — 4 stat rows (between dotted hairlines), each `Space Mono 22 700` value with a Work Sans 9 caps label on the right: editions received, dispatches filed, weekly plans, letters exchanged
- **Colophon** — short Lora 12 muted paragraph crediting the typefaces, the editor, the city

### Footer rail

`The Desk · Senayan` / `Page 4 · Controls` / `— back to the Front Page —`

### Data integration

Read-only fields populate from the existing user record. Voice toggle persists to user prefs and is read by the LLM prompt builder (extra-soft / standard / extra-direct system-prompt tuning). Delivery prefs gate background jobs (weekly review email, etc.). Cancel disconnects Strava OAuth and deletes the user row.

---

## State screens

### Loading — `<ThinkingPage context="dispatch" | "plan">`

Used while the LLM is generating. **Width:** 760. Small masthead.

- Heading: caps `Stop Press`, h1 Abril 56 `Pak Har is at the typewriter.`
- **Typewriter strip** (`1px solid ink` card): 4 task rows. Each row is grid `24 / 1fr / 80`:
  - Marker glyph (Abril 18): `·` queued · `›` writing (accent) · `✓` done
  - Task text (Space Mono 13). Active row: blinking cursor at end. Done rows: opacity 0.55.
  - Status caps (Work Sans 8): `queued` / `writing` / `filed`
- Below: italic muted Lora 13.5: `This usually takes twenty to forty seconds. If it takes longer, the printer is warm — that is all.`
- Sidebar: caps `Coming in This Edition` + bullet list (§ glyph + Lora 12.5) of what the LLM will produce, varying by `context`
- Footer rail: `The Press · Senayan` / `Special edition · going out` / `— hold the line —`

Tasks (text varies by `context`):

- **dispatch:** `Pulling splits from the wire... · Reading the zones... · Checking last week... · Writing the dispatch...`
- **plan:** `Reading your last four weeks... · Rounding up the targets... · Drafting Tuesday... · Filing the plan...`

Production: each task ticks `done` as the corresponding tool/data step completes. If you don't have task-level signals, fake the progression on a 900ms tick.

### Offline — `<OfflinePage kind="api" | "ollama" | "strava">`

**Width:** 760. Small masthead.

- Big errata callout: `3px solid ink`, padding `28px 32px`, bg `rgba(138,42,18,0.04)`
  - Caps `Errata · Notice to Readers` (accent weight 800)
  - h1 Abril 64 (per kind):
    - `api`: `The presses are down.`
    - `ollama`: `Pak Har is not at his desk.`
    - `strava`: `Strava did not answer.`
  - Lora 16 deck (kind-specific, all in voice — no apologies, no jargon)
  - Lora 13.5 italic muted sub-line with the practical fix
  - Footer row: ink **Retry →** button (white text) on left, kind error code (Space Mono 11 caps muted) on right — e.g. `503 · Service Unavailable`, `502 · Bad Gateway`, `504 · Upstream Timeout`
- Below: 3-column secondary info grid: Status / Cache / Support (each with thin top border, caps label, Lora 12.5 body)
- Footer rail: `Errata · Senayan` / `Special notice` / `— regular edition resumes shortly —`

Detect:

- **api** = the Next.js BFF cannot reach the Python API
- **ollama** = API responded but the LLM endpoint timed out / returned 502
- **strava** = Strava OAuth refresh / activity fetch timed out

---

## Behavior & navigation

### Routing map

| Path | Component |
|---|---|
| `/` (unauth) | `LandingPage` |
| `/dashboard` | `DashboardPage` |
| `/activities` | Activities Front Page (`activities-frontpage.jsx`) |
| `/activities/[id]` | Dispatch (`direction-news.jsx` with `pairingKey="tabloid"`) |
| `/plan` | `PlanPage` |
| `/coach` | `CoachPage` |
| `/settings` | `SettingsPage` |

After auth, `/` redirects to `/dashboard`. The masthead nav links are: Front Page → `/dashboard`, Dispatches → `/activities`, Plan → `/plan`, Letters → `/coach`, Desk → `/settings`.

### Connect-Strava flow

`/` is the only entry point. The button initiates Strava OAuth in a popup (or full redirect):

- `idle` → click → `connecting`
- on success → redirect to `/dashboard`
- on failure → `error` (Errata box + Retry)

### Loading & error patterns

- Any LLM-generating screen (`/activities/[id]` first time, `/plan` first time, `/coach` while streaming) renders `<ThinkingPage>` if generation is in flight and no cached output exists
- API/Ollama/Strava failures render `<OfflinePage>` at the section level, not the page level (so the masthead stays). Retry resets the section-level fetch.

### Tone shift

Empty states soften slightly. Pak Har is still honest, just less biting on first-run / no-data screens. Examples already in the mocks:

- Landing tagline keeps full bite (`he has thoughts`)
- Settings copy (`No farewell edition. No retention dance.`)
- Loading copy (`If it takes longer, the printer is warm — that is all.`)
- Offline (`This is not your fault. Usually not, anyway.`)

Do **not** soften post-run dispatches or weekly reviews. That is the product.

---

## Copy bank (all in Pak Har voice)

Section labels, microcopy, and footer rails — keep verbatim:

- Page footers: `Printed at Senayan · Jakarta` / `Filed at Senayan · Jakarta` / `Wire Desk · Senayan` / `The Press · Senayan` / `Errata · Senayan` / `The Desk · Senayan`
- Recurring italic muted aside: `"Besok pagi, lari lagi ya."` (Bahasa: "Tomorrow morning, run again.")
- House line: `· No Cheerleading Since 1976 ·`
- Continuation lines: `— continued page 2: Plan for the week —`, `— filed daily, rain or otherwise —`, `— hold the line —`, `— back to the Front Page —`, `— replies go out on the hour —`

Pak Har's run dispatch (mocked):

```
Headline: "You went out too hard. Again."
Pull-quote: "The last kilometre — that is ego, not fitness."
Stamp word: "PACED POORLY"

Body:
1. First kilometre 5:12 on an easy day. What were you training for, the bus?
2. By km 7 you were in Z4 and pretending it was still easy. It was not. The last kilometre — the sudden 5:44 — that is ego, not fitness. You saw the finish and tried to be someone.
3. Three runs this week against five last week. The rain on Thursday is not a reason. You know this.
4. Tomorrow: 35 minutes, heart rate under 148. If you cannot hold it, slow down until you can. This is not a punishment. This is the work.
```

In production this comes from the LLM. The UI must render plain paragraphs split on `\n`, drop-capping the first letter of the first paragraph.

Op-Ed (Dashboard) — voice example:

```
Headline: "The curve is real. So is the drop."
Pull-quote: "You are getting tired before you are getting fit."
Body: 2 paragraphs, justified. Last sentence is action-y.
```

Plan editor's note — voice example:

```
Headline section: "Editor's Note"
Body: 1 paragraph, justified, drop-capped. Sign-off "— Pak Har · Plan filed Mon 13 Apr · 05:14"
```

Coach teletype seed exchanges (showing voice & length):

```
SUB > How was my pace on the long run Saturday?
EDITOR > Too even. 5:52 for the first kilometre, 5:51 for the last. A long run is not a tempo. You were supposed to feel like you could do two more. Could you?
SUB > Not really. My legs felt heavy after km 10.
EDITOR > Then you have your answer. Start thirty seconds slower next Saturday. Negative-split the second half by fifteen. This is not a negotiation.
```

---

## Data shapes (additions to existing schemas)

### Activity (list item & detail)

Adds three fields the coach response should produce alongside long-form analysis (so the list can render without a second LLM round-trip):

- `verdict_short: string` — one-line Pak Har verdict (becomes the card headline and the dispatch `<h1>`)
- `verdict_tag: string` — 1–2 word stamp for the tone badge (e.g. `PACED POORLY`, `ON PLAN`, `NO SHOW`)
- `tone: 'critical' | 'good' | 'neutral'` — drives badge styling

### Plan (weekly)

Existing 7-day structure plus optional:

- `descriptor: string` — short italic tag for non-rest rows (Tempo/Long). Optional.

### Dashboard insights

The existing weekly review payload should expose:

- `headline: string`
- `pull_quote: string`
- `body: string[]` — array of paragraph strings (recommended: 2)
- `stats: { avg_hr: number, avg_hr_delta: number, load_change_pct: number, weekly_km: number[6] }`

### Settings — Editor's Voice

User pref enum: `'gentle' | 'standard' | 'unfiltered'`. Read by the prompt builder when constructing the system prompt for any LLM call.

---

## Responsive notes

Mocks are desktop-only. Existing `BottomNav` for mobile + `Sidebar` for desktop split is unchanged.

Mobile treatment is out of scope but: the column layouts collapse to single column (CSS grid `auto-fit`), the mastheads step down (Old Legs at 56px, big page h1 at 36–40px), the fixtures table reflows into card-stack rows, and the teletype transcript fills the viewport with a sticky composer.

---

## Open questions for the next pass

- Mobile layouts (especially fixtures table + teletype)
- Onboarding sequence after Strava connect (the "we are reading your last four weeks" moment)
- Notifications email/web-push templates in voice
- Dark mode (invert paper to tobacco-dark `#1a1612` with warm cream ink; accent stays)
- Race-goal flow — currently no UI
