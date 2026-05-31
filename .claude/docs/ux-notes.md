# Old Legs — UX Notes

> Written by UX Agent (TASK-009). Read by Frontend Agent before building any page.

---

## Design System

### Colors (CSS custom properties)

| Variable | Value | Usage |
|---|---|---|
| `--color-background` | `#0f0f0f` | Page background — always |
| `--color-surface` | `#1a1a1a` | Cards, panels, sidebar |
| `--color-surface-raised` | `#242424` | Hover states, elevated cards, user chat bubbles |
| `--color-text-primary` | `#f0f0f0` | All primary text |
| `--color-text-muted` | `#888888` | Secondary text, labels, timestamps, empty states |
| `--color-accent` | `#e06c2a` | Pak Har presence only — analysis border, active nav item, CTA buttons |
| `--color-error` | `#c0392b` | Error states only |
| `--color-success` | `#27ae60` | Sparingly — do not celebrate everything |
| `--color-border` | `#2a2a2a` | Card borders, dividers, input borders |

Tailwind usage: `bg-background`, `bg-surface`, `bg-surface-raised`, `text-primary`, `text-muted`, `bg-accent`, `text-accent`, `border-border`, `text-error`, `text-success`

### Typography

- **UI text:** Inter — loaded via `--font-inter`, mapped to `--font-sans`
- **Stats and numbers:** JetBrains Mono — loaded via `--font-jetbrains-mono`, mapped to `--font-mono`
  - Use the `.font-stats` CSS class for pace, distance, HR, elevation values
  - All numeric stats should be monospace for alignment

### Component patterns

- **Cards:** `bg-surface rounded-md border border-border shadow-card`
- **Hover:** `hover:bg-surface-raised transition-colors`
- **Accent usage:** `text-accent` / `bg-accent` / `border-l-4 border-accent` — only for Pak Har-related UI
- **Muted text:** `text-muted text-sm`
- **No gradients.** No glassmorphism. No neumorphism.
- **Animations:** `transition-colors` and `transition-opacity` only. No bounce, slide, or spring.
- **Border radius:** `rounded-sm` (4px) for badges/inputs, `rounded-md` (8px) for cards — never `rounded-full` on buttons

---

## Page Layouts

### `/` — Landing page (logged out)

- Full-screen centered layout, no sidebar, no nav
- Elements (top to bottom): app name "Old Legs" (large, bold), tagline below in `text-muted`, single "Connect Strava" button
- Button: `bg-accent text-white rounded-md px-6 py-3` — no pill shape
- No decorative images, no hero art

---

### `/dashboard` — Main dashboard (logged in)

**Desktop:**
- Sidebar (240px, fixed left) + main content (flex-1)
- Sidebar: app name at top, nav items (Dashboard, Runs, Plan, Pak Har), avatar + name at bottom
- Nav items: text label + small Lucide icon, `text-muted` default, `text-accent` when active

**Mobile:**
- No sidebar — bottom tab bar with 4 icons (Dashboard, Runs, Plan, Pak Har)
- Use `md:` breakpoint to switch layouts

**Main content:**
- Page title "Your runs" (not "Dashboard")
- Activity list (ActivityCard components, stacked)
- No decorative headers, no welcome messages

---

### `/activities` — Activity list

- Same sidebar/mobile layout as dashboard
- List of ActivityCard components ordered by date desc
- No filters in v1

---

### `/activities/[id]` — Single activity

- StatGrid at top: 4-up grid with distance (km), pace (min/km), time (H:MM), elevation (m)
- If `average_hr` is not null: show HR stat (avg / max) below the 4-up
- All stat values use `.font-stats` class (JetBrains Mono)
- Below stats: AnalysisBlock component
  - If `analysis` is null: show "Pak Har hasn't seen this run yet." + button "Get his take"
  - If `analysis` exists: show the `.analysis-block` (accent left border, plain prose)
  - Button label: "Get his take" — not "Generate AI Insights", not "Analyze with AI"
- No confetti, no green success boxes when analysis loads

---

### `/plan` — Weekly training plan

- 7-day grid (table or div grid)
- Columns: Day, Type (Badge), Target distance, Target pace, Pak Har's note
- Run type badges: Easy (neutral), Long (neutral), Hard (accent border), Rest (muted, greyed)
- Rest day rows: `text-muted`, no distance/pace shown
- Pak Har's note column: plain text, truncated to 2 lines on mobile

---

### `/coach` — Chat with Pak Har

- Full viewport height layout: fixed header + scrollable messages + fixed input
- Header: "Pak Har" in plain text — no subtitle, no AI badge, no robot icon
- Messages scroll area: `flex-1 overflow-y-auto`
- User messages: right-aligned, `bg-surface-raised rounded-md px-4 py-2`
- Pak Har messages: left-aligned, plain text — no bubble background, just text with "Pak Har" label above in `text-muted text-sm`
- No markdown rendering — Pak Har speaks in plain prose
- While streaming: show a blinking `|` cursor using `animate-pulse` after the last token
- Input bar: fixed at bottom, full-width text input + send button
  - Send button: icon only (Lucide `Send`), `text-accent`
  - No "Typing..." indicator with dots

---

## Empty States (exact copy — do not alter wording)

| Context | Text |
|---|---|
| No runs synced | "No runs synced yet. Connect your Strava account to get started." |
| Analysis not yet generated | "Pak Har hasn't seen this run yet." |
| Ollama offline | "Pak Har is unavailable right now. Make sure Ollama is running." |
| No training plan | "No plan yet. Pak Har will build one based on your recent runs." |
| No chat history | (no empty state — just show the input, Pak Har doesn't greet) |

---

## Loading States

- Skeleton blocks: grey `bg-surface-raised animate-pulse rounded-sm` divs in place of content
- No spinners with text
- No "Loading..." labels
- Pak Har chat streaming: blinking `|` cursor via `animate-pulse` — not dots, not a spinner
- Keep skeleton shapes proportional to the content they replace (stat-sized blocks for stats, text-line blocks for activity names)

---

*Frontend agent: this file is your source of truth for layout, copy, and component behaviour. Do not make design decisions not covered here — add a note to this file under "Frontend Requests" if something is missing.*

---

## Components Delivered

**TASK-010 — completed 2026-04-17**

All files in `apps/web/src/components/ui/`. Import via `@/components/ui`.

| Component | File | Notes |
|---|---|---|
| `Spinner` | `Spinner.tsx` | Sizes: sm/md/lg. Use for buttons and isolated loading only — use skeleton blocks for content areas. |
| `Button` | `Button.tsx` | Variants: primary (accent fill), ghost (border), danger (error border). Loading prop renders Spinner inline. Never `rounded-full`. |
| `Card` | `Card.tsx` | Optional `header` and `footer` slots. `noPadding` for full-bleed content. `hover` for clickable cards. |
| `Badge` | `Badge.tsx` | Variants: neutral, accent (border only — Hard runs), muted (Rest days), success (sparingly), danger. `rounded-sm`. |
| `Avatar` | `Avatar.tsx` | `src` + `name` props. Falls back to initials (max 2 chars) on error or missing src. Sizes: sm/md/lg. |

---

**TASK-011 — completed 2026-04-17**

All files in `apps/web/src/components/layout/`. Import via `@/components/layout`.

| Component | File | Props | Notes |
|---|---|---|---|
| `Sidebar` | `Sidebar.tsx` | `userName: string`, `avatarUrl?: string \| null`, `className?: string` | Fixed left sidebar, 240px (`w-60`), full viewport height. `hidden md:flex`. App name at top, 4 nav items in middle, avatar + name at bottom. Active route: `text-accent`; inactive: `text-muted hover:text-primary`. Uses `usePathname()` — `"use client"` required. |
| `BottomNav` | `BottomNav.tsx` | `className?: string` | Mobile-only fixed bottom tab bar (`flex md:hidden`). Icon-only (no labels). 4 tabs matching Sidebar. Active: `text-accent`; inactive: `text-muted`. `aria-label` on each link for accessibility. `"use client"` required. |
| `TopBar` | `TopBar.tsx` | `title: string`, `userName: string`, `avatarUrl?: string \| null`, `className?: string` | Page title (h1) left, Avatar right. No nav, no extra chrome. Pure Server Component. |
| `PageWrapper` | `PageWrapper.tsx` | `children: ReactNode`, `userName: string`, `avatarUrl?: string \| null`, `pageTitle?: string`, `className?: string` | Composes all three. Desktop: `flex h-screen`, Sidebar fixed 240px + `main` with `md:ml-60`. Mobile: Sidebar hidden, BottomNav fixed at bottom, `main` has `pb-20` to clear it. `pageTitle` is optional — TopBar only renders when provided. |

**Usage:**
```tsx
import { PageWrapper } from "@/components/layout";

export default function DashboardPage() {
  return (
    <PageWrapper userName="Nikko" pageTitle="Your runs">
      {/* page content */}
    </PageWrapper>
  );
}
```

---

**TASK-012 — completed 2026-04-17**

Files in `apps/web/src/components/activity/`. Import via `@/components/activity`.

| Component | File | Notes |
|---|---|---|
| `StatGrid` | `StatGrid.tsx` | 2-col mobile / 4-col desktop grid. Renders distance, pace, time, elevation. HR row only shown when `average_hr` is not null. All values use `font-mono text-xl`. |
| `PaceChart` | `PaceChart.tsx` | **Placeholder — deferred to v2.** Renders "Lap data unavailable." No recharts installed; no lap data in backend schema. |

---

**TASK-013 — completed 2026-04-17**

Files in `apps/web/src/components/coach/`. Import via `@/components/coach`.

| Component | File | Notes |
|---|---|---|
| `ChatBubble` | `ChatBubble.tsx` | User: right-aligned, `bg-surface-raised`. Pak Har: left-aligned plain text with "Pak Har" label. No markdown rendering. Optional timestamp. |
| `ChatInput` | `ChatInput.tsx` | Auto-resize textarea, send on Enter (Shift+Enter for newline), disabled while streaming. Send icon: Lucide `Send`, `text-accent`. |
| `AnalysisBlock` | `AnalysisBlock.tsx` | Accent left border (`border-l-4 border-accent`), plain prose. Used on activity detail page. |

---

**TASK-014 — completed 2026-04-17**

Files in `apps/web/src/components/plan/`. Import via `@/components/plan`.

| Component | File | Notes |
|---|---|---|
| `WeeklyPlanGrid` | `WeeklyPlanGrid.tsx` | 7-day grid. Today's row highlighted. Run type badges via `Badge` component (easy: neutral, hard: accent, rest: muted). Mobile: stacks vertically. Pak Har's notes truncated to 2 lines on mobile. |

---

## Tabloid Redesign (Phase 2)

Design system: Tabloid newspaper aesthetic — Abril Fatface / Lora / Work Sans / Space Mono. Paper `#f4efe4`, ink `#141210`, accent `#8a2a12`. No border radius anywhere. No icons. Tailwind only.

All three components live in `apps/web/src/components/redesign/`. Import via `@/components/redesign`.

---

**TASK-127 — ToneBadge — completed 2026-04-24**

File: `redesign/ToneBadge.tsx`

Props:
- `tone: 'critical' | 'good' | 'neutral'` — controls color scheme
- `children: string` — the verdict stamp text (e.g. "PACED POORLY", "HELD THE LINE", "NO SHOW")
- `className?: string` — optional override

Variants:
- `critical`: bg `#8a2a12`, white text — used for failed/bad runs
- `good`: bg `#141210`, white text — used for well-executed runs
- `neutral`: transparent bg, `1px solid #141210`, ink text — used for mixed/unremarkable runs

Notes: Work Sans 9px, weight 700, uppercase, tracking `0.125rem`, padding `px-2 py-[3px]`. Hard corners (newspaper aesthetic — no border radius anywhere).

---

**TASK-128 — FrontPage — completed 2026-04-24**

File: `redesign/FrontPage.tsx`

Props:
- `activities: Activity[]` — full list; `activities[0]` is the lead story, `activities[1..]` are previous editions
- `weeklyKm: WeeklyKmEntry[]` — array of `{ label, km, runs, current? }` for the sidebar standings (pass oldest first: W-3, W-2, W-1, This — component reverses for display)
- `lastSyncedAt?: string | null` — ISO timestamp of last Strava sync; shown in Notices
- `onActivityClick: (id: number) => void` — navigate to Dispatch for a given run
- `onRefreshSync: () => void` — trigger Strava re-sync

Exported types: `WeeklyKmEntry`

States:
- Empty activities: shows "No editions yet. Connect Strava and run." in Abril 44px
- Single activity: lead renders normally; "No previous editions." italic text in the previous editions column
- MISSED run (distance_km === 0): stats column shows an accent "—" dash in Abril 32px, no numbers
- Missing HR data: shows "—" for AVG HR and MAX HR in the scoreboard

Layout: 980px paper on `#1a1612` dark frame. Top rail → masthead → double rule → lead story → two-column section (previous editions + sidebar) → footer rail.

---

**TASK-130 — Dispatch — completed 2026-04-24**

File: `redesign/Dispatch.tsx`

Props:
- `activity: Activity & { verdict_short?: string | null }` — the run to display
- `weeklyKm: WeeklyKmEntry[]` — same type as FrontPage, used for the sidebar mileage rail
- `splits?: DispatchSplit[]` — optional per-km split data: `{ km, pace, hr, cad, elev }`
- `onBack: () => void` — navigate back to FrontPage

Exported types: `DispatchSplit`

States:
- No analysis: prose section shows "Pak Har hasn't seen this run yet."
- No splits: splits table shows "Splits unavailable — lap data not yet synced."; HR zones also shows unavailable
- Pull-quote: extracted as the 2nd sentence of `analysis`; only shown when analysis has >= 2 paragraphs
- Drop cap: CSS class `dispatch-drop-cap` applied to first paragraph — ::first-letter rule in globals.css

Layout: 760px paper on `#1a1612` dark frame. Back button above paper → top rail → masthead → headline block → numbers strip → stats strip (6-col) → two-column body (prose left, splits/zones/weekly right) → footer rail.

**Design decision — splits redundancy resolution (2026-05-03, reversed same day):**
~~The PACE PER KILOMETRE chart placeholder section has been removed.~~ **REVERSED.** Product owner confirmed: build the chart. The two sections serve different cognitive purposes — the chart shows the *shape* of the run (fades, negative splits, blow-ups), the table gives the *numbers*. These are not redundant; they answer different questions.

**Pace chart + overlay spec (confirmed 2026-05-03):**
- Full-width SVG line chart above the two-column body. Pace line always shown.
- **Pace line:** `stroke: #141210` (ink), `strokeWidth: 2`, solid. Inverted Y-axis — faster = visually higher.
- **Average pace reference line:** single horizontal dashed line at the run's average pace. Ink, opacity 0.3, `strokeDasharray: "4 3"`.
- **Dot markers** at each split point. No fill under the line.
- **Toggleable overlays:** HR / ELEVATION / CADENCE. One active at a time. Each overlay rendered as `stroke: #8a2a12` (accent), `strokeWidth: 1.5`, `strokeDasharray: "4 3"`. Y-axis normalised to 0–100% of the overlay metric's own range (shape only — precise values remain in the table).
- **Nulls:** break the line, do not interpolate. If a metric is entirely null for all splits, its toggle is disabled (opacity 0.4, pointer-events none).
- **Legend** above chart: two Caps labels in Space Mono 9px with 16px line sample (solid ink swatch for PACE, dashed accent swatch for active overlay + unit label e.g. `HR · BPM`).
- **Toggle buttons** below the chart section: Work Sans 9px uppercase, `letterSpacing: 0.1em`, `fontWeight: 700`, hard corners, `padding: 5px 10px`, `gap: 8px`, left-aligned. Active: `background: #141210`, `color: #f4efe4`. Inactive: `border: 1px solid rgba(20,18,16,0.35)`, transparent bg, muted text. Disabled: `border: 1px solid rgba(20,18,16,0.2)`, `color: rgba(20,18,16,0.3)`, `cursor: not-allowed`.

---

## TASK-201 — Plan next-week polish

> C2 visual spec — to be implemented by Frontend agent (TASK-201-F2, TASK-201-F3, TASK-201-F4).

---

### 1. Pre-generate caption

Displayed above the generate button on the plan page, before the user commits. The caption is driven by the `reason` field returned by `GET /plan/next-target`. It sits immediately above the generate button, left-aligned, in Lora italic 13px, `var(--color-muted)`, no decorative container — just text.

The button itself changes label based on `is_next_week` (copy defined in TASK-201-C1 voice section):
- `is_next_week === false` → button label: "File this week's plan"
- `is_next_week === true` → button label: "File next week's plan"

Both button states use the existing generate-button style: `background: var(--color-ink)`, `color: var(--color-ink-on-ink)`, Work Sans 11px uppercase letter-spacing 3, `padding: 10px 20px`, hard corners, `border: none`.

The caption line and button are grouped in a flex column, gap 10px, `align-items: center` (matches the existing no-plan centered state in PlanPaper).

---

### 2. PlanPaper variant: `is_next_week === true`

Two and only two things change when the plan being displayed covers a future week. No other part of PlanPaper changes.

**Change 1 — Section label in `NewspaperChrome`**

Current label passed to `NewspaperChrome`: `"Fixtures · Week of {dateRange}"`

When `is_next_week === true`, the label becomes: `"Next Edition · Week of {dateRange}"`

When `is_next_week === false` (current week or past): unchanged — `"Fixtures · Week of {dateRange}"`

The `PlanPaper` component receives `isNextWeek: boolean` as a new prop. The prop is used only to compute the `section` string passed to `NewspaperChrome`. No other rendering logic changes.

**Change 2 — Today-row treatment**

When `is_next_week === true`, every day in the plan is in the future. The today-row accent treatment must be removed entirely:

- `borderLeft: isToday ? '3px solid var(--color-accent)' : '3px solid transparent'` → for next-week plans, both cases render `3px solid transparent` (no left accent border on any row)
- `background: isToday ? 'var(--color-accent-soft)' : 'transparent'` → for next-week plans, all rows render `transparent`
- The "Today" `Caps` label beneath the day name → not rendered for any row when `is_next_week === true`

The `isToday` calculation (`d.day === todayDow`) can remain in place — it is simply not used when `isNextWeek` is true.

**What does not change**

- Row opacity treatment for Rest days (`opacity: 0.55`) — unchanged
- All column content (day, date, session type, target, realization, instruction/verdict) — unchanged
- Totals row, Editor's Note, Key, Corrections section — unchanged
- The regenerate button at the bottom — unchanged

**Both light and dark themes** inherit the change automatically via CSS vars. No theme-conditional logic needed.

---

### 3. Replace-confirmation modal

Fires only when `GET /plan/next-target` returns `replaces_active_plan: true`. The modal must be rendered at the PlanPaper level (or the plan page level), not inside the generate button's click handler inline. It uses a backdrop overlay and a centered dialog.

**Backdrop**

- Full viewport, `position: fixed`, `inset: 0`, `z-index: 50`
- Background: `rgba(0, 0, 0, 0.4)`
- Click-outside on the backdrop dismisses (calls cancel handler)

**Dialog container**

- `position: fixed`, centered via `top: 50%`, `left: 50%`, `transform: translate(-50%, -50%)`, `z-index: 51`
- `background: var(--color-paper)`
- `border: 3px solid var(--color-ink)`
- `border-radius: 0` — hard corners throughout, consistent with tabloid aesthetic
- `max-width: 400px`, `width: calc(100% - 32px)` — responsive on mobile
- `padding: 28px 28px 20px`

**Heading**

- Abril Fatface, `font-size: 24px`, `line-height: 1.1`
- Color: `var(--color-ink)`
- `margin: 0 0 14px`
- Copy from C1 voice section

**Body text**

- Lora, `font-size: 13.5px`, `line-height: 1.55`
- Color: `var(--color-ink)`, `opacity: 0.75`
- `margin: 0`
- Copy from C1 voice section

**Hairline divider**

- `height: 1px`, `background: var(--color-hairline)`, `margin: 20px 0 16px`

**Button row**

- `display: flex`, `justify-content: flex-end`, `gap: 12px`, `align-items: center`

**Cancel button**

- `background: transparent`
- `border: 1px solid var(--color-ink)`
- `color: var(--color-ink)`
- Work Sans, `font-size: 11px`, `letter-spacing: 3px`, `text-transform: uppercase`, `font-weight: 600`
- `padding: 10px 20px`
- `border-radius: 0`
- `cursor: pointer`
- Label: "Keep it" (see C1 copy)

**Confirm/replace button**

- `background: var(--color-accent)`
- `border: none`
- `color: var(--color-ink-on-accent)`
- Work Sans, `font-size: 11px`, `letter-spacing: 3px`, `text-transform: uppercase`, `font-weight: 600`
- `padding: 10px 20px`
- `border-radius: 0`
- `cursor: pointer`
- Label: "Replace it" (see C1 copy)

**Dark mode**: All values reference CSS vars. The modal inherits `[data-theme="dark"]` token overrides automatically. No separate dark spec needed.

**Focus trap**: When the modal opens, focus moves to the cancel button. Escape key triggers cancel. Tab cycles between cancel and replace only while modal is open.

**No animation on open/close** — consistent with the no-dramatic-transitions rule. The modal appears and disappears on the next render frame. `transition-opacity` on the backdrop (100ms) is acceptable if already a project pattern — do not add if not already used.
