# Tasks (backlog + active)

Format per task — copy this block:

```
## T-### · <title> · STATUS: TODO | IN PROGRESS | BLOCKED (why)
- Requested: <date> — owner's words / intent (quote them)
- Scope / non-goals:
- Acceptance criteria:
  - [ ] ...
- Sub-steps:
  - [ ] ...
- Related docs/files:
- Open questions for the owner:
```

Completed tasks move to `archive.md`. Live execution state goes in `progress.md`.

---

## Active

## T-006 · Phase 2 — hero map system first, then futuristic polish · STATUS: FUNCTIONALLY DONE — 2A map + deep audit, 2B B1–B8, map v2 (6 features), visual sweep, full QA all built/verified/pushed (phase2 plan §9–§11). OPEN (owner-gated): (1) owner's hands-on feedback, (2) 3D vehicle models (last)

- Requested: 2026-09-27 — owner: "futuristic second phase"; "the map in all screens ... should look most beautiful and have live moving things like trips, actual vehicle icons/logo moving ... currently the map is simple and bland". Owner deferred to my recommendation: **map first (2A), then general futuristic pass (2B)**.
- Plan, scope, tech options and the open questions: **`agent/architecture/phase2-map-and-futuristic-plan.md`**.
- Rules: agree direction with the owner BEFORE coding (product-direction rule); don't break existing map behaviour; tokens only; keep real-API path; showcase mode simulates movement.
- **OPEN TODO list for T-006 (owner 2026-09-28, everything else in the map audit was judged not worth doing):**
  1. [ ] **Owner's hands-on map feedback** — owner reviews the map by hand (Live map, Overview hero, trip/vehicle modals, picker, landing hero, /map); apply whatever they find. Only blocker of the map work.
  2. [ ] **3D vehicle models (LAST polish step, before any demo recording)** — real glTF models via a three.js custom layer so vehicles look solid when the map is tilted (silhouettes are flat decals in 3D). Details + cheaper alternative: `decisions.md` 2026-09-28 and phase2 plan §9a.
         Skipped on purpose (owner): Firefox/Safari checks, extra axe scans of vehicle modal/phone/3D, Esc-fullscreen, tab-order reorder, prefs-flash check.
- **T-006-R map realism: DONE 2026-09-27** (motion, ×3 default, stable bubbles, route highlight, named start/destination, yards+geofences along the road; commits 1fa51dc, e6d7c12, 8c3227f; decisions.md 2026-09-27 items 1–7).
- **Now working on: phase 2B (B1 visual check → B2 → B5 → B6 → B7 → B8), then B9 QA.** NO UI COMPROMISE (owner rule): every effect must look premium, use tokens, respect reduced motion.
- **MAP V2 + VISUAL SWEEP (owner 2026-09-28, "lets do these first"):** [x] M2-1 map search box (vehicles + yards, keyboard, fly + select) [x] M2-2 saved camera views (presets + user bookmarks, localStorage) [x] M2-3 animated route flow (marching dashes along the remaining route) [x] M2-4 ETA chips (destination chip on the trip route) [x] M2-5 speed-coloured trails (history + comet trails, legend) [x] M2-6 heat layer (density of positions, layers-panel toggle) [x] VS visual sweep of EVERY screen in the real visible window (1:1 screenshots), fix anything off vs the no-compromise rule. QA cadence: targeted checks per feature; full build+crawl+axe only after the sweep.
- Sub-steps: milestones M0–M8 (map) and B1–B9 (futuristic pass) with tracker at the bottom of the plan doc. Owner decisions: MapLibre GL yes; light + night (+satellite) basemaps with toggle; 3 vehicle icon styles with toggle; 3D allowed; any library allowed; no UI compromise.

## T-007 · Landing + login + register "hook" pass — DONE, all 5 parts built + verified + pushed (2026-09-27) · plan + tracker: agent/architecture/landing-auth-plan.md · decisions T7-1..T7-5 in decisions.md

Owner's words: landing is too simple / has too little to hold a client's eyes; add an interactive live-map part; same feeling for login + register. Findings: landing hero map is `interactive={false}` (vehicles move but cannot be touched), sections are static text cards, no proof/tour/how-it-works, big vertical gaps; login/register left panel = static text + two floating cards. Landing hero map verified green (moving) logged-out. Proposal: (1) interactive hero map (click a truck → card + highlighted road, look/3D toggle, live counters, AI insight ticker); (2) tabbed product tour with live components (map + fleet list, trips, analytics, AI chat with clickable prompts); (3) scroll-story sticky map; (4) proof strip (fictional logos, testimonials, count-up numbers) + how-it-works + night-map CTA + footer; (5) login/register: live night map behind glass widgets, rotating alert toasts, testimonial, register perks + password strength. Constraints: one WebGL map at a time (lazy mount), tokens only, light theme default, reduced-motion respected. Decisions to log as they are made.

## T-006-R2 · Live-map enterprise/operator review — RECOMMENDATIONS, NOT STARTED (owner asked only to document them; pick with the owner before coding) · full text: agent/architecture/map-enterprise-review.md

Status 2026-09-27: items 1–7 DONE (D1–D7 in decisions.md), item 8 waits for the owner. Priority order I proposed: (1) hero default state (tight fleet fit + one vehicle preselected with card/route/ETA); (2) collapsible fleet list panel inside the map (search, status filter, click-to-select); (3) name/plate labels on vehicles at high zoom; (4) group demo controls (speed, tour, clean) under one "Demo" button; (5) taller/full-bleed map; (6) softer heat layer; (7) alert strip (speeding, geofence events, late trips); (8) driver + trip + playback on the vehicle card; (9) moving colour ≠ brand orange (semantic colour) — owner chose the palette, ask first.

## T-005 · Showcase data layer (fake data for screenshots/videos) · STATUS: DONE pending owner review (A–D built, pushed, verified; a11y scan done)

- Requested: 2026-09-27 — owner: "we just need to focus on ui and if you need you can have like fake data in utils folder or however you like to populate screens"; "you can check real api responses in sync folder for existing screens, and for new screens/things you can have mock data in utils". Also: no IndexedDB/Dexie demo, no backend work.
- Full plan, architecture, endpoint shapes, order of work and the response-capture method: **`agent/work/showcase-data-plan.md`** (read it first).
- Acceptance: with the toggle ON every main screen (overview, map, vehicles, drivers, trips, yards, geofences, incidents, assignments, 4 analytics pages, products/devices, /home) shows realistic Pakistani-fleet data with consistent numbers and no "ZZ …" names; OFF = unchanged real-API behaviour; production build + crawl clean.
- Sub-steps: [x] A lists [x] B dashboard family [x] C analytics reports [ ] D detail modals + products/devices [x] toggle + label [x] verify + crawl.

- DONE 2026-09-27: modal/public-page a11y scan + production build + route crawl (see progress.md).

## T-004 · "Enterprise / big-project feel" design review · STATUS: IN PROGRESS — batch 1 done (owner 2026-09-27: 'move to T-004 without asking'): ⌘K entity search, status bar footer, Integrations catalog, Modules (live /api/modules), Plan & usage (preview, company currency), /internal-user → /members. Batch 2 done: workspace chip (≥1760px wide), real Company & locations page (profile + yards), keyboard shortcuts (? sheet, g+letter), /notifications (preview data) + bell 'View all'. Batch 3 done: Activity log page (/activity, Access menu; created/updated stamps of vehicles/drivers/trips/incidents/yards/geofences in company tz), Saved views on all 6 fleet lists (SavedViews.tsx, localStorage `views:<list key>`), palette trip search fix. Batch 4 done: Products & devices summary tiles (DeviceSummary), breadcrumbs (shell/Crumbs.tsx) on product pages / role editor / edit user / company sub-pages. Batch 5 done: ListEmpty (icon orb, filtered vs empty, add/clear action) on Vehicles/Drivers/Yards/Trips/Geofences/Incidents. Batch 6 done: Live map 'Layers' panel (vehicles/yards/geofences toggles with counts). Batch 7 (a11y): scanned ~25 pages for controls without an accessible name and fixed them: password show/hide toggles (Account/Login/Register), label-less GlobalInput (aria-label from placeholder/name), table select-all/row checkboxes, role-card kebab, permission switches. Not scanned: open modals/dialogs, public pages (login/register/reset) beyond the toggles. Demo-data toggle: NOT built — old fakeBackend targets the old unpaged API; realistic names need seeded backend data (out of scope). Ideas still open: density toggle (low value: spacing is hard-coded per screen), breadcrumbs, demo-quality seed data (ZZ names look test-like; backend data = out of scope, maybe a frontend demo-data toggle).

- Requested: 2026-09-27 — owner: "i think it still does not feel like a proper enterprise big project, but we will come to it later after doing that [T-003]". No specific area named. Start with an owner Q&A (what feels thin: density, data richness, page depth, charts, empty pages, placeholders like module/plan management?), then propose a plan before coding.

## T-001 · Rebrand ConvoyAI → ConvoyAI, then link a git remote and push the first commit · STATUS: IN PROGRESS (steps 1–9 done except browser visual check; step 10 waits for owner's remote URL + explicit go)

- Requested: 2026-09-26 — owner: "this project's name in old folder was convoyai, so you can replace it with ConvoyAI everywhere, then I will link it with git repo, and push our first commit of this ConvoyAI."
- Scope: user-visible brand text and code identifiers `ConvoyAI/ConvoyAI/convoyai` → `ConvoyAI` (identifiers lowercase `convoyai`). Then: owner links the remote, first commit + push.
- Non-goals (unless the owner says otherwise): new logo/artwork, changing backend URLs, editing generated `backend_frontend_sync/api_contract/`, changing behaviour.
- Measured footprint (2026-09-26, excl. `agent/` and node_modules): ≈143× `ConvoyAI`, 42× `ConvoyAI`, 81× `convoyai`, 25× `example.com`, 25× `ConvoyAIDemo`, 7× `convoyai-theme`, 5× `DemoConvoyAIDatabase`, 11× `fe-convoyai`, 10× `FE-ConvoyAI`, 6× `ConvoyAIFrontend`. Content hits by area: `src/screens` 13 files, `src/GuestHomeComponents` 12, `src/components` 8, `src/utils` 3, `src/forms` 3, `public/locales` 2 (en, ar), `app/layout.tsx`, `app/providers.tsx`, `src/index.css`, `src/contexts`, `src/lib`, `package.json`, `package-lock.json`, `public/unity` (1), root docs (`task.md`, `CLAUDE_FRONTEND_CONTEXT.md`, `TYPING_HANDOFF.md`, `DEV_PERFORMANCE.md`, `HOW_TO_TEST.md`, `kapi dashboard.md`), 27 files under `backend_frontend_sync/api_contract/` (GENERATED — do not edit), 3 flow files + STATUS/README in the sync folder (history), and `agent/*` + `CLAUDE.md`.
- File/dir NAMES containing convoyai: `src/ConvoyAIDemo/` (+7 files), `src/GuestHomeComponents/assets/{convoyai-logo.png,convoyainew.png}`, `src/assets/images/{ConvoyAI.png,logo.png,convoyai2.png,convoyai_fav.png,convoyaifavicon*.png|webp|jpg,screens/convoyai.webp}`, `public/unity/Build/ConvoyAI.{data.gz,framework.js.gz,loader.js,wasm.gz}`.

### HAZARDS the executing session must handle (decide with the owner BEFORE editing — "never break what works" rule)

1. **Real backend hostnames `api.example.com` / `api.example.com` (25 hits: env docs, `HTTPProtocol.tsx` hardcoded webhook URL, Login Google origin comments, docs).** These are real infrastructure — do NOT blindly rename. Ask which domain ConvoyAI will use; until answered keep them.
2. **Unity build filenames `public/unity/Build/ConvoyAI.*` + references inside `public/unity/index.html` / loader** — renaming binaries can break the 3D viewer; recommended: leave the files and internal references as is (brand-invisible), only change visible text.
3. **`localStorage['convoyai-theme']`** (ThemeContext, anti-FOUC script in `app/layout.tsx`) — renaming resets every user's saved theme once; harmless but an existing-behaviour change → get approval (recommended: rename to `convoyai-theme`, accept one-time reset).
4. **Dexie DB name `DemoConvoyAIDatabase`** (demo mode only) — renaming makes demo data reseed once; acceptable, mention it.
5. **Generated/history files**: do NOT edit `backend_frontend_sync/api_contract/**` (generated by backend; owner rule) — leave; leave flow-file history as written (optional: add a one-line note "project renamed to ConvoyAI" in `backend_frontend_sync/STATUS.md`, bumping the stamp and telling the owner a copy is owed).
6. **Logo/image assets** still show the ConvoyAI artwork (PNG/SVG/WEBP, favicon `public/favicon.png`, `src/assets/images/*`, `GuestHomeComponents/assets/*`). Text-only rename cannot fix these → list them for the owner; renaming the files needs import updates (do it in the same commit) but the pixels stay old until the owner supplies new artwork.
7. **Casing map to confirm**: wordmark text `ConvoyAI`/`ConvoyAI` → `ConvoyAI`; lowercase package/identifier/key `convoyai` → `convoyai`; `ConvoyAIDemo` folder/imports → `ConvoyDemo` (7 files + 25 import sites); i18n strings in `public/locales/{en,ar}/*.json` (Arabic file may contain Arabic transliterations — check manually); `package.json` `"name"` and `package-lock.json` root name/entries; guest site copy in `GuestHomeComponents/data/*.ts` and sections (marketing sentences like "ConvoyAI OS" → check wording reads well: "ConvoyAI OS"?).
8. **Never touch** third-party/vendor text in `node_modules`, `.next`, minified Unity `.gz` files.
9. **Before the first push (SECURITY):** tracked files contain real-looking secrets/credentials that would be published: MapTiler key `<MAPTILER_KEY_REDACTED>` + Pusher key `<PUSHER_KEY_REDACTED>` (in `task.md`, `CLAUDE_FRONTEND_CONTEXT.md`, `agent/history/task-md-digest.md`, `agent/rules/owner-rules-and-workflow.md`? (check), `backend_frontend_sync/FACTS.md`), an old MapTiler key `<OLD_MAPTILER_KEY_REDACTED>` in commented code (`VehicleDetailModal.tsx`, `FleetMap.tsx`, `Map.tsx`), and the seeded test login `junead@chaminade-hs.org / <test-password>` (docs). `.env` and `.env.local` are git-ignored (verify with `git check-ignore -v .env .env.local` before pushing). `.claude/scheduled_tasks.lock` is a tracked junk file (remove from index / ignore). Recommend: scrub or redact those strings, ask the owner whether the repo will be private/public, and rotate the MapTiler key if the repo is public. Ask before pushing.
10. `node_modules` is not installed; verification of the rename = `npm install` → `npm run typecheck` (0 errors) → `npm run build` (dev server stopped) → run app and smoke-test login page, guest home, sidebar, Fleet Overview (titles/brand text) in dark + light.

- Acceptance criteria:
  - [ ] Owner answered the questions below; decisions logged in `decisions.md`.
  - [ ] No occurrence of `convoyai`/`ConvoyAI`/`ConvoyAI` remains in tracked files EXCEPT the deliberately kept ones listed in the decisions (backend hostnames, Unity binaries, generated contract, history docs), which are documented.
  - [ ] Renamed folders/files have all imports updated; `npm run typecheck` = 0; `npm run build` succeeds; app boots; brand text shows ConvoyAI on: browser tab title, login, register, sidebar/navbar, guest landing, footer, i18n strings (en + ar), demo tours.
  - [ ] `agent/` docs, `CLAUDE.md`, root docs updated to the new name (keep one line "formerly ConvoyAI / repo FE-ConvoyAI" for searchability).
  - [ ] Secrets scrubbed or explicitly accepted by the owner; junk lock file untracked.
  - [ ] Remote linked by the owner; first commit created (message + trailers per harness) and pushed ONLY after explicit go; hash recorded in `archive.md`.
- Sub-steps (execute in this order):
  - [x] 1. Start ritual (`session-ritual.md` §A); `npm install`.
  - [x] 2. Ask the owner the open questions below (one choice-list batch), record answers.
  - [x] 3. Produce the full occurrence list (`grep -rIn -i convoyai` excluding the generated contract/node_modules/.next/.dev-logs) into the scratchpad and classify each hit: brand text / identifier / path / URL / storage key / doc.
  - [x] 4. Rename directories/files with `git mv` (ConvoyAIDemo → ConvoyDemo, image/logo filenames if approved) and fix every import.
  - [x] 5. Replace text by class with a scripted, reviewable pass (case-mapped), then hand-review the diff (`git diff --stat`, spot-check user-visible strings, Arabic locale).
  - [x] 6. Update `package.json`/lock names, `app/layout.tsx` metadata title, theme storage key + anti-FOUC script (if approved), demo DB name.
  - [x] 7. Update `agent/` + `CLAUDE.md` + root docs; add the rename to `decisions.md`.
  - [x] 8. Secret scrub + untrack junk; `git check-ignore` checks.
  - [x] 9. Verify (typecheck, build, smoke test, both themes), then END ritual.
  - [ ] 10. When the owner provides the remote URL: `git remote add origin <url>`, review `git status`, ask "OK to commit and push?", commit, push, record hash.
- Open questions for the owner:
  1. Casing: is the brand exactly `ConvoyAI` everywhere (also in uppercase wordmarks and the folder/package `convoyai`)?
  2. Backend hostnames (`api.example.com`, `api.example.com`): keep as is for now (recommended), or give the new domain?
  3. Rename `convoyai-theme` localStorage key (one-time theme reset) — yes (recommended) or keep?
  4. Unity `ConvoyAI.*` build files: leave untouched (recommended)?
  5. Logo/favicon artwork: will you supply ConvoyAI assets later (recommended) or should I only rename files/text now?
  6. Repo visibility (private/public) and target URL — needed to decide the secret-scrub level and to link the remote.
  7. Should the old GitHub names (`FE-ConvoyAI`, `ConvoyAIFrontend` upstream) in docs be kept as historical notes (recommended) or removed?
- Related docs/files: this task's hazards; `agent/architecture/overview.md` (env, config), `agent/rules/owner-rules-and-workflow.md`, `backend_frontend_sync/README.md` (never reformat/edit generated contract).

## T-002 · Revamp/recreate the entire frontend UI — Fleet + AI focused, light theme · STATUS: PHASE 1 COMPLETE (base revamp on `staging`); PHASE 2 (futuristic polish) DONE

- Requested: 2026-09-26 — owner: "we have to entirely revamp/create ui of this entire frontend project"; current UI "not good, and too many overlapping libraries doing same thing"; wants a LIGHT theme (other portfolio projects are dark); presented as "automated fleet management + AI"; IoT stays minimal (what exists is enough); "ui must be production grade, rich, enterprise level, no compromise"; avoid the standard admin-panel layout (left sidebar of modules + 80% content) because they already have one in their portfolio.
- Rules: backend strictly out of scope; use existing endpoints, else mock/dummy data. Only revamp the Fleet module and its inner stuff first; also in focus: products, devices, fleet, complex RBAC, AI. IGNORE for now: alarms, assets, rule-builder, all demo-mode code.
- Showcase: UI is used in screenshots/videos to attract clients, so it must wow at first glance (rich, big-project feel, never bland). Any library/custom components allowed. Branch: `staging` (main = original reference).
- Non-goals: backend work, `backend_frontend_sync/`, deferred lists.
- Sub-steps: [x] 1. Direction agreed (design-spec.md). [x] 2. Spec written. [x] 3. Library audit approved. [ ] 4. Build foundation on `staging` (tokens, fonts, Tailwind theme, shell: floating nav, Cmd-K, copilot). [ ] 5. Rebuild Fleet overview + live map. [ ] 6. Vehicles/drivers/trips/dispatch. [ ] 7. Analytics. [ ] 8. RBAC, products/devices, AI hub, public pages.
- Status 2026-09-27: steps 1-3 done; step 4 (foundation, tokens, shell) DONE; step 5 (Fleet overview/map/lists/analytics/modals) DONE and live-verified; AI workspace page + landing + auth screens DONE; MUI icons → lucide DONE (`components/ui/icons`).
- 2026-09-27: MUI/icons/charts DONE, Phase 2 polish DONE, live QA pass 1 DONE. NOW: manual button-by-button QA of every page (`agent/work/qa-checklist.md`). After that: owner decides merge `staging`→`main`; optional cleanups (Chart.js in WebGL overlays, antd on Assets, react-icons leftovers); final docs refresh; archive T-002.
- (old plan, mostly done) Remaining: (a) replace MUI components (Dialog/Modal, TextField, Select, Checkbox/Radio/Switch/Slider, Pagination, Popover, Accordion, Tables, Avatar, CircularProgress; `AppRouterCacheProvider`) with own token-styled primitives, then remove @mui/*, @emotion, antd, chart.js/react-chartjs-2, react-icons, @radix-ui/react-icons; (b) restyle Account settings/profile/company screens, members/users tables, forms inside modals (AddDevices multistep, driver/trip/vehicle forms), 404/error pages, ManageProductConfig; (c) Phase 2 futuristic icons/animations/motion; (d) final: docs refresh (file-map, README), archive T-002.
- Open questions: none.

## Backlog (deferred by the owner earlier — do NOT start unless told; full list in `agent/status/current-state-and-open-items.md` §3)

- Global UI consistency + enterprise components pass (after Fleet).
- Fleet leftovers G14, G15, G18, G20, G19 (last).
- Trip lifecycle / driver experience notes (G22–G26).
- Rule Builder system-notification / SMS; onboarding step-3 lock (owner-led).
- Phase 8 SEO; strictness ladder; lint backlog.
