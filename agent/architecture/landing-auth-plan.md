# Landing + login + register "hook" pass (T-007) — findings, plan, tracker

## Findings (2026-09-27, logged-out walk-through)

- Landing (`src/components/landing/Landing.tsx`, 386 lines): hero → browser-frame mock with the live sample-fleet map (`HeroMapLive.tsx`, `interactive={false}`: vehicles move but nothing can be touched) → 4 stat tiles → 6 feature cards → AI section → analytics section → roles table → CTA. All static text/cards, large vertical gaps, no proof (customers, testimonials), no "how it works", no interactive product, no footer to speak of.
- Login/register (`src/components/auth/AuthShell.tsx`, 83 lines): split screen; left = brand + headline + 3 bullets + two floating cards, all static. Nothing moves; nothing shows the product.
- Landing hero map verified logged-out: vehicles/bubbles green (D8).
- Hero mock says "132 Moving" while the map shows the 39-vehicle sample fleet (inconsistent numbers → make the counters derive from the same sample fleet).

## Owner decisions (2026-09-27)

- Do ALL FIVE parts, in the recommended order below. Invented customers/testimonials/logos are fine but must look like a real product (believable names, roles, companies, numbers; no "Lorem", no "demo" wording).

## Plan (one by one; each part: build → verify live logged-out → decision entry in decisions.md → commit + push)

1. **Interactive hero map** — pan/zoom, click a truck → card (speed, trip, driver) + highlighted road, look/3D toggle, live counters from the same sample fleet, rotating AI insight, "click a truck" hint; scroll-zoom off until the map is clicked.
2. **Proof + finish** — customer logo strip, testimonials, count-up numbers, how-it-works (3 steps), night-map CTA, real footer.
3. **Login + register** — live night-mode map behind glass widgets, rotating alert toasts, testimonial line; register: perks list + password-strength meter.
4. **Tabbed product tour** — Live map (with fleet list), Trips, Analytics, AI copilot (clickable prompts) using the real components/sample data.
5. **Scroll story** — pinned map that changes as you scroll (select vehicle → route → geofence → alert).
   Constraints: one WebGL map at a time (lazy-mount the rest), tokens only (no hard-coded values), light theme default, `prefers-reduced-motion` respected, keyboard + AA contrast, logged-out pages must not call the real API (sample data only). Log in only on localhost; to see logged-out pages set `token`/`user` aside in localStorage and restore after (procedure in progress.md 2026-09-27).

## Tracker

- [x] 1 Interactive hero map (done, T7-1) - [x] 2 Proof + finish (done, T7-2) - [x] 3 Login + register (done, T7-3) - [x] 4 Product tour (done, T7-4) - [x] 5 Scroll story (done, T7-5) — ALL FIVE PARTS OF T-007 NOW DONE
