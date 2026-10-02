# ConvoyAI design direction (agreed with owner, 2026-09-26, T-002)

> **CORRECTION (2026-09-26, same day, later): the palette line below is STALE/REJECTED.** This was the
> _first_ direction proposed, before two full mockups were built and compared. The owner chose **vibrant
> orange** (`#E8590C`–`#FF7A1A`) over this teal/emerald option — see `agent/work/decisions.md`'s 2026-09-26
> palette entry and the actual token values in `agent/architecture/design-tokens.md` (which is what the real
> code uses; it always wins over this file if they ever disagree). The rejected teal mockup is kept for
> reference at `design/fleet-overview-mockup.html`; the chosen orange one at
> `design/fleet-overview-mockup-orange.html`. Everything else on this page (layout, personality, type,
> scope rules, UI-over-UX) is still accurate.

Status: agreed direction, no code yet. Branch `staging` (main = original reference). Detailed tokens/spec to be written next.

- **Purpose:** showcase (screenshots/videos for clients). Must impress at first glance; rich, big-project feel; never bland. Light mode only.
- **Personality:** premium glass + soft depth: bright canvas, layered translucent cards, soft shadows, subtle gradients/glows, imagery and a map hero.
- **Layout:** NOT a sidebar admin panel. Floating pill top navbar + full-width canvas, mega-menus, contextual tabs, Cmd-K command palette.
- **Palette:** deep teal/emerald primary, warm off-white surfaces, amber highlights; status colours green/amber/red; AI gets its own highlight treatment.
- **AI:** hero feature: copilot panel available everywhere + AI insight cards inside fleet screens (risk, fuel, maintenance, routes) + dedicated AI workspace/hub.
- **Type:** Geist / Inter Tight body, tabular mono for data, display serif accent for hero numbers/headlines (sparingly).
- **Density/shape:** medium density, large radius (16–24px), generous whitespace.
- **Public pages:** redesign landing, login, register in the same style.
- **Polish priority:** (1) Fleet overview dashboard + live map, (2) vehicles/drivers/trips/dispatch, (3) analytics/reports/cost/fuel, (4) RBAC/users + products/devices.
- **Scope rules:** ignore alarms, assets, rule-builder, demo mode. Backend out of scope: existing endpoints or mock data. IoT stays minimal. Consolidate overlapping UI libraries (audit pending).
- **UI over UX (owner, 2026-09-26):** unlike real fleet products, do NOT prioritise operator simplicity/navigation efficiency. Optimise purely for visual richness in pics/videos/in person; UX/operator-functionality compromises are acceptable, UI quality is not.
