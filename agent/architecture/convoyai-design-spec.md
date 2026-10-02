# ConvoyAI design spec (T-002) — source of truth for the UI revamp

Approved 2026-09-26. Reference mockup: `design/fleet-overview-mockup-orange.html` (open in browser; copy tokens/patterns from it). Branch: `staging` (main = original code). Light mode only. Backend out of scope (existing API or mock data). UI richness beats UX.

## Tone

Playful AND enterprise: vibrant, rich, big-project feel, never bland or too neutral. Orange lives in accents, gradients, hero moments, glows, primary buttons and route lines; surfaces are glassy and light. Must look stunning in screenshots and videos.

## Tokens (see mockup `:root`)

- Background `#FBF5EE` (alt `#F3E9DD`), plus fixed radial glows: orange top-left, gold top-right, indigo bottom-right.
- Ink `#0E1B1A`, `#3A4A48`, `#6F7E7B`, `#9AA7A4`; lines `rgba(14,27,26,.08/.14)`.
- Primary orange `#E8590C` (deep) / `#FF7A1A` (bright) / `#FFB36B` (soft) / `#7A2E05` (ink) / wash `#FFE7D2`.
- Gold `#F5B700`, wash `#FFF3C4`, ink `#7A5600`.
- AI indigo `#5B5BE6` to `#8B7CF6`, wash `#ECEAFE` (only for AI features: copilot, insights, AI-rerouted).
- Status: green `#2E9E5B`, red `#E0523F` (+ washes). Idle uses gold (consider a distinct hue if it clashes with orange).
- Glass: `rgba(255,255,255,.66)` + blur(22px) saturate(1.5) + 1px white border + soft shadow.
- Radius 12 / 20 / 28; pills 999. Shadows: s/m/l as in the mockup.
- Fonts: Geist (UI), Instrument Serif (hero numbers, greetings, display), Geist Mono (data/kbd). Tabular numerals on all figures.

## Layout

No sidebar admin panel. Floating pill navbar (sticky) + full-width canvas (max ~1480px). Nav: Overview, Live Map, Vehicles, Drivers, Trips & Dispatch, Analytics, Access (+ products/devices). Cmd-K palette (cmdk), "Ask Convoy" button opens the AI copilot (side panel available everywhere). Mega-menus and contextual tabs for depth.

## Signature components (build once, reuse)

GlassCard, Pill/Badge, KPI tile (serif number + sparkline + delta), FloatingNav, CommandPalette, CopilotPanel, InsightCard, VehicleCard (map overlay), MapCanvas (Leaflet with light custom style), DonutStatus, AreaChart (ApexCharts), DataTable (rounded rows, avatars, status pills, AI notes), Segmented control, Buttons (primary orange gradient with glow, ghost, AI indigo).

## Libraries (approved)

Keep: Next 15, Tailwind, Radix primitives (headless), lucide-react, ApexCharts, Leaflet/react-leaflet, react-hook-form + yup, @tanstack/react-query, cmdk, react-hot-toast (restyled) or own toaster, i18n as is, motion (one animation lib). Remove as replaced: MUI, antd, Radix Themes, Chart.js, react-icons, MUI icons, unused (vaul, zustand, dayjs, date-fns). Details: `library-audit-2026-09-26.md`.

## Scope and order

Public pages (landing, login, register) then: 1 Fleet overview + live map, 2 vehicles/drivers/trips/dispatch, 3 analytics/reports/cost/fuel, 4 RBAC/users + products/devices, AI hub/copilot throughout. Ignore alarms, assets, rule-builder, demo mode.

- **Phase 2 (after the full revamp):** futuristic icons, animations, motion polish. Not before.
