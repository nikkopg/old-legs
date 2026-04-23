# Old Legs — Design Handoff

A tabloid-newspaper aesthetic for the Old Legs running coach app, centered on Pak Har's unsparing voice. Two screens designed in this pass:

1. **Front Page** — the Activities list, styled as a tabloid front page with a lead story and previous editions
2. **Dispatch** — the post-run analysis detail view, styled as a broadsheet with masthead, headline verdict, stats, pace chart, dispatch prose, splits table, HR zones, and weekly mileage rail

The design locks in the **Tabloid font pairing** (Abril Fatface / Lora / Work Sans / Space Mono) after exploring 6 alternatives. Pak Har remains the only coach in v1.

---

## About the design files

The HTML files in this bundle are **design references** built with inline React + Babel. They are not production code to copy directly. The job is to recreate them in the existing Next.js 16 / Tailwind v4 codebase under `apps/web/`, using the project's established patterns (the `@/components/ui` primitives, the `@/lib/formatters` helpers, the existing route structure at `/activities` and `/activities/[id]`).

## Fidelity

**High-fidelity.** Exact colors, typography, spacing, and copy tone are final. Layouts are pixel-precise at the widths given. The developer should match these one-to-one using Tailwind utilities and CSS variables.

## Files

| File | What it is |
|---|---|
| `Old Legs - Front Page.html` | Main prototype: Activities list + click-through to Dispatch. **Start here.** |
| `Old Legs - Post-Run Analysis.html` | Early exploration — 3 directions (Receipt, Broadsheet, Dossier). For reference only. |
| `Old Legs - Broadsheet Font Pairings.html` | 6 font pairings on the broadsheet. Shows why Tabloid was chosen. |
| `components/activities-frontpage.jsx` | Front-page (Activities list) component. |
| `components/direction-news.jsx` | Dispatch (detail) component. `pairingKey="tabloid"` is the shipped variant. |
| `components/activity-feed.jsx` | Fake activity feed data — shape matches `@/types/api` `Activity`. |
| `components/run-data.jsx` | Fake detail-run data + Pak Har verdict copy. |

---

## Design tokens

### Color

| Token | Hex | Usage |
|---|---|---|
| `paper` | `#f4efe4` | Page background (all tabloid surfaces) |
| `ink` | `#141210` | Primary text, rule lines, body bars |
| `accent` | `#8a2a12` | Iron-oxide red. **Used sparingly**: tone-critical badges, ego-surge annotations, Z4/Z5 HR bars, current-week rail, "read on →" hotspot |
| `muted` | `rgba(20,18,16,0.55)` | Secondary metadata, italic asides |
| `hairline` | `rgba(20,18,16,0.35)` | Thin column rules |
| `dotted-border` | `rgba(20,18,16,0.3)` | Table row separators (dotted) |
| `data-fill-bg` | `rgba(20,18,16,0.08)` | Unfilled portion of mini bar charts |

The **orange `#e06c2a` in the existing `globals.css` is retired** for these screens — it reads generic fitness-app. Replace with `#8a2a12`.

Page frame background (outside the paper): `#1a1612`.

### Typography

Pairing: **Tabloid**. Load from Google Fonts:

- `Abril Fatface` (display — masthead + all tabloid headlines)
- `Lora` (body serif — paragraph prose, at-a-glance copy)
- `Work Sans` 400/500/600/700/800 (sans — all-caps labels, tone badges, bylines, metadata)
- `Space Mono` 400/700 (mono — numbers: stats, splits, zones, weekly rail)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Lora:ital,wght@0,400;0,700;1,400;1,700&family=Work+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

Add to Tailwind v4 theme:

```css
@theme inline {
  --color-paper: #f4efe4;
  --color-ink: #141210;
  --color-accent: #8a2a12;
  --font-display: "Abril Fatface", "Playfair Display", Didot, serif;
  --font-body: "Lora", Georgia, serif;
  --font-sans: "Work Sans", "Inter", sans-serif;
  --font-mono: "Space Mono", "JetBrains Mono", monospace;
}
```

### Type scale (used values)

| Purpose | Family | Size | Weight | Tracking | Case |
|---|---|---|---|---|---|
| Masthead ("Old Legs") | display | 88 | 400 | -1.5 | uppercase |
| Lead headline (verdict) | display | 64 | 400 | -1 | uppercase |
| Broadsheet masthead | display | 64 | 400 | -1.5 | uppercase |
| Broadsheet headline | display | 44 | 400 | -0.5 | sentence |
| Prev-edition headline | display | 28 | 400 | -0.4 | **sentence** (not uppercase) |
| Big stat number | mono | 28 | 700 | — | — |
| Medium stat number | mono | 20 | 700 | — | — |
| Body prose | body | 13.5 | 400 | — | sentence |
| At-a-glance copy | body | 12 | 400 | — | sentence |
| Section labels | sans | 10 | 600–700 | 3 | uppercase |
| Metadata / bylines | sans | 9–10 | 500–700 | 2 | uppercase |
| Tone badge text | sans | 9 | 700 | 2 | uppercase |

Mono uses `font-variant-numeric: tabular-nums`.

### Spacing & structure

- Front Page width: **980px** paper, `padding: 28px 36px 40px`
- Dispatch width: **760px** paper, `padding: 28px 36px 48px`
- Page frame: `#1a1612` background, 40px top/bottom, 20px sides
- Stage `min-height: 100vh`, flex-justify center, align-start
- Column gap between paper content and sidebar: 28px
- Rules: **1px** hairline, **3px** thick. Double-rule = 3px + (3px gap) + 1px
- Grid gutters between stat cells: `10px 18px`

### Border radius & shadows

- **No radii.** Everything is hard-cornered (newspaper aesthetic).
- **No drop shadows** on paper surfaces.
- Bordered callouts use `1px solid ink` or `3px solid ink` (scoreboard box).

---

## Screen 1 — Front Page (Activities list)

**Route:** `/activities`
**Purpose:** User sees today's latest run as the lead story and scans past runs as newspaper editions. Clicking any entry navigates to that run's Dispatch.

### Layout

Single-column paper (980px) on dark frame. Top-to-bottom:

1. **Top rail** — flex-between, Work Sans 10px uppercase, opacity 0.75:
   - Left: `Vol. III · Edition No. 412`
   - Center: `Old Legs Daily — The Runner's Paper`
   - Right: `Mon 13 Apr 2026`
2. Thick rule (3px ink)
3. **Masthead** — center-aligned `Old Legs` in Abril 88px uppercase, under it `· No Cheerleading Since 1976 · Jakarta Edition ·` in Work Sans 10px letter-spacing 6
4. Double rule
5. **Lead story** (today's latest run) — see below
6. 22px gap
7. **Two columns** — main archive (flex) + sidebar (260px fixed, left border 1px ink)
8. Footer rail — "Printed at Senayan · Jakarta" / "Page 1 · Front" / "— continued page 2: Plan for the week —"

### Lead story

- Flex-between header: `Today's Lead · Post-Run Dispatch` (Work Sans caps) + Tone Badge (accent bg, white text, `PACED POORLY`)
- 2-column grid: `1.35fr / 1fr`, gap 28px
  - **Left:**
    - Sans caps metadata: `SUN 12 APR · EASY · Senayan loop × 2`
    - Abril 64px uppercase headline (the Pak Har one-liner verdict)
    - Lora 14px body: "Pak Har's full dispatch is inside — splits, zones, the ego surge, the Rx for tomorrow.  Read on →" (the "Read on →" is accent, uppercase, Work Sans 11 letter-spacing 2, weight 700)
  - **Right — Scoreboard box:**
    - `3px solid ink` border, padding 14/18, bg `rgba(20,18,16,0.02)`
    - Label `The Scoreboard` (Work Sans caps 9, letter-spacing 3)
    - 2×3 grid of `label / value`: DIST, TIME, PACE, AVG HR, MAX HR, ELEV. Labels: Work Sans 8 letter-spacing 2, opacity 0.6. Values: Space Mono 20px 700.
- Bottom border: `3px solid ink`

### Previous editions

Main column, below `Previous Editions` section label with right hint `tap an edition to read →`, then a double rule.

Each entry: 3-column grid `76px / 1fr / 260px`, gap 18px, padding `14px 0`, bottom border 1px ink (last entry: no border).

- **Gutter (76px):** date stack
  - DOW (Work Sans 9 letter-spacing 2 opacity 0.6)
  - DAY (Abril 32px)
  - MON (Work Sans 9 letter-spacing 2 opacity 0.6)
- **Headline column:**
  - Row of Tone Badge + metadata: `TYPE · route` (Work Sans 9 caps)
  - Headline: **Abril 28px, weight 400, line-height 1.1, letter-spacing -0.4, SENTENCE CASE** (this is the tweak that was corrected — do not uppercase)
  - Footer: `by Pak Har · read the dispatch →` (Work Sans 10, opacity 0.55, uppercase)
- **Stats column (right-aligned):**
  - Distance: `{km}` Space Mono 20px 700 + ` km` 11px opacity 0.6
  - Line 2: `{time} · {pace}/km` Space Mono 13px
  - Line 3: `{avg_hr} bpm · +{elev} m` Space Mono 11px opacity 0.65
  - If `MISSED`: show a single `—` in Abril 32px accent, no numbers

### Tone Badge component

Props: `tone: 'critical' | 'good' | 'neutral'`, children.

- Padding: `3px 8px`
- Work Sans 9px, letter-spacing 2, weight 700, uppercase
- `critical`: bg `#8a2a12`, text `#fff`, no border
- `good`: bg `#141210`, text `#fff`, no border
- `neutral`: transparent bg, `1px solid #141210`, text ink

Used labels: `PACED POORLY`, `HELD THE LINE`, `ON PLAN`, `FUELING`, `RESTRAINED`, `FADED LATE`, `STEADY`, `NO SHOW`.

### Sidebar (260px)

- Left border `1px solid ink`, `padding-left: 18`
- **The Standings** — label + sub-label `Weekly Mileage`
  - 4 rows (This, W-1, W-2, W-3), grid `44px / 1fr / 48px`, gap 8:
    - Label (Work Sans uppercase letter-spacing 1; current week 700, others 400)
    - 10px-tall bar: bg `rgba(20,18,16,0.08)`, `1px solid ink`, fill width `(km/40)*100%`, fill color `#141210` (current week: `#8a2a12`)
    - Km value right-aligned Space Mono 11
  - Footer `3 runs · 26.8 km so far` (Work Sans 9 uppercase opacity 0.55)
- 1px hairline separator at opacity 0.3
- **Notices** label + Lora 12 body:
  - `Strava: synced 2 min ago. Tap Refresh for latest.` — "Refresh" is sans caps 10, underlined with 1px ink, cursor pointer
  - `This week's plan is filed on page 2.`
  - Italic muted: `"Besok pagi, lari lagi ya."`
- 1px hairline separator
- **Coach on Duty** label + `Pak Har` (Abril 26px uppercase) + `Senior Coach · Since 1976` (Work Sans 10 caps opacity 0.6)

### Interactions

- Entire lead block and each previous-edition row are click targets; navigate to `/activities/{id}`
- Hover: mild darken (e.g. bg `rgba(20,18,16,0.02)`) — not implemented in the mock but expected in production
- "Refresh" text link: triggers Strava re-sync
- Clicking masthead: no-op (or scroll to top)

---

## Screen 2 — Dispatch (post-run analysis)

**Route:** `/activities/[id]`
**Purpose:** The hero moment. Pak Har's verdict on one run, with supporting data dense enough to believe him.

### Layout

Paper width 760px. Single column with internal 2-column splits.

1. **Top rail** — Work Sans caps: `Vol. III · Edition No. 412` / `Old Legs Daily · Post-Run Dispatch` / `{date}`
2. Thick rule
3. **Masthead** `The Old Legs` — Abril 64px uppercase, centered, tracking -1.5. Subtitle `· No Cheerleading Since 1976 ·` (Work Sans 10 letter-spacing 6)
4. Thick rule
5. **Headline block** — grid `1fr / 240px`, gap 24:
   - Left: section label `FRONT PAGE · VERDICT`, then `<h1>` Abril 44px sentence case (Pak Har's verdict headline), then byline `BY PAK HAR · SENIOR COACH · FILED 07:48 WIB`
   - Right: left border 1px ink(0.4), `AT A GLANCE` label + Lora 12 2-sentence precis
6. Hairline · caps section label `THE NUMBERS · {title} · {route} · {weather}` · hairline
7. **Stats strip** — 6-column grid (Distance / Time / Avg Pace / Avg HR / Cadence / Elev):
   - Label: Work Sans 9 caps opacity 0.7
   - Value: Space Mono 28px 700, line-height 1. Unit trails at 12px opacity 0.6, 3px left margin
8. **Pace chart card** — `1px solid ink`, padding `10px 12px 4px`, `rgba(20,18,16,0.015)` bg
   - Label `PACE PER KILOMETRE ———— HR (DASHED)`
   - SVG: 680×150, pad 38/20/18/24
     - 3 horizontal dotted guide lines (ink, 0.4px, dasharray `1 3`, opacity 0.5)
     - Pace polyline: 1.2px ink, round joins
     - Dots: 1.8px ink at each km; 3px accent at km 1 and km 10
     - HR polyline: 0.8px ink, dasharray `3 2`, opacity 0.55
     - X labels: km numbers, Space Mono 9 ink
     - Y labels: min + max pace, Space Mono 9 ink, end-anchored
     - Annotations: 0.8px accent vertical line from km 1 to `too hard, too early` (Lora italic 10, accent); same at km 10 to `ego surge`
9. **Two-column body** — `1.15fr / 1fr`, gap 28:
   - **Left — Dispatch prose:**
     - Section label `PAK HAR'S DISPATCH` + hairline
     - First `<p>` gets a drop cap: Abril 46px, line-height 0.9, padding-right 6, padding-top 2, weight 400, floated left
     - Remaining paragraphs: Lora 13, justified, `hyphens: auto`
     - **Pull-quote**: top + bottom `2px solid accent`, padding `10px 0`, Abril 20px italic centered accent
     - Sign-off: `— PAK HAR · POST-RUN DISPATCH` right-aligned Work Sans 9 caps opacity 0.7
   - **Right — supporting data:**
     - `SPLITS · BY THE NUMBERS` + hairline + table (Space Mono 11, column heads Work Sans 9 uppercase 600, rows separated by dotted hairline). Columns: KM / PACE / HR / CAD / Δ ELEV, all right-aligned. **Km 1 and km 10 pace cells: accent, weight 700.**
     - `HEART RATE ZONES` — 5 rows, grid `28px / 60px / 1fr / 40px`:
       - Zone label (Z1..Z5, Work Sans 10 700 uppercase)
       - Range (Space Mono 10, opacity 0.7)
       - 8px bar: bg `rgba(20,18,16,0.08)`, `1px solid rgba(20,18,16,0.3)`, fill width `(pct/40)*100%`. **Z1–Z3 fill: ink 0.78. Z4–Z5 fill: accent 0.85.**
       - `{min}m · {pct}%` right-aligned Space Mono 10
     - `LAST 4 WEEKS · KM` — 4 rows, grid `44px / 1fr / 90px`, 10px bars. Current-week bar: accent.
10. Thick rule
11. Footer rail: `Filed at Senayan · Jakarta` / `"Besok pagi, lari lagi ya."` / `— continued page 2: Plan for the week —`

### Interactions

- Back button in chrome above the paper: navigates `/activities`
- No other interactive elements in this screen (view-only)
- Deep-link URL should be shareable (`/activities/{id}`)

---

## Copy & voice

**Non-negotiable.** All Pak Har copy uses the existing `prompts/pak_har.py` voice rules (blunt, specific, zero hype, no exclamation points, no emojis). The prose for the mocked run is in `components/run-data.jsx`:

```
Headline: "You went out too hard. Again."
Pull-quote: "The last kilometre — that is ego, not fitness."
Stamp word: "PACED POORLY"

Body paragraphs (4):
1. First kilometre 5:12 on an easy day. What were you training for, the bus?
2. By km 7 you were in Z4 and pretending it was still easy. It was not. The last kilometre — the sudden 5:44 — that is ego, not fitness. You saw the finish and tried to be someone.
3. Three runs this week against five last week. The rain on Thursday is not a reason. You know this.
4. Tomorrow: 35 minutes, heart rate under 148. If you cannot hold it, slow down until you can. This is not a punishment. This is the work.
```

In production this comes from the LLM. The UI must render plain paragraphs split on `\n`, drop-capping the first letter of the first paragraph.

Microcopy is in Pak Har's voice throughout (`Today's Lead`, `Previous Editions`, `The Scoreboard`, `tap an edition to read →`, `read the dispatch →`, `Coach on Duty`, `"Besok pagi, lari lagi ya."`).

---

## State, data & integration

### Data shapes

Uses the existing `Activity` type at `@/types/api` for list items and detail. The fake feed in `components/activity-feed.jsx` adds three fields that **must be added to the coach response schema**:

- `verdict_short: string` — one-line Pak Har verdict (becomes the card headline and the dispatch `<h1>`)
- `verdict_tag: string` — 1–2 word stamp for the tone badge (e.g. `PACED POORLY`, `ON PLAN`, `NO SHOW`)
- `tone: 'critical' | 'good' | 'neutral'` — drives badge styling

Recommend generating these server-side alongside the long-form analysis in the `/coach` router so the list can show them without a second LLM round-trip.

### Splits, zones, weekly rail

Splits and HR zones come from Strava streams (fetch & cache on activity ingest). Weekly rail is derived from the last 4 weeks of activities — already available per the existing Strava context pipeline.

### Routing

- `/activities` — Front Page
- `/activities/[id]` — Dispatch
- Back button uses `router.back()` or an explicit `router.push('/activities')`

### Empty states (not mocked — please implement in-voice)

- No activities yet: front-page headline area shows `No editions yet. Connect Strava and run.` in Abril 44px.
- Pak Har hasn't analyzed yet: show the existing `AnalysisBlock` empty state (`Pak Har hasn't seen this run yet.` + "Get his take" button), but style to match the broadsheet.

---

## Responsive notes

Mocks are desktop-only (the existing `BottomNav` is mobile, `Sidebar` is desktop — follow that split). Mobile treatment is out of scope for this pass; the column layouts collapse to single column naturally if you use CSS grid `auto-fit`, but the masthead typography will need to step down (target `Old Legs` masthead at 56px on mobile, headline at 40px).

---

## Assets

No images or icons. Everything is type, rules, and bar charts. Do not add illustrations, emoji, or decorative glyphs — the weight of the newsprint aesthetic comes from restraint.

---

## Open questions for the next pass

- Weekly plan page (page 2) — not designed yet. Likely a tabloid "league table" view.
- Chat with Pak Har — not designed. Candidate: a columnist's reply format (typewritten letter?).
- Dark mode — not in scope. If needed later, invert the paper to a tobacco-dark `#1a1612` with warm cream ink; accent stays.
- Loading / thinking state for Pak Har — not designed. Suggest a blinking cursor at the drop cap position.
