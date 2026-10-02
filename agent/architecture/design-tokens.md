# ConvoyAI design tokens — how to change the look of the whole project

**Rule (owner, mandatory):** no UI value is hardcoded in a component. Fonts, sizes, weights, colours, gradients, borders, radii, shadows, glass, spacing, container width and motion all live in ONE place. Change a variable and every screen follows.

## Files

| File                        | What it holds                                                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/tokens.css`     | `@theme static { … }` (generates Tailwind utilities) + `:root { … }` (gradients, glass, layout, motion). THE place to edit values.                                                                                                                                    |
| `src/styles/components.css` | Semantic classes built only from tokens: `page-title`, `page-display`, `page-subtitle`, `eyebrow`, `card-title`, `card-subtitle`, `kpi-value`, `glass`, `glass-strong`, `glass-pill`, `glass-modal`, `card-lift`, `btn-brand`, `btn-ai`, `control`, `page-container`. |
| `src/index.css`             | Imports Tailwind + the two files above, base body typography, scrollbar/calendly/nprogress leftovers. No design values.                                                                                                                                               |
| `src/lib/design/tokens.ts`  | `token('--color-brand')` — reads a token at runtime for code that needs real colour strings (Leaflet, ApexCharts, SVG strings). `useVizColors()` (analytics/theme.ts) builds chart palettes from `--color-chart-*` / `--color-status-*`.                              |
| `app/layout.tsx`            | Loads the font files (Google Fonts link). Families are named in tokens.css (`--font-sans`, `--font-serif`, `--font-mono`).                                                                                                                                            |

## Token groups (in tokens.css)

- **Fonts:** `--font-sans` (Geist), `--font-serif` (Instrument Serif, display numbers/titles), `--font-mono` (Geist Mono).
- **Type scale:** `--text-display|title|kpi|heading|body|control|caption|micro` (+ `--text-*--line-height`) → utilities `text-title`, `text-kpi`, etc.; weights `--font-weight-*`; tracking `--tracking-*`.
- **Colours:** surfaces `--color-surface-0..3`, lines `--color-line(-soft)`, ink `--color-ink-0..2`; brand `--color-brand(-bright|-soft|-wash|-ink)`; gold; AI `--color-ai*`; status `--color-success|warning|danger`; data-viz `--color-chart-1..8`, `--color-chart-neutral|grid|axis`, `--color-status-good|warning|serious|critical`. Legacy aliases (`accent-cyan` = brand, etc.) exist so old code re-skins; do not use in new code.
- **Radii:** `--radius-control|card|panel|modal|pill` → `rounded-control`, `rounded-card`, `rounded-panel`, `rounded-modal`.
- **Shadows:** `--shadow-card|glass|glow|ai|modal` → `shadow-card`, `shadow-glass`, `shadow-glow`, `shadow-ai`, `shadow-modal`.
- **Gradients (`:root`):** `--gradient-brand|ai|avatar|ai-orb|page-glow|copilot|copilot-glow|orb-core|modal-glow` (use via `var()` or the classes above).
- **Glass:** `--glass-bg`, `--glass-bg-strong`, `--glass-bg-modal`, `--glass-blur`, `--glass-border`, `--backdrop-overlay`, `--backdrop-blur`.
- **Layout:** `--container-page` (`max-w-page`), `--container-nav` (`max-w-nav`), `--page-gutter(-mobile)`.
- **Motion / focus:** `--motion-fast|base|slow`, `--ease-standard`, `--focus-ring`.

## How-to

- Rebrand colour: edit `--color-brand*`, `--gradient-brand`, `--shadow-glow`, chart-1.
- Change corner style: edit `--radius-*`. Change fonts: edit `--font-*` and the Google Fonts link in `app/layout.tsx`.
- New component: use `glass`/`glass-strong`, `page-title`, `card-title`, `eyebrow`, `control`, `btn-brand`, `rounded-card`, `shadow-card` — never `#hex`, `text-[13px]`-style magic numbers for design roles, `rounded-[28px]`, or inline gradients.
- Code needing colour strings: `token('--color-…')`, never a literal.
- Adding a token: put it in `tokens.css`, document it here.

## Known remaining literals (backlog, replace when touching the file)

Older screens still use Tailwind's stock sizes (`text-xs`, `text-sm`) and some `rounded-md/lg`; WebGL/Assets/legacy Fleet dashboard were intentionally left alone; the `#fff` glass border in components.css.

## Motion system (Phase 2, added 2026-09-27)

Tokens: `--motion-fast|base|slow|rise|ambient|stagger`, `--ease-standard`, `--pattern-grid(-size)`. Classes (components.css, all disabled under `prefers-reduced-motion`): `.motion-rise` (+ `--delay`), `.motion-stagger` (children rise in sequence), `.motion-float`, `.motion-glow`, `.motion-spin-slow`, `.cv-ping` (pulsing live marker), `.cv-route-flow` (animated dashed line), `.cv-draw` (sparkline draws in), `.skeleton` (shimmer), `.btn-ai` sheen, `.bg-grid-fade`, `.icon-gradient` / `.icon-gradient-ai` (gradient-stroke icons; gradients defined once in app/layout.tsx). Component: `components/ui/CountUp.tsx` (animated numbers, used by KpiTile and landing stats). Page transition: `AuthLayout` keys `<main>` on the top-level route segment. Mobile: `FloatingNav` has a hamburger sheet below `lg`; menus use `.glass-menu` (`--glass-bg-menu`).

## a11y text tokens (2026-09-27)

- `--color-ink-2` is now `#5f6e6a` (≥4.5:1 on the cream page background).
- `--color-brand-text` (`#c2410c`, Tailwind `text-brand-text`) = brand orange for SMALL text/links on cream/white (≥4.7:1). Use it instead of `text-accent-cyan`/`text-brand` for small copy; keep `text-brand` for large display text and fills.
- `--color-danger-text` (`#a8321f`, `text-danger-text`) = danger red for small text on tinted/raised surfaces (≥4.7:1). Status pills on `bg-surface-3` use `text-ink-1`.

## Phase 2B additions (2026-09-29)

- **Tokens:** `--ease-spring` (overshoot easing for switches / pops), `--map-light-hillshade-highlight` / `--map-night-hillshade-highlight`, plus the whole `--map-light-*` / `--map-night-*` basemap palette (mapStyles.ts repaints MapTiler from them).
- **Icon tiles:** `.icon-gradient` (existing) and `.icon-tile` share one treatment (gloss, tone glow, drop-shadowed glyph, hover sheen + lift). Tone via `--icon-tone`; variants `.icon-gradient-ai`, `.icon-tile--gold|--success|--danger`; `.icon-live` = pulsing ring (no sheen, `overflow: visible`). Rows use a `group` ancestor for the hover.
- **AI orb:** `components/ui/AiOrb.tsx` + `.ai-orb*` (`data-state` idle | thinking | speaking).
- **Micro-motion:** `.btn-brand/.btn-ai` press scale + light sweep, `.btn-soft` press, `.switch-thumb` (springy), checkbox/radio pop keyframes, `.row-glide` (table row rail).
- **Live values:** `components/ui/Flash.tsx` + `.value-flash`; `.bell-wiggle`, `.icon-live-dot`.
- **Empty state:** `.empty-orb` glossy with a turning dashed ring. Route progress bar + toasts styled in `src/index.css` / `ToastContext.tsx`.
- **Map controls:** one focus ring for `[role=toolbar] button` and the Zoom group (components.css); `.cv-eta` (ETA chip), `.cv-cluster` z-index 3, marker `:focus-visible` ring.
- **Gradients for icon strokes** (`#cv-grad-brand/-ai` in `app/layout.tsx`) use `gradientUnits="userSpaceOnUse"` (24×24) — a bounding-box gradient makes perfectly straight strokes disappear.
- All new motion sits inside `prefers-reduced-motion: no-preference` queries. Owner rule: never lower motion quality to save CPU.

- **Form inputs (2026-09-29):** `.field` (components.css) = the one style for text inputs / selects / textareas in add-edit forms (rounded-control, brand focus glow, hover tint). 57 inputs across 13 form files use it; `RecordForm` too. Do not reintroduce ad-hoc `bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs` strings.

## Vehicle status colours (2026-09-27, decision D8)

`--color-moving` (= `--color-success` green), `--color-moving-bright`, `--color-moving-deep`, `--color-moving-wash`, `--color-moving-text` (tokens.css, in `@theme`, so `bg-moving`, `bg-moving-wash`, `text-moving-text` exist). Used for every "moving" indicator on the live map (icons/halo via `.cv-veh.is-moving`, count bubbles `.cv-cluster.has-moving`, `MapHud`, `FleetPanel`, `MapSearch`, `VehicleCard` pill, layers legend). Idle = `--color-gold`, parked = `--color-chart-neutral`, offline = `--color-ink-2`. Brand orange stays for UI, routes, selection, actions. Revert = point `--color-moving` at `--color-brand`.
