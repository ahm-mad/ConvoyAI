# Owner rules & working workflow (READ FIRST)

Source: `task.md`, `backend_frontend_sync/README.md`, `FLEET_ANALYTICS_DESIGN.md` §0/D-13. These were stated by the
project owner ("the owner") to previous sessions, several as "very important". They apply to **every** session
and every module unless the owner says otherwise in the current chat.

## A. Standing rules

1. **Never break what already works** (whole project, frontend AND backend). Anything that changes existing behaviour
   — an endpoint/response/number, a screen's behaviour/layout/copy/route, a shared component/hook/config, or even a
   bug-fix that changes numbers the owner saw — needs the **owner's approval FIRST** (say what changes, who is affected,
   recommended option, rollback), and only afterwards inform the other side in the sync folder. Purely additive/opt-in
   work (new route, new component, new optional prop with unchanged default) is fine, but must be verified not to alter
   existing behaviour. No drive-by "improvements". If something existing breaks: stop, tell the owner, restore first.
   Before "done": `git diff` review, `npx tsc --noEmit` = 0 errors, live check of neighbouring features, state what was NOT tested.
2. **UI quality is non-negotiable**: "best and most beautiful enterprise-grade UI". Design first (show the owner when
   the layout is new), design tokens only (no hex in components; chart palette from `analytics/theme.ts`), dark AND light,
   reviewed at ≥1600 px (also 820/1280/1920), every state designed (loading skeleton, empty, error+retry, partial, stale),
   hover/focus/keyboard, WCAG AA, no layout shift, no console errors. **Load the `dataviz` skill before writing any chart code**
   and `artifact-design` for standalone HTML pages. Say plainly what was not visually verified.
3. **No hardcoding for foreign clients**: timezone (company fleet settings), currency (company record), unit system
   (`metric|us|uk`, `utils/units.ts`, `useUnits()`; the API is ALWAYS metric — convert only for display/typed input).
   Never write km / L / PKR / a city name into a screen.
4. **Make the real product client-worthy** (sellable), not the demo. **Never use the demo account
   (`demoAccount@chirptech.io`) for integration testing** — it is a client-only MSW+Dexie mock and proves nothing.
5. **Frontend drives API design**: the frontend decides which APIs it needs; backend builds to match.
6. Owner's process preferences: ask decisions as **short choice lists with a recommended option first** (answer the owner's
   clarifying questions inside the options); one focused batch of questions; tell the plan before editing code for big work;
   verify LIVE before saying done; don't ask again about things the owner has already decided; docs before the owner resets context.

## B. The Feature Request Flow (backend-dependent work) — permanent

1. **Assess** (read code + look at the live app). 2. **Match against the contract** (`api_contract/`). 3. **Build UI on mock data**
   behind ONE clearly-marked removable toggle/function. 4. Frontend decides the API. 5. **Write the exact ask** into
   `backend_frontend_sync/communication/flows/` (with a concrete JSON request/response example), bump `STATUS.md` "Last synced"
   (`date '+%Y-%m-%d %H:%M %Z'`, side = frontend) and tell the owner a copy of the folder is owed to the backend session. 6. **Round trip** (owner copies folder to backend, then brings it back). 7. **Integrate for real**, delete the mock entirely. 8. **One live test pass** on the finished integration. Pure frontend fixes skip straight to build-and-test.
   In THIS workspace the backend is out of scope for now, so steps 5–6 only apply if the owner brings a backend-dependent task.

**Regression safety** (each time): `tsc --noEmit` = 0 and `next build` clean; shared-component changes strictly additive; glance at
sibling features; before asking backend to CHANGE an endpoint, grep every call site (`grep -rn '/api/<path>' src`).

## C. Git / commit / push etiquette (from the previous workspace)

- Commit in logical, buildable commits. Trailer rules come from the harness attribution reminder (currently
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` + a `Claude-Session:` line when provided).
- **Push only when the owner asks.** Stage exact files (never `git add -A src`). This workspace has no remote yet.
- `lint-staged` runs Prettier on commit (`.husky/pre-commit`); it will reformat staged files. **Never run Prettier on
  `backend_frontend_sync/`** (ignored in `.prettierignore`) and never hand-edit `backend_frontend_sync/api_contract/`.
- Prettier config: 2 spaces, single quotes, semicolons, printWidth 100, trailingComma es5, arrowParens avoid.
- Code style in the codebase: comments explain _why_, cite backend flow numbers (e.g. "flows/06 §12"); Fleet code carries
  `/* eslint-disable @typescript-eslint/no-explicit-any */` and treats API entities as `any` (API response types are deliberately loose).

## D. Deliberate "do NOT start" items (owner said wait) — see `status/current-state-and-open-items.md` §3

Rule Builder system-notification/SMS, onboarding step-3 lock, ledger/reports E-series, trip-lifecycle/driver-app notes,
the global UI consistency pass (only after Fleet is finished), G14/G15/G18/G20/G19 leftovers. Do not start them unprompted.

## E. Browser-testing recipes learned (Claude-in-Chrome MCP), if a browser is available

- The owner logs in **manually** in the MCP Chrome tab (never type their password). Real seeded login (original env, backend at
  `http://localhost:8080`): `junead@chaminade-hs.org` / `<test-password>` (company 2, currency PKR, timezone UTC until the owner saves Asia/Karachi).
- Start dev server: `npm run dev` in background (log to scratchpad), `curl` the first route once to compile (~20 s). Stop: kill the wrappers
  (`dev-monitor`, `dev-safe`, `npm run dev`) first, then `next dev`/`next-server` **by PID** (never `pkill -f` patterns), `rm -rf .next`,
  check nothing listens on 3000. **Never run `next build` while dev is up.** Do not open many iframes/routes in one browser call (crashes dev).
- In-page API calls: `fetch` with `localStorage.token`. Tool output that looks like `key=value`/cookies is blocked — sanitize.
- `resize_window` opens a NEW window without the session; to see a 1536 px layout in a ~1250 px viewport use
  `document.documentElement.style.transform='scale(0.816)'` (origin 0 0, width 1536px) or inject a same-origin `<iframe>` at the wanted width.
- axe-core can be injected via `<script>` from jsdelivr for a11y checks. Coordinate clicks can miss at devicePixelRatio 1.25 — click by `find` ref.
- Radix menus/selects need real events or `find`+ref clicks; cmdk arrow/Enter tests need one key per call.
- Fleet sensor-test recipe: `POST /api/get-encrypt-token {protocol_id:1, product_id:118}` → token at `response.token.token`; then
  `POST /api/webhook` with header `token` and body `{time, object:{latitude,longitude,speed}, deviceInfo:{devEui, deviceName}}`
  (first packet on a new token is config-only).
- Test-data hygiene: throwaway records are prefixed `ZZ`; delete what you create (hard delete now exists for never-used vehicles/drivers/yards).

## Addendum 2026-09-26 (T-002 direction)

Backend is strictly out of scope: use existing endpoints or mock/dummy data. UI is being revamped as a light-themed, non-admin-panel-layout, enterprise-grade Fleet + AI product (IoT minimal). This supersedes the earlier "dark + light" wording for NEW UI: the new design is light-first. Ignore alarms/assets/rule-builder/demo. See tasks.md T-002 and decisions.md.

## Addendum 2026-09-26 (showcase)

UI is for showcase (screenshots/videos to attract clients): visually rich, striking at first glance, big-project feel, light mode, never bland. Any library or custom components allowed; implementation concerns are secondary to the UI for now. Work happens on branch `staging`; `main` stays as the original reference.

## Addendum 2026-09-27 — no local demo database

The owner does not want a local browser demo/mock database (IndexedDB, Dexie, MSW). Do not build, revive or extend `src/utils/fakeBackend` / `src/ConvoyDemo`. Screens use the real API; anything without an endpoint is a small static block labelled 'Preview'. (Decision log: decisions.md, 2026-09-27.)

## Addendum 2026-09-27 (later) — showcase fixtures are OK

The owner clarified: this is a portfolio showcase (pictures + videos), so backend work is never needed. Fake data is welcome as static TS fixtures in `src/utils/` (e.g. `src/utils/showcase/`) to populate screens. IndexedDB/Dexie/MSW local databases remain off the table.

## QA cadence (owner, 2026-09-28)

Run the heavy QA (production build + full route crawl + axe accessibility scan) **less often: only at the END of a phase or before a demo recording**, not after every batch of changes. Between those points verify only what a change touched (typecheck + live check of the affected screens + an axe scan of just those screens if the change is structural). Reason: the full run costs ~25k tokens mostly in browser wait calls, and most batches do not need it.

## UI beats efficiency (owner, 2026-09-29)

Never reduce UI/UX quality to save CPU or memory: no lower frame rates, fewer animated elements or cheaper substitute effects. The owner can afford whatever resources the best-looking UI needs. Only real leaks / hangs may be fixed, and never in a way that changes how the product looks or feels. (Test-only tooling such as `src/components/map/qaRaf.ts` may be made robust.)

## `main` branch = untouched reference; never merge/demo without explicit word (owner, 2026-09-27)

`staging` must not be merged into `main`, and no demo may be recorded, until the owner explicitly says so — they believe real work remains. `main` stays the untouched original and is the reference to compare behaviour against when something looks broken or you're unsure what the pre-revamp behaviour was: use `git show main:<path>` to read the original file instead of guessing.

## How the owner delegates ("continue" / "don't ask again") (owner, 2026-09-27)

When the owner says "continue" or "don't ask again, I'm busy", they want autonomous progress on the already-agreed task: one commit per idea/step, pushed to `staging` (pre-authorised), and an honest statement at the end of what was and was not verified. They dislike over-claiming — after an earlier "QA complete" they asked "is every page, every button working?" and required a stricter full pass. **Never say "everything works" after only sampling.** Mock/made-up content shown in the UI should read as genuinely real (see the product-direction memory content folded into `agent/README.md`'s status banner), not as obvious placeholder text.

## Invented/sample content must look genuinely real, not placeholder-ish (owner, 2026-09-27)

When adding fictional customers, testimonials, names, numbers or example questions anywhere in the showcase (landing page, demo/showcase data, AI copilot examples, etc.), write them so they read as credible and specific — real-sounding company and person names, plausible numbers and job titles — never generic filler like "Lorem ipsum", "Test Company" or "demo user". This applies wherever invented content is added in the future, not only the one task (T-007) where it was first said.

## Full browser-testing reference + machine/environment facts (moved out of Claude's memory, 2026-09-27)

Everything about running/verifying this app live in a browser (screenshot quirks, animation/rAF quirks, the IntersectionObserver-never-fires finding, code pitfalls like `@ts-nocheck` and the CSS `@layer` rule, the whole-app-crawl method) is now in **`agent/browser-testing-playbook.md`** — read it before any live verification work, regardless of which model/tool is doing the verifying. Machine specs, the installed `resource-guard` safeguard and dev-server memory rules are in **`agent/environment-and-safeguards.md`**. Both files exist so this knowledge survives a switch away from Claude Code (whose own cross-session memory a different assistant cannot read).
