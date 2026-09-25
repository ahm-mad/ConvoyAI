# TASK.md — FE-ConvoyAI: React(Vite) → Next.js + TypeScript migration

> **Working task tracker.** This file is the single source of truth for the current large task and its
> progress. If a session runs out of context, the next session resumes from the **Progress Log** and the
> **Phase status** markers below — do not re-plan from scratch, continue from the first unchecked item.
>
> **Convention for future tasks:** keep using this file. When a task finishes, move its content under
> `## Archive` at the bottom (with a date) and start a fresh `## CURRENT TASK` block at the top.

---

## ▶▶▶▶ RESUME HERE — END OF DAY 2026-09-25 (~17:45 PKT): frontend caught up with backend's 14:45 copy (U1 verified on the real field, B6 + B7 integrated, scope bar + compare-year + group-by built, a11y pass partly verified); our reply is flow 07 §33 / §34 / §34.5 / §35; a copy of the sync folder is OWED to backend (the owner pastes it after the pending browser checks); EVERYTHING IS PUSHED — READ THIS FIRST (supersedes the older "RESUME HERE" further down)

### ★ CURRENT STATE (read this, then the details below)

1. **The programme (flow 07 = Fleet dashboard / analytics / reports / ledger, on top of the finished flow 06 enterprise-readiness):** design in `FLEET_ANALYTICS_DESIGN.md` (§0 UI bar, §8 decisions D-1…D-17, §9 / §9b / §9c status); backend proposal + every reply in `backend_frontend_sync/communication/flows/07-fleet-analytics-dashboard.md`. **Numbering:** backend sections §10–§13, §17–§20, §23, §24, §25 (B6), §26 (B7), §32; ours §15, §16, §21, §22, **§27–§31 (our old §25–§29, renumbered by backend on merge)**, **§33 (reply to §25 / §26 / §32), §34 (+ §34.5), §35 (frontend status index)**. **The next frontend section is §36**; backend continues after §32. **Standing owner rules (VERY IMPORTANT, both sides):** (a) never break what already works — ask the owner FIRST, then tell the other side; additive / opt-in is fine; (b) UI quality is non-negotiable (best, most beautiful enterprise UI; dark + light at wide widths; dataviz skill before chart code; WCAG AA); (c) no hardcoding — foreign clients: timezone, currency, units are per-company settings.
2. **WHAT IS BUILT (frontend, live-verified against the real backend — details in the DONE log below):**
   - **Navigation:** `app/(app)/fleet-management/layout.tsx` + `components/fleet/FleetNav.tsx` — **Operations | Analytics** + page tabs + "Fleet settings"; one URL per page: `/fleet-management/operations/{overview,map,vehicles,drivers,geofences,yards,trips,assignments,incidents}`, `/analytics/{utilisation,trips,fuel,maintenance}`, `/settings`; the old hub is kept unlinked at `/fleet-management/legacy` (**owner 2026-09-25 evening: KEEP it for now**; backend keeps the `fleet_status.unknown` alias until it goes). `FleetNav` carries the range / compare filters everywhere and the scope + group-by only to the reports that honour them (`SCOPE_CARRY`).
   - **Overview** (B1 summary, B2 attention, B3 status + live `fleet:status_summary`, C1 / C4 compliance rows, B9 yards + geofences, A8 top vehicles) — no sample data.
   - **Analytics:** **Utilisation** (trip-based, A8 server table), **Trips & delivery** (B5), **Fuel & efficiency (B6: six tiles with compare + economy target, economy / price / litres / cost trends, efficiency by category, spend by vendor, "Fill-ups worth a second look" flags worded as _check_, paged fills table + CSV)**, **Maintenance = three views (`?view=`)**: Schedules (C1 + B7 due-date buckets), Service history (B7 report + C2 log), **Compliance (B7 compliance report: rate, six expiry classes, documents vs licences, expiry outlook with horizon chips, by document type, paged records + CSV)**.
   - **Filter bar (`FilterBar` + `useAnalyticsFilters`):** range presets / custom, Compare on/off + **mode Prior period | Last year (`cmp=year`, `compare=previous_year`)**, **Group by Auto | Day | Week | Month** (`interval=`, only options within the 92-bucket cap; shown on Trips, Fuel, Service history), refresh. **Scope bar (`ScopeBar` + `useAnalyticsScope`, Radix Popover + cmdk)** on Trips (category / vehicles / yard / trip's own driver / cost centre*), Fuel (category / vehicles / yard / cost centre*), Maintenance Schedules + Service history (category / vehicles); Compliance, Overview, Utilisation have none. *cost centre appears only when `GET /fleet/options` returns `cost_centres` (backend ask A).
   - **Fleet settings** (F1: timezone combobox + validation + 409 + Units cards + targets), `TimezoneNotice` (never auto-applies).
   - **Per-company units (U1):** `utils/units.ts` (metric | us | uk; API stays metric), `hooks/useUnits.ts` — LIVE on the real backend field; company currency everywhere (also the vehicle Maintenance / Fuel record lines, fixed 2026-09-25).
   - **Accessibility (axe-core run in the page):** `role="presentation"` on chart canvases, scoped AA-contrast muted text (`.a11y-muted` in `src/index.css`, on `PageScroller` + the Overview scroller; the app-wide `--color-ink-2` is UNCHANGED), `KpiTile` clickable tiles are a card + overlay button (no nested buttons), empty donut classes dimmed without opacity.
3. **WHERE WE CAUGHT UP WITH BACKEND:** backend's last copy = stamp `2026-09-25 14:45 PKT` (slices 1–7 + U1 `unit_system`; contract **324 operations**). Backend had merged our old §25–§29 themselves and renumbered them §27–§31. Our last sync stamp: see `sed -n 3p backend_frontend_sync/STATUS.md` (the day's last edits are §35 + a STATUS paragraph). **A COPY IS OWED to backend.** Snapshots before pastes (git tags + copies in `/home/chirp/projects/fe-convoyai-sync-snapshots/`): `sync-frontend-20260925-1318`, `…-1358-handover`, `…-1519`, `…-1537-scope`; **take a NEW tag + copy right before the owner pastes** (the folder changed after 15:37).
4. **WHAT BACKEND HAS BUILT THAT THE FRONTEND DOES NOT USE:** whole endpoints — billing / CRM group (25 ops, out of scope → Ledger), `GET /trips/{id}/gps-trail`, `within_days` on expiring-soon; capabilities — the `customer_id` scope, the extra C2 / C3 list filters (`service_type`, `vendor`, `min_cost` / `max_cost`, `payment_method`, `trip_id` — deliberately skipped: the tables' search already matches vendor / service), `by_category` (B3), `by_document_type` (C4), `meta.data_quality`, yard `series`, `busiest_bucket`, attention `type` / `yard_days` / `action`, cost centre (needs backend ask A).
5. **NOT BUILT BY BACKEND (we wait) + OUR OPEN ASKS (flow 07 §34.2):** B8 (drivers scorecard + `GET /incidents/summary` → the "Drivers & safety" page), D1 → B4 utilisation (owner decision on "Mark as location" + retention), downtime days (needs a vehicle status history; owner: not now), E1–E4 ledger, F2 saved views, F3 scheduled exports. **Our asks:** **A** `cost_centres` in `GET /fleet/options`; **B** `yard_id` + `cost_centre` on `GET /maintenance-logs` and `GET /maintenance-schedules` (+ exports); **C** question — will B4 carry the scope filters (then Utilisation is rebuilt on it). **Specific question still OPEN (owner asked us to make sure backend answers it): flow 07 §33.5 / `communication/findings.md` row — the economy figure on a fill flagged `odometer_backwards` (12.5 km/L from an older fill). REMIND THE OWNER to ask backend about it explicitly when they paste our folder.**
6. **OWNER DECISIONS:** (a) **YES — save `Asia/Karachi` as the real company timezone via the Fleet settings page — NOT YET DONE (waiting for a browser)**; afterwards re-check Overview / Trips / Fuel (day buckets start at Karachi midnight; the timezone notice strip disappears); (b) keep `/legacy`; (c) backend slice order still open (B8 next); (d) global muted-text colour token → propose in the project-wide UI pass (a global change needs approval).
7. **NEXT — FIRST ACTIONS (a browser is required; the owner closed Chrome and the extension went offline at ~16:00, still offline at 17:40 — ask the owner to restart Chrome and open claude.ai once, check `list_connected_browsers`):** (i) start the dev server (`npm run dev` in the background, log to the scratchpad, `curl` the route once to compile; first page ~20 s); (ii) the **PENDING CHECKLIST the owner wants finished BEFORE they paste to backend** — axe + eyeball on Overview / Utilisation / Compliance / Settings in light AND dark (incl. the donut-legend change and `.a11y-muted` on the Overview); a screen-reader proxy (accessibility tree via `read_page` — a real listening test is impossible for me, say so); a populated year-over-year check (seed throwaway ZZ fuel logs / trips dated Sept 2025, compare `cmp=year`, delete them); `uk` on the older screens + yard-create / slot-editor under `us` (ONE more temporary unit switch `us` → `uk` → `metric`, each bumps the settings row's `updated_at` — the owner allowed the earlier switches; announce it); yard + driver scope on trips that have them (find a yard with a checked-in vehicle, a driver with trips, compare to the API); the vehicle picker at 10,000 vehicles (throw-away mock `scratchpad/vehicles-mock.js` on port 8099 + an XHR `open` patch redirecting `localhost:8080/api/vehicles/options`; scratchpad may be gone — recreate); **save the Karachi timezone**; (iii) **take a fresh snapshot of the sync folder (git tag + copy) and tell the owner it is safe to paste**; (iv) then diff backend's reply against that tag (routine in item 12). After that: the scope bar for Overview / Utilisation once backend answers ask C; Drivers & safety when B8 exists; Ledger when E exists; the frontend-only leftovers G14 / G15 / G18 / G20 and the ZZ cleanup G19 LAST; the project-wide UI consistency pass AFTER Fleet is done (⭐ TODO below). **Do NOT start the deferred lists or the ⭐ TODO TRIP LIFECYCLE notes until the owner says so.**
8. **VERIFICATION DEBT (compulsory, not yet exercised):** everything in the pending checklist above; keyboard-only run-through with a real screen reader; `compare=previous_year` with real data a year old; `uk` beyond the Fuel page; the yard create / slot-editor forms in a non-metric unit; yard / driver scope on real trips; scope picker at scale; widths other than 1536 px for Compliance / Maintenance history / Fuel were measured (820 / 1280 / 1920 / 2560: no overflow) but not visually reviewed at every width; populated delay charts on REAL data (real trips have no planned end); print; the older debt (409 banners on yard / geofence / trip / driver forms, slot toasts, geofence events column at wide width, delete "select all N", B8 with > 2,000 trackers, bulk actions, trip stops editor, yard slot editor / layout upload, list CSV exports).
9. **GIT:** branch `feat/next-ts-migration`, remote `origin` = `https://github.com/ahm-med/FE-ConvoyAI.git` (the owner's fork; `upstream` = MuhammadShoaib756/ConvoyAIFrontend — never pushed by us). **Everything up to the end-of-day docs commit was PUSHED on 2026-09-25 evening** (owner: "push everything"); snapshot tags `sync-frontend-*` are LOCAL only. Push again only when the owner asks.
10. **ENVIRONMENT (state at end of day):** dev server STOPPED, `.next` + `tsconfig.tsbuildinfo` cleared, no helper processes; Chrome extension offline. **The owner logs in MANUALLY** in the MCP Chrome tab (never type the password); after a Chrome restart the session may be gone. Start: `npm run dev` in the background (log into the scratchpad), `curl -s --max-time 120 localhost:3000/fleet-management/operations/overview` once. Stop: kill `dev-monitor` first, then `dev-safe` / `npm run dev`, then `next dev` / `next-server` BY PID (never `pkill -f` patterns), `rm -rf .next`, verify no listener on 3000 / 809x. **Do not load many iframes in one browser call:** nine hidden app copies in one call blew the dev server up and `dev-safe` restarted it; run 2 pages per call. Backend: `localhost:8080/ready`.
11. **PRE-EXISTING console warnings (not ours, untouched):** hydration mismatch on `<html className="light">`, missing `key` in `LeftSidebar`; "A listener indicated an asynchronous response…" errors are Chrome-extension noise. The Next dev "N Issues" badge is these.
12. **SYNC ROUTINE (every time):** BEFORE the owner pastes ours: new git tag `sync-frontend-<date>-<time>` + copy of the folder outside the repo, `diff -rq`. AFTER a paste: `git status --short`, `git diff --numstat HEAD -- backend_frontend_sync`, stamp (`sed -n 3p backend_frontend_sync/STATUS.md`), `git diff -U0` removed lines of flow 07 + STATUS + findings, semantic contract diff (python yaml over `api_contract/openapi/*.yaml`: new / removed / changed operations + params), read the new backend sections; **this time backend merged and renumbered OUR sections itself** (their merge note names the new numbers) — verify by diffing our old sections against the renumbered ones; if a copy predates ours, restore our sections renumbered AFTER theirs with a merge note; continue numbering after the highest number either side used; never Prettier `backend_frontend_sync/`; bump the stamp with the real `date`; tell the owner a copy is owed. Before committing a pasted folder check the numstat equals the pre-commit numstat (the hook ignores the folder).

**Opening prompt for the next session (paste after /clear):** "Resume the Fleet work. Read memory MEMORY.md — first the two standing owner rules (never-break-existing-ask-owner-first, ui-quality-bar-non-negotiable), then fleet-dashboard-audit (the live programme; its top block is the authoritative current state), fleet-unit-system, foreign-clients-no-hardcoding, fleet-enterprise-readiness, fleet-frontend-architecture, fleet-test-recipe, backend-frontend-sync-process, trip-lifecycle-driver-experience-notes (notes only, do NOT start), global-ui-consistency-pass — then task.md's top ▶▶▶▶ RESUME HERE section (the ★ CURRENT STATE block — item 7 is the first-actions checklist), FLEET_ANALYTICS_DESIGN.md (§0 + §8 + §9c), backend_frontend_sync/STATUS.md and communication/flows/07-fleet-analytics-dashboard.md (§32 = backend's last message; §33–§35 = ours; §35 is the frontend status index). First check the Chrome extension (`list_connected_browsers`; if empty ask me to restart Chrome and open claude.ai), then do the pending browser checklist from item 7 (accessibility pass on Overview / Utilisation / Compliance / Settings in light + dark, populated year-over-year, uk + yard / slot-editor units with one more temporary unit switch, yard + driver scope on real trips, the 10,000-vehicle picker mock), SAVE the Asia/Karachi company timezone (I said yes), then snapshot the sync folder (git tag + copy) and tell me it is safe to paste to backend — and remind me to ask backend the odometer_backwards economy question (flow 07 §33.5 / findings.md) specifically. When I paste backend's reply into the sync folder: BEFORE anything else diff it against that snapshot tag (per-file removed-line counts, Last synced stamp, semantic contract diff via python yaml old-vs-new; backend may have renumbered our sections again — verify, restore anything of ours it dropped), then tell me in 5 lines what backend answered, what is newly BUILT (B8? cost_centres? C1 / C2 yard + cost-centre filters? B4 scope answer?), which existing API responses changed, and what you can build right now. Rules: never break existing things (ask me first, then inform the other side), the UI must be the best and most beautiful enterprise UI (design first, review dark + light at wide widths, dataviz skill before chart code, WCAG AA), no hardcoded locale / units / currency (foreign clients), don't start anything from the deferred lists or the trip-lifecycle notes, tell me the plan before editing code, and before I paste anything into the sync folder remind me to let you snapshot the current folder first."

### ⭐ TODO (owner, 2026-09-25 ~09:25 PKT, recorded verbatim in intent): GLOBAL UI CONSISTENCY + ENTERPRISE COMPONENT PASS — AFTER Fleet Management is finished

**Owner:** "when we are done with fleet management, we will check that the UI is consistent throughout the ENTIRE project — only UI design etc, no flow or backend — and also enhance the UI, especially of inputs, dropdowns etc.; we will make ONE global input, dropdown, datepicker etc. and use it everywhere, so the entire app feels like a proper enterprise, very good and rich UI. Again NO compromise on a very good, rich, enterprise UI. You can use whatever library or package you want."

- **When:** only AFTER the Fleet Management module is done (i.e. after the analytics / reports / ledger programme, the frontend-only Fleet leftovers G14 / G15 / G18 / G20 and the ZZ cleanup order the owner set). Do NOT start it earlier unless the owner says so.
- **Scope:** UI design only — visual consistency, spacing / typography / colour tokens, and ONE shared set of form controls used everywhere: **Input, Select / Dropdown (searchable, multi-select, async), Combobox, DatePicker / DateRange / DateTime, Checkbox / Radio / Switch, Textarea, Button variants, Modal / Drawer, Toast, Table, Tabs, Badge, Tooltip, Empty / Loading / Error states**. NO flow, routing, business-logic or backend changes.
- **Library freedom:** any library is allowed (owner). Facts found 2026-09-25 to decide with: `package.json` already carries THREE competing UI kits — **MUI** (`@mui/material`, `@mui/x-date-pickers`), **antd**, **Radix** (`@radix-ui/react-*` + `@radix-ui/themes`) — plus `react-hook-form`, `date-fns` + `dayjs`, `framer-motion`, `class-variance-authority`, `tailwind-merge`, `vaul`, `lucide-react`, `react-hot-toast`. Homegrown variants in `src/components/`: `Input.tsx`, `Select.tsx`, `CustomSelect.tsx`, `OptionSelect.tsx` (Fleet), `RadixDropDown.tsx`, `DropDownMenuRadix.tsx`, `MultiLevelDropdown.tsx`, `CheckBox.tsx`, `GLobalCheckBox.tsx`, `Button.tsx`, `FilterButton.tsx`, `Modal.tsx`. Raw controls: `<select>` in 14 files, date / datetime-local inputs in 12, `<input>` in 45. Recommendation to evaluate then: Radix primitives (already installed, accessible) + `class-variance-authority` + Tailwind tokens as the single system (shadcn-style), `react-day-picker` (or the MUI X pickers if kept) for the date pickers, `cmdk` for searchable comboboxes; remove the redundant kits only after every screen migrated (each removal = a global change → owner approval).
- **How (respecting the standing rules):** (1) inventory + screenshot every screen in dark + light (baseline) — an audit report to the owner first; (2) design the global component spec (tokens, states, sizes, density, focus rings, validation / error styling, keyboard behaviour, RTL-safe) and BUILD the components ALONGSIDE the old ones (additive, new folder e.g. `src/components/ui/`) with a showcase page; (3) owner approves the look; (4) migrate screen by screen, ONE module per commit, each screen visually compared before / after, with the owner's OK per module (changing an existing screen = "ask first" under `never-break-existing-ask-owner-first`); (5) only then delete the old components / unused kits. Every screen must be re-tested live for behaviour (forms still submit, validation still works) — visual change only, no flow change.
- **Bar:** `ui-quality-bar-non-negotiable` applies in full (best, most beautiful enterprise UI; dataviz skill for charts; dark + light; ≥ 1600 px wide; all states; accessibility). Memory: `global-ui-consistency-pass`.
- **Not for the sync folder:** frontend-only, no backend involvement (the backend session does not need to know).

### ⭐ TODO (owner, 2026-09-25 ~17:30 PKT — "for now only note these, we will come to these later when we are finished building current things"): TRIP LIFECYCLE · AUTOMATED ODOMETER · DRIVER vs OPERATOR EXPERIENCE

**STATUS: NOTES ONLY — nothing designed, asked of backend or built. Do NOT start until the owner says so (it refines the deferred "driver app / notifications / ETA" items). Not in the sync folder yet — write flow 08 for backend only when the owner gives the go.**

**The owner's notes (kept close to their words):**

1. **Odometer should be automated.** Assume a vehicle is used ONLY through our platform, so the system knows how far it travelled in a trip — at the end of a trip, then at the start of the next, and so on. **A trip's total distance should be calculated automatically from the trip's start and end point** (not typed).
2. **When a trip is created, a notification is sent to the driver; when the driver acknowledges it, the trip's status changes** — an enum such as `not-informed` → `acknowledge(d)`.
3. **Driver screen ≠ operator screen.** Managerial ("secret") things such as adding yards must not be on the driver's screen — the owner thinks this comes with the proper, detailed, **scoped RBAC**.
4. **The "Start trip" button is visible to the DRIVER and not to the operator.**
5. **The intended flow:** the driver receives the notification that he is assigned to a trip; at the planned start he sits in the truck, opens his account on our site and clicks **Start trip**; then, **when he leaves the starting point (lat / lng, 100 m radius) the sensor sends data and we mark that the trip has actually started.**

**What exists today (facts checked in code / contract, 2026-09-25) — so the future work starts from truth:**

- Trip status enum = `planned | in_progress | completed | cancelled`; there is NO acknowledgment / "informed" state. The operator-facing `TripDetailModal` has Start / Complete buttons and `StopActions` (manual arrive / depart); backend step 4 already has a **sensor → trip bridge** (positions inside yard geofences mark stops arrived / departed; `trip:update` socket events) — but NOT a "left the origin within 100 m" rule.
- **Odometer / distance are manual today:** vehicle `odometer_km`, trip `odometer_start_km` / `odometer_end_km` (typed on New trip / Start / Complete), fuel-log and maintenance-log `odometer_km` (typed), trip planned distance typed; `actual_distance_km` is stored (some real trips have it; where it comes from should be re-checked). The Fuel report's economy and the "distance vs plan" KPI depend on these numbers.
- **Drivers are records, not users:** a driver has name / email / phone / licence …, but no login (no `user_id` link). "Driver opens his account on our site" therefore needs **driver user accounts linked to driver records** (invite / role) — a backend + RBAC foundation, not just a screen.
- **RBAC:** Fleet is all-or-nothing (`all-fleet`; backend B12 granular fleet permissions was deferred by backend's owner); the app has an RBAC module (`Rules & Permissions`, `rbac.yaml`). The design doc already promises permission hooks in the frontend (D-8).
- **Notifications:** the socket event `notification:new` exists on the backend but the frontend has NO listener / bell / notification centre (deferred Rule Builder "system notification"); email works through Rule Builder actions; SMS untested.
- A trip already carries origin / destination coordinates ("Pick on map") and yards have `radius_m` with an auto-geofence; a **company setting for the start radius** (default 100 m) fits the "no hardcoding" rule.

**Open questions to ask the owner when we start (recommended option first):**

- Enum values and states: `not_informed` → `informed` (notification sent) → `acknowledged`? Who is allowed to re-send? What if the driver never acknowledges (reminder, escalate to the operator)?
- The two-step start: driver taps Start (a new state, e.g. `ready` / `started_by_driver`?) and the trip becomes `in_progress` only when the first position outside the 100 m origin radius arrives. What if the driver taps Start but never leaves (timeout / cancel)? Is there an **operator override** (an exception path) or is the operator's Start removed completely? (Removing the operator's Start changes an existing screen → ask first, tell backend first.)
- Distance source: GPS trail along the actual path, a routed distance between the start and end points, or both (planned = routed estimate, actual = GPS trail — keeps the "distance vs plan" KPI meaningful)? What when the vehicle has no tracker?
- Odometer: vehicle odometer becomes derived (opening value + trips) and the manual odometer fields on vehicle / trip / fuel-log / maintenance-log forms become read-only or optional-correction? (A change to existing forms and to the fuel-economy inputs → ask first.)
- Driver experience: which screens exist (My trips, trip detail with Acknowledge / Start / Arrive / Depart, my compliance documents, report an incident?) and what is hidden (yards, geofences, vehicles management, analytics, settings, other drivers' trips).
- Notification channel(s): in-app bell + email now; SMS / push later?

**Dependencies / rough shape (for a future backend proposal, flow 08):** trip acknowledgment field + endpoints (driver-only `acknowledge`, `driver-start`), notification on trip create / assign (socket + email), driver ↔ user linkage and a `driver` role, scoped permissions ("own trips only"), the departure rule at the trip origin (company setting `trip_start_radius_m`, default 100), odometer automation (vehicle odometer updated at trip completion, trip start odometer = vehicle odometer, distance from telemetry), audit of all of it. Frontend: role-aware navigation and route guards (`FleetNav` / layout), permission hooks, a driver-first "My trips" area, notification bell + centre, disabling the manual odometer inputs — each as its own announced step.

**Suggested order (my recommendation, decide with the owner):** (1) scoped RBAC + driver accounts (foundation) → (2) trip acknowledgment + notifications → (3) driver "My trips" screen with Acknowledge / Start and the sensor-confirmed departure → (4) automated odometer and trip distance → (5) operator-side adjustments (remove the operator's Start, hide managerial actions from the driver). Standing rules apply throughout: never break what works (ask, then inform backend), the best enterprise UI (design first, dark + light, all states), no hardcoded locale / units / currency, feature-request flow (assess → mock → ask → round-trip → integrate → test). Memory: `trip-lifecycle-driver-experience-notes`. Gap rows G22–G26 below.

### Details (newest first — kept as the working log)

**PENDING — owner asked (2026-09-25 ~16:10 PKT) to finish these BEFORE they paste the sync folder to backend; needs a connected Chrome (the owner closed it; extension offline):** (1) axe + eyeball on Overview / Utilisation / Compliance / Settings, light AND dark, incl. the donut-legend fix and the `a11y-muted` class on the Overview; (2) screen-reader check (use the accessibility tree via `read_page` as a proxy — a real listening test is not possible for me); (3) populated year-over-year: seed throwaway ZZ fuel logs / trips dated Sept 2025, compare `cmp=year`, delete them; (4) `uk` on the older screens + yard-create / slot-editor under `us` (one more temporary unit switch: `us` → `uk` → `metric`); (5) yard + driver scope on trips that have them (find a yard with a checked-in vehicle; a driver with trips); (6) the vehicle picker at 10,000 vehicles (throw-away mock `scratchpad/vehicles-mock.js` on port 8099 + an XHR `open` patch redirecting `localhost:8080/api/vehicles/options`); (7) **owner said YES: save `Asia/Karachi` as the company timezone via the Fleet settings page** (then re-check Overview / Trips / Fuel; bucket days now start at Karachi midnight) — **and KEEP `/legacy`** for now. Then: re-snapshot the sync folder (git tag + copy) and tell the owner.

**END-OF-DAY SUMMARY 2026-09-25 (afternoon → evening, session after the 13:55 hand-over) — everything done, in order, with commits (all pushed; the individual DONE entries below have the details and the verification lists):**

| #                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | What                                                                                                                                                                                                                                                                       | Commit(s)            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Backend's 14:45 folder pasted, diffed (nothing of ours dropped; backend had renumbered our §25–§29 → §27–§31), contract 319 → 324 ops (+5: `/fleet/analytics/{fuel,fuel/export,maintenance,compliance,compliance/export}`; `GET/PUT /fleet/settings` gained `unit_system`) | `efc03f9`            |
| 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **U1 `unit_system` verified on the REAL field** (owner-approved temporary `us` → `uk` → `metric`; settings row `updated_at` moved)                                                                                                                                         | (verification)       |
| 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **B6 Fuel & efficiency** on `GET /fleet/analytics/fuel` (hooks `useFuelReport`, screen rebuilt; `StackedColumns integer` prop)                                                                                                                                             | `5659563`            |
| 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **B7 Maintenance + Compliance** (`useMaintenanceReport`, `useComplianceReport`, `ComplianceView`, `MaintenanceHistoryView` rebuilt, Schedules due-date bar; `useKpiColumns(count)`)                                                                                        | `8cb2639`            |
| 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Docs: flow 07 §33, STATUS, task.md, design doc §9c                                                                                                                                                                                                                         | `52d9eca`            |
| 6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Company currency instead of a hard-coded `$` on the vehicle Maintenance / Fuel record lines (owner: "yes switch it")                                                                                                                                                       | `e9d2271`            |
| 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **Scope filter bar** (Radix Popover + cmdk installed): `useAnalyticsScope`, `ScopeBar`, scope param in all report hooks + exports, `FleetNav` carry                                                                                                                        | `822525f`            |
| 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Docs: flow 07 §34 (asks A / B / C), findings row (economy question OPEN), STATUS                                                                                                                                                                                           | `021e079`            |
| 9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **`compare=previous_year` + Group by** (`cmp=year`, `interval=`) in `FilterBar` / `useAnalyticsFilters`; Overview summary sends `previous_year`                                                                                                                            | `6282b40`            |
| 10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Docs: §34.5 (older unit screens verified on the real field; compare-year built)                                                                                                                                                                                            | `2d11e98`, `9a6a676` |
| 11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Accessibility pass** (axe-core injected in the page): canvas role, scoped AA muted colour, `KpiTile` overlay button, donut legend                                                                                                                                        | `98db152`            |
| 12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Pending-checks list + owner decisions (timezone YES, keep legacy)                                                                                                                                                                                                          | `470d4e0`            |
| 13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | End-of-day documentation: this block, ⭐ TODO TRIP LIFECYCLE notes (G22–G26), CLAUDE_FRONTEND_CONTEXT addendum 4, design doc D-14…D-17, flow 07 §35 status index, memory                                                                                                   | (final docs commit)  |
| **Owner decisions given today:** order B6 → B7 → scope bar; OK to switch the real company unit temporarily (twice); downtime days NOT asked from backend; use the company currency; make sure backend answers the economy question; any library is fine if it meets the UI rule; **save Asia/Karachi (pending); keep /legacy**; document + push everything; the trip-lifecycle notes are notes only. **Lessons (also in memory `fleet-test-recipe`):** axe-core can be injected with a `<script>` from jsdelivr into the page or a same-origin iframe; nine hidden iframes in one call crashed the dev server (dev-safe restarted it) and Chrome; the screenshot tool crops and coordinate clicks can miss at devicePixelRatio 1.25 — click by `find` ref or dispatch events; cmdk arrow / Enter tests need one key per call; a mouse resting on a list re-selects the hovered item; `prettier --write src/hooks/*.ts` formats files you did not intend to touch — pass explicit paths; a repo-wide `replace` of a string can also rewrite the OTHER side's quoted text in the sync folder — restore it from git. |

**DONE 2026-09-25 (~16:00 PKT) — ACCESSIBILITY PASS (axe-core run in the page on the analytics pages).** Found + fixed: (1) chart canvases carried an unlabelled `role="img"` inside their labelled wrapper → `role="presentation"` on the canvas (`charts.tsx`); (2) muted text `text-ink-2` failed WCAG AA (light 3.4:1, dark 2.9:1) → a scoped `.a11y-muted` class in `src/index.css` (light `#5a6570`, dark `#7f8994`, ≥ 4.6:1 on every surface) applied on `PageScroller` and the Overview scroller — the app-wide `--color-ink-2` is UNCHANGED (a global token change would need the owner's OK; propose it in the global UI pass); (3) clickable `KpiTile` was a button wrapping the info button (nested-interactive) → a card with an overlay button, info button re-enabled above it (verified: tile click toggles the filter, info opens its popover without toggling); (4) the donut legend dimmed empty classes with row opacity (text below AA) → only the swatch is dimmed. **axe result after fixes (light, Fuel + Service history): 0 violations; Trips / Schedules only showed the transient 60 %-opacity "refreshing" state.** **NOT verified in a browser (the owner closed Chrome, extension offline at 16:00):** the donut-legend change, the `a11y-muted` class on the Overview, axe on Overview / Utilisation / Compliance / Settings, and the whole pass in DARK mode; also still no screen-reader listening test. **Resume: reopen Chrome (extension connected), run axe on those pages light + dark, eyeball the muted text in both themes at ≥ 1600 px.** Dev server was restarted on a clean `.next` at 15:58 and is running.

**DONE 2026-09-25 (afternoon, ~15:50 PKT) — `compare=previous_year` + GROUP-BY CHOOSER (commit `6282b40`) AND THE REAL-FIELD UNIT PASS OVER THE OLDER SCREENS (owner allowed a second temporary switch; company saved `us`, read, restored `metric`, PUTs carried only `unit_system`).** **Filter bar:** `useAnalyticsFilters` gained `compareMode` (`cmp=year`), `prev` follows the mode (same dates − 1 year, 29 Feb → 28 Feb), `interval` / `intervalOptions` (only intervals ≤ 92 buckets via `bucketCount`), `compareParam`; `FilterBar` shows "Prior period | Last year" and "Group by Auto | Day | Week | Month" (only on Trips, Fuel, Service history via `AnalyticsShell intervalControl`); hooks `useTripsReport` / `useFuelReport` / `useMaintenanceReport` take `compareMode` + `interval`, `useOverviewData` sends `previous_year`; `FleetNav` carries `cmp` everywhere and `interval` to the three reports. Verified: requests `compare=previous_year`, `interval=week|month`, Overview previous dashboard window 2025-08-27..2025-09-25, one-row bar at 1536, wraps cleanly at 820, no overflow; **NOT verified: a populated year-over-year comparison (real data has nothing a year ago).** **Older unit screens verified on the REAL field under `us`:** vehicle detail (52.5 ft, 277 mi, mph), fuel tab (621 mi, add-fill defaults to gallons), maintenance record `PKR 150`, edit form labels (MI / GALLONS / FT / LB, 52.49 ft for 16 m), fuel-log RecordForm (621.37 mi), trip detail (50 km → 31.1 mi, 62.652 → 38.9), New Trip placeholders (mi), geofence + yard radii in ft (150 m → 492 ft), map popup `Speed: 7 mph`. **Still not verified on the real field:** `uk` beyond the Fuel page, yard create / slot editor forms. Extra C2 / C3 list filters (vendor, service type, cost range) were deliberately NOT built — the tables' search already matches vendor / service. Sync: flow 07 §34.5, STATUS; a copy is owed to backend.

**DONE 2026-09-25 (afternoon, ~15:40 PKT) — SCOPE FILTER BAR BUILT (Trips, Fuel, Maintenance) + COMPANY CURRENCY IN THE VEHICLE RECORD LINES (commits `e9d2271`, `822525f` + docs; not pushed).** Owner: "any library, just keep our UI rule" → added **`@radix-ui/react-popover` + `cmdk`** to `package.json` (Radix popover was already a transitive dep; cmdk is new — both fit the global UI pass). **Built:** `components/analytics/useAnalyticsScope.ts` (URL-synced `?category=&vehicle=1,2&yard=&driver=&costcentre=`, API params `vehicle_category` / `vehicle_id` / `yard_id` / `driver_id` / `cost_centre`), `components/analytics/ScopeBar.tsx` (pills + "Add filter" menu + searchable pickers, single / multi, server-side search on `/vehicles|yards|drivers/options?include_inactive=1`, labels resolved from detail endpoints for bare URLs, cost centre hidden until `/fleet/options` returns `cost_centres`), `AnalyticsShell` `scope` / `scopeHints` props, scope param on `useTripsReport` / `useFuelReport` / `useMaintenanceReport` / `useCompanyLogs` / `useMaintenanceSchedules` (also in CSV export params), `FleetNav` carries scope only to pages that honour it (`SCOPE_CARRY`). **Fields per page:** Trips = category / vehicles / yard / driver (trip's OWN driver) / cost centre; Fuel = category / vehicles / yard / cost centre; Maintenance (Schedules + Service history) = category / vehicles only (C1 / C2 accept only those); Compliance, Overview, Utilisation = none. **Verified live:** vehicle 2 + Semi-Trailer → Trips 6 (fleet 26), Fuel 80 L / 1 fill, Schedules 1 of 2, Service history 1 of 2 = API; requests + exports carry the params; chips resolve names from a bare URL; carry-over between reports; widths 820 / 1920 with five chips; dark + light; keyboard (arrows / Enter / Esc); popover fits the available height. **Currency:** `VehicleDetailModal.tsx` Maintenance / Fuel record lines now `PKR 45.5` (company currency) instead of `$45.5` (verified with throwaway logs, deleted). **NOT verified:** yard / driver scope on trips that actually have them (real data has none), thousands of vehicles in the picker, screen reader, `costcentre` (hidden until backend ask A). **Sent to backend (flow 07 §34):** asks A `cost_centres` in `/fleet/options`, B `yard_id` + `cost_centre` on C1 / C2, C question on B4 scope; §33.5 economy question REMAINS OPEN — **REMIND THE OWNER when they paste our folder to backend to ask backend that question specifically.** **Left on the frontend:** `compare=previous_year` + interval chooser (FilterBar), extra C2 / C3 list filters (`service_type`, `vendor`, `min_cost` / `max_cost`, `payment_method`), a real-field pass over the older unit screens (needs another temporary unit switch — ask first), keyboard / screen-reader pass, Drivers & safety (B8), Ledger (E), saved views (F2).

**DONE 2026-09-25 (afternoon, ~15:30 PKT) — BACKEND 14:45 COPY MERGED; U1 VERIFIED ON THE REAL FIELD; B6 FUEL + B7 MAINTENANCE / COMPLIANCE INTEGRATED (commits `efc03f9` docs merge, `5659563` B6, `8cb2639` B7 + the docs commit after them; not pushed).** Backend had already merged our §25–§29 and renumbered them **§27–§31** (theirs: §25 = B6, §26 = B7, §32 = reply); contract 324 ops (+5 new: `/fleet/analytics/fuel` (+export), `/maintenance`, `/compliance` (+export); only `GET/PUT /fleet/settings` changed = `unit_system`). **Our reply = flow 07 §33; the frontend continues from §34.** **Owner decisions today:** order B6 → B7 → scope bar; OK to switch the real company to `us` / `uk` temporarily (done through the Fleet settings page, restored to `metric`; the row's `updated_at` moved 06:24:54Z → 10:04:01Z); downtime days NOT asked from backend (we show "in the workshop now" + a note). **Built:** `hooks/useFuelReport.ts` + rebuilt `screens/FleetFuelAnalytics.tsx` (six tiles with compare + economy target, economy / price / litres / cost charts, efficiency by category, spend by vendor, "Fill-ups worth a second look" flags worded as _check_, paged fills table with Economy + Check columns, chips incl. "To check", export); `hooks/useMaintenanceReport.ts` + `MaintenanceHistoryView` (six tiles with compare, cost + services per period, cost by service type / category / costliest vehicles, C2 log table kept) + Schedules "When services fall due" bar; NEW `hooks/useComplianceReport.ts` + `screens/ComplianceView.tsx` (`?view=compliance`: rate, six-class donut = table filter, documents-vs-licences bars, expiry outlook with horizon chips, by document type, paged records + export, row → owner's Compliance tab); shared kit additions (both opt-in, defaults unchanged): `StackedColumns integer` prop, `useKpiColumns(count)`. **Verified live (real backend):** real data + throwaway ZZ rows (deleted; real counts back to 12 fills / 2 services); unit switch us / uk / metric on the Fuel page (311 gal, 15.67 mpg, 5.55 / gal, 9.56 / mi; UK 18.81 mpg); chips, sorts, search, exports, donut filter, horizon → `interval=month`, row clicks, dark + light, widths 2560 / 1920 / 1280 / 820, neighbours (Overview, Trips, Utilisation, Settings). **NOT verified:** keyboard / screen reader; compare with real earlier data (real data has none); a real anomaly; `previous_year`; a real-field pass over the older unit-converted screens (trips, vehicles, yards, records, map); the Compliance page with more than one real vehicle document. **Findings to raise with the owner (existing screens = ask first):** (1) hard-coded `$` in `VehicleDetailModal.tsx` lines ~694 (maintenance record) and ~857 (fuel record) — should use the company currency (`useFleetCurrency`); (2) backend observation §33.5 (economy on a fill flagged `odometer_backwards`, sent to backend as a question). **NEXT:** the scope filter bar (design first — show the owner — then build) and the extra list filters, `previous_year`, interval chooser; Drivers & safety after backend B8; Ledger after E.

**DONE 2026-09-25 (afternoon, later) — BACKEND C2 / C3 INTEGRATED.** Analytics → Maintenance now has two views (`?view=history`): Schedules (C1, snapshot) and **Service history** (C2, range-driven; KPIs from `meta.summary`, server table + export, row → vehicle Maintenance tab); NEW **Analytics → Fuel & efficiency** (`/fleet-management/analytics/fuel`, nav entry; C3: KPIs, full / partial chips, cost + price per company unit, export, row → vehicle Fuel tab). Files: `hooks/useCompanyLogs.ts`, `screens/MaintenanceHistoryView.tsx`, `screens/FleetFuelAnalytics.tsx`, `components/analytics/ViewSwitch.tsx`; `AnalyticsShell` `comparable` prop / `FilterBar` `hideCompare`; a 0 total with no priced record shows '—'. Verified live (dark + light, custom range 3 services = 225, exports, chips, sort, rows; a throwaway 10-gal fill converted to 37.9 L / 2.64 per litre and deleted). **Backend-built but unused by the frontend (flow 07 §28.2):** billing / CRM group (25 ops, out of scope → future Ledger), `trips/{id}/gps-trail`, `within_days`; and unexposed capabilities: scope filters (vehicle_category, cost_centre, vehicle_id[], driver_id[], yard_id, customer_id) on the analytics endpoints, `compare=previous_year`, interval chooser, extra C2 / C3 filters, `by_category` / `by_document_type` / `data_quality` / yard `series` / `busiest_bucket` / attention filters. **NEXT proposal: a scope filter bar on the analytics pages.** Reply = flow 07 §28; copy of the sync folder OWED to backend. **NOT verified:** widths ≠ 1536 for the two new views, keyboard, imperial on the fuel page (maths tested in Node only).

**DONE 2026-09-25 (afternoon) — BACKEND SLICE 5 (B5 TRIPS REPORT) INTEGRATED.** Merged backend's 13:16 copy (their new §24 overwrote our §24 / §25 → restored renumbered §25 / §26; snapshot tag `sync-frontend-20260925-1318` + copy in `/home/chirp/projects/fe-convoyai-sync-snapshots/`). `screens/FleetTripsAnalytics.tsx` rebuilt on `hooks/useTripsReport.ts` (one call: KPI summary + previous period + target, series, on-time trend, delay + duration histograms, cancellation reasons, server-paged table with status chips = table only, CSV export), `components/analytics/useKpiColumns.ts` (shared with the Overview), `RankBars` per-row colour / no stub for 0. Verified live (real data, status / sort / search / export / row → trip, 984-day range, dark + light, neighbours re-tested; populated on-time / delay charts only on illustrative numbers via a test proxy because the real data has no planned ends). Reply = flow 07 §27 (stamp in STATUS). **Owed to backend: a copy of the sync folder. Still open on backend: `unit_system` (U1).** C2 / C3 lists and `within_days` are built on the backend but unused by any screen (they wait for the fuel / maintenance report pages B6 / B7). **NOT verified:** a real late trip, `compare=previous_year`, widths ≠ 1536, keyboard.

**DONE 2026-09-25 ~13:00 PKT — PER-COMPANY UNIT SYSTEM (owner: "yes we have to add it"; foreign clients) + BACKEND SLICES 3 / 4 INTEGRATED.** Backend's 11:10 copy merged (nothing of ours dropped; contract 317 ops; B9 yards + geofence summary, C2 / C3 logs, C4 compliance counts built; `trends` has no cap). **Integrated:** Overview yard occupancy (`/fleet/analytics/yards`) + geofence activity (`/geofences/events/summary`) + compliance rows (C4 counts, licence `license_state` totals) — NO "Sample data" left (`sampleData.ts` deleted). **Units (flows/07 U1):** `utils/units.ts` (metric | us | uk; API stays metric; display + typed-input conversion; metric identity is exact — `toDisplayString` never rounds it; tested with a Node script, `node --experimental-strip-types`), `hooks/useUnits.ts`, Fleet settings 'Units' cards + unit-aware distance / cost-per-distance / economy fields (only when `/fleet/settings` returns `unit_system`; missing = metric), new pages + older screens converted (Trips list / detail / create / edit / complete, Vehicles create / edit / detail / fuel + maintenance records, RecordForm `qty`, Yards / Geofences radius + slot length, marker speed, route trail). **Request to backend = flow 07 §24.3 (U1), status = §25 (stamp in STATUS).** **Tested with a local proxy that simulates the field** (scratchpad `unitproxy.js`; real backend only for ZZ records, all deleted; `maintenance_due_soon_km` restored to 500; vehicle 2 `length_m` restored to 16). **WAITING for backend to build `unit_system` — until then nothing changes for anyone.** Owner decisions pending: none new (timezone for their own company still UTC). **NOT verified:** fuel-log create form default unit (gallons for US) and the maintenance-schedule / fuel-log RecordForm edit in imperial were not clicked; Yards create / edit + slot editor in imperial; the map marker popup speed; UK preset beyond the Overview / Settings; a real backend field (only simulated); the legacy hub is unconverted on purpose. **Rounding note:** integer-metre fields (geofence radius) can read back 1 ft off.

**DONE 2026-09-25 ~11:20 PKT — 'NO HARDCODING' (owner: the product may be used by foreign clients).** Audited the new Fleet code: timezone (`/fleet/settings`) and currency (company record) are per-company; `UTC` appears only as the backend's default / fallback; dates use the browser locale. Fixed: Pakistani city names in the sample yard widgets → neutral names; added `components/fleet/TimezoneNotice.tsx` (dismissible strip when the company timezone is still UTC and the browser is not — never auto-applied) and a 'Use this browser's (zone)' suggestion in Fleet settings (fills the field; the operator still saves, with the consequence warning). Verified live (nothing saved). **OPEN DECISION (owner + backend): UNITS.** Backend serves and the UI shows kilometres / litres / km per litre only; a US or UK client would want miles / gallons / MPG. Proposal: a company `unit_system` (metric | imperial) in `/fleet/settings` (backend field) with display conversion in one frontend formatter (`analytics/format.ts` already centralises number formatting; the older Fleet screens format units inline) — ask the owner before building; not started.

**DONE 2026-09-25 ~11:00 PKT — VERIFICATION ROUND + TWO-LEVEL NAVIGATION + OLD-DASHBOARD SWAP (commits up to `5ba8a91`, not pushed; sync note = flow 07 §20, stamp 2026-09-25 10:45 PKT; a COPY IS OWED to backend).** **Owner decisions (2026-09-25 ~10:20 PKT):** navigation design = my call ("best and most beautiful enterprise UI/UX"); old-dashboard swap = approved; company timezone = owner asked how big the change is (answer: NO code change — set it on the Fleet settings page; all Fleet times already render in the viewer's browser timezone, only the server's day-bucketing is UTC; labelling 'UTC' everywhere would be wrong) → **still waiting for the owner's yes to save `Asia/Karachi`**. **Verified:** widths 2560 / 1920 / 1536 / 1280 / 820 on Overview, Settings, Utilisation, Trips, Maintenance (no horizontal overflow anywhere; tables scroll inside their own wrapper at 820; screenshots 820 / 1536 / 1920). Custom range on Overview + Utilisation: invalid range disables Apply, 10 days, 100 days (weekly), 984 days (summary interval=month, trends week — no 422); found + fixed: ambiguous labels on multi-year ranges (year now shown), 'Distance per day' title follows the interval. Scale with a synthetic mock server (10,000 vehicles, 5,000 schedules, 4,000 attention items, 12,483-vehicle donut; backend/data untouched): found + fixed: pager had only prev/next (now first / last / jump-to-page, clamps), Overview attention chips counted the loaded page (now server counts + 'most urgent 50 of 4,000'), Overview Top vehicles downloaded the whole vehicle table (now server top-6 via A8). **Nine Fleet tabs re-tested with real actions (all via the UI, new routed pages):** Vehicles create / edit / deactivate / delete-permanently; Drivers create / edit / deactivate / delete; Yards create / edit / deactivate / delete; Geofences create / edit / disable / enable / delete; Trips create (vehicle → driver preselect) / edit / start / complete / delete-planned; Assignments assign + unassign in the vehicle modal and the row shows in the Assignments tab; Incidents log / edit / delete (driver modal; also in the company list API); Map renders full height and a real tracker packet moved the marker within 3.5 s (realtime hook still works); Overview + old dashboard load; console clean. **Not exercised:** yard slot editor / layout upload, bulk actions + 'select all N', list CSV exports, trip stops editor, the 409 banners (still in the older debt list), keyboard / screen-reader. **Navigation:** `app/(app)/fleet-management/layout.tsx` (FleetNav + `useFleetRealtime` mounted ONCE), `components/fleet/FleetNav.tsx` (segment switch Operations | Analytics, page tabs, 'Fleet settings' entry, range filters carried between Overview and the reports), routes `/fleet-management/operations/{overview,map,vehicles,drivers,geofences,yards,trips,assignments,incidents}`, `/analytics/{utilisation,trips,maintenance}`, `/settings`; `/fleet-management` and `/fleet-management/overview` redirect to `/operations/overview`; the pre-restructure hub (`screens/FleetManagement` + old `FleetDashboard`) is unlinked but alive at `/fleet-management/legacy` (own tab bar, own realtime) for rollback / comparison — **remove it (and tell backend the `unknown` alias can go) only with the owner's OK.** Ledger segment intentionally not shown until it exists. **ZZ test data left behind (add to G19):** completed trip `ZZ-REG-TRIP-1` (id 137, vehicle 2 / driver 2, cannot be deleted), an ended assignment ZZBulk001↔ZZ Bulk Veh 001, vehicle 2's last position moved by a test packet, attention feed shows the ZZ licences. Everything else created during the run was deleted.

**DONE 2026-09-25 ~10:15 PKT (commits `c023c62`, table-paging commit, `1e8a2e2` + sync commit; not pushed) — BACKEND SLICES 2a + 2b + THE §18 FIXES INTEGRATED (preview routes only).** Backend's 09:52 copy was diffed (nothing of ours dropped; contract 304 → 310 ops: new `/fleet/analytics/summary`, `/fleet/attention`, `/fleet/status-summary`, `/maintenance-schedules` (+export), `/fleet/dashboard/vehicle-performance/export`; only `vehicle-performance` changed — opt-in paging/filters) and merged. **Done:** (1) Overview KPI tiles = B1 (no client arithmetic; null → '—'; 'based on N trips' from `on_time_sample`), Needs attention = B2 (server severity filter, `ATTENTION_KIND` labels, entity → modal), fleet status donut = B3 + realtime `fleet:status_summary` (added to `SocketContext` + `useFleetRealtime` — one additive listener), maintenance row = C1 counts (documents / licences rows still from the old lists, no OK segment until C4; yard + geofence widgets still Sample data = B9). (2) New pages mount `useFleetRealtime` (via `AnalyticsShell`; the Fleet hub is the only other mounter). (3) Utilisation vehicle table is SERVER-driven (`DataTable` opt-in `server` mode; A8 page / sort / search; server CSV export). (4) NEW `/fleet-management/analytics/maintenance` (C1: status tiles = filters, server-paged table, export, row → vehicle Maintenance tab; `AnalyticsShell` filters optional — point-in-time page). **Verified live** (dark + light): tiles = server values, severity filter request, status refetch at 1 s (fleet:changed) and ~54 s (A9) after creating/deleting throwaway vehicle 193 (deleted), table paging / sort / search / exports (66-row and 2-row CSVs), tile filter, row modal; old dashboard shows 'no on-time data'; console clean. **Reply to backend = flow 07 §19 (stamp 10:12 PKT): includes our B9 shape proposal (`GET /fleet/yards/summary`, `GET /fleet/geofence-events/summary`) and 'keep the `unknown` alias until told' (old dashboard tab still reads `fleet_status.unknown`). A COPY of the sync folder is OWED to backend.** **NOT verified:** widths other than 1536, keyboard / screen reader, Custom range on the new pages, > 66 vehicles / thousands of schedules, print, Overview realtime beyond the status event, the 9 Fleet tabs beyond a load smoke (no CRUD re-run). **Next (needs owner / backend):** B9 widgets (after backend builds), navigation restructure + old-dashboard swap (owner approval), remaining reports (B4–B8, D1, ledger), the timezone (owner), global UI pass after Fleet.

**DONE 2026-09-25 ~10:00 PKT (commits `f413023`, `322468b`, not pushed) — FLEET SETTINGS PAGE + FIRST TWO ANALYTICS PAGES (all additive preview routes; existing tab bar / old dashboard untouched; sync folder NOT touched — backend was working in it; a flow 07 §14 note is OWED once the owner pastes backend's folder).** (1) `/fleet-management/settings` (`screens/FleetSettings.tsx`, `components/fleetSettings/controls.tsx` = NumberField + searchable TimezoneCombobox with UTC offsets + live "now in <zone>" clock, `components/analytics/PageScroller.tsx`): sections Company time / Live tracking / Working day & delivery / Maintenance planning / Targets; 'In use' vs 'Used by upcoming reports' chips (only timezone, freshness, scheduled hours, grace and the utilisation target are consumed today); client validation mirrors the backend 422 rules; per-field 'Default' reset; timezone-change warning; sticky save bar (changed fields only); 409 via `useEditConflict` (banner scrolls into view + toast); beforeunload guard. **Verified live** dark + light at 1536 px: search 'kara', keyboard pick, invalid 0 → error + disabled Save, real save (PUT body = changed field only, 200), external PUT → 409 banner naming the editor, Reload latest shows the fresh value. **Data left behind:** the company now HAS a fleet_settings row (all values back to defaults: idle 5, timezone still UTC) — `is_default` is now false. **The owner has NOT set the real timezone (Asia/Karachi) — their call; question raised: owner asked whether it belongs beside the company info in Account settings → answer: today it lives in backend fleet settings (not the companies table); moving it = a backend/product decision, ask first.** (2) `/fleet-management/analytics/utilisation` and `/analytics/trips` (`screens/FleetUtilisation.tsx`, `FleetTripsAnalytics.tsx`, `components/analytics/{AnalyticsShell,DataTable}.tsx`, `hooks/useAnalyticsData.ts`): AnalyticsShell = title + page switcher (Overview | Utilisation | Trips & delivery, query string carried) + shared FilterBar; DataTable = search, sort, client paging, CSV export (verified: sort, search, 66-row export). Utilisation: 4 KPIs + deltas, trend with target line, distance per day, per-vehicle table (row → vehicle modal). Trips: 4 KPIs, trips by outcome, outcome mix donut. Overview KPI tiles Utilisation / On-time now link to the pages. **Deliberately NOT built / not faked:** day×hour heatmap + moving/idle/parked hours (need backend D1), trip-level table + delay distribution + cancellation reasons (need B4 — the trips list's date filter matches actual OR planned start, so it would not reconcile with the KPI counts), server paging of the vehicle table (needs A8 — today it is loaded whole, then paged client-side). **NOT verified:** widths other than 1536, keyboard/screen-reader pass, Custom range on the new pages, thousands of vehicles, realtime refresh. **Still owner-gated:** navigation restructure (Operations / Analytics / Ledger tab bar), replacing the old dashboard, the timezone, the two open findings (on-time 0→null, variance), next backend slice.

**DONE 2026-09-25 ~09:12 PKT (commit `e878b53`, not pushed) — NEW FLEET OVERVIEW + ANALYTICS WIDGET KIT (preview route `/fleet-management/overview`, built ALONGSIDE the old dashboard; nothing existing touched).** Owner said "continue with the recommended things" then "you can resize or test however you want". Files: `src/components/analytics/{theme,format,chartSetup,states,MetricInfo,WidgetCard,KpiTile,StatusDonut,charts,bars,Worklist,FilterBar,useAnalyticsFilters,sampleData}`, `src/hooks/{useFleetSettings,useOverviewData}.ts`, `src/screens/FleetOverview.tsx`, `app/(app)/fleet-management/overview/page.tsx`. Visually reviewed dark + light at 820 / 1280 / 1536 / 1920 px wide, forced empty / loading / error / refetch states (throwaway harness route, deleted), tooltips, definition popover, table twin, custom-range popover, single-day range, compare off. Bugs found + fixed during review: single-slice donut drew an empty ring, chart y-axes showed fractional counts, curved lines invented shape between daily points (now straight), BucketBars truncated labels, KPI tile chip wrapping, custom-range popover shifted the toolbar, donut legend truncated in narrow cards (now container-width based), Tailwind `min-[1760px]` lost to `lg:` in the cascade (KPI columns now from container width), tooltips now value-first with line keys. **Widgets on REAL data:** KPIs (availability, utilisation, on-time (guard: 0 → "—", flows/07 §12.3), cost per km (client-side total_cost ÷ distance until B1), fuel economy, open issues), fleet status (no_tracker split + tracker coverage), needs attention (alarms + expiring documents + licences + silent trackers; "Show all N"), trips per day, utilisation trend (target line from `/fleet/settings`), incidents by week, cost breakdown, top vehicles. **Sample-data chip until backend C1 / B9:** maintenance & compliance, yard occupancy, geofence activity. Replacement map (which backend row retires which client-side work) is in flow 07 §13.2. **NOT verified / TODO:** keyboard-only walk-through and screen-reader pass; the custom-range Apply flow end to end; performance with thousands of rows (the widgets are bounded but the data hook was only run on ~66 vehicles); print; the on-screen skeleton on a slow network (only forced in the harness); light-mode chart tooltip; realtime refresh of the Overview on a live trip / position event. **Pre-existing app warnings seen in the console (not mine, untouched): a hydration mismatch on `<html className="light">` (ThemeProvider sets the class after SSR) and a missing `key` in `LeftSidebar`.** **Shell note for the owner:** every page scrolls as one document (the sidebar scrolls away with long pages); the Overview scrolls inside its own container so the shell stays put — changing the shell for all screens would be a global change (needs the owner's OK). **Browser-tool lessons (memory `fleet-test-recipe`):** `resize_window` opens a NEW window WITHOUT the session (owner must log in again there; never close that tab); the screenshot is a 1:1 crop of the top-left ~1254 px of the viewport → to see a 1536-wide layout set `documentElement.style.transform='scale(0.816)'` (origin 0 0, width 1536px); to review other widths inject a same-origin `<iframe>` of the page at 820 / 1280 / 1920 px and scale it. **NEXT (owner OK where noted):** Fleet settings page (timezone, freshness, idle threshold, scheduled hours, on-time grace, maintenance window, KPI targets — additive; the owner sets the real timezone there, e.g. Asia/Karachi); two-level navigation Operations / Analytics / Ledger (modifies the existing tab bar → OWNER APPROVAL FIRST); Analytics pages (Utilisation, Trips & delivery, Fuel & efficiency…); wire each backend row as it turns BUILT; then replace the old dashboard only after the owner approves the switch.

**STATE 2026-09-25 ~08:40 PKT — BACKEND ANSWERED FLOW 07 (§10 facts, §11 slice 1 BUILT); our reply is §12.** The owner approved **A1–A7 directly with backend** and backend built **F1 fleet settings + A1–A7** (contract 304 operations; `GET/PUT /fleet/settings`; trips by actual-else-planned start, `no_tracker` status split with `unknown` as deprecated alias, full-tank fuel economy, maintenance in the cost breakdown, utilisation in-service × scheduled hours, `distance_source` / `utilisation_basis`, local-date buckets `meta.timezone` (still UTC — the owner has not set the company timezone), Monday-aligned weekly buckets, `age_seconds` / `fresh` on positions). **Frontend re-tested everything live** (existing dashboard handles all changes with NO code change; 8 Fleet tabs + 8 other module screens load without errors — shallow) and sent two findings (§12.3): `on_time_pct` is 0 instead of null when no completed trip has a plan (existing screen now shows a false "0% on-time"), and planned-vs-actual distance variance mixes trip sets — **fixing them changes existing numbers, so the owner must approve; backend will ask**. NOT built yet: A8, A9, B0–B9, C1–C4, D1–D4, E1–E4, F2, F3 (**the owner picks the next slice**; backend recommends B3 → C1 → B1 → B2 → A8 → A9). Backend facts (§10): only lat / lng / speed / heading have fleet roles (ignition / odometer / fuel level need a role-mapping extension = owner decision), `device_positions` kept forever, `device_values` 12 months, no company timezone (buckets UTC), billing tables (invoices, billable events, rate cards) already hold what revenue + receivables need, no generic attachment endpoint (R2 exists), fleet has one permission; backend recommends ledger void-with-reason, single company currency. Frontend proposals awaiting the owner: a small **Fleet settings** page (set timezone `Asia/Karachi`? freshness, targets) — additive; start the mock-based Overview / widget kit ("go"). **A copy of `backend_frontend_sync/` is owed to backend.** Still true: don't touch the existing dashboard code; the new Overview is built alongside it.

**⭐⭐ STANDING OWNER RULE (2026-09-25 ~08:25 PKT, "very important"): DO NOT BREAK WHAT ALREADY WORKS — the whole project (every module, not only Fleet), both sides (frontend + backend). The owner has tested the project and it works. If anyone needs to change anything that already exists (an existing endpoint / number / screen / shared component / hook / config, or fixing a bug in existing behaviour), FIRST ASK THE OWNER (what changes, who is affected, recommended option, rollback), and only after their yes inform the other side in `backend_frontend_sync/`. Purely additive, opt-in work (new endpoint / optional param / new route / new component) is fine but must not alter existing behaviour. Before "done": `git diff` review, `tsc --noEmit`, live check of the neighbouring features that share the code, say what was not regression-tested; no drive-by "improvements"; if something existing breaks: stop, tell the owner + the other side, restore first. Full text: `backend_frontend_sync/README.md` "STANDING OWNER RULE"; memory `never-break-existing-ask-owner-first`; `FLEET_ANALYTICS_DESIGN.md` D-13. Consequences now: flow 07 A1–A9 (they change existing dashboard numbers) and replacing the old Fleet Dashboard need the owner's approval first — the new Overview is built ALONGSIDE the old dashboard.**

**⭐ STANDING OWNER REQUIREMENT (2026-09-25 ~07:57 PKT, "very important"): UI QUALITY IS NON-NEGOTIABLE — the owner wants the BEST and MOST BEAUTIFUL enterprise-grade UI; "we can't compromise on UI".** Applies to EVERYTHING built from now on (Fleet dashboard / analytics / reports / ledger first, then bringing the rest of Fleet up to the same bar). The full bar, process and checklist are in `FLEET_ANALYTICS_DESIGN.md` §0 (best-in-class polish, tokens only, crafted charts, every state designed, dark + light, ≥ 1600 px wide review, accessibility, load the `dataviz` skill before chart code, screenshot-review before "done", say what was not visually verified). Memory: `ui-quality-bar-non-negotiable`.

**One paragraph.** Fleet owner-flow is complete and the **enterprise-readiness** work is now built end to end against everything backend has BUILT (contract 302 operations): server-side lists / options pickers / bulk / export / restored filters / edit+delete of every record / paged detail tabs / audit line (B1–B4, B6, B9–B11) **plus, this session: B5 trip-stop editor, B13 optimistic concurrency (409 banner), B7 status count chips + company-wide Incidents tab, incident driver/vehicle briefs, C14 guarded permanent delete (single + bulk) for vehicles / drivers / yards.** B12 (granular permissions) is **deferred by backend's owner** (fleet stays all-or-nothing). **B8 (map `bbox`) was BUILT by backend at 06:15 and is now integrated too (07:10) — every ask of flow 06 is built or deferred.** Backend's decision list **L1–L6 (flow 06 §30): the owner said "do it" for all six; backend BUILT them (§34, D-0182) and the frontend re-tested them live and integrated the one change needed (dashboard overview sends `fleet_only=1`) — reply §35; nothing waits on backend.** Still asked of us later: the ledger / reports / graphs / analytics WISHLIST (§30.3) — owner: after the current enterprise work. Our reply is flow 06 **§35**, sync stamp `2026-09-25 07:34 PKT, by frontend`; **a copy of `backend_frontend_sync/` is owed to backend** (the owner pastes it to them, then brings their reply back).

**Git (older note, superseded by line 9 above):** the B5 / B13 / B7 / C14 / Incidents / B8 feature commits are `fd73525`, `31479ce`, `d9e9310`, `404dbf9`, `75b9822`, `945252f`; the analytics Overview is `e878b53`; everything since `10e1095` is unpushed.

**Do this at the start of the next session:**

1. Read memory `MEMORY.md` (esp. `fleet-enterprise-readiness`, `fleet-enterprise-gap-list`, `fleet-frontend-architecture`, `fleet-test-recipe`, `owner-working-preferences`, `backend-frontend-sync-process`, `verify-live-not-code-only`), then this section and the gap list below.
2. If the owner pastes backend's folder: diff it against HEAD FIRST (`git status --short`, `git diff --numstat HEAD -- backend_frontend_sync`, `sed -n 3p backend_frontend_sync/STATUS.md`, removed-line counts for flow 06; restore any of OUR lines it dropped from git; never Prettier `backend_frontend_sync/`; never hand-edit `api_contract/`). Semantic contract diff: parse old (from `git show HEAD:…`) vs new `api_contract/openapi/*.yaml` with python `yaml` and compare parameters / requestBody / responses per operation (finds CHANGED existing endpoints). Backend renumbers our replies if numbers collide — continue from the highest number they state (next = §30). Then tell the owner in ~5 lines what backend answered / what is BUILT / what changed, and build ONLY against BUILT rows. Expected next: nothing from backend is open — wait for the owner (next enterprise / IoT step, or the ledger / reports wishlist section: ask the owner one question at a time; §30.5 note: crossings are detected only from positions inside each packet).
3. Otherwise (no new backend reply) the buildable work is **frontend-only and needs the owner's go** — G14 multi-select trip status, G15 URL-synced list state, G13 compliance list on server params, G18 polish (skeletons, a11y, light theme, saved views), G20 imagery — plus the **verification debt** below. Don't start the deferred backlog.
4. Verify every change LIVE in the real app (never demo account); list anything not exercised as compulsory deferred verification. Log in flow 06 (next section number), bump `STATUS.md`, tell the owner a copy is owed to backend. Commit in logical buildable commits with the trailers; stop the dev server + clear `.next` + close my Chrome tab when handing off.

**Verification debt (compulsory, not exercised live) — B8: a real view with > 2,000 trackers / > 500 yards or geofences (the truncation notices were forced with `limit=1`; the yard/geofence page-cap notice was never reached).** (The Map in light theme was checked 2026-09-25 ~07:30 PKT: markers, yard icons, geofence circles, vehicle popup + trail, the truncation notice and the empty-area hint all fine; the hint got the same shadow/contrast as the notice.) Earlier items: the "select all N matching" UI path for permanent delete (needs > 1 page; backend semantics checked by API: `include_inactive:0` honoured); the 409 banner on the yard / geofence / trip / driver edit forms and the slot edit / move 409 toast (same shared `useEditConflict` / `fleetConflict` helpers as the vehicle / fuel-log forms that WERE clicked); a real sensor "System" write producing a 409; over-cap (500) bulk 422; the ≤ 100 stops limit; the Incidents tab on a page with > 20 rows. **Light theme (owner asked, checked 2026-09-25 ~06:45 PKT in a small ~1250 px window): Dashboard, Map, Vehicles + count chips, Drivers + bulk bar, Yards modal, Geofences, Trips + stops editor + error, Assignments, Incidents, the 409 banner and the delete-permanently confirm all look fine; two small fixes were made (delete-confirm no longer squeezes the Edit button; Incidents header matches the other tabs). NOT checked: the geofence events column at full window width (needs a wide window — stays in G18).**

**OWNER'S PLAN FOR THE REMAINING FLEET ITEMS (2026-09-25 ~06:40 PKT, verbatim intent: "keep that in todo … we will do all these remaining things of fleet after we are done with the current things of making this fleet module a proper enterprise IoT automated fleet management system"):** FIRST finish the current enterprise / IoT-automation work (backend's B8 map `bbox` and whatever the owner adds next); ONLY THEN do, in one go, the frontend-only leftovers — **multi-select trip status (G14), URL-synced list state (G15), polish (G18: skeletons, a11y, light theme, saved views) and imagery (G20)** — and the **ZZ test-data cleanup (G19) comes last**. Do not start these earlier unless the owner says so. (2026-09-25 06:40: while backend reads our folder, the owner asked for a light-theme visual check of Fleet — bug fixes for what I built this session are in scope; broader polish stays G18.)

**TODO — explicit owner-requested checks (2026-09-25 ~06:50 PKT; do them together with the polish batch, or earlier if the owner asks; both are verification only, fix whatever they reveal):**

- [ ] **Geofence events column at full window width** — visual check in BOTH themes in a wide window (≥ 1600 px; the MCP window was only ~1250 px so it could not be judged). Belongs to G18 polish.
- [ ] **Untested Fleet edit forms / slot actions** — click the 409 "changed by someone else" banner on the **yard, geofence, trip and driver** edit forms, and the **slot edit + slot move** conflict toasts (recipe: open the form, `PUT` the record from outside ≥ 1.1 s later, then Save; for the slot toasts patch `XMLHttpRequest.send` to send an old `expected_updated_at`). Only the vehicle and fuel-log forms and the geofence enable/disable toggle were clicked so far. The rest of the verification debt (delete "select all N matching", real "System" 409, 500-cap bulk, 100-stop limit, Incidents > 20 rows) is listed just above.

**Open owner decisions (ask with a recommended option when reached; do NOT ask unprompted):** G14 multi-select trip status (recommend yes); G15 URL-synced list state (recommend yes, page size 20); G17 document attachments; G18 saved views / a11y / skeletons / light theme; G20 imagery & polish (vehicle photo map markers + initials avatars are the safest start); G21 yard-slot "deactivate" (owner 2026-09-25: keep refusing deletion of slots with history now; ask again later); G13 low value. Decided this session: company-wide Incidents = a **Fleet tab** (owner: incidents are fleet-only; platform-wide alerts belong to Alarms / notifications — a global cross-module inbox is a possible later product decision); hard delete = **secondary "Delete permanently"** (Deactivate stays primary), single + bulk.

**Deferred backlog (owner: do NOT start unless told):** Rule Builder system notification (`notification:new` listener + bell), dead per-row Active toggle in `RuleBuilder.tsx`, Rule Builder SMS live test, onboarding step-3 "Don't Skip" lock, fleet extras (alert rules / notifications, ledger / reports / analytics, bulk CSV import for vehicles/drivers, driver app, ETA). CRM / customers / billing out of scope. G19 (ZZ test-data cleanup) happens LAST.

**Frontend code map (details in memory `fleet-frontend-architecture`):** lists = `hooks/useServerList` (+ `useTripsList`, `useListState`, `useSelection<T>`, `useBulkAction` + `bulkTargets`, `useServerExport`, `useOptions` + `components/OptionSelect`, **`useStatusCounts` + `components/list/StatusChips`**); realtime = `hooks/useFleetRealtime` (coalesced; `trip:update` also refetches `trips-counts`) + `utils/fleetCache`; records = `components/records/{RecordItem,RecordForm,PagedRecords,DeleteControl,fields,IncidentSummary}`; **concurrency = `hooks/useEditConflict` + `components/ConflictBanner` + `utils/fleetConflict`; stops = `components/TripStopsEditor`; hard delete = `components/PermanentDeleteControl` (via `DeactivateControls allowDelete`)**; `apiHelper` errors now keep `status` / `errors` / `current`; screens `screens/{Vehicles,Drivers,Yards,Geofences,Trips,Assignments,Incidents,FleetMap,FleetDashboard,FleetManagement}.tsx`.

**Environment / test data (company 2, login `junead@chaminade-hs.org`; the owner logs in MANUALLY in the MCP Chrome tab — I may not type the password; the session persists across dev-server restarts).** Dev server: `npm run dev` in the background (log to the scratchpad), then `curl -s --max-time 90 localhost:3000/fleet-management` once to compile before opening the tab (route **`/fleet-management`**); backend `http://localhost:8080` (separate Claude session). Stop recipe: kill the `npm run dev` / `dev-safe` / `dev-monitor` wrappers first, then `next dev` / `next-server`, `rm -rf .next`, close my Chrome tab, report RAM. Never `next build` while it is up. Test-recipe: memory `fleet-test-recipe` (in-page `fetch` with `localStorage.token`; browser tool blocks outputs that look like query strings / cookies — sanitize with `.replace(/[^A-Za-z0-9 .,':-]/g,'_')`).
Seeded `ZZ` data (clean up at the very end — G19; leave the owner's own vehicle "truck 1" id 1 and driver "john doe" id 1 alone): vehicles 2, 3, 5, 11, 14 + `ZZ Bulk Veh 001–060` (vehicle 15 has a test photo, maintenance log 81, ~11 fuel logs) + 157 `ZZ Audit Veh` (deactivated); drivers 2, 3, 4, 6, 9 + `ZZBulk001–040` + 124 `ZZAudit` (deactivated); yards 1, 2, 7–10 + `ZZ Bulk Yard 001–030`; ~33 geofences; ~43 trips (mostly completed / cancelled `ZZ-TRIP-*`, `ZZ-BULK-*`, plus cancelled `ZZ-B5-TEST` id 127 and `ZZ-BULK-CHIP` id 129); product 118 "ZZ Tracker Product"; driver 2 has an EXPIRED "Medical Certificate" document; company currency PKR. This session's throwaway vehicles / driver / yard / incidents were all deleted again (hard delete now exists for never-used records — useful for G19). Vehicle 15's cost centre was restored to empty. **Left over from the L1–L6 re-test (07:34 PKT): vehicle 187 `ZZ L4 Veh A` (deactivated, has yard check-ins so it cannot be hard-deleted) and yard 126 `ZZ L5 Yard` (deactivated, its slot has check-in history; its layout image is a test PNG) — clean up in G19. ZZ tracker 1 (`ZZTRK0000000001`, vehicle 2) was moved to ~31.9 N 75.0 E during the B8 test.**

**Process rules that are locked in (memory `owner-working-preferences`):** decisions via choice lists with a recommended option first (answer the owner's clarifying questions inside their answers before proceeding); verify live before saying done; logical buildable commits with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` + `Claude-Session: …` trailers; push only when asked; stage exact files (never `git add -A src`); docs before /clear.

**Suggested opening prompt for the next session:** see the ★ block at the top of this section (it is the current one).

---

## ▶▶▶ FLEET DASHBOARD AUDIT (owner asked 2026-09-25 ~07:45 PKT: "check what it shows, whether the data is correct / meaningful / enterprise-worthy — then we model it into the graphs + analytics task") — AUDIT DONE 2026-09-25; the findings were sent to backend as flow 07 §1 and slice 1 (A1–A7) is now BUILT (see the ★ block at the top)

**What it is:** `screens/FleetDashboard.tsx` (1,108 lines, `@ts-nocheck`, chart.js via react-chartjs-2). Calls 5 endpoints (+ the expiring-documents panel): `GET /fleet/dashboard?from&to&fleet_only=1` (status cards, KPI strip, trip + utilisation breakdown, alert summary), `/dashboard/alerts?fleet_only=1`, `/dashboard/vehicle-performance` (unpaged table), `/dashboard/financial`, `/dashboard/trends?interval` (5 small charts). Polls every 5 min (the file's comment says 30 s — wrong); trip / fleet realtime events invalidate it, position events do not.

**Correctness findings (numbers checked against raw records on 2026-09-25, range 19–25 Sep):**

1. **Trip counts are wrong / inconsistent.** Overview + trends say **2 trips, 0 completed, 2 cancelled**; the real data has **24 trips started in the range (21 completed, 3 cancelled)** and 43 trips in total. Even a Jan-1→today range still says 2 / 0 / 2. The dashboard evidently counts trips by `planned_start_at` only, so every ad-hoc trip (started now, no plan) is invisible — and the same screen's vehicle table sums to **21 trips** (by actual start). On-time %, avg duration, the "Trips — completed vs cancelled" chart all inherit it. **Ask backend: which date basis, and use `actual_start_at` OR `planned_start_at` like the trips list.**
2. **Two "fuel used" definitions:** KPI = fuel LOGS in range (80 L, vehicle 2, 21 Sep); vehicle table = trip-level fuel (30 L for the same vehicle). **Efficiency 1.8 km/L = GPS distance 144.3 km ÷ 80 L of fuel-log liters** (mixes sources; over Jan→today it is 0.24 km/L).
3. **Three different "distance" numbers on one screen:** KPI tile "Distance" = `trips.actual_distance_km` = **0 km**; the utilisation strip "Utilisation Distance" = **144.3 km** (GPS); table sum 144.4.
4. **Utilisation is trip-derived, not IoT-derived:** `driving_hours` = Σ duration of COMPLETED trips; `available_hours` = vehicles × hours; `parked_hours` = available − driving (11,087.9 h "parked" — every vehicle without a trip, even those with no tracker); `idle_hours` always 0. Rate 0.1 h / 11,088 h = 0.001 % shown as "0%".
5. **Fleet status cards:** Offline 65 of 66 vehicles because 64 have never reported a position (no tracker) — "Unknown 64" is a SUBSET of Offline shown as a peer card (1+0+0+65 = 66, "+64 unknown"); the dashboard treats a position as "moving" for **30 min** (verified: moving 1 → 0 exactly 30 min after the last packet) while the map marks a vehicle stale after **15 min**. Idle / Parked are 0 (no ignition / speed-0 data path yet).
6. **"Needs Attention (0)" beside "65 Offline Vehicles · 11 Expiring Licences"** — the header counts only IoT alarms; the licence counter has no list / drill-down (expiring documents do).
7. **Financial:** 5 of 6 tiles "Coming soon"; total cost = fuel only and 0 (fuel logs carry no cost in our data); **`cost_breakdown.maintenance` is always null although maintenance logs have costs** (a 75 PKR log dated 1 Jul is not counted in a Jan→today range); the donut shows one slice at 0.
8. **Vehicle performance table:** 66 rows, unpaged (no `page` param on the endpoint), 63 are all-zero, default sort by utilisation (ties in arbitrary order, "truck 1" first with 0 %), no search / filter / export, rows not clickable, "km/L", "Trips", "Fuel Cost" not sortable. Would be unusable at thousands of vehicles.
9. **Charts:** five 130-px charts; all-zero data draws negative axes (−1 % … 1 %, fuel cost −1 … 1); the card's "latest" value is the last (partial, today) bucket, not the peak; no legend / comparison / drill-down; no period-over-period; day buckets in UTC or company timezone is UNKNOWN (ask backend — matters for PKT users around midnight).

**Meaningful / enterprise-worthy?** It is a decent first operational screen (status, trips, alerts, expiring docs) but NOT analytics: no period-over-period, no filters (category / group / driver / customer), no drill-down (cards only open the Map), no export / print, no targets or thresholds, no maintenance-due / overdue block, **nothing from the incidents, maintenance, compliance, fuel-log, yard-occupancy or geofence-event data the backend already serves**, no driver scorecards, no cost per km / per vehicle, and its "IoT" metrics are actually trip arithmetic. Several numbers contradict each other, so an operator cannot trust it yet.

**Suggested shape for the graphs + analytics task (to agree with the owner, then a numbered flow-06/07 ask to backend):** (0) FIRST fix definitions with backend (trip date basis, one distance source, one fuel source, status thresholds, idle / parked from telemetry, timezone, maintenance cost) — no chart is worth building on wrong numbers; (1) a live **Operations** dashboard (status donut with "no tracker" split out, active trips, alerts + expiring docs / licences with lists, yard occupancy, geofence events 24 h, incidents this week, maintenance due) fed by realtime; (2) an **Analytics / Reports** area, one report per decision — Utilisation & distance, Fuel & cost, Maintenance & compliance, Drivers & safety, Trips & on-time — each with date range + filters (category, vehicle, driver, customer), period-over-period, chart + paged table, CSV export, drill-down to the vehicle / driver / trip; (3) ledger / financial later (owner's scope note). Open questions for the owner: who reads it (fleet manager vs finance), the 5 decisions it must support, whether metrics must come from IoT telemetry (engine / motion) or trip records, and which reports come first.

## ▶▶▶ FLEET ANALYTICS / DASHBOARD REDESIGN — PLAN (owner 2026-09-25 ~07:50 PKT: "I don't have a single clue — make it proper enterprise; decide what to show, in which form (chart / card / colour / table), ask backend for anything new or changed; you can tell backend to build anything")

**Deliverables written (commit them together):** `FLEET_ANALYTICS_DESIGN.md` (repo root — principles, IA, Overview layout, every widget → chart form → colour, six Analytics pages, glossary, frontend architecture, phasing) and the backend proposal **flow 07** `backend_frontend_sync/communication/flows/07-fleet-analytics-dashboard.md` (A1–A9 fixes, B0–B9 analytics contract + reports, C1–C4 company-wide lists, D1–D4 telemetry, E1–E4 ledger, F1–F3 settings / saved views / exports, six questions). Sync stamp `2026-09-25 07:51 PKT, by frontend`; **a copy of `backend_frontend_sync/` is owed to backend.**

**DECIDED 2026-09-25 ~07:55 PKT (owner delegated everything; full text = `FLEET_ANALYTICS_DESIGN.md` §2 + §8 decisions log D-1…D-11):** the dashboard, analytics, reports and ledger are **separate URL-routed pages grouped under the one "Fleet Management" sidebar entry in three areas — Operations (Overview = the dashboard = landing page, + Map / Trips / Vehicles / Drivers / Assignments / Yards / Geofences / Incidents), Analytics (= Reports: Utilisation · Trips & delivery · Fuel & efficiency · Maintenance & compliance · Drivers & safety · Costs · later Saved & scheduled) and Ledger (Entries · P&L · Receivables; finance; own permission later).** Routes `/fleet-management/{operations|analytics|ledger}/<page>` via an optional catch-all; two-level nav (segment buttons + page tabs); shared URL-synced filter bar. Ledger = operational fleet ledger, NOT general accounting. Scale target 10 000 vehicles / 100 000 trips a month / 1 M packets a day. Old dashboard replaced (not patched) after backend answers A1–A9. Backend proposal = flow 07 (§8 decisions, §9 thirteen questions); waiting for the owner to pass the folder to backend and bring the reply back.

**Frontend work that does NOT depend on backend answers (start after the owner's go, on typed mocks — feature-request-flow step 2):** the widget kit in `components/analytics/` (KpiTile, DeltaChip, Sparkline, StatusDonut, TrendLine, StackedColumns, RankBars, Heatmap, BucketBars, WorklistCard, server-paged DataTable, FilterBar with URL-synced state, MetricInfo popover, EmptyState, Skeleton, ExportMenu), colour tokens for status / severity / category, the Overview layout on mocks. Then integrate rows as backend marks them BUILT; verify live at scale (seed thousands of ZZ rows), light + dark. Also closes G15 (URL-synced state) and part of G18 (skeletons / a11y). Phasing 0–5 is in the design doc §7.

**Status 09:20 PKT:** the widget kit + Overview preview are BUILT (see the top block); the existing dashboard code is still untouched (only `fleet_only=1` was added on 2026-09-25 07:34 with the owner's approval); it is replaced only after the owner approves the switch.

## ▶▶▶ FLEET ENTERPRISE GAP LIST — what still separates Fleet from "proper enterprise grade" (recorded 2026-09-25 00:30 PKT; owner: "after completing all the tasks we will come back to it later, where we stand")

**Rule:** this list stays until every row is closed. Whenever the owner returns to Fleet, start here, then diff any pasted backend folder against HEAD. Build only against backend rows marked BUILT; owner decisions marked (OWNER) must be asked with a recommended option. Full ask text is in `backend_frontend_sync/communication/flows/06-fleet-enterprise-readiness.md` (§3 list contract, §4 CRUD gaps C1–C14, §7 asks B1–B13, §8.4 refinements).

**Already enterprise-grade (do not redo):** server-side page / search / filter / sort on Vehicles, Drivers, Yards, Geofences, geofence events, Trips (B1 built + integrated 2026-09-25); cross-page row selection; bulk deactivate/reactivate (V/D/Y, per-record refusals); CSV export; create + edit + deactivate/reactivate for vehicles/drivers/yards/geofences; trip create / edit (fields only) / delete-planned / start / complete / cancel; assignment-history views (paged by backend); expiring-documents panel; vehicle photo upload; realtime that keeps page + filters. Verified at ~66 vehicles / 46 drivers / 71 trips only — **not load-tested at thousands.**

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                  | Blocked by                                                                                                                                                                                 | What the frontend does when unblocked                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | ✅ **DONE 2026-09-25 01:36 PKT** — every picker uses the options endpoints (B2). Leftovers: filter dropdowns are active-only (asked `include_inactive`, flows/06 §16.3) and cap at 1,000 options with no typeahead. ~~**Dropdown pickers download the full unpaged lists** (assign driver, tracker, trip form, yard check-in, Trips vehicle/driver filters, Assignments filters) — breaks at scale~~ | **B2** options endpoints (backend: not built, owner decision pending there)                                                                                                                | move every picker to `/options` (search-as-you-type for big fleets); add Category options for the vehicle filter                                              |
| G2  | ✅ **DONE 2026-09-25 01:36 PKT** — bulk by ids / filter (B10, now also on Trips + Geofences) and server CSV export (B11) on every list + events. Leftover: the over-cap (500) bulk 422 was not exercised live. ~~**Bulk = N single calls (4 parallel); "Select all N" and Export CSV walk pages, cap 1,000 rows**~~                                                                                  | **B10** bulk-by-ids/filter + **B11** server CSV export                                                                                                                                     | "select all N matching" → bulk-by-filter with per-id results; Export → server download; remove the 1,000 cap; add bulk for geofences / trips (delete planned) |
| G3  | ✅ **DONE 2026-09-25 07:10 PKT** — B8 built + integrated: viewport-driven Fleet Map (`MapViewportWatcher`, `useViewportList`, bbox-aware realtime). ~~**Map loads every position**~~ (no clustering — backend: later, if ever)                                                                                                                                                                       | —                                                                                                                                                                                          | —                                                                                                                                                             |
| G4  | ✅ **DONE 2026-09-25 02:56 PKT** — B9 paged sub-lists back the vehicle tabs (maintenance, fuel, yard visits, incidents) and the driver incidents tab. ~~**Vehicle/driver detail sub-lists are embedded, not paged** (maintenance, fuel, incidents, yard history capped at 20)~~                                                                                                                      | **B9** paged sub-list endpoints                                                                                                                                                            | page + date-range filter inside each detail tab                                                                                                               |
| G5  | ✅ **DONE 2026-09-25 02:56 PKT** — B3 edit / delete for maintenance schedules + logs, fuel logs, compliance documents, incidents (vehicle + driver side). ~~**Log-type records cannot be edited or deleted** (maintenance schedules/logs, fuel logs, compliance documents, driver incidents)~~                                                                                                       | **B3** (+ derived-data rules)                                                                                                                                                              | Edit/Delete UI on each tab; company-wide incidents list (B7)                                                                                                  |
| G6  | ✅ **DONE 2026-09-25 02:56 PKT** (B4) — vehicle photo remove, yard layout replace / remove, slot delete (refuses a slot with a vehicle or history; owner: keep refusing, see G21). ~~**Yard slot delete, yard layout replace/remove, vehicle photo remove**~~                                                                                                                                        | **B4**                                                                                                                                                                                     | slot delete with "check out first" guard, layout replace/remove, photo remove                                                                                 |
| G7  | ✅ **DONE 2026-09-25 06:1x PKT** — B5 built + integrated: `TripStopsEditor` in Edit trip (planned trips) and New trip. ~~**Trip stops cannot be edited on a planned trip** (add/remove/reorder yards)~~                                                                                                                                                                                              | **B5**                                                                                                                                                                                     | stops editor inside _Edit trip_                                                                                                                               |
| G8  | ✅ **DONE 2026-09-25 04:20 PKT** — B6 built + integrated: `AuditLine` on every record view ('System' for automatic changes, dates only for pre-audit records). ~~**No audit trail** ("created/last edited by … on …")~~                                                                                                                                                                              | **B6**                                                                                                                                                                                     | audit line on every record                                                                                                                                    |
| G9  | ⏸ **DEFERRED by backend's owner 2026-09-25 04:56 PKT (flow 06 §24)** — fleet stays all-or-nothing; frontend has nothing to build. ~~**No granular permissions** (single `all-fleet`; no "my permissions" endpoint) — buttons can 403                                                                                                                                                                 | **B12**                                                                                                                                                                                    | hide/disable actions by right (view/create/edit/deactivate/export/manual stop marking)                                                                        |
| G10 | ✅ **DONE 2026-09-25 06:1x PKT** — B13 built + integrated (`useEditConflict`, 409 banner, quick-action toasts). ~~**Concurrent-edit safety** (last write silently wins)~~                                                                                                                                                                                                                            | **B13** (`updated_at`/If-Match → 409)                                                                                                                                                      | "changed by someone else — reload" flow                                                                                                                       |
| G11 | ✅ **DONE 2026-09-25 06:2x PKT** — B7: `StatusChips` on Trips / Vehicles / Drivers + the company-wide **Incidents** tab. ~~**Filter-chip counts** (Planned 4 · In progress 2 …)~~                                                                                                                                                                                                                    | **B7**                                                                                                                                                                                     | chips on Trips/Vehicles/Drivers                                                                                                                               |
| G12 | ✅ **DONE 2026-09-25 01:36 PKT** — Category, Year, licence state, driver Status sort, yard State / Has-slots / Radius restored (D-0167); NULLs-last confirmed. ~~**Features dropped in the B1 switch (no server parameter yet)**~~                                                                                                                                                                   | backend refinements in flows/06 §8.4 (`sort_by=year`, licence expired/valid/none, driver `status` sort, yard `is_active`/has-slots/`radius_m` sort, Category options, NULLs-last ordering) | restore each removed control when its parameter exists                                                                                                        |
| G13 | **Compliance-documents list is not on the server-side params yet** (backend B1 covers it; ComplianceTab still uses the small per-record flat list)                                                                                                                                                                                                                                                   | frontend only (optional, low value until documents are numerous)                                                                                                                           | page / search / expiry filters in the Compliance tab                                                                                                          |
| G14 | **Trips status filter is single-select** (backend accepts several)                                                                                                                                                                                                                                                                                                                                   | frontend only                                                                                                                                                                              | multi-select status control                                                                                                                                   |
| G15 | **List state is kept per browser tab (sessionStorage), not in the URL** (not shareable, no back/forward)                                                                                                                                                                                                                                                                                             | **(OWNER)** decision — recommended: yes, URL-synced, page size 20                                                                                                                          | sync page/search/filters/sort to the query string                                                                                                             |
| G16 | ✅ **DONE 2026-09-25 06:3x PKT** — C14 built (guarded: never-used records only) + integrated as a secondary "Delete permanently" (single + bulk). ~~**Hard delete for vehicles/drivers/yards** — deactivate only today~~                                                                                                                                                                             | **(OWNER)** C14 — recommended: keep deactivate-only                                                                                                                                        | (none if kept)                                                                                                                                                |
| G17 | **Compliance document file attachments** (only metadata today)                                                                                                                                                                                                                                                                                                                                       | **(OWNER)** C4 + backend upload/download                                                                                                                                                   | upload/download on documents                                                                                                                                  |
| G18 | **Saved filter views**, keyboard/accessibility pass, skeleton loading, light-theme review, geofence events column at full window width (not visually re-checked)                                                                                                                                                                                                                                     | **(OWNER)** priority                                                                                                                                                                       | Phase 5 polish                                                                                                                                                |
| G19 | **Test-data cleanup** — `ZZ` vehicles/drivers/yards/geofences/trips/product 118 in company 2 (list in ▶▶ RESUME HERE); the `ZZ Insurance` document was deleted 2026-09-25 02:56 PKT (G5 done)                                                                                                                                                                                                        | do at the very end of the enterprise work                                                                                                                                                  | delete planned trips, deactivate vehicles/drivers/yards, remove product 118                                                                                   |
| G21 | **Yard-slot "deactivate"** (owner 2026-09-25 02:56 PKT: for now keep refusing deletion of slots with check-in history; "add deactivate slot in future, after asking me")                                                                                                                                                                                                                             | **(OWNER)** ask again later; needs a backend schema change (hidden by default, history kept)                                                                                               | ask the owner, then request it in flows/06; add a Deactivate / Reactivate control + "Show inactive slots" in the yard editor                                  |
| G22 | **(NOTE, owner 2026-09-25 evening — not started)** Trip acknowledgment: notification on trip create, driver acknowledges, status enum `not_informed` → `acknowledged`                                                                                                                                                                                                                                | **(OWNER)** go + backend (field, endpoints, notification)                                                                                                                                  | see ⭐ TODO TRIP LIFECYCLE                                                                                                                                    | trip detail shows the acknowledgment state; driver-side Acknowledge |
| G23 | **(NOTE)** Automated odometer + trip distance from start / end point (vehicle used only on our platform)                                                                                                                                                                                                                                                                                             | **(OWNER)** go + backend (odometer derivation, distance source)                                                                                                                            | ⭐ TODO                                                                                                                                                       | manual odometer inputs become read-only / derived                   |
| G24 | **(NOTE)** Driver vs operator screens; managerial actions off the driver screen                                                                                                                                                                                                                                                                                                                      | scoped RBAC (backend, B12-style) + driver accounts                                                                                                                                         | ⭐ TODO                                                                                                                                                       | role-aware nav + route guards + permission hooks                    |
| G25 | **(NOTE)** Start-trip button for the DRIVER only (not the operator)                                                                                                                                                                                                                                                                                                                                  | depends on G24 (+ an override decision)                                                                                                                                                    | ⭐ TODO                                                                                                                                                       | move / hide the Start action by role                                |
| G26 | **(NOTE)** Sensor-confirmed actual start: driver taps Start, the trip becomes in progress when the vehicle leaves the origin's 100 m radius                                                                                                                                                                                                                                                          | backend rule + company setting for the radius                                                                                                                                              | ⭐ TODO                                                                                                                                                       | show "waiting for departure" state; realtime via `trip:update`      |

### FLEET VISUAL POLISH / IMAGERY IDEAS — recorded 2026-09-25 01:29 PKT (owner: "record these in your todo md files, we will again review these later") — NOT STARTED, needs the owner's go

Owner's question: should Fleet use pictures (vehicles, yards, start/end points, drivers…) to make the whole UI — not only the map — look superb? Facts checked: map vehicle markers are colored SVG pins (`VehicleMarker.tsx`, color = position freshness), yard markers are small square icons (`YardMarker.tsx`); the yard modal shows slots on top of the uploaded **layout image** (`layout.url`, prompt "Upload a yard layout image" when none — intentional; the flat blue rectangle on `ZZ Yard 1` is just a test image, the only yard with `has_layout`); backend supports only vehicle photo (`POST /vehicles/{id}/image`, no remove) and yard layout (`POST /yards/{id}/layout`, upload-only, no replace/remove = B4); drivers have a `photo_path` field in the data but NO upload endpoint; trip start/end are address + coordinates, not entities; geofences have no image field.
My recommendation (to review with the owner, decide per item):

1. **Vehicles — yes (frontend-only):** round photo marker on the map (`image_url`), fallback icon by category (truck / van / bus / yacht / trailer / generic), colored ring for freshness/status; same avatar in the trip route map, dashboard, Assignments, lists and modals.
2. **Yards:** keep the layout image for the slot editor; on the map a nicer yard icon; an optional real yard PHOTO later would need a new backend field/endpoint (+ B4 replace/remove for the layout).
3. **Trip start / end points:** styled pins with icon + label (origin / stops / destination), no pictures.
4. **Drivers:** a real photo needs a backend upload + delete endpoint (ask backend); until then a colored **initials avatar** everywhere (lists, modals, assignments, trip cards) — frontend-only.
5. **Geofences:** no pictures; clean outline + label on the map.
6. **Fleet-wide polish (frontend-only):** consistent empty states, skeleton loading, icons and status badges, light-theme review.
   Backend asks that would unlock more: driver photo upload/delete, vehicle-photo remove (B4), yard layout replace/remove (B4), optional yard photo.

**Order of attack when backend answers (recommended):** ~~G1 (B2) → G2 (B10/B11)~~ done 2026-09-25 01:36 PKT; next G3 (B8) — G4 (B9) done → G5–G8 (B3–B6) → G9–G11 (B12/B13/B7) → G12 as parameters appear → owner-decision rows G15–G18 → G19 last. Frontend-only rows G13/G14 can be done any time the owner asks.

**Out of scope until the module above is enterprise-complete (owner):** fleet alert rules + notifications, reports / graphs / financial ledger / analytics, bulk CSV import for vehicles/drivers, driver-reported stops / driver app, ETA, CRM / billing. The other parked backlog (Rule Builder notification / SMS / toggle, onboarding "Don't Skip" lock) stays deferred.

---

## ▶▶ (HISTORICAL — superseded by ▶▶▶▶ RESUME HERE at the top) state at the end of the first long Fleet session (2026-09-24 ~22:40 PKT)

**One-paragraph summary.** The owner's original Fleet Management vision is **fully built and confirmed end to end** (vehicle → driver → yards + geofences →
assign tracker + driver → trip with yard stops → start → sensor + manual stop updates → completion prompt → live map, all over sockets). Backend closed its
fleet task (all 7 build steps + `fleet:changed` + trip created/deleted events). The owner then asked for **enterprise level**: full CRUD, server-side pagination,
search, filters, sort, bulk, export. Frontend Phases 1–2 of that are done (shared list foundation; Trips truly server-paged; Vehicles/Drivers/Yards/Geofences do
search/filter/sort/paging/CSV/bulk **client-side = a demo-only stopgap**). **The next real step is on the backend: asks B1–B13 in
`backend_frontend_sync/communication/flows/06-fleet-enterprise-readiness.md` (PRIORITY 1 banner at its top: server-side lists B1 + dropdown options B2).**
The owner is pasting the sync folder (stamp 22:3x PKT) to the backend and will paste its reply back. **Everything is committed and pushed on `feat/next-ts-migration`.**

**STATE 2026-09-25 00:08 PKT (newer than the summary above):** backend answered **B1 (server-side lists) — BUILT**; frontend integrated it (Phase 2b): Vehicles, Drivers, Yards, Geofences (+events panel) and Trips are server-side via `hooks/useServerList` / `useTripsList`; `useClientList` is deleted; selection (`useSelection`) spans pages; "Select all N" and "Export CSV" walk pages (interim until B10/B11). **Backend has NOT built B2–B13 (owner decisions pending on their side).** Nothing more is buildable until B2 (dropdown options) etc. arrive. Findings/asks sent in flows/06 §8.4. Everything is committed; push only when the owner asks.

**Do this at the start of the next session, in order:**

1. Read memory `MEMORY.md` (esp. `fleet-enterprise-readiness`, `fleet-frontend-architecture`, `owner-working-preferences`, `backend-frontend-sync-process`, `backend-sync-no-prettier-on-api-contract`).
2. When the owner pastes backend's reply: **diff the folder against HEAD first** (`git status`, `git diff --stat -- backend_frontend_sync`, per-file removed-line counts for `communication/flows/*.md`, `STATUS.md`; check the `Last synced` stamp has date AND time and is newer than ours). Backend once truncated a flow file — if anything of ours is missing, restore it from git and tell them. **Never run Prettier on `backend_frontend_sync/`** (it is `.prettierignore`d). Read flow 06 §8 (status log) for backend's answers.
3. Build only against rows marked **BUILT**. When B1/B2 land → do **Phase 2b** (flows/06 §5): swap each list's adapter (`useClientList`; the search branch of `useTripsList`; dropdown sources) to request params, move dropdown pickers to the `/options` endpoints, then "select all N matching" → bulk-by-filter (B10) and export → server export (B11). Then B3–B6, B8, B9, B12, B13 as they arrive.
4. **Phase 3 is DONE + live-verified (2026-09-24 23:07 PKT, uncommitted until the owner asks):** Edit trip (`components/TripEditForm.tsx`, button in `TripDetailModal` overview), assignment history (`components/AssignmentHistory.tsx` used by the new _Assignments_ hub tab `screens/Assignments.tsx`, the vehicle _Vehicle History_ tab and a new driver _Assignments_ tab), expiring-documents panel (`components/ExpiringDocumentsPanel.tsx` on the dashboard; vehicle/driver modals got an additive `initialTab` prop), vehicle photo upload (`components/VehicleImageControl.tsx`). Not exercised live: editing an _in-progress_ trip; the Edit button's absence on completed/cancelled trips (code-only). As of 23:07 backend had **still not answered B1–B13** (folder identical to HEAD) — nothing else is buildable until a row is BUILT.
5. Ask the owner (with a recommended option each) only when a real product decision is reached (open ones: page size 20 + URL-synced list state, hard-delete policy, document attachments, key filters, saved views).
6. **Do NOT start the deferred backlog** unless the owner says so: (a) Rule Builder system notification (`notification:new` listener + bell + notification center), (b) Rule Builder dead per-row Active toggle, (c) Rule Builder SMS live test (needs the owner's phone), (d) onboarding step-3 "Don't Skip" lock (owner will bring their own idea), (e) fleet enterprise extras: alerts/notifications rules, reports/graphs/financial ledger/analytics, bulk CSV import for vehicles/drivers, driver-reported stops/driver app (see ⭐ TODO TRIP LIFECYCLE), ETA. CRM/customers/billing are out of scope (only payment APIs, later).

**✅ PHASE 3 VERIFICATION DEBT CLOSED (2026-09-25 00:08 PKT).** V1 in-progress trip edit → `PUT /trips/{id}` 200, modal refreshed, test trip restored + cancelled; V2 no _Edit trip_ button on a completed (ZZ-TRIP-002) and a cancelled (ZZ-TRIP-003) trip; V3 screenshots reviewed for the Assignments tab, vehicle History tab (empty state + earlier with data), driver Assignments tab (fixed: table now fits the 600 px modal), dashboard Expiring Documents panel, vehicle photo control, Edit-trip form. Not visually re-checked: light theme (only dark was reviewed) and the geofence events panel column (off-screen in the narrow MCP window; verified through the DOM/API only) — treat those two as small remaining V3 items if the owner cares.

**What exists in the frontend (Fleet) — see memory `fleet-frontend-architecture` for the full map:** hub `screens/FleetManagement.tsx` (mounts `useFleetRealtime`); screens Dashboard, Map (trip route
selector), Vehicles, Drivers, Yards, Geofences, Trips; shared forms `VehicleFields`/`DriverFields` (+ Edit forms, `DeactivateControls`, `YardEditForm`, `GeofenceEditForm`, `CoordinatePicker`);
trip UI `TripDetailModal` (+ `StopActions`, `TripRouteMap`/`TripRouteLayers`); list foundation `hooks/useListState|useClientList|useSelection|useBulkAction|useTripsList`,
`components/list/{DataToolbar,Pager,BulkBar,SelectableRow}`, `utils/{csv,fleetCache,fleetCurrency,fleetOptions,datetime}`; sockets via `contexts/SocketContext` (`subscribeFleetEvent`).

**Environment / test data (company 2, login `junead@chaminade-hs.org`; the owner logs in MANUALLY in the MCP Chrome tab — I may not type the password; the session persists across dev-server restarts):**

- Backend API `http://localhost:8080` (separate Claude session). Dev server: `npm run dev` (capped, port 3000). To stop it: list PIDs with `ps -eo pid,cmd | grep -E "next-server|next dev|dev-safe|dev-monitor|npm run dev"`, kill the `npm run dev`/`dev-safe`/monitor wrappers first, then `next dev`/`next-server`, then `rm -rf .next`. Never run `next build` while it is up. It grows to ~2–3 GB.
- Seeded `ZZ` test data (leave the owner's own records alone: vehicle "truck 1" id 1 and driver "john doe" id 1): vehicles 2,3,5,11,14 + `ZZ Bulk Veh 001–060`; drivers 2,3,4,6,9 + `ZZBulk001–040`; yards 1,2,7–10 + `ZZ Bulk Yard 001–030` (25 with auto-geofences); geofences 1–3,10–13+; trips `ZZ-TRIP-*`, `TRP-*`, `ZZ-BULK-001–071`; product 118 "ZZ Tracker Product" (GPS roles set; devices 146 → vehicle 2, 147 → vehicle 14); company currency was set to PKR. **Clean these up when the enterprise work is finished** (delete planned trips, deactivate vehicles/drivers/yards; there is no hard delete).
- Sensor test recipe: in-page `fetch` with the app's stored token; `POST /api/get-encrypt-token {protocol_id:1,product_id:118}` → token string at `response.token.token`; `POST /api/webhook` header `token`, body `{time, object:{latitude,longitude,speed}, deviceInfo:{devEui:'ZZTRK0000000001'|'…002', deviceName}}` (first packet on a new token is config-only). Yards need a geofence linked to them (auto-created since step 7).
- Browser-tool gotchas: keep each `javascript_exec` under ~30 s (longer ones lose their return value but still run — check for duplicate side-effects); output containing `key=value` text can be blocked ("[BLOCKED: Cookie/query string data]"); Radix menus/selects need real events or `find`+ref clicks; if the extension drops, `tabs_context_mcp` reconnects it.

**Process rules that are locked in (details in memory `owner-working-preferences`):** commit in logical, buildable commits with the Co-Authored-By/Claude-Session trailers and **push only when asked**; bump the sync stamp (`date '+%Y-%m-%d %H:%M %Z'`, side = frontend) on EVERY edit of `backend_frontend_sync/` and tell the owner a copy is owed; verify everything live before calling it done; write docs before the owner resets context.

**Suggested opening prompt for the new session** (also kept in memory `fleet-enterprise-readiness`): "Resume the Fleet enterprise-readiness work. Read memory MEMORY.md, task.md's ▶▶ RESUME HERE
section, backend_frontend_sync/STATUS.md and communication/flows/06-fleet-enterprise-readiness.md. I have (or will) paste backend's reply to the sync folder — diff it against HEAD first, summarise in 5 lines what
backend answered on B1–B13 and what is BUILT, then tell me what you can build against right now. Don't start the deferred backlog. Don't edit code until you've told me the plan."

---

## ⇄ WORKING WITH THE BACKEND SESSION — read this every session

There are **two separate sets of markdown files** in this project, and they are not interchangeable:

1. **This repo's own docs** (`task.md`, `TYPING_HANDOFF.md`, `CLAUDE_FRONTEND_CONTEXT.md`,
   `DEV_PERFORMANCE.md`, …) — frontend-only, never copied anywhere, never read by the backend session.
2. **`backend_frontend_sync/`** — a **plain folder, not a git repo**, that the owner manually copies by
   hand between this repo's root and the separate `node-backend` repo's root, to bridge the two Claude
   Code sessions (which have no shared context with each other). Full explanation:
   `backend_frontend_sync/README.md`.

**Standing rule: whenever a change is made to anything under `backend_frontend_sync/` in this session
(a new/updated flow file, a `findings.md` row, `STATUS.md`, `FACTS.md`), say so explicitly before the
turn ends and tell the owner to copy the folder over to `node-backend`'s root.** Don't wait to be asked —
that's the whole point of this rule (see `backend_frontend_sync/STATUS.md`'s "Last synced" line, which
should be updated to today's date + "frontend" whenever this happens). Conversely, if a task needs
backend-side info that might have changed since this copy was last synced, ask the owner whether they
have a newer copy from the backend session before assuming this one is current.

## 🔁 THE FEATURE REQUEST FLOW — permanent, read this every session (locked in 2026-09-22)

This is **the standing procedure for every backend-dependent piece of work** the owner brings to this
session — "X is missing", "X is buggy", "build X from scratch". Follow it in order; don't skip steps or
collapse them because a step feels obvious.

1. **Assess.** Read the current code, and check the live app in Chrome for the actual current status.
   This is an ordinary status check — **not** the live-backend probing banned in step 5. Looking at what's
   already on screen/in the code is always fine, any session, any time.
2. **Match against the contract.** Check `api_contract/` — does an existing API already cover the
   requirement, partially cover it, or not exist at all.
3. **Build the UI against mock data.** Model the mock on `api_contract/`'s documented shapes, or — where a
   new/changed API is needed — model it on **exactly what step 5 is about to ask the backend for**. Keep
   the mock behind one clearly-marked, easy-to-remove toggle or function (e.g. a single `USE_MOCK` flag or
   a `getMockX()` call site) — never scattered inline — so swapping it out later is a one-line change, not
   a rewrite. Verify the UI looks and behaves right against the mock before moving on.
4. **Frontend is the driver.** This session decides what APIs are needed, not the backend session —
   backend builds/changes to match what's asked here, not the other way around.
5. **Write the exact ask into `backend_frontend_sync/`** (a flow file, or a new one from
   `communication/flows/_template.md`). **Include the mock data itself as a concrete JSON example of the
   wanted request/response** — a real example beats a paragraph of prose every time; don't just describe
   the shape in words when the mock already IS the shape. Bump `STATUS.md`'s "Last synced" line and tell
   the owner the folder is ready to copy to `node-backend` (per the standing rule above).
6. **Round trip.** The owner copies the folder to the backend session, backend builds or confirms against
   exactly what was asked, the owner copies the folder back. This session reads what came back before
   doing anything else with it.
7. **Integrate for real.** Swap the mock for the real API call. Delete the mock code entirely — never
   leave both paths coexisting "just in case".
8. **One live test pass on the finished integration.** Not incremental probing along the way — one pass,
   after integration is done, covering everything the feature touches. If it surfaces a bug: fix and
   re-test within this same pass. Only go back to step 5 if the fix needs a **new or different** backend
   change.

**Scope:** this full cycle is for backend-dependent features. A pure frontend fix (styling, a client-side
bug, dev tooling) skips straight to build-and-test — no mock, no sync-folder step; running the whole cycle
for something with no backend dependency is needless overhead, not extra rigor.

**Regression safety ("don't break what already worked"), made concrete — check every time, not just when
asked:**

- `tsc --noEmit` at 0 and `next build` clean before anything counts as done.
- A change to a **shared** component (RadixTable, Button, Select, Modal, …) stays strictly additive —
  new optional props with safe defaults, existing behavior and existing props' meaning untouched. (The
  model: `RadixTable`'s `isRowExpanded`/`renderExpandedRow`, added 2026-09-22 — opt-in, zero effect on
  every other consumer.)
- Before calling a task finished, glance at sibling features in the same file/area for plausible
  collateral damage, not just the one thing that was touched.
- **Before asking backend to _change_ (not just add to) an existing API, `grep` this repo for every
  other call site of that endpoint first.** If anything else already depends on its current shape/
  behavior, either the change must stay backward-compatible for them too, or the ask must say explicitly
  "these other call sites also need updating" / "add a new endpoint instead of changing this one" — never
  let an endpoint change silently break a screen that wasn't part of the current task. This applies
  symmetrically: when backend independently changes something existing, they should check the same way
  on their side, or ask here first if unsure whether the frontend depends on the current behavior.

---

## 🧹 DEFERRED CLEANUP — read this whenever asked "what's remaining" or told to clean up

**Rule: never clean these up unprompted.** Only touch this list when the owner explicitly says to clean
up, or explicitly asks what's remaining — then report/act on exactly this list, don't go looking for more.

### Widget-type / widget dashboard / 3D building — owner decision 2026-09-22

The owner decided the **legacy widget-dashboard (GridStack) and the 3D building viewer are redundant for
now** — the product now centers on the plain attribute-configuration flow
(`backend_frontend_sync/communication/flows/01-product-onboarding.md`), not per-attribute dashboard
widgets or the Unity building view. First concrete step taken: **removed the "Select widget type" picker
from `AttributeModal.tsx`** (the modal opened via "Configure Attribute" on
`/products/{id}/configuration`) — it now silently sends the backend a fixed default
(`DEFAULT_WIDGET_TYPE`, the old picker's first entry) instead of asking the user to choose, so the save
payload shape is unchanged and nothing downstream breaks. Verified live: `POST
/api/attribute/preference/setting/store` → `201`, attribute persists via `GET /api/product-settings/{id}`.

**Still using widget types / not yet touched (leave alone until told):**

- `src/components/Grid.tsx` — the GridStack widget dashboard itself (drag/drop widgets, `useSimpleQuery`
  dashboard data, `dashboard:update` socket consumer).
- `src/utils/DynamicImport.tsx` (`getWidgetConfig`) + `src/forms/DashboardForms/*` + widget component
  registry (`src/components/Widgets/`) — the widget-type → form/render-component mapping the old picker
  drove.
- `src/screens/WEBGLBUILDING.tsx`, `src/components/BuildingMultiFloor3DViewer.tsx`,
  `src/components/FloorPlanEditor.tsx`, and `Assets.tsx`'s `building:update` socket consumer — the 3D
  building viewer.
- `src/utils/IconMapper.tsx`'s `widgetsIconMapper` array — still imported by `AttributeModal.tsx` only
  for `DEFAULT_WIDGET_TYPE`; the rest of it (icons/colors for the removed picker) is now dead weight.
- Backend-side: whatever `widget_id`/`rule_id` resolution and the whole widgets/dashboards data model
  backs `POST /api/attribute/preference/setting/store` — frontend has no visibility into whether that
  side considers this redundant too; raise in `backend_frontend_sync/` if it becomes relevant.

**When asked to clean up:** confirm scope first (all of the above, or just a subset) — this spans a whole
subsystem (GridStack, widget forms, 3D building), not a quick delete.

---

## 📋 SESSION RECAP (2026-09-22) — what just happened, for the next session to orient on

This session (ended by the owner deliberately, to avoid running out of the 1M context window mid-task)
covered, in order — full detail lives in git history (commits `...` through `6139688`) and
`backend_frontend_sync/`, this is just the index:

1. **Dev-server memory runaway fixed** — `next dev` was freezing the owner's laptop. Root cause:
   `src/utils/ReactIconDynamicImport.tsx` dynamically importing ~20 whole `react-icons` packs for ~64
   icons. Fixed by generating a local file with only the 70 actually-used icon SVG trees
   (`scripts/gen-react-icon-data.mjs` → `iconData.ts`), plus guarded dev tooling (`dev-safe.sh` /
   `dev-monitor.sh` / `dev-report.sh`, memory-capped + auto-restart + crash-loop detection) now wired as
   the default `npm run dev`. Full writeup: `DEV_PERFORMANCE.md`.
2. **Avatar / navbar bugs fixed** — header + popper + `AccountSettings.tsx` avatar now live-update on
   save, fall back to an initial-letter/PersonIcon instead of MUI's default "U", and the popper shows the
   **user's own name** (was showing the company name — `accountDisplayName` bug in `Navbar.tsx`) with the
   language submenu no longer squished (was absolute-positioned, now normal flow).
3. **Pusher → Socket.IO migration**, per `backend_frontend_sync/api_contract/API_CONTRACT.md` §4.
   `PusherContext.tsx` → `src/contexts/SocketContext.tsx`; one connection per user, JWT in `auth.token`,
   shared listener per event type dispatching by id (not a socket binding per id like Pusher). Fully
   live-verified end to end.
4. **`backend_frontend_sync/` established** as the permanent, plain-folder (explicitly **not a git repo,
   not a submodule** — owner rejected both), manually-copy-pasted bridge between this session and the
   separate `node-backend` Claude session. Structure, conventions, and the standing **8-step Feature
   Request Flow** are documented in `## ⇄ WORKING WITH THE BACKEND SESSION` and `## 🔁 THE FEATURE REQUEST
FLOW` above — **read those two sections before starting any backend-dependent work**, that rule is
   permanent, not session-specific.
5. **`AttributeModal.tsx`'s widget-type picker removed** (owner: widget dashboard / 3D building are
   redundant for now) — see `## 🧹 DEFERRED CLEANUP` above for exactly what's untouched and why.
6. **Packet-history page rebuilt** (`/products/{id}/history` via `ManageDevice.tsx`'s History tab):
   device-scoped dropdown filter, one column per configured attribute (from `GET
/product-settings/{productId}`), raw Payload column replaced with a collapsible "View Details" JSON
   viewer (`PacketPayloadViewer.tsx`, using `RadixTable.tsx`'s new additive `isRowExpanded` /
   `renderExpandedRow` props), live device-scoped refetch via `device:value`. This surfaced **three real
   backend bugs**, all found by rigorous live testing (not accepted on the first fix) and all now fixed +
   independently re-verified: `device:value`'s `deviceId` resolving to the wrong product on a duplicate
   `device_unique_identifier` (D-0142), a product's Initial Packet permanently keeping empty `device_ids`
   (D-0142), and a regression in that same fix mis-attributing backfilled `device_ids` on multi-device
   products (D-0143). Full story: `backend_frontend_sync/communication/flows/02-packet-history-live-
view.md` and `communication/findings.md`. **Feature is signed off — good to go**, per
   `backend_frontend_sync/STATUS.md`.
7. **Standing rules added this session** (all permanent, see the relevant sections above): never use the
   demo account (`demoAccount@chirptech.io`) for integration testing — it's a client-only MSW+Dexie mock
   and proves nothing; before changing an existing API, check whether the change would break other
   current call sites; don't be shy about pushing backend for a real fix over a soft workaround —
   "trade-off things done half-heartedly... will produce bugs in proper production" (owner's words).
8. **Owner aside, not yet acted on beyond this note:** the whole project's UI/UX will get a full revamp
   later ("currently it is not user friendly nor beautiful") — no scope or timing given yet, just
   flagged here so it isn't lost.

**Real seeded login for all live testing:** `junead@chaminade-hs.org` / `password123` against
`http://localhost:8080` (node-backend — run and managed by the _other_ Claude session, not this one).

---

## ▶ NEXT TASK (owner-assigned, 2026-09-22) — Asset/Building module at `/assets` — **DONE (2026-09-22)**

**Resolution:** both bugs fixed, live-verified end to end, **frontend-only — no backend change needed**.

1. `Assets.tsx` — the floor-plan ("Floor Plan" map icon) is now gated to `!node.isTopMost &&
node.data.parent_id === null` (a true first-level child of the building), not every non-root node.
2. `FloorPlanEditor.tsx` — the "unpositioned sensors" list now calls `GET /devices/{id}?type=component`
   (an existing endpoint that already resolves a node's entire subtree server-side — see
   `backend_frontend_sync/api_contract/openapi/assets.yaml`'s `x-quirks` on that path) instead of
   flat-filtering only immediate children. Each entry now shows `name — DevEUI`.
3. Drag-and-drop: owner's call — kept the existing select-then-click flow (already precise enough on a
   small image), no HTML5 drag-and-drop added.

Live test: on the owner's real `arfa - building`, assigned test devices to two branches under `floor 1` at
different depths (`floor 1→area 1→site 1`, depth 3, device `f7c4`; `floor 1→area - 2`, depth 2, device
`dev2-beta`) — both left with no device in this session's starting state. Confirmed depth-3+ nodes lost the
floor-plan icon, `floor 1` kept it, uploaded a floor-plan image to `floor 1`, confirmed both sensors listed
with DevEUI regardless of depth, selected the depth-3 sensor and placed it on the image, verified via
`GET /api/components/3` that `floor_plan_id`/`position_x`/`position_y` persisted correctly. Also live-tested
placing/removing via the marker dot: removing a placed sensor (click its dot) correctly nulls
`floor_plan_id`/`position_x`/`position_y` via the same generic `PUT /api/components/{id}`, no new backend
endpoint needed. `tsc --noEmit` and `next build` both clean. Test device assignments + the test floor-plan
image were left in place on the live building (not reverted) since they're useful as a working example —
ask the owner if a clean building is wanted instead.

**Follow-up (2026-09-22, same day) — Building 3D (all floors) stacking view, `BuildingMultiFloor3DViewer.tsx`:**
owner reported the multi-floor 3D view (opened via the "Building 3D (all floors)" layer icon on the building
root) looked like only one floor was visible at a time. Added a second test floor (`floor 2`, id 5, floor
level 1, test image) to actually have two floors to stack — confirmed live that both floors DO render
simultaneously in one 3D scene (not one-at-a-time), but the **default camera** (`[8,8,8]`, ~35° elevation)
visually merges them almost completely since `FLOOR_HEIGHT` (2.2 world units) is small relative to the
8-unit-wide plane at that steep angle. Manually rotating to a flatter angle showed both floors cleanly
separated, confirming this was a camera-framing bug, not a stacking-logic bug. Fixed by changing the
initial camera position to `[5, 3.5, 13]` (~14° elevation) — confirmed live, floors now read as clearly
separated stacked planes on open, no manual rotation needed. `tsc --noEmit` clean.
Separately confirmed (owner's call, no change made): clicking a sensor marker opens `DevicePointsModal` as
a centered modal, not an inline left-side panel — this is the intended/kept behavior, not a bug.

**Follow-up (2026-09-22, same day) — click-to-isolate a floor + fixed floor-label positions:**
owner clarified the wanted interaction: clicking a floor in the stacked view should hide every other floor
and show only that one (maximized) so its sensors are easy to check, plus a back button to return to the
stacked view; owner also flagged the "Level N" labels looked "way off." Both confirmed live and fixed in
`BuildingMultiFloor3DViewer.tsx`:

- `FloorLayer` gained a `standalone` prop — when true, the floor renders at the world origin (`y=0`)
  instead of its stacked `floor_level * FLOOR_HEIGHT` offset, since it's the only thing in the scene.
- The center canvas now conditionally renders either the full stacked `floors` array or just
  `[selectedFloor]`, with a `key={selectedFloorId ?? 'stacked'}` on `<Canvas>` so it fully remounts and
  resets to the right initial camera for each mode (`[5,3.5,13]` stacked / `[0,6,6]` isolated, reusing the
  single-floor viewer's tuned framing) — R3F only applies the `camera` prop on mount, so a plain state
  change wouldn't have moved the camera.
- A "← Back to stacked view" button appears top-left of the canvas only while a floor is isolated, resetting
  `selectedFloorId` to `null`.
- The floor's own "Level N" `<Html>` label was anchored at the plane's back-left corner
  (`[-planeWidth/2-0.3, 0.1, -planeDepth/2-0.3]`), which drifted away from its own floor's silhouette as
  camera angle changed and collided with nearby sensor name tags — moved to elevated top-center
  (`[0, 0.7, 0]`), clear of both problems regardless of camera angle or plane aspect ratio.
- Added a second test floor (`floor 2`, id 5, `floor_level: 1`, test image) specifically to verify the
  isolate/back-button round trip with 2 real floors, live: stacked → click floor 0 → isolated (right panel
  - header text update to `Level 0`, only floor 0's plane + its "area - 2" sensor visible) → back button →
    fully restored stacked view with both floors and clean, non-colliding labels. `tsc --noEmit` clean.

**Follow-up (2026-09-23) — sensor DevEUI/alert-state, floor names, sensor visibility, modal navigation:**
owner reported 5 more issues after live-testing the above (with their own real floor-plan image uploaded to
`floor 1`, replacing the earlier test image). All fixed in `BuildingMultiFloor3DViewer.tsx` +
`DevicePointsModal.tsx`, live-verified, **frontend-only, no backend change**:

1. **Sensor DevEUI missing + alert/online state always wrong.** `positioned_components` from
   `GET /floor-plans/building/{id}` carries only `device_id` — checked directly, no `device` sub-object at
   all, so `getAlertState`'s fallback to `sensor.device?.last_updated` was always `undefined`, meaning every
   non-alerted sensor showed "offline" (gray) forever, and DevEUI/last-packet-value were never shown despite
   the JSX referencing them. Fixed by fetching `GET /devices/{assetId}?type=asset` once per building
   (already resolves every device under the whole building with `uuid`/DevEUI and real per-attribute
   `isAlert`/`last_packet_value` — confirmed scopes correctly at any tree level) and merging by `device_id`
   into a `deviceById` map threaded through `FloorDetailPanel`/`FloorLayer`/`SensorMarker`. `getAlertState`
   and `summarizeDeviceValues` now read from this real data instead of the non-existent field.
2. **Floor labels showed only "Level N", not the floor's own name.** `floor-plans/building/{id}` has no
   `name` field either (only `floor_level`). Fixed by fetching `GET /assets/{assetId}` (already returns the
   full nested tree with names) once, flattened into a `componentNameById` map. Labels now read e.g.
   `"floor 1 · Level 0"`.
3. **Sensors cluttered the stacked (multi-floor) view.** `FloorLayer` now only renders `SensorMarker`s when
   `standalone` (isolated) — stacked view shows floor numbering/names only, sensors appear once a floor is
   focused, per the owner's explicit ask.
4. **"Level N" floated awkwardly on top of the isolated floor's image.** That 3D `<Html>` tag now only
   renders in the stacked view (multiple floors genuinely need individual in-scene labels there); the
   isolated view instead gets a normal 2D breadcrumb overlay (`{buildingName} / {floorName} (Level N)`),
   top-right, next to the existing top-left back button — same treatment, not floating on the image.
5. **No way back to the isolated view from a sensor's detail modal.** Root cause: `ModalContext` is a
   single-slot store (`openModal` replaces, doesn't stack) — clicking a sensor called the global `openModal`
   for `DevicePointsModal`, which destroyed the whole Building 3D viewer underneath, and the modal's own
   close button called the same global `closeModal`, closing everything with nothing to return to. Fixed by
   giving `DevicePointsModal` an optional `onClose` prop (backward compatible — defaults to the original
   global `closeModal`, so its two other existing call sites are unaffected) and rendering it as local state
   (`viewingDevice`) inside `BuildingMultiFloor3DViewer` instead of through the global modal — closing it now
   just clears local state, leaving the Building 3D view (stacked or isolated) intact underneath. First
   attempt layered it as an absolute-positioned overlay on top of the still-mounted `<Canvas>`, but drei's
   `<Html>` portals its marker/floor labels with a very high default z-index, which bled through on top of
   the overlay — fixed by swapping the `<Canvas>` out for the modal entirely (mutually exclusive render)
   rather than layering, which sidesteps the z-index problem structurally.

Live-verified end to end on `arfa - building`: stacked view shows `"floor 1 · Level 0"`/`"floor 2 · Level
1"` with zero sensor markers; isolated floor 1 shows the owner's own uploaded floor-plan image, breadcrumb
`"arfa - building / floor 1 (Level 0)"` top-right, back button top-left, right panel sensor listed as
`"area - 2 — dev2-beta"` in green (real online state) with `"temperature: 8002"`; clicking it opens
`DevicePointsModal` cleanly (no bleed-through) showing real point data (`Temp Alert: 8002`,
`deviceInfo.devEui: dev2-beta`, last-reported timestamp); closing it returns to the Building 3D view intact.
`tsc --noEmit` clean.

**Follow-up (2026-09-23) — camera-rotation label reliability, alert marker contrast, points modal:**
owner re-tested with a real alerted sensor (`site 1`/`f7c4`, real `temperature` attribute `isAlert: true`)
positioned on `floor 1` alongside `area - 2`. Three more issues, all fixed in `BuildingMultiFloor3DViewer.tsx`

- `DevicePointsModal.tsx`, live-verified, frontend-only:

1. **Stacked-view "Level N" 3D labels misalign as the camera rotates around several closely-stacked
   floors** — rather than chasing a perfect 3D anchor (inherently fragile: drei's `<Html>` labels are flat
   screen-space overlays with no depth occlusion, so they can visually drift near/over the wrong floor from
   certain angles), added a reliable 2D "Floors" list to the left summary panel — each floor by name +
   level, clickable to isolate it, with an alert-count badge. Camera-angle-independent by construction; the
   3D labels/plane-click still work too, this is an additional, more reliable path, live-verified as the
   primary way to select a floor now.
2. **Alert-state 3D marker text was low-contrast** — `SensorMarker`'s floating label used the same red
   (`colors.text`) for both text and border on a dark chip, which read fine in the flat 2D right panel but
   looked muddy floating over a busy floor-plan image. Changed to white text on a solid red chip — confirmed
   live, `site 1 — f7c4`'s alert marker is now clearly legible.
3. **"Commandable" column removed** from `DevicePointsModal`'s points table per owner's ask — confirmed it
   already shows real configured-attribute data (`deviceInfo.devEui`, `Battery voltage`, `Water leak`,
   `Temperature`, with real last-packet values/units), just needed that column gone.

`tsc --noEmit` clean.

**Follow-up (2026-09-23, same day) — left-panel order, many-floors/many-sensors edge cases, marker contrast
bug found in both states:** all in `BuildingMultiFloor3DViewer.tsx`, live-verified with 5 real floors added
via direct API calls (`floor 3`/`4`/`5`, ids 6/7/8, `floor_level` 2/3/4) specifically to exercise these edge
cases, `tsc --noEmit` clean:

1. **Left-panel order** — the "Online vs Offline, by Floor" chart now renders above the "Floors" list
   (owner's ask), not below it.
2. **Many-floors / many-sensors overflow** — both the left panel (`Floors` list) and right panel (`Sensors`
   list) already had `overflow-y-auto` on their outer containers; confirmed this actually engages with 5
   real floors (`panel.scrollHeight (601) > clientHeight (565)`) rather than just trusting the class was
   there. Right panel's identical CSS pattern wasn't independently stress-tested with extra sensors (no
   more spare devices to assign in this environment) but is the same mechanism.
3. **Many floors in the stacked 3D view** — the camera position/distance were fixed regardless of floor
   count, so a tall stack would get cut off by default. Added a `stackedCamera` memo that scales the
   camera's position outward and re-centers its height on the stack's vertical midpoint as floor count
   grows (`scale = 1 + stackHeight/10`), and scales `OrbitControls`' `maxDistance` to match. Live-verified
   with 5 floors: all 5 fit cleanly in frame on open, no manual zoom-out needed.
4. **Found and fixed a real contrast bug affecting BOTH the alert (already "fixed" last round) and normal
   states** — `SensorMarker`'s label used `var(--ink-0)`, `var(--line)`, `var(--surface-0)` for the
   non-alert branches, but the project's actual CSS custom properties are prefixed `--color-*`
   (`--color-ink-0`, `--color-surface-0`, etc. — checked directly in `src/index.css`). These wrong names
   silently resolved to nothing: background fell through to fully transparent, text color fell back to
   inherited (happened to render white here). On the owner's white uploaded floor-plan image this made the
   "normal" (green) marker's white-text-on-nothing label invisible — exactly what they reported. Owner's own
   fix direction ("do it like alerted has bg red") was cleanest: **every** state (alert/normal/offline) now
   renders as a solid `colors.text`-background chip with white text, unconditionally — not gated behind
   `isAlert` and not depending on any CSS variable resolving correctly, so it's legible against any image
   color by construction. Also fixed the same wrong-variable-name bug in `FloorDetailPanel`'s border color
   (`var(--line-soft)` → `var(--color-line-soft)`) — lower-risk there since that panel sits on the app's own
   solid background, but wrong regardless.

**Status: zero code read, zero live testing done for this task in this session.** The owner gave the
requirements below, then said **"wait stop"** the instant I was about to start reading code, because
context was about to run out — so this is a clean handoff, not a resume-mid-investigation.

**The owner's own instruction for how to start this (do this first, literally, before writing any
code):**

> "first run on chrome do live and check what i told you is working as it is, then as many questions as
> you want until you get whole point and flow of this buliding module, then we will update current
> implementation"

So the first steps in the new session are, **in this order**: (1) read the current implementation —
`src/screens/Assets.tsx`, `AddEditEntityModal.tsx` (or equivalent — verify actual filenames, don't
assume from memory), `FloorPlanEditor.tsx`, `BuildingMultiFloor3DViewer.tsx`, and whatever else `grep`
turns up under the `/assets` route; (2) log in live in Chrome as `junead@chaminade-hs.org` (never demo
mode) and exercise the existing building the owner already created at `http://localhost:3000/assets`,
to verify each claim below against real behavior; (3) ask clarifying questions until the whole flow and
its edge cases are understood; (4) only then plan/implement, following `## 🔁 THE FEATURE REQUEST FLOW`
above if any backend change turns out to be needed.

**The owner's requirements, preserved close to verbatim (their own words, lightly reformatted for
readability — do not silently reinterpret these, ask if anything is ambiguous):**

- **The domain model:** a client/business has a building they want to automate. Hierarchy example given:
  `building 1 → floor 1 → unit 1 (1 sensor attached)`. The tree can go arbitrarily deep, any number of
  siblings horizontally or vertically ("any nth horizontal or vertical numbers"). At exactly one point in
  each vertical branch — e.g. a "unit" or a "unit → site" — **exactly one sensor can be assigned, and
  that point is the last node in that branch** (terminal/leaf node = exactly one sensor, nothing below
  it). The owner said this part ("you can see it for yourself") is already reflected in the current CRUD
  and believed working.
- **Floor-plan image upload should be restricted to only the first-level child of a building** (i.e.
  only "floor"-type nodes, not units/sites/anything deeper). **Current (wrong) behavior per the owner:**
  a floor-plan image can currently be added to _any_ node in the tree, not just the building's immediate
  child.
- **The right-side device panel, when viewing a floor's floor-plan, should show ALL devices/sensors
  under that floor's entire subtree** (every descendant, arbitrary depth), not just immediate children.
  Owner's concrete example: floor 1 has two units, each with an assigned sensor; after adding a floor
  plan to floor 1, the right side should show **both** sensors with their DevEUIs. **Current (wrong)
  behavior per the owner:** if you add a floor plan to a node that is NOT the top-level floor (e.g. to a
  "unit" node whose child is a "site" with a sensor), the right side only shows that immediate child's
  sensor — because floor plans can currently be added at the wrong tree level in the first place, the
  "right panel" logic ends up scoped to whatever level the plan was added at, not to the true floor
  level's full subtree.
- **Drag-and-drop:** the owner wants to pick a device from the right-side list and drop it onto the
  floor-plan image itself (this part's current-vs-wanted state is unverified — the owner said "this is
  somewhat working also" but gave no specifics; confirm exact current behavior live before assuming
  anything).
- Owner's own framing of scope: **"most of work has already been done, we just need adjustments both on
  frontend and backend (like no floor plans on all children except first child of building, showing of
  all sensors under that floor, pick and drop of sensors from left side to that floor image plan)"** —
  i.e. this is corrective/scoping work on an existing feature, not a ground-up build. Expect a backend
  change may be needed (e.g. an API to fetch "all devices under this floor's subtree" if one doesn't
  already exist) — if so, that's a Feature Request Flow ask into `backend_frontend_sync/`, not something
  to guess/mock past step 3.

**Do not start implementing anything until questions from step (3) above have been asked and answered.**

---

## ▶ NEXT TASK (owner-assigned, 2026-09-23) — Product onboarding redundant-UI audit — **IN PROGRESS**

Owner asked, before moving past the Asset/Building module: audit the product onboarding modal/form
(`src/forms/MultiStepForm/{AddDevices,SecondstepForm,ThirdstepForm,FourthstepForm}.tsx`,
`src/forms/FormComponents/{Dropzone,TagInput}.tsx`) for redundant UI — things that don't call an API or
have no backend implementation — named `bulk devices`, `tags`, `device location` as suspects. Findings and
decisions (owner picked, in order):

1. **CSV bulk-import dropzone** (`Dropzone.tsx`, in the "Device Details" onboarding step) — confirmed
   completely dead: `<input type="file">` with **no `onChange` at all**, no state, no API call. No backend
   endpoint exists for CSV/bulk device import either (checked `devices.yaml`/`products.yaml`). The
   row-based "+ Add Another Device" flow next to it (`TagInput.tsx`) already works and covers multi-device
   add via `POST /api/products`. **Owner's call: build it out for real** (a genuine enterprise need — bulk
   sensor onboarding), but **deferred until the rest of this module is done** — owner has more instructions
   coming for this module first. **Not started.**
2. **Device Location** — turned out to already be a real, displayed, editable column on the actual
   reachable devices page (`ManageDevice.tsx`, route `/products/{id}/devices` — inline-editable via
   `PUT /api/devices/{id}`). No change needed; corrected an initial wrong assumption (a stray grep pattern
   missed the `accessor:`-based column definition). **Done — no action required.**
3. **Tags** — same capture/store/return path as Location (confirmed in `api_contract/openapi/products.yaml`'s
   `POST /products` schema: optional, but present in both request and the `201` response), but never
   displayed or used anywhere downstream. Owner's call: **remove it entirely** rather than build a display.
   **Done, frontend-only:** removed the Tags input from `TagInput.tsx`, the Tags column from
   `ManageDevice.tsx` (the real page) and `AllDevices.tsx` (see #5), and stopped including `tags` in the
   `POST /products` payload (`AddDevices.tsx`'s initial `step2.data` shape). **Backend ask filed** in
   `backend_frontend_sync/communication/findings.md` (2026-09-23 row): drop `tags` from `POST /products`'s
   device request/response schema — not blocking, no rush.
4. **Devices bulk-delete** — the "Delete Selected" bulk action looked broken (`handleBulkAction` was a
   no-op, just cleared the selection, no API call) — but that was in `src/screens/AllDevices.tsx`, which
   turned out to be **dead/orphaned code**: its route (`/devices`) is commented out of the sidebar
   (`LeftSidebar.tsx` line ~190), unreachable through normal navigation. The REAL, actually-used devices
   page (`ManageDevice.tsx`, `/products/{id}/devices`) already has fully working bulk delete **and**
   bulk enable/disable, all wired to real endpoints (`POST /devices/bulk/destroy`,
   `/devices/bulk/enable`, `/devices/bulk/disable`) with real confirmation modals — live-verified: selected
   the one real device, opened "Delete Devices — are you sure..." confirmation, cancelled rather than
   actually deleting it (real data, didn't want to destroy the owner's test device). **No fix was actually
   needed on the real page.** Did still apply the same Tags-column removal to the dead `AllDevices.tsx` file
   for consistency (harmless, and correct if that route is ever re-linked later) — **flagging `AllDevices.tsx`
   itself as a candidate for removal** (near-duplicate of `ManageDevice.tsx`'s Devices tab) to raise with the
   owner, not removed unprompted.

**Still open / next:** ask the owner whether to delete `AllDevices.tsx` + its route entirely, then the
deferred CSV bulk-import build-out (needs a new backend endpoint — Feature Request Flow), then whatever
further onboarding-module instructions the owner has queued up.

---

## ▶ NEXT TASK (owner-assigned, 2026-09-23) — Enterprise demo-readiness audit — **punch list mostly DONE**

> **Standing priority, read every session from here on: make this real thing client-worthy — sellable to
> an actual enterprise customer.** Not a demo, not a prototype — the real flow real users like
> `junead@chaminade-hs.org` go through. Polish and completeness of the real product take priority over
> demo-mode tooling (see the demo-mode note below).

Owner asked, once the product onboarding module was fully done: step back from bug-hunting and evaluate
login → home → product onboarding → devices → connectors → building as a first-time enterprise buyer
would, looking for friction, missing capabilities, and unnecessary complexity — not just "does it work."
Explicit framing: CSV bulk-import (built earlier this session) is the model case of a _missing capability_
that existed alongside a bug-free flow — i.e. "working correctly" isn't the same as "complete."

Full audit run (fork, code + live Chrome, logged in as `junead@chaminade-hs.org`) covering: login, home
page, the "Add Devices" onboarding modal, Connector Health, and the Assets/Building entry screen. Findings
below, grouped by severity. **Demo-mode tour code** (`StartModelDemo`/`AddProductModelDemo.ts`,
`isDemoMode`) **is explicitly out of scope for this whole pass** — owner's call: it was already unreachable
before this pass (`isDemoMode` can never become `true`, a separate pre-existing bug — confirmed, not
touched), so nothing regresses either way; it'll be re-molded to match the real flow once the real flow is
settled, not before.

### 🔴 Blocking — would embarrass or lose the deal live

- [x] **"Existing Product" step-1 option is a dead end.** **Resolved differently than originally scoped —
      owner's decision (2026-09-23): remove the choice entirely, not fix the picker.** No more
      Existing/New/Template boxes at all. The global "Add Product" flow always creates a new product; the
      existing-product path (adding devices to a product you're already on, via that product's own "Add
      Device" button) was already working and is untouched. See the friction item below — this and the
      step-1/2 merge were done together as one piece of work.
- [x] **Raw backend keys leak onto Connector Health's capability badges** (`_READ`, `_WRITE`,
      `IS_PUSH_BASED` instead of humanized labels). **Fixed.** Root cause confirmed via a live raw fetch to
      `GET /api/connectors/health`: the real API returns snake_case (`supports_read`, `is_push_based`), not
      the camelCase the cleanup regex assumed. Rewrote the regex to strip the `supports_`/`is_` prefix and
      convert underscores to spaces. Live-verified: badges now read READ / WRITE / PUSH BASED.

### 🟡 Friction — technically works, but a real user would frown or hesitate

- [x] **Owner's own suspicion about onboarding-modal complexity, confirmed — but not where expected, and
      resolved with a bigger structural change than a copy fix.** Step 2 (manual-row table + CSV dropzone)
      was already fine. The real friction was steps 1 and 3 — **owner's decisions, both implemented:**
  - [x] **Step 1 over-promised** (existing/new/template choice, template picker built-but-dark). **Fixed by
        removing the choice entirely** (see blocking item above) **and merging the surviving product-name
        field directly into the devices step** — the modal is now 2 steps ("Product & Devices" /
        "Network Protocol") instead of 3, since product+devices were already one atomic save underneath
        anyway. `SecondstepForm.tsx` gutted to just the name field; `AddDevices.tsx` restructured
        (`step===1` handles the combined save, `step===2` is Network Protocol unchanged). **Found and fixed
        a real bug the merge introduced before it shipped:** the Back button used to sit before the save
        point; after merging, that same step number became Network Protocol — after the save — so Back
        would let a user resubmit and create a duplicate product. Removed the Back button entirely (matches
        the old flow's own behavior, which never had one past its save step either). Live-tested: fresh
        product+device creation, existing-product "Add Device" entry point (still skips the name field,
        still closes immediately, no Network Protocol step), and confirmed no duplicate is created on a
        resubmit attempt.
  - [ ] **Step 3 hard-locks the modal** ("Network Protocol — Don't Skip", no close button until HTTPS/MQTT
        is configured). **Deliberately left alone — owner has their own plan for this, not yet shared.**
        **⚠ STANDING REMINDER (owner, 2026-09-23, said twice now — ask them, don't just leave this
        parked indefinitely):** owner wants to discuss their own solution for this "Don't Skip" lock. Bring
        it up proactively next session if they haven't already, don't wait to be asked a third time.
- [x] **Home page's device-status numbers look self-contradictory at a glance** (0 online, 3 offline, but
      "Active in last 24h" also 3, nothing explaining why). **Fixed.** Added a one-line hint under each of
      the three time-windowed stats — "Reporting right now" / "Not reporting right now" / "Reported within
      24h — may include offline devices" — the last one directly defuses the apparent contradiction.
      Live-verified. (The separate "Recently Active Devices panel shows empty" note isn't a code issue —
      just have a genuinely-streaming device live before any real client demo.)
- [x] **React Flow's free-tier attribution watermark was visible on the Assets/Building canvas.** **Fixed**
      — added `proOptions={{ hideAttribution: true }}` to `FlowChart.tsx`'s `<ReactFlow>`. Verified via DOM
      query (`.react-flow__attribution` no longer renders).

### 🟢 Missing capabilities — a real buyer would expect these and they don't exist

- [x] **Device protocol selection — owner's decision (2026-09-23): this isn't a real concept, drop it, not
      revive it.** Owner + their boss decided: there's no such thing as "device protocol" in the product
      model — only **network protocol** (HTTPS/MQTT, i.e. Step 3) exists. The commented-out
      LoRaWAN/Modbus/BACnet/OPC UA selector was never wired back in; `device_protocol_id` is no longer sent
      in the create-product payload at all (previously sent as explicit `null`, now just omitted).
- [x] **Product templates — owner's decision (2026-09-23): out, boss doesn't want this feature.** Not
      revived. The commented-out picker code stays commented (untouched, not deleted — could resurface
      later if the decision changes, but not being maintained).

### ⚪ Nice-to-haves

- [x] "Mqtt" → "MQTT" casing on the Connector Health card title. **Fixed** alongside the badge-label fix —
      added an explicit `CONNECTOR_LABELS` map (`mqtt` → "MQTT", `webhook` → "Webhook") with a graceful
      fallback for any future connector key, replacing the CSS `capitalize` class that only ever uppercased
      the first letter.
- [ ] A couple of i18n keys still say `datacake_product`/`datacake_product_desc` internally — **now moot**,
      these exact keys were deleted as part of the `SecondstepForm.tsx` rewrite (replaced with
      `FirstStep.product_details_heading`/`product_details_info`). No action needed.
- [ ] `ManageDevice.tsx`'s devices table search/filter feels slightly less polished than
      `ManageProduct.tsx`'s equivalent — not broken, still not dug into deeply, still flagged for a closer
      pass later.

**Everything in this list is now done except step 3 (owner has their own plan) and the devices-table-polish
nice-to-have (never blocking, low priority).** `tsc --noEmit` clean after every change in this list, each
live-tested in Chrome before being marked done.

**Done (2026-09-23, same day) — consolidated `next build` check.** Owner's own dev server had been stopped
by this point, so ran it clean: dev server confirmed down, `.next` removed, `NODE_OPTIONS=--max-old-space-
size=6144 npx next build` — clean, no errors, `/devices` route confirmed absent from the output (matches
the `AllDevices.tsx` deletion). `.next` removed again afterward and a fresh `npm run dev` started so the
owner could check the fixes live themselves.

**Done (2026-09-23, same day) — onboarding modal resize/flicker fixed + MQTT marked coming-soon.** Owner
tried the rebuilt modal live and reported two more things:

1. **The modal visibly resized/flickered between steps** (step 1 → step 2, and again switching HTTPS ↔
   MQTT within step 2). Root cause: the MUI `Dialog` sizes itself exactly to content (`width/height: auto`,
   no transition) — any content-size change snaps the dialog to a new size and recenters instantly.
   Measured real heights live: step 1 content ~567px, step 2 HTTPS ~515px, step 2 MQTT ~234px. Fixed by
   giving the step-content area a fixed `h-[640px] overflow-y-auto` in `AddDevices.tsx`. **First pass only
   fixed height — owner caught that width was still resizing** (909.6px on step 1/HTTPS, collapsing to
   527.2px on the narrow MQTT placeholder, confirmed live). Root cause was the same class of bug: the root
   wrapper only had `max-w-[860px]` (a ceiling, no floor), so shrink-to-fit sizing collapsed to whatever the
   narrowest content needed. Fixed by changing it to `w-[860px] max-w-[95vw]` (a real fixed width, `vw` cap
   only for narrow-viewport safety). Live-verified after both fixes: step 1, step 2/HTTPS, and step 2/MQTT
   all measure identically — 909.6 × 861.6px, every time. Any single step's content that ever exceeds
   640px tall scrolls internally instead of resizing the dialog.
2. **MQTT should say "coming soon" and the real MQTT code should be commented out** (incomplete on both
   frontend and backend). Done in `FourthstepForm.tsx`: `<MQTTProtocol>` usage and its `handleMqttConnect`
   handler commented out (not deleted — easy to restore later), replaced with a "MQTT — Coming Soon"
   placeholder. The Acknowledge button correctly stays disabled while the MQTT tab is active (nothing sets
   `formData.step3.isFilled` for MQTT anymore), so nobody can mistake the placeholder for a completed step.

`tsc --noEmit` clean, both fixes live-verified in Chrome (height measurements + DOM checks; screenshot
capture was flaking in-session, verified via `getBoundingClientRect()` and page-text dumps instead).

---

## ▶ NEXT TASK (owner-assigned, 2026-09-24 22:0x) — FLEET ENTERPRISE READINESS (pagination · search · filters · sort · full CRUD)

**Owner's words:** we can't be enterprise level without proper CRUD, pagination, searching, filtration etc. — do it one by one. Ledger/reports/analytics and the other deferred items wait until this is done.
**Full audit, standard, proposals and plan live in `backend_frontend_sync/communication/flows/06-fleet-enterprise-readiness.md` (pointer: flows/04 §26). Read it first.**

**Current state (audited 2026-09-24, live + contract + code):**

- Owner flow complete and confirmed (flows/04 §22); realtime + edit/deactivate/delete-planned-trip done.
- **Pagination:** ONLY `GET /trips` is paged by backend (20/page) — and the frontend shows page 1 only with NO pager (trips beyond 20 are invisible = real bug). Vehicles/drivers/yards/geofences return everything (no paging params in the contract); geofence events = `limit` only.
- **Search / filter / sort: NONE on any fleet list** (no `search` param exists anywhere in the fleet contract). Backend already supports trips filters `status, vehicle_id, driver_id, customer_id, date_from, date_to` (unused by the UI); `/companies` is the house list standard (`search, sort_by, sort_order, per_page, page` → `data.items` + `data.pagination{page,per_page,total,total_pages}`).
- **CRUD gaps:** maintenance schedules/logs, fuel logs, compliance documents, driver incidents = create+read only (no PUT/DELETE in the contract → needs backend); yard slots no delete; yard layout no replace/remove; vehicle image upload unused; `PUT /trips/{id}` (planned/in_progress) unused → frontend can build "Edit trip" now; trip stops not editable after creation (backend); assignment-history (3 endpoints) + `expiring-soon` unused (frontend-only).
- Dropdown pickers rely on receiving ALL records → must stay unpaginated (propose `/options` endpoints, flows/06 §3.4).

**Plan (each phase shippable; details + acceptance in flows/06 §5):**

1. **Phase 1 (START HERE, frontend-only):** list foundation = `useListQuery` (page/size/debounced search/filters/sort → query params, keepPreviousData, URL-synced) + `DataToolbar` + `Pager` + empty/error states + CSV export; apply to **Trips first** (server paging + existing filters; search client-side over the page until backend adds `search`).
2. **Phase 2:** Vehicles, Drivers, Yards, Geofences, Geofence events with the same components — client-side search/filter/sort/paging behind an adapter until backend §3 lands; bulk select + bulk deactivate/reactivate; CSV export.
3. **Phase 3 (frontend-only):** Edit planned trip (PUT /trips), assignment-history views, expiring-documents widget, vehicle image upload.
4. **Phase 4 (backend-dependent):** edit/delete for maintenance/fuel/documents/incidents, slot delete, layout replace, trip-stop editing, audit line ("last edited by").
5. **Phase 5:** RBAC-aware buttons, consistent empty/error states, a11y, skeletons, saved views.
   **PHASE 1 DONE (2026-09-24 22:4x) — live-verified on Trips with 71 seeded `ZZ-BULK-nnn` trips:** `useListState` (sessionStorage per list, debounced search, resets to page 1), `DataToolbar`, `Pager`, `csv.ts`, `useTripsList` (server paging + filters; search mode loads all pages capped at 1 000 and matches locally until backend adds `search`); Trips screen rebuilt (pager 20/50/100, filters status/vehicle/driver/date, search, Clear, empty/error+retry, Export CSV of all matching rows). Realtime handler now invalidates `trips-list*`. Findings for backend: `date_from/date_to` undefined in contract (observed = trip's own date, not created_at), `status` single-valued, no sort/search. **NEXT = Phase 2** (vehicles/drivers/yards/geofences/geofence events on the same components, client-side search/filter/sort/paging until backend §3; owner decisions still to ask: bulk select+bulk deactivate, CSV export per list). List state is in sessionStorage, NOT the URL yet (fleet tabs aren't URL-routed) — revisit with URL tabs.
   **PHASE 2 DONE (2026-09-24 22:5x) — live-verified:** Vehicles, Drivers, Yards, Geofences + geofence events on the shared foundation: `useClientList` (client-side search/filter/sort/paging; comparators are direction-aware with empties LAST), `useSelection`, `useBulkAction` (4 concurrent POSTs, per-record refusals with backend's messages), `BulkBar`, `SelectableRow`. Owner chose bulk deactivate/reactivate (Vehicles/Drivers/Yards) + CSV export on all lists. Seeded/verified: 66 vehicles, 46 drivers, 36 yards, 33 geofences. Events: "Load more" + type/text filters; backend quirk — `limit` applies BEFORE the alert_on filter (limit=20 → 17 rows) so "fewer than limit" ≠ exhausted (flows/06 §8.2). **TEST DATA TO CLEAN UP LATER:** `ZZ Bulk Veh 001–060`, drivers `ZZBulk001–040`, yards `ZZ Bulk Yard 001–030` (+25 auto geofences), trips `ZZ-BULK-001–071`. **NEXT = Phase 3** (frontend-only): Edit planned trip (`PUT /trips/{id}`), assignment-history views (vehicle/driver detail + company-wide), expiring-documents widget, vehicle image upload.
   **OWNER DIRECTION (22:3x): client-side filtering is only a stopgap — enterprise needs SERVER-SIDE search/filter/sort/pagination (no downloading thousands of rows). B1/B2 are now an explicit PRIORITY 1 request to backend (banner in flows/06 + STATUS), plus new B8 (map `bbox`/limit/clustering for positions, yards, geofences) and B9 (paged detail sub-lists: maintenance/fuel/incidents/history). When backend marks B1/B2 BUILT: switch each screen's adapter (`useClientList` → request params; `useTripsList` search branch → `search` param; dropdowns → `/options` endpoints) — small per-screen change. Until then: no more client-side list features; only backend-independent Phase 3 work.**
   **Backend asks B1–B9 sent (PROPOSALS) in flows/06 §7; don't build against them until BUILT.** Owner decisions to raise when reached: client-side-first (recommended), page size 20 + URL state (recommended), bulk actions/export, hard-delete policy (deactivate-only?), file attachments for documents, which filters matter.
   **Pagination test data:** seed ≥60 trips, ≥100 vehicles/drivers, ≥30 yards/geofences with a `ZZ bulk` prefix via API; clean up (delete planned trips, deactivate the rest).

## ▶ NEXT TASK (owner-assigned, 2026-09-24) — Fleet Management — **COMPLETE (2026-09-24 21:5x) — historical record; current state is in ▶▶ RESUME HERE at the top**

**Analysis only, no code edited (commit 2ee2d5c).** Deliverable:
`backend_frontend_sync/communication/flows/04-fleet-management.md` — per-tab UI→API tables, backend rules found
live, sensor/automation status, bugs (backend B1–B12, frontend F1–F10), raw-ID-input→dropdown list,
unused/missing endpoints, questions C1–C9. Owner's vision: vehicle → driver → yards/geofences → assign
tracker+driver → trip with yard stops → start; progress updated by humans AND sensors, on a real map. CRM and
billing OUT of scope.

**Headline gap:** geofence events fire from sensor packets but never update a trip's planned yards (bridge
missing); no manual arrive/depart; map shows no trips; assign-device 500s on DevEUI; vehicle `yard_history`
always `[]`; no edit/delete for vehicles/drivers/yards/slots.

**Added 2026-09-24 (owner concern, live-verified, in flows/04 §9):** attribute config has no "location" option —
lat/lng need a dummy mandatory alert condition, and backend detects coordinates by the LABEL text ("Latitude"/
"Longitude"; renaming to anything else silently stops positions). Owner's suggestion: third option "tracker-related →
pick Latitude/Longitude". Backend to decide the shape (role field vs endpoint).

**Done 2026-09-24 (frontend-only, owner-approved per field):** raw-ID inputs → dropdowns for vehicle→assign
driver, driver→assign vehicle, yard slot check-in vehicle, trip-create driver (same ids/endpoints as before).
**Deliberately left as text inputs:** (1) vehicle Tracker tab "Tracker Device ID" — PLANNED backend ask: endpoint
listing devices not assigned to any vehicle (internal id + name + DevEUI + product); convert once it exists.
(2) Trip-create "Fleet customer ID (optional)" — CRM, out of scope; REMOVE the field + `fleet_customer_id` payload
key from `src/screens/Trips.tsx` after the backend review. Both also noted in flows/04 §5.
**Parked observations from the dropdown live test (fix later, in flows/04 §4 as F11 / F5 update):** Trips list
doesn't refetch after cancelling from the trip modal (stale `planned` row); trip-create vehicle select still shows
duplicate vehicle names with no disambiguator.

**2026-09-24 15:5x — backend replied (flows/04 §10/§11); owner decided everything in flows/04 §12** (GPS role via
"Mark as location" in the attribute ⚙ menu; map+trip show positions/yards/geofences/route stops/trail; manual
arrive/depart in trip timeline with reason to overwrite; all 3 socket events + refetch on reconnect/focus + safety
poll 2 min Map/Trips, 5 min Dashboard; yard radius field; bridge accepted, operator confirms completion; all three
fleet rules; assignable-trackers endpoint; 4 CRUD gaps first batch; assigned-only positions). Frontend-only items
DONE + live-verified: ISO datetimes, `maintenance_schedule_id`, stale copy + Trips list refresh + vehicle select #id,
trip driver now required (backend 422s without one). **WAITING on backend:** a flow note per build step with real
shapes (attribute role mark/unmark, assignable trackers, trip route, stop arrive/depart, socket payloads, small
fixes B1/B3/B4/B8/B9, `/fleet/devices/{id}/history`). Frontend builds each step only after its flow note arrives
([[feature-request-flow]]). A copy of the sync folder is owed to backend.

**Sync-folder hygiene (backend request, 2026-09-24):** never run Prettier over `backend_frontend_sync/api_contract/`
(generated; backend's `openapi:check` compares bytes). Root cause was the husky pre-commit lint-staged hook reformatting
staged `*.md`/`*.json`; fixed by adding `backend_frontend_sync/api_contract/` to `.prettierignore`. After the owner pastes
backend's folder (stamp 2026-09-24 15:50 PKT, by backend): `git diff` first, keep backend's README/STATUS/api_contract,
re-add only my own notes. Backend's regenerated copy is owed to the frontend.

**2026-09-24 17:1x — backend built steps 1–3 (flows/05 BUILT); frontend built + live-verified against them:**
"Mark as location" (Lat/Lng/Speed/Heading) + "Clear location role" in the attribute ⚙ menu with role badge, checkbox
locked while a role is set, "GPS tracking on/off" status line (ProductConfiguration.tsx); Tracker tab dropdown from
`GET /vehicles/assignable-trackers` ("no GPS yet" tag, sorted last); driver→vehicle dropdown greys out vehicles that
already have a driver. Re-test of steps 1–3 clean (flows/04 §14). Steps 4–7 (manual stops + trip route, sensor bridge,
realtime, CRUD + yard radius) NOT built by backend yet — don't build against them until flows/05 says BUILT. Copy of
the sync folder (stamp 17:17 PKT, by frontend) is owed to backend.

**2026-09-24 frontend-only queue (owner-approved, live-verified, uncommitted at time of writing):** customer ID removed
from the trip form; trip timeline fixed (no "Current" on completed trips, yard stops only "Completed" with evidence,
"Missed" badge); stray debug log removed; `FLEET_CURRENCY` constant (`src/utils/fleetCurrency.ts`) replaces hard-coded
PKR; Add Vehicle / Add Driver forms gained a collapsible "More details" (vehicle: plate, VIN, year, odometer, tank,
cost centre, width/height, gross weight, payload, acquisition date/cost; driver: email, phone, hire date, payroll
ref) with plate/phone/email shown in rows/headers; reusable `CoordinatePicker.tsx` ("Pick on map": click/drag pin)
wired into yard, manual geofence and trip origin/destination. Owner scope notes: financial LEDGER + reports/graphs/
analytics come LATER (after the fleet module is fully functional to the intended flow); CRM and payments stay OUT except
exposing payment APIs (client integrates them; we only post responses).

**2026-09-24 17:4x — backend built step 4 (flows/05 §5 BUILT); frontend built + live-verified:** trip Timeline stop actions
(`StopActions.tsx`: Mark arrived/departed with editable time, reason required to correct, History from `events[]`),
trip detail "Map" tab (`TripRouteMap.tsx`) + Fleet Map "Show trip route…" selector (both via `TripRouteLayers.tsx`,
`GET /trips/{id}/route`), Complete form's odometer now optional, "Destination reached — confirm completion" banner
(needs step 5 to ever show). Shared `src/utils/datetime.ts`. Backend next = step 5 (sensor→trip bridge). Pending asks
below WERE sent in flows/04 §15 (stamp 17:49 PKT, by frontend) — copy of the folder owed to backend.

**2026-09-24 19:1x — backend built step 5 + value lists (`GET /fleet/options`) + `companies.currency` + `fleet_only` + parked hours (flows/05 §6, §11, §12; flows/04 §16); frontend built + live-verified all** (see flows/04 §18): Add Vehicle/Driver dropdowns + certifications, company currency (Fleet dashboard reads it; Currency dropdown in Account Settings company form; company id bug fixed in AddLocation), "Needs Attention" `fleet_only=1`, trip timeline sensor labels/destination-reached time, geofence events "Trip #id", 30 s refresh of in-progress trips. Sensor bridge tested with real packets. Backend next = step 6 realtime (`fleet:position`/`geofence:event`/`trip:update`), then step 7 (CRUD + yard radius auto-geofence). Backend once returned flows/04 truncated to §16 — restored from git; README now forbids deleting/condensing the other side's sections.

**2026-09-24 19:18 — backend built step 6 realtime (flows/05 §7, API_CONTRACT §4.6); frontend built + live-verified** (flows/04 §20): `subscribeFleetEvent` in
SocketContext (+ local `fleet:connected` on every (re)connect), `useFleetRealtime` hook mounted in FleetManagement (positions patched in cache, trip:update /
geofence:event refetch, reconnect refetches fleet keys), polls lowered to 2 min (Map/Trips/Geofences/vehicle) and 5 min (Dashboard). Not exercised: reconnect refetch,
user without `all-fleet`. Backend next = step 7 (CRUD + yard radius auto-geofence) = the LAST fleet step; then frontend edit/deactivate screens, yard radius field, delete planned trip.

**2026-09-24 21:3x — backend built step 7 (flows/05 §8) = ALL 7 STEPS DONE on backend; frontend built + live-verified all of it and re-tested the whole owner flow end to end (flows/04 §22):**
shared `VehicleFields`/`DriverFields` (+ Edit forms in the detail modals, changed-fields-only PUT), `DeactivateControls` + "Show inactive" on Vehicles/Drivers/Yards, yard radius on Add + `YardEditForm`,
slot edit/move, `GeofenceEditForm` (centre only for manual geofences), delete planned trip, `fleetCache.ts` (`invalidateFleetQueries`), currency first-paint from `user.company.currency`, stop-time default now has seconds
(bug: rounding to the minute could precede the arrival → 422). Fleet task can be closed from the frontend side. Still pending on the OWNER (not blocking): `created`/`deleted` reason on trip:update and a
company-room event for vehicle/driver/yard edits. NOT built: enterprise extras (alerts/notifications, reports/ledger/analytics, driver app, bulk CSV import, ETA) — owner said later, after the module is functional.

**Owner decided the 2 open realtime questions (both recommended):** `trip:update` gets `created` + `deleted` reasons; one generic company-room `fleet:changed {entity,id,action}` event for vehicle/driver/yard
(+geofence) edits — requested from backend in flows/04 §23. FRONTEND TODO once backend marks them BUILT: subscribe to `fleet:changed` in SocketContext (`FleetEventName`) + `useFleetRealtime` (invalidate the
matching lists/details/dropdowns by entity), confirm trip:update `created`/`deleted` refresh the Trips list + Fleet-Map selector + dashboard, then re-test with two sessions.

**2026-09-24 21:5x — backend closed the fleet task (built `fleet:changed` + trip:update created/deleted before our request arrived); frontend subscribed to `fleet:changed` (useFleetRealtime) and live-verified with a simulated second operator (flows/04 §25). FLEET IS DONE end to end. Next = the deferred/parked backlog (owner picks).**

**DEFERRED BACKLOG (owner, 2026-09-24 21:5x — "keep all of these in the deferred list, we have to work on something else first"; do NOT start unless the owner says so):**
(1) Rule Builder system notification: `notification:new` socket listener + bell/unread count + notification center on `/notifications` (needed for any in-app alerting; also the future channel for fleet alerts).
(2) Rule Builder dead per-row Active/Inactive toggle (`RuleBuilder.tsx` ~line 303, commented-out `handleSingleStatusChangeClick`).
(3) Rule Builder SMS live test (needs the owner's phone; I cannot receive SMS).
(4) Onboarding step 3 "Network Protocol — Don't Skip" lock (owner will share their own idea).
(5) Fleet enterprise extras: fleet alert rules/notifications, reports + graphs + financial ledger + analytics, bulk CSV import (vehicles/drivers), driver-reported stops / driver app, ETA.
(6) ~~Phase 3 verification debt V1–V3~~ closed 2026-09-25 00:08 PKT (see ▶▶ RESUME HERE); leftover: light-theme look + geofence events column at full width.
Owner has ANOTHER fleet task coming next — wait for it.

**PENDING BACKEND ASKS — (now sent in flows/04 §15; kept here for history) — send with the NEXT sync round (deliberately not in the folder yet, so backend isn't
re-copied mid-build):** (1) canonical value lists for `fuel_type`, `ownership_type`, `employment_status`,
`availability_status`, and the documented shape of driver `certifications` — contract has them as free text, reports
need clean values; frontend then adds them as dropdowns. (2) company-level currency setting (replaces FLEET_CURRENCY).
(3) F6: `/fleet/dashboard/alerts` mixes company-wide IoT rule alarms into "Needs Attention" — should it be fleet-only?
(4) F10: dashboard "parked" hours for a vehicle with no tracker (formula is the old app's; owner's call to change).
(5) later, when the module is functional: ledger/reports/analytics + payment-API design.

**Older next-step note (superseded by the above):** owner returns with backend's reply / a build order. Then follow THE
FEATURE REQUEST FLOW item by item. Likely first frontend-only wins (no backend needed): replace raw-ID inputs
with dropdowns (driver in vehicle overview, vehicle in driver overview, vehicle in yard check-in, driver in
trip form), fix blank geofence-event names fallback, stale copy on map/vehicle history, timezone-safe
datetime sending, use unused `GET /trips/{id}/gps-trail` + planned yards on the map.

**Test data:** "ZZ …" vehicles 2,3; drivers 2,3; product 118 (devices 146,147); yards 1,2; geofences 1,2;
trips 1–3 in company 2 (login junead@chaminade-hs.org / password123). Owner's own "truck 1"/"john" untouched.
See memory `fleet-management-analysis` for the fuller list.

## ▶ NEXT SESSION — START HERE (handoff updated 2026-09-23, session ended on context limit — demo-readiness

punch list closed except step 3, awaiting the owner's next module)

**Standing priority, carried forward every session:** make the real product client-worthy/sellable — the
real flow real users go through, not demo-mode. See the note at the top of `## ▶ NEXT TASK` above.

**Where things stand right now — read this first:**

1. **Asset/Building module** — fully done, owner confirmed (session before this one).
2. **Product onboarding module** — fully done: Tags removed, bulk-delete/pagination/search audited (2
   backend bugs found + fixed, D-0144/D-0146/D-0147), CSV bulk-import built end to end (D-0148 + frontend
   integration), dead `AllDevices.tsx`/`/devices` deleted, Product ID column removed, "Invalid Date" bug
   fixed, LoRaWAN-only copy generalized.
3. **Enterprise demo-readiness audit** (this session's main work, see full punch list under `## ▶ NEXT
TASK` above) — **done except one item, deliberately deferred:**
   - Onboarding modal cut from 3 steps to 2 (Existing Product/Templates removed entirely — owner decision,
     not reviving them; device-protocol concept dropped too — owner + their boss decided it's not a real
     concept, only network protocol/HTTPS-MQTT exists).
   - Connector Health's raw snake_case keys fixed, "Mqtt" → "MQTT" casing.
   - Home page's contradictory online/offline/24h stats — explanatory hints added.
   - React Flow watermark hidden on the Assets/Building canvas.
   - Modal resize/flicker eliminated — **fixed in two passes**, first pass only fixed height, owner caught
     that width was still collapsing (909.6px → 527.2px on the narrow MQTT tab), second pass fixed width
     too. Confirmed identical **909.6 × 861.6px** across step 1, step 2/HTTPS, and step 2/MQTT — zero
     resize anywhere in the flow now.
   - MQTT marked "Coming Soon" (real `MQTTProtocol` form + its handler commented out, not deleted —
     incomplete on both frontend and backend) — Acknowledge button correctly disabled while that tab is
     active.
   - Consolidated `next build` check done clean; dev server restarted fresh for the owner to verify live.
   - **🟡 DEFERRED, OWNER-DRIVEN — do not raise proactively again:** step 3's "Network Protocol — Don't
     Skip" hard-lock (no way to close the modal or finish later once you're on that step). Asked about it
     2026-09-23 at session start; owner said explicitly to keep it deferred and they'll bring their idea to
     the table later. **Wait for the owner to raise it — asking again would be the third time.**
   - Not done, genuinely low priority, never blocking: `ManageDevice.tsx`'s search/filter polish vs.
     `ManageProduct.tsx`'s (cosmetic gap only).

**Sync folder:** nothing under `backend_frontend_sync/` changed this session — every fix above was
frontend-only (UI/UX polish, no new backend dependency, no backend-relevant decision). Not copying it to
`node-backend` is correct; there's nothing there for that session to see.

**Next up:** waiting on the owner to name the next module — demo-readiness punch list is wrapped, step 3 is
parked per owner instruction (see the 🟡 item above).

---

**Follow-up (2026-09-23, new session) — Rule Builder module started; onboarding modal given an enterprise
visual redesign while blocked on backend.**

4. **Rule Builder module** (`/rule-builder`, `/new-rule`) — **investigation done, live testing not started,
   blocked on the owner checking backend.** Owner reported it worked pre-migration but hasn't been
   retested since. Full flow read from code (`src/screens/RuleBuilder.tsx`, `src/screens/AddNewRule.tsx`,
   `ConditionRow.tsx`, `EmailAction.tsx`, `SmsAction.tsx`, `SystemNotificationAction.tsx`) — one product per
   rule, multiple attribute/value conditions with AND/OR, then email/SMS/system-notification actions with
   placeholders. Payload shape matches the backend's own `rules.yaml` contract (already tested, D-0130).
   **Confirmed root cause for "system notification doesn't work":** the frontend never wired up the
   `notification:new` Socket.IO event or the `/notifications` REST endpoints during the Pusher→Socket.IO
   migration — `SocketContext.tsx` binds `dashboard:update`/`building:update`/`packet:initial`/`device:value`
   only, and there is no bell/notification-center UI anywhere (`BellIcon.tsx` is an unused icon asset). This
   is a real frontend gap, not a backend question — even a perfect backend emit has nothing to render it.
   Owner decision: **leave system notification deferred**, and **don't touch the dead single-row
   Active/Inactive toggle** in `RuleBuilder.tsx` (`// handleSingleStatusChangeClick(...)`, ~line 303) for
   now. Owner is separately asking backend to confirm SMS/email are actually implemented server-side before
   any live test; I cannot self-verify SMS receipt (no telephony access) or email receipt without a real
   inbox — that needs the owner in the loop for at least the SMS leg. **Do not proceed to live-testing SMS/
   email until the owner explicitly says go.**
5. **Product onboarding modal — enterprise visual redesign, DONE, live-verified.** Owner gave full creative
   freedom ("make it beautiful, enterprise level... I leave it up to you"). Redesigned, functionality/ids/
   behavior unchanged (including the step-3 "Don't Skip" lock, which stays exactly as-is per item 3 above —
   only its badge styling changed, not its behavior):
   - `AddDevices.tsx`: numbered circle stepper with a connecting line and checkmark-on-complete (replacing
     the old `border-t-4` bars), icon badge + "Step X of Y" in the header, close (X) button now a proper
     hover target that stays visibly dimmed (not just `opacity-50` on a bare icon) while disabled at step 2,
     footer separated with a top border, primary button bumped to `size="large"` (also removed a dead
     no-op `sx` prop — `Button` ignores `sx` entirely).
   - `SecondstepForm.tsx` / `ThirdstepForm.tsx`: section heading icons, legacy `text-text-dark`/`text-medium`
     classes swapped for the current `ink-*` tokens (same aliased colors, just consistent going forward),
     the two instruction paragraphs merged into one compact icon+text callout (same copy, both `en`/`ar`
     locale strings untouched — no i18n work needed).
   - `Dropzone.tsx`: circular icon treatment for both the empty and file-selected states, tokens updated.
   - `TagInput.tsx`: "+ Add Another Device" is now a real icon+label pill instead of a plain bordered div
     (strips the literal "+ " off the existing translated string via regex rather than hand-editing both
     locale files, so `ar.json` needed no changes).
   - `FourthstepForm.tsx` / `HTTPProtocol.tsx`: protocol tabs got icons (Globe/Radio), the "Don't Skip" text
     is now an amber badge with a warning icon instead of inline red text glued to the heading (copy and
     lock behavior identical), MQTT "Coming Soon" placeholder got an icon, HTTPProtocol's token box is now a
     real button with a copy icon.
   - Verified live in Chrome end-to-end, both **dark and light** theme (the profile happened to be in light
     mode partway through — useful, confirmed both), full create flow (throwaway product → HTTPS → MQTT tab
     → back to HTTPS → Acknowledge → product created), throwaway test data cleaned up via real bulk-delete
     both times. `tsc --noEmit` clean. Hit one unrelated hiccup mid-session — a stale/expired auth token
     caused a 401 on Save; owner had me clear localStorage/cookies and re-login fresh, which fixed it (not a
     bug in this redesign, no code change involved).
   - **Follow-up same day — owner caught leftover dead space below "Add Another Device.**" Root cause: the
     content area's fixed height (`h-[640px]`, needed so switching steps/tabs never resizes the dialog —
     see [[fixed-size-modal-dimension-checks]]) was tuned to the old, more verbose content and never
     revisited after this redesign compacted things. Measured real content height in Chrome via
     `scrollHeight` before guessing: new-product flow (step 1 + step 2 HTTPS/MQTT, one fixed height shared
     across all of it) was carrying ~73–354px of dead air depending on step/tab; the existing-product
     "Add Device" flow (opened from a product's own Devices tab) — which is a **separate, shorter** flow
     that never reaches step 2 at all (`proceedAfterSave` closes the modal immediately when
     `hasExistingProduct`) — was carrying 231px of dead space on its own. Fix: `hasExistingProduct` never
     changes within one open modal, so it's safe to give that flow its own shorter fixed height instead of
     inheriting the taller one — `h-[480px]` for the existing-product flow, `h-[600px]` for the full
     new-product flow (still one fixed value for step 1 + both step-2 tabs in that flow, so the no-resize
     guarantee holds). Cut dead space from 231px→71px and 73px→33px on the two flows' step-1 view
     respectively, verified with real `scrollHeight` measurements, not eyeballing. `tsc --noEmit` clean.
     (Incidental: hit a flaky row-checkbox in `manage-product`'s table that stopped registering clicks
     partway through this session — worked around by calling `/products/bulk/destroy` directly for
     test-data cleanup; not investigated further, unrelated to this task, worth a look if the owner notices
     it independently.)

**Follow-up (2026-09-23, same session) — `POST /products` error handling fixed: no orphan products, no
duplicate-resend on retry, done and live-tested across every input combination.** Owner flagged a real gap
after the visual redesign: on a save error, the modal only showed an error and offered no way to edit and
retry — and even if it had, retrying naively would either (a) create a new orphan product each time (since
the old code always sent `product_name` again) or (b) resend already-created devices, which 422s against
the backend's global `device_unique_identifier` uniqueness (D-0148). Owner got backend to confirm three
things in writing (now in `communication/findings.md`): check `created_count`, not just `success: true`;
surface partial failures without blocking forward progress; retry with `existing_product_id`, never
`product_name`, once a product exists.

- **`createdProductId` state** (`AddDevices.tsx`) — set from `response.product.id` on ANY response that
  includes it, even one where every device failed (the product row persists regardless, per backend). Every
  subsequent save in the modal session sends `existing_product_id` instead of `product_name` once this is
  set, so a failed-then-corrected retry reuses the same product instead of creating a new one.
- **`pruneToUncreatedDevices`** — after any save with failures, removes the devices that DID get created
  from the form by `device_unique_identifier` (not array position), converts any failed CSV rows into
  ordinary editable manual rows, and clears the CSV file (fully consumed already). What's left in the form
  after this is, by construction, exactly what still needs fixing — so resubmitting it, even unedited, can
  never re-send an already-created device. This is what actually answers the owner's core question ("what
  if he fixes his mistake and hits save — won't the already-saved devices go again?") — they can't, because
  they're no longer in the form to send.
- **Unified error/continue UI** — replaced the old `CsvImportResults` full-screen "Continue-only" replacement
  (deleted, no longer used) with an inline banner (new shared `DeviceErrorTable.tsx`, extracted so the same
  table renders both here and nowhere else now) shown above the still-editable form. A second "Continue with
  N created" button appears next to Save only when something was actually created; a total failure
  (`created_count: 0`) shows Save only, since there's nothing to continue to.
- **Live-tested in Chrome, every combination, verified via direct API calls (not just UI appearance) that
  exactly the right number of products/devices existed after each:**
  1. Manual-only, full success — 1 product, 2 devices.
  2. Manual-only, total failure (duplicate identifier) → fix → retry — 1 product (no orphan), 1 device.
  3. Manual-only, partial success (1 good + 1 duplicate) → **Continue** — 1 product, 1 device (bad one
     correctly abandoned).
     3b. Same partial-success setup → **fix the bad row and Save again instead of Continue** — 1 product, both
     devices present (the original success + the retried one), no duplicate-resend error. This was the
     exact scenario the owner was worried about.
  4. CSV-only, full success — 1 product, 2 devices.
  5. CSV-only, total failure → fix → retry — 1 product, 1 device.
  6. CSV-only, partial success → Continue — 1 product, 1 device.
  7. Combined manual+CSV, partial success (1 manual good + 1 CSV good + 1 CSV bad) → fix and Save again — 1
     product, all 3 devices present across both save attempts.
  8. Existing-product entry point (`hasExistingProduct`, opened from a product's own Devices tab) — total
     failure → fix → retry — no new product created, device added to the existing one, modal closed
     correctly on success (this flow never advances to step 2).
     All 8 test products deleted afterward via the real `/products/bulk/destroy` endpoint — confirmed via a
     fresh `GET /products` sweep that exactly zero were left over. `tsc --noEmit` clean throughout.

**Follow-up (2026-09-23, same session) — `AttributeModal.tsx` ("Attribute Settings", opened from a
product's Configuration tab) redesigned — unrelated to the onboarding modal work, but same underlying
cause class.** Owner reported it "shrunk" and looked bad; traced with `git diff`/`git show` before touching
anything — confirmed via hard evidence (zero diff on this file or `Modal.tsx`/`ProductConfiguration.tsx`
since the last handoff commit) that this session's onboarding-modal work never touched it. Real root cause:
a **prior** session (`41d6294`, 2026-09-22) removed the widget-type picker (a 2–6 column icon grid — owner
decision, redundant with the widget dashboard being deferred), which was most of this modal's width and
height. The modal's outer wrapper only ever had a `max-w-[1100px]` **cap**, not a real width, and MUI's
`Dialog` in `Modal.tsx` sizes to `fit-content` — so once the wide/tall picker was gone, the remaining sparse
content (a label + unit row, one condition row) let the dialog shrink down to a ~390×600px box, looking
cramped and disproportionate against the whole screen. Confirmed centering was never actually broken
(`getBoundingClientRect()` showed equal ~38px top/bottom margins throughout) — it just looked "shrunk"
because it was small and narrow, not because it was mispositioned.

Redesigned to match the onboarding modal's visual language: real width instead of a bare cap
(`w-[620px] max-w-[95vw]`, replacing `max-w-[1100px]`), icon badge + attribute-name subtitle in the header
(replacing the plain title), close button restyled as a proper hover-circle, section heading icon on "Alert
settings", the "Attribute" display chip recolored from `danger` (red — semantically wrong, it's not an
error) to `accent-cyan` with a tag icon, and the Save button now uses the shared `Button` component
(`loading`/`disabled` handled by it) instead of a hand-rolled button + inline spinner SVG. No behavior
changes — same validation, same `POST/PUT /attribute/preference/setting/*` calls, same payload.

Live-verified: reopened the real modal on a real product's real attribute (`test product`, id 117,
`channel`), confirmed via `getBoundingClientRect()` the dialog now renders ~620×619px still centered
(~38px margins), filled in a label + condition value and saved for real — `POST
/attribute/preference/setting/store` succeeded, modal closed, no console errors beyond the pre-existing,
unrelated `/highlight-attributes` 404 (documented known-non-bug, needs a Groq key, not new). `tsc --noEmit`
clean. **Left a small test attribute-setting ("Channel Label Test") on the owner's own `test product` (id 117)** — tried to find and delete it via the settings API afterward but the endpoint's response shape
didn't match what I expected for this product, so I left it rather than risk touching their test data
incorrectly; low-stakes (one attribute's label/condition on a product they're using for Rule Builder
testing), removable from the Configuration tab in a few seconds if it's in the way.

**Follow-up (2026-09-23, same session) — `AttributeModal.tsx`: fixed a real alignment bug, added a missing
"remove configuration" action (checked the API contract first, it existed, wired it up).**

1. **Label/unit field misalignment.** Root cause: "Enter Attribute Label" used `GlobalInput`'s built-in
   `label` prop (renders at `text-sm`/`mb-1.5`), while "Select unit" used its own hand-written `<label>` at
   `text-xs`/`mb-1` right above `SelectRadix` — two different label styles with different heights, so the
   two input boxes never started at the same y position. Fixed by dropping `GlobalInput`'s `label` prop and
   giving both fields the exact same hand-written label (`block mb-2 text-sm font-medium text-ink-1`,
   matching the convention already used in the onboarding modal's `SecondstepForm.tsx`). Verified via
   `getBoundingClientRect()`: both boxes now start at the identical y-coordinate (diff: 0px).
2. **No way to un-configure an attribute.** Owner asked to check the API contract before building anything
   — `products.yaml` already had `DELETE /attribute/preference/setting/{id}`
   (`deleteAttributePreferenceSettingById`, "Cascades linked widget + rule if present") sitting unused; nothing
   in the frontend called it. Added a "Remove configuration" action, only shown when editing an
   already-configured attribute (`existingSettings?.productAttributeData?.id` present — a brand-new
   attribute has nothing to delete). Since the endpoint's own description says it cascades to a linked Rule
   Builder rule — a bigger blast radius than "just this attribute" — added an inline confirmation panel
   (this app's `ModalContext` only holds one modal at a time, so a stacked confirm dialog wasn't an option)
   that says so explicitly before deleting, rather than a generic "are you sure" with no detail.
   `ProductConfiguration.tsx` gained a matching `onDelete`/`handleModalDelete` alongside its existing
   `onSave`/`handleModalSave` — unselects the attribute (so it doesn't fail the parent form's own "configure
   it first" check on next submit) and refetches `/product-settings/{id}` so the "Attributes Displayed" list
   reflects the removal immediately.

Live-verified on the owner's real `test product` (id 117, `channel` attribute — the same one used to
verify the earlier alignment/shrink fix): opened Configure Attribute, clicked "Remove configuration", saw
the exact cascade warning, clicked **Cancel** first and confirmed the form reverted cleanly with no side
effects, then reopened and clicked through to confirm — `DELETE /attribute/preference/setting/{id}`
succeeded, modal closed, reopening "channel" afterward showed a genuinely fresh/unconfigured form (no
"Remove configuration" button, empty label) confirming both the delete and the unselect worked. This also
cleans up the one test artifact ("Channel Label Test") left on the owner's product from the earlier
AttributeModal fix — nothing left over now. `tsc --noEmit` clean.

**Follow-up (2026-09-23, same day) — Rule Builder: email action confirmed working, SMS + system
notification parked to revisit later.** Owner ran the live test themselves (real rule, real trigger, real
inbox) rather than handing it to this session — **email delivers correctly, confirmed end to end.**
Decision: **leave SMS and system notification for later** — not abandoned, just not the active focus right
now. Status of each, so a future session doesn't have to re-derive it:

- **SMS** — never live-tested, status genuinely unknown. Needs the owner's own phone to verify (no
  telephony access on this end).
- **System notification** — still the root cause found earlier this session: the Pusher→Socket.IO migration
  never picked up the `notification:new` event or the `/notifications` REST endpoints, and there's no
  bell/notification-center UI anywhere (`BellIcon.tsx` is an unused asset). This doesn't change just
  because email works — it's an independent frontend gap that needs a real build (socket listener +
  notification-center UI) before there's anything to test.

Full history and the module's flow/architecture notes are in [[rule-builder-module-task]] (memory) — not
re-duplicating them here since nothing about the flow itself changed, only the status of these two actions.

**Next up:** Rule Builder is parked (email done, SMS/system-notification deferred by owner's own choice, not
blocked on anything) — moving to the **Fleet Management module** next, scope not yet defined by the owner.
All onboarding-modal work and both AttributeModal fixes (shrink/redesign, alignment + remove-configuration)
remain fully done and live-verified — no further action unless the owner wants changes after seeing them.

**Full history below this point is the product onboarding module + everything before it — reference only,
not the active task.**

Asset/Building module is **fully done**, owner confirmed. Product onboarding module: Tags removed,
bulk-delete live-verified, pagination/search audit **fully closed** (D-0144/D-0146/D-0147). CSV bulk
device-import built and live-tested end to end (D-0148 + frontend integration). Everything is committed on
`feat/next-ts-migration`.

**CSV bulk-import — the full round trip, this session:**

1. Frontend-only prep shipped first (no backend dependency): `Dropzone.tsx` restricted to `.csv` + 5 MB
   cap with real validation errors; onboarding step's stale `tags`-mentioning copy fixed; dead "our
   documentation" link wired to a new `/documentation` route (`src/screens/Documentation.tsx`) showing the
   3-column CSV format + a downloadable sample file.
2. **Design decision (owner):** don't add a separate bulk-import endpoint — extend the existing
   `POST /products` instead, since step 2 already sends product info + manual devices in one call to that
   single endpoint (only call site: `AddDevices.tsx`), and a separate CSV-only endpoint would've meant two
   sequential calls for a brand-new product with an orphan-product risk if the second failed.
3. Concrete ask written to `backend_frontend_sync/communication/flows/03-device-bulk-csv-import.md` —
   multipart request (product fields + `devices` JSON + optional CSV `file`), additive `import_summary`
   response field for per-row errors.
4. **Backend built it (D-0148)** — plus surfaced and fixed a real cross-cutting bug while answering the
   duplicate-scope question: real Laravel's `device_unique_identifier` uniqueness was always **global**
   (not per-product), and this Node backend had never enforced it — now restored on both the CSV path and
   the plain manual-only path. Row limit: 500 (backend switched device creation to a real bulk insert to
   support this). Synchronous, no polling needed.
5. **Frontend integration built + live-tested end to end**, against the real confirmed shape:
   - `AddDevices.tsx`'s save now sends `multipart/form-data` (same proven pattern as
     `FloorPlanEditor.tsx`'s image upload elsewhere in this repo).
   - New `src/utils/csvDevices.ts` (added `papaparse` as a dependency — needed real RFC-4180 parsing since
     `location` values can contain commas): client-side pre-checks (required columns, ≥1 row, ≤500 rows)
     mirroring backend's own rules, so bad files are caught before upload.
   - `ThirdstepForm.tsx` shows a live CSV preview once a file parses.
   - `TagInput.tsx`'s Save-enabled gate fixed — it previously required the default blank manual row to be
     filled even for a CSV-only submission; now blank rows are correctly ignored.
   - New `src/forms/FormComponents/CsvImportResults.tsx` — shown when `import_summary.failed_count > 0`:
     per-row error table + a client-generated downloadable error-report CSV (per backend's explicit ask —
     no server-side CSV generation), with its own Continue button (Save/Back footer hidden in this state so
     it can't be resubmitted).
   - Live-tested in Chrome with real throwaway data, cleaned up via the real bulk-delete endpoint each
     round: CSV-only happy path (3/3 created, auto-advanced), manual+CSV combined with one bad row (2/3
     created, exact backend error shown, error-report CSV downloaded correctly, Continue advanced without
     resubmitting — verified no duplicate product), client-side row-limit rejection (501 rows), client-side
     missing-column rejection. `tsc --noEmit` 0, `next build` clean.

**Done (2026-09-23, same day) — `AllDevices.tsx` deleted.** Owner confirmed: delete it. Removed
`src/screens/AllDevices.tsx`, its route (`app/(app)/devices/page.tsx`), the already-commented-out
`LeftSidebar.tsx` nav entry (+ its now-unused `FaMobileAlt` import), and the matching dead `/devices`
`Breadcrumb.tsx` entry — only reference to the file anywhere in the codebase was its own route file,
confirmed via grep before deleting. `tsc --noEmit` 0.

**Done (2026-09-23, same day) — Product ID column removed from `manage-product`, PRODUCT ONBOARDING MODULE
NOW FULLY COMPLETE.** Owner asked about two things: (1) `/products/{id}/devices`'s "Points" column — just
explained what it does (opens `DevicePointsModal`, `GET /devices/{id}/points`, showing each configured
attribute's last value + unit and a "last reported" timestamp — the current-state view, distinct from the
raw-payload packet-history accordion), no code change needed. (2) `manage-product`'s "Product ID" column —
a raw internal DB primary key with no user-facing meaning. Owner's call, matching my recommendation: remove
it outright, no replacement column (Status/Name/Created Date/Devices/Actions is already a complete row).
Removed in `ManageProduct.tsx`. Live-verified in Chrome. `tsc --noEmit` 0. Flagged in the same message
(not yet fixed at the time): `/products/{id}/devices`'s "Last Updated" column showed "Invalid Date" — fixed
same day, see below. **This closes out the product onboarding module — everything (Tags removal,
bulk-delete/pagination/search audit, CSV bulk-import, AllDevices.tsx cleanup, Product ID column removal) is
now done.**

**Done (2026-09-23, same day) — "Invalid Date" fixed + onboarding copy generalized.** Root cause of the
"Invalid Date" flagged above: the API returns `last_updated` **pre-formatted** as a display string
(`"19 hours ago"`, or the literal `"never"` — confirmed against `api_contract/openapi/products.yaml`'s
documented shape and a live raw fetch), not a parseable timestamp. `ManageDevice.tsx` was wrongly calling
`new Date(item.last_updated)` on it. Fixed to render the string as-is. Separately, owner asked to fix step
2's instruction copy — it said "LoRaWAN device EUIs" but the platform supports multiple device protocols;
reworded to "device unique identifiers (e.g. your IoT sensor's serial number or Dev EUI)" in both en/ar
locales. Both live-verified in Chrome, `tsc --noEmit` 0.

**Done (2026-09-23, same day) — full enterprise demo-readiness audit run, findings documented.** Owner
asked, with the onboarding module fully closed, for a holistic first-time-buyer walkthrough (login → home →
onboarding → devices → connectors → building) rather than more spot-fixes — see the full punch list under
`## ▶ NEXT TASK` above this section. Not yet fixed — that's the next work queue.

**Suggested opening message for the new session (paste as the first prompt) — superseded by the one at the
top of `## ▶ NEXT SESSION — START HERE`, kept here only as history:**

> Continue from `task.md`'s `## ▶ NEXT SESSION — START HERE` section. The demo-readiness punch list is
> done except step 3 (owner's own plan, deferred) and one low-priority nice-to-have. First do the owed
> consolidated `next build` check (stop the dev server first), then ask the owner what's next.

**Follow-up (2026-09-23, same day) — bulk-delete verified for real + pagination/search audited, 2 real
backend bugs found:** owner asked to actually exercise bulk-delete by deleting real test devices (not just
reading code), and to check pagination/filter on both the products and devices tables.

- **Bulk-delete: confirmed genuinely working.** Created 3 test devices via the real onboarding form,
  selected them, ran bulk-delete, confirmed the "3 selected devices" dialog, clicked through for real —
  only the pre-existing real device remained afterward.
- **Devices pagination: works.** Created 13 real devices, confirmed page 1→2 navigation shows the
  remaining rows.
- **Products pagination: broken — real backend bug, not frontend.** Clicking page 2 fires a correct
  `page=2` request (confirmed via network log) and react-query genuinely refetches (fresh
  `dataUpdatedAt`, confirmed via temporary instrumentation added to `ManageProduct.tsx` then removed) —
  but a **direct raw fetch** to `GET /products?...&page=2...` (bypassing the frontend entirely) returns
  `current_page: 1` with page 1's own rows. The backend ignores the `page` param on this endpoint. Devices
  pagination (`GET /products/{id}`, same param shape, just scoped) works correctly by contrast. Filed in
  `backend_frontend_sync/communication/findings.md` (2026-09-23 rows) — **no frontend fix is possible**,
  this needs a real backend change.
- **Devices search: broken — also a real backend bug.** The search box's own placeholder says "Search by
  device name, Dev EUI, location..." but a direct raw fetch with `search=f7c4` (a real device's own Dev
  EUI, visible in its own column) or `search=Loc 5` (a real device's own location) returns **zero**
  results — only `name`-field matches work. Also filed in `findings.md`.
- **Products search: confirmed working correctly** (exact and partial name matches both return right).
  All test data (3+12 devices, 12+12 products across two rounds) created for these checks was cleaned up via
  real bulk-deletes afterward — nothing left behind. `tsc --noEmit` clean (no frontend code changes ended up
  needed for either bug — both are backend-only).

**Follow-up (2026-09-23, same day) — backend round-trip: both bugs fixed (D-0146), a third found and fixed
(D-0147), products pagination/search audit now fully closed:** backend fixed `tags` drop (D-0144), the
`page` param (now conventional 1-based, D-0146), and device `search` (now matches DevEUI/location too, not
just name, D-0146). Live re-verified all three against the real stack with fresh throwaway data — all
confirmed working. While stress-testing the `page` fix (14 throwaway products, 12 sharing one `created_at`
second — a realistic bulk-onboarding shape), found a **new** real bug: at `per_page=5`, pages overlapped
(3 ids duplicated across pages) and 3 ids never appeared on any page at all — a missing secondary `ORDER BY`
tie-breaker. Didn't affect the real UI (only offers 10/25/50/100 as page sizes) but was a genuine
data-correctness bug that would resurface with more same-timestamp rows, e.g. after bulk-import. Filed in
`backend_frontend_sync/communication/findings.md`, explicitly **not** signed off pending a real fix — per
this file's own regression rule, didn't let a "mostly works" pagination fix pass as done. Backend added a
deterministic `id` tie-breaker to both `GET /products` and `GET /products/{id}`'s device list (D-0147, the
latter a genuine Laravel-parity gap the original port missed). Re-verified with a harder sweep than the
original repro (`page=1..4`@`per_page=5` and `page=1..7`@`per_page=3`, deliberately overshooting the row
count) — zero duplicates, zero gaps both times. All test data cleaned up via the real bulk-delete endpoint
each round (caught and fixed one self-inflicted slip mid-test: a failed response-shape assumption silently
created an untracked batch of throwaway products; found and deleted via a fresh raw `GET /products` sweep
before declaring done — nothing left on the live DB). **Products pagination + search work: fully signed
off, good to go.** Full write-up in `backend_frontend_sync/STATUS.md`.

---

## CURRENT TASK

**Goal:** Convert the existing React 19 + Vite 6 SPA into a **Next.js (App Router) + TypeScript** app,
**preserving all logic and UI exactly**. This is a framework/tooling swap only — no feature changes,
no redesign, no behavior changes.

> **✅ MIGRATION COMPLETE (2026-09-09):** Phases 0–7 done (commits through `7121a25`).
> Next.js 15 App Router + TypeScript; `src/` 100% `.ts(x)`; `tsc --noEmit` clean & enforced by
> `next build`; Vite gone; 2 Vercel Preview deploys verified.
>
> **▶ IN PROGRESS (2026-09-10): "strict types for major screens" follow-up** — see
> **`## FOLLOW-UP TASK`** below and the detailed resume doc **`TYPING_HANDOFF.md`**.
> Units 1–10 done (Unit 5b — 3 giant Fleet files — still deferred). `tsc --noEmit` 0,
> build green, 161 `@ts-nocheck` files left.
>
> **After that (owner-gated):** `strictNullChecks` → `noImplicitAny` → `strict:true`; empty the
> `@ts-nocheck` backlog; ~2900 legacy lint issues; **Phase 8 (SEO)**.

---

## FOLLOW-UP TASK — strict types for major screens & shared components (started 2026-09-09)

> **📄 FULL RESUME DOC: `TYPING_HANDOFF.md` at repo root.** It has the detailed recipe, the strict-
> verification snippet, the per-unit file lists + gotchas, the global groundwork, and the latent-bug
> list. This section is the short tracker. **All 10 screen units done; Unit 5b (3 giant Fleet
> files) still deferred.** `tsc --noEmit` 0, `next build` green, 161 `@ts-nocheck` files left.

**Goal (owner):** hand-write strict TS `interface`s for **props / state / handlers / refs** of the
major screens (`src/screens/*`) and the shared components they use — **feature by feature, build
green after each**. Leave low-level leaf components alone. **Do NOT type API response shapes yet**
(`ApiResult` is deliberately loose — real per-endpoint types wait for API docs). Verify each unit:
`tsc --noEmit` (loose, whole project) stays **0**, AND `tsc` with `strict:true` reports **0 for that
unit's files**.

**Recipe per unit:** remove `// @ts-nocheck` from the unit's files → add `interface`s (all-optional
where the component has fallbacks) + type `useState<T>()`/`useRef<T>()`/handlers/`useParams` → API
results stay `any` (via `ApiResult`) → `tsc` loose 0 + `tsc --strict` 0 for those files → `next build`
→ commit.

**Config done up front:** `ApiResult` widened to `ApiEnvelope<T> & { error?: boolean } & Record<string, any>`
(no `ApiError` union to narrow). `next.config.mjs` `images.disableStaticImages:true` so `*.png` imports
type as `string` (our `assets.d.ts`) instead of Next's `StaticImageData` — matches the webpack rule.

> **⚠ Dev-server memory / freeze investigation (2026-09-18): see `DEV_PERFORMANCE.md`.** `npm run dev` is now a guarded, logged wrapper; `npm run dev:raw` = plain `next dev`; `npm run dev:report` summarises a session after a freeze.

### Units

- [x] **Unit 1 — shared form primitives** (commit `6617d40`): `components/Input.tsx` (`GlobalInputProps`), `components/Button.tsx` (`ButtonProps`, `ButtonVariant`), `components/Select.tsx` (`SelectRadixProps`, `SelectOption`). `tsc` loose 0 / strict 0 for the 3. `next build` green.
- [x] **Unit 2 — Auth** (commit `3821fd7`): `screens/{Login,Register,ForgetPassword,ResetPassword,VerifyAccount}.tsx`. Form-value `interface`s + `useForm<T>`, typed handlers / `useRef<Window|null>` / timer refs / `MessageEvent` / `catch (e: any)`. `router-compat` `CompatLocation.state` → `any`. yup resolver `as any` (`useForm<T>` still strict for handler/fields).
- [x] **Unit 3 — App shell / shared** (commit `bd7d635`): `layout/{AuthLayout,NonAuthLayout}`, `components/{Navbar,LeftSidebar,MenuItem,Breadcrumb,Modal,GlobalPacketListener,DashboardSubNav,Tables,WelcomeIntroModal}`. Props `interface`s (`LeftSidebarProps`+`NavItem`, `MenuItemProps`, `TablesProps`, `NavbarProps`, `DashboardSubNavProps`, `WelcomeIntroModalProps`, `BreadcrumbItem`). **Global groundwork done here:** `ApiResult` → `{ data?: any; success?; message?; error?; [k]: any }`; `useSimpleQuery`/`usePaginatedQuery` → generic `<TData = ApiResult>`; `apiHelper` default generic `unknown` → `any`; `UserContext.uploadedImage` → `string | null`. `RadixTable` deferred → Unit 7.
- [x] **Unit 4 — Dashboard/Home** (commit `945e01f`): `screens/Home` (`DashboardAnalytics` state interface), `components/{DashboardWrapper,DeviceStatusGrid}` (device rows `any`). `screens/Dashboard.tsx` already clean.
- [x] **Unit 5 — Fleet** (commit `92c06b9`): `screens/{FleetManagement,Vehicles,Drivers,Geofences,Yards,Trips,FleetMap}` + `components/{DriverDetailModal,YardLayoutEditor,ComplianceTab,VehicleMarker,YardMarker}`. Props interfaces + typed state/handlers/refs; fleet **entities stay `any`**; leaflet tuple casts `as [number, number]`. Installed **`@types/leaflet`** (react-leaflet 5 needs it). `useSimpleQuery` url param widened to `string | null | undefined`.
- [ ] **Unit 5b — DEFERRED Fleet giants** (kept `@ts-nocheck`; consumers still type-check via inferred `{ prop: any }`): `components/VehicleDetailModal.tsx` (1017 L), `components/TripDetailModal.tsx` (997 L), `screens/FleetDashboard.tsx` (1092 L). The 3 biggest files in the codebase — each is its own mini-unit. See `TYPING_HANDOFF.md` §6.
- [x] **Unit 6 — Products/Devices** (commit `9ab991f`): `screens/{ManageProduct,ManageProductConfig,ProductConfiguration,ManageDevice,ManageDeviceConfig,ManageConfiguration,ProtocolIntegration,Integration}`. Props interfaces + typed state/handlers; product/device **entities stay `any`**; `useForm<FormValues>` + `yupResolver(...) as any` (ProtocolIntegration, ProductConfiguration). **Shared-component work pulled in here:** `RadixTable` (`DataTable`) got a real **public props contract** (`DataTableProps`/`DataTableColumn`/`DataTableBulkAction` exported; internals stay `@ts-nocheck` — moved off Unit 7's plate); `Button` `ButtonProps` gained `sx?` compat shim (many screens still pass MUI `sx`); `useSimpleQuery` `key` widened to `string | readonly unknown[]` (array keys); minor `@ts-nocheck` signature widenings on `AddDevices`, `ConfirmActivationModal` (`itemName?`), `DropDownMenuRadix` (`id?`), `IntegrationContent`, `ConvoyAIDemo/ProductConfigurationDemo` (`return null`).
- [x] **Unit 7 — Rules** (commit `0cdd6d0`): `screens/{RuleBuilder,AddNewRule}`. `RuleBuilder` — `DataTableColumn[]` columns (widened `accessor?: string | null`), typed page/search/sort/bulk handlers, `rules`/`selectedRules` as `any[]`. `AddNewRule` — `RuleFormValues` + `RuleCondition` interfaces + `useForm<RuleFormValues>` + `useFieldArray`; `setValue(`conditions.${i}...`)` template paths cast `as any`; product/attribute-mapping helper params `any`. `@ts-nocheck` signature widenings: `ConfirmDelete` (accepts optional `itemName`/`title`/`message`), `TableSkeleton` (`count?`), `EmailAction`/`SmsAction` (`inputStyles?`), `ConvoyAIDemo/RuleBuilderDemo` (`return null`). Removed dead imports (`ConditionSelect`, `ConditionalDropdown`, `mapExtractedKeys`, `X`). Deleted empty `screens/Rules.tsx`.
- [x] **Unit 8 — Roles/Users/Admin** (commits `d102f64` `1f9fdb5`): `screens/{StatusFilterContent,EditCompany,EditUser,CompanyLocation,AllDevices,AllAsset,Allproducts,AllCompaniesList,InternalUser,PermissionToggle,RolesPermission,AccountSettings}`. List screens = the RadixTable pattern (`DataTableColumn[]`, `any[]` selection, typed handlers, `useParams<{…}>()`). `PermissionToggle`/`AccountSettings`/`RolesPermission` = `useForm<T>` + `yupResolver(...) as any` + `Record<string,boolean>` permission maps. `user` accessed via `user?.id` / `(user as any)?.roles` where the old code assumed non-null. **`AllUser.tsx` stays `@ts-nocheck`** — pre-existing `onRefetch` ReferenceError (used in 3 paths, never destructured); added `onRefetch` to its props destructure so `EditCompany`'s `onRefetch={refetch}` type-checks and the guarded calls now work, but full typing deferred (owner: don't compromise on broken behaviour). New `src/types/modules.d.ts` (`declare module 'react-scrollspy'`). `@ts-nocheck` signature widenings: `AccountSettings` param type, `AddLocation` (`companyID?`/`refetch?`), `GLobalCheckBox` (`checked?`), `GlobalRadioGroup` (param type), `CreateProductFromPayload` (`initialProductId?`), `CardRole` (`onSuccess?`/`onClose?`), `CustomAvatar` (`onImageChange` arity), `TableSkeleton` (`count?`). `RadixTable` `DataTableColumn` gained `sortable?`, `DataTableProps` gained `defaultRowsPerPage?`, `DataTableBulkAction.id` → `string | number`.
- [x] **Unit 9 — Assets/WebGL** (commit `f9ee5c2`): `screens/{Assets,WEBGLBUILDING,WEBGLFARM,WEBGLMARINA}`. Type-only, no restructure (highest visual risk). New Unity globals in `src/types/modules.d.ts` (`Window.createUnityInstance?` / `gameInstance?` / `unityInitialized?` / `ReactUnityBridge?` — payloads untyped). WEBGL screens: `useRef<HTMLCanvasElement | null>`, keydown handlers `(e: KeyboardEvent)`, `.then/.catch` chains fall out of the typed `createUnityInstance`. `Assets`: antd `Tree` `treeData`/`titleRender`/`onSelect`/`switcherIcon` all `as any` / `(x: any)` (antd's `DataNode` lacks the app's `data`/`isTopMost`/`id`); `IconMapper` (concrete object) indexed via `(IconMapper as any)[key]`; `usePusher`/`useTheme` already typed. `useState<any>` setter updaters need explicit `(prev: any) =>` (the `SetStateAction<any>` union collapses to `any`, so no contextual type).
- [x] **Unit 10 — Map/Simulation/misc** (commit `60e413e`): `screens/{Map,Simulation,Alarms,ConnectorHealthPage}`. `Map` — leaflet `center`/`position` as `[number, number]`. `Simulation` (799 L) — `Record<string, any>` for `PRODUCT_CONFIG`/`formData`/`errors`/payload builders (nested arrow params still need explicit `: any` — `Record<string,any>` does NOT contextually type them under strict); `Icon` set typed `Record<string, (p: any) => any>`; sub-components (`FormSection`, `SummaryRow`, `SegmentedControl`, `StatusToggle`, `BooleanToggle`) get inline prop types; curried `handleInputChange = (field: string) => (e: ChangeEvent<HTMLInputElement>) =>`. `Alarms`/`ConnectorHealthPage` — small; card sub-components inline-typed, `{...}[key]` icon maps cast `Record<string, ReactNode>`.

### Latent bugs surfaced while typing (kept behaviour-identical, flagged for the team)

- `components/Select.tsx` — `<Select.Content onOpenAutoFocus={…}>`: Radix Select's Content has no such prop (Dialog/Popover only). The searchable-select autofocus-on-open has always been dead. Kept verbatim via a loose spread.
- `screens/VerifyAccount.tsx` — the resend-email failure branch reads `response.error` as a message string, but `apiHelper` sets `error: true` (boolean) on caught failures, so a real failure sets `resendMessage` to `true` (renders as nothing). Behaviour unchanged.
- `screens/ProductConfiguration.tsx` & `screens/ProtocolIntegration.tsx` — `useSimpleQuery(key, url, { enabled: … })` passes the options object as the **3rd** (`params`) arg, not the 4th (`options`). So `enabled` never disables the query and just lands in the query key; these queries always run. Kept verbatim.
- `screens/ProductConfiguration.tsx` — `markAsUniqueAPI` does `response.message.includes('successfully')` with no null guard; a failure response without `message` would throw. Kept verbatim via `(response as any)`.
- `screens/ProductConfiguration.tsx` — `handleModal`'s `onSave` calls `handleModalSave(data, selectedAttribute, productName)` with a 3rd arg the 2-param function ignored; added an unused `_productName?` param to keep the call legal without behaviour change.
- `components/Button.tsx` — several Product/Device screens pass a MUI-style `sx={{…}}` prop to the (non-MUI) `Button`; it never did anything. `ButtonProps.sx?` added as an accepted-but-ignored compat shim (also no longer spread onto the DOM node).
- `ConvoyAIDemo/ProductConfigurationDemo.ts` — component had no `return`, so it typed as returning `void` and couldn't be used as JSX. Added `return null;` (matches `ManageProductDemo`).
- `screens/RuleBuilder.tsx` — `useSimpleQuery(…, { keepPreviousData: true })` + `isPreviousData` destructure: both are react-query **v4** API; v5 renamed them (`placeholderData` / `isPlaceholderData`). Silently no-op / always-`undefined` since the v5 upgrade. `keepPreviousData` and the unused `isPreviousData` removed (`staleTime: 0` kept). "Keep previous page while paginating" behaviour is gone — flagged for a real `placeholderData` fix later.
- `ConvoyAIDemo/RuleBuilderDemo.ts` — no `return` → same void-component issue as ProductConfigurationDemo. Added `return null;`.
- `components/ConfirmDelete.tsx` — `RuleBuilder`'s bulk-delete path passes `title` + `message` props that `ConfirmDelete` never reads (it renders both from i18n). Always a no-op. Widened the `@ts-nocheck` signature to accept (and ignore) them, and made `itemName` optional.
- `screens/AllUser.tsx` (Unit 8) — `onRefetch` is called in `handleConfirmSingleDelete`, `handleConfirmBulkDelete`, `handleAddUser` (all `if (onRefetch) …`) but was never a prop / variable → **`ReferenceError` on every add or delete** (the `del`/`post` call already fired, so the row is gone server-side, but the modal never closes and the list never refreshes). Not a migration regression — broken in the JS version too. `EditCompany` passes `onRefetch={refetch}`; the `/users` route renders `<AllUser />` with no props. Added `onRefetch` to the props destructure so the intended behaviour works and `EditCompany` type-checks; **file kept `@ts-nocheck`** (owner: don't trade correctness for strict types).
- `screens/RolesPermission.tsx` / `AllCompaniesList.tsx` (Unit 8) — read `user.roles[0].company_id` / `user.id` with no null guard (`user` is `User | null`). Switched to `user?.id` / `(user as any)?.roles?.[0]?.company_id` to match every other screen; happy path unchanged, no longer throws if `user` is briefly null.

---

**Locked decisions (from the project owner, 2026-09-09):**

| Decision       | Choice                             | Notes                                                                                                                                                             |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router         | **Next.js App Router**             | Modern default, LTS. Not Pages Router, not a react-router catch-all.                                                                                              |
| `'use client'` | Use liberally, wherever needed     | App is ~100% client-side today; most files become client components.                                                                                              |
| SSR / SEO      | **Faithful port first, SEO later** | No SSR rearchitecting now. After parity, a separate task adds blog/marketing SSR + metadata for SEO.                                                              |
| TypeScript     | **Pragmatic incremental**          | `allowJs: true`, `strict: false` at first. Boot on Next with files still `.jsx`, then convert `.jsx`→`.tsx` module-by-module, tighten strictness at the end.      |
| Repo strategy  | In-place, long-lived branch        | Branch `feat/next-ts-migration` off current HEAD (`new-convoyai-os`). Rebase/merge `main` periodically. Do not touch production until Phase 5 parity is signed off. |

**Non-goals (do NOT do as part of this task):**

- Fixing the ~2900 pre-existing lint errors.
- Fixing known bugs from `CLAUDE_FRONTEND_CONTEXT.md` §13 (dead Tutorials link, 401 no-logout, etc.).
- Migrating libraries (MUI→something, antd→something). Keep the exact dependency set + versions where possible.
- Adding SSR to app pages, adding blogs, adding metadata beyond what `index.html` already had.
- Refactoring the demo fake-backend logic (only its _bootstrap wiring_ moves).

---

## GROUND-TRUTH INVENTORY (verified 2026-09-09, branch `new-convoyai-os` @ `694a8a8`)

Numbers to size the work; re-verify a specific file before you depend on it.

- **Files:** 481 `.js/.jsx` under `src/`; **62** page files in `src/pages/`; 140 in `src/components/`.
- **Entry:** `src/main.jsx` (provider stack + demo bootstrap), `src/App.jsx` (route loop + `<Modal/>` + `<RouteLoader/>` + Pusher init), `index.html` (root div, inline anti-FOUC theme script, Google Fonts `<link>`, favicon `/src/assets/favicon.png`).
- **Routing:** `src/routes/AllRoutes.jsx` — `publicRoutes[]` (8) + `authProtectedRoutes[]` (~70 entries, many are tab-variants of one component). `src/routes/AuthWrapper.jsx` (guard: `!isLoggedIn` → `<Navigate to="/login">`), `src/routes/RouteLoader.jsx` (NProgress on `location.pathname` change).
- **Layouts:** `src/layout/NonAuthLayout.jsx` (thin wrapper, nav/footer commented out), `src/layout/AuthLayout.jsx` (LeftSidebar + Navbar + Breadcrumb + `GlobalPacketListener` + welcome modal + **fetches `/api/user/:id/dashboards`** and passes `dashboardData` to sidebar/navbar).
- **Providers (order in `main.jsx`):** `QueryClientProvider > BrowserRouter > ThemeProvider > I18nextProvider > UserProvider > PusherProvider > ToastProvider > ModalProvider > App`.
- **react-router-dom:** imported in **53 files**. Symbol counts: `useNavigate` ×70, `Link` ×41, `useParams` ×36, `useLocation` ×34, `NavLink` ×6, `Navigate` ×6, `Outlet` ×2, `useSearchParams` ×2 (read-only — **no `setSearchParams` anywhere**, good). `Routes/Route/BrowserRouter` only in the 3 routing/entry files.
- **`import.meta.env`:** 9 usages. Env vars referenced: `VITE_API_URL`, `VITE_PUSHER_KEY`, `VITE_PUSHER_CLUSTER`, `VITE_MAPTILER_KEY`. **No `import.meta.glob` / `import.meta.hot` / `import.meta.url`** (no Vite-only dynamic magic to refactor).
- **Module-scope browser access that will break SSR/prerender** (executes at import time):
  - `src/contexts/PusherContext.jsx:4` — `const isDemo = JSON.parse(localStorage.getItem('user')...)`
  - `src/utils/DynamicImport.jsx:23` — same
  - `src/forms/FormComponents/ShowAndHide.jsx:17` — same
  - `src/validation/BatteryFormValidation.js:3`, `TemperatureValidation.js:2`, `SignalStrengthValidation.js:3` — same
  - `src/main.jsx:20` — `document.getElementById('root')` (entry, goes away)
  - → each needs `'use client'` + guard (`typeof window !== 'undefined'`) or move the read into the component/hook body.
- **Aliases** (in BOTH `vite.config.js` and `jsconfig.json`): `@assets @acl @components @contexts @forms @hooks @layout @locales @pages @routes @root @utils @validation`. `@root` → repo root (used for `../reactQueryConfig.js` etc.). `@locales` currently points at `src/locales` which **does not exist** (translations are in `public/locales`) — likely already dead, verify.
- **Tailwind:** v4 via `@tailwindcss/vite`. `src/index.css` starts `@import 'tailwindcss';` and has a big `@theme { ... }` block (design tokens) + `.light` overrides. Legacy `tailwind.config.js` (v3-style `content` array) exists but v4 mostly ignores it (no `@config` directive in `index.css`).
- **MSW:** `package.json` `"msw": { "workerDirectory": ["public"] }`; `public/mockServiceWorker.js` committed. Started from `main.jsx` `bootstrapApplication()` **before** `root.render()` when `user.isDemo`.
- **Static assets in `public/`:** `unity/` (~46MB, served pre-gzipped `.gz`), `DiaryFarm/` (~26MB), `locales/en`, `locales/ar`, `mockServiceWorker.js`. All carry over to Next `public/` unchanged.
- **Deploy:** Vercel. `vercel.json` = Unity `.gz` `Content-Encoding`/`Content-Type` headers + a `"/(.*)" → "/"` SPA rewrite. The rewrite must be **removed** (App Router owns routing); the headers must move to `next.config.js` `headers()`.
- **CSS side-imports** in `main.jsx`: `driver.js/dist/driver.css`, `nprogress/nprogress.css`, `./index.css`. `App.jsx` also imports `./index.css`.
- **Build:** Node v24.20.0, npm 11.19.0. Prior notes say `vite build` OOM'd without `--max-old-space-size` — expect `next build` may need `NODE_OPTIONS=--max-old-space-size=6144` too.
- **Misc dead/scratch files:** `src/index.css.bak`, `dist/` (old build), and this file's previous content was a pasted sample login API response (recoverable from git history `task.md@694a8a8` if needed).

---

## TARGET STRUCTURE (App Router)

```
app/
  layout.tsx                 # SERVER root: <html><body>, imports src/index.css + driver.css + nprogress.css,
                             #   <head> anti-FOUC theme script, Google Fonts, favicon, metadata, <AppRouterCacheProvider> (MUI)
  providers.tsx              # 'use client' — full provider stack from main.jsx (QueryClient, Theme, i18n, User, Pusher, Toast, Modal)
  bootstrap.tsx              # 'use client' — MSW demo-mode setup + SimulationEngine.resumeAll(), readiness gate, Pusher init
  not-found.tsx              # -> src/components/NotFound
  (public)/
    layout.tsx               # wraps children in <NonAuthLayout>
    page.tsx                 # '/'  -> GuestHome
    login/page.tsx
    register/page.tsx
    forget-password/page.tsx
    plan-price/page.tsx
    reset-password/page.tsx
    use-cases/page.tsx
    verify-token/[token]/page.tsx
  (app)/
    layout.tsx               # 'use client' — auth guard (redirect to /login if !isLoggedIn) + <AuthLayout>
    dashboard/[id]/page.tsx
    assets/page.tsx
    ...one folder per protected route (see AllRoutes.jsx). Dynamic segments:
       [id] [userId] [companyId] [productId] [ruleId] [token]
    products/[productId]/[tab]/page.tsx        # tab ∈ devices|configuration|integration|history  -> ManageDevice
    edit-products/[productId]/[tab]/page.tsx   # -> ManageDeviceConfig
    all-products/[productId]/[tab]/page.tsx    # -> ManageConfiguration
next.config.js               # transpilePackages, headers() for unity .gz, images.unoptimized, temp ignoreBuildErrors/ignoreDuringBuilds
tsconfig.json                # allowJs, checkJs:false, strict:false, jsx:preserve, moduleResolution:bundler, paths (the 13 aliases)
next-env.d.ts
postcss.config.mjs           # { plugins: { '@tailwindcss/postcss': {} } }
```

`src/` stays in place. Page components keep living in `src/pages/**`; each `app/**/page.tsx` is a thin
`'use client'` file that re-exports/renders the existing component. Old `src/main.jsx`, `src/App.jsx`,
`src/routes/AllRoutes.jsx`, `src/routes/AuthWrapper.jsx`, `index.html`, `vite.config.js`, `jsconfig.json`
are removed only in Phase 7 once nothing imports them.

### Refined decision (2026-09-09): render the whole app behind an `ssr:false` client shell

Verified problem: several providers/components touch `localStorage`/`window` **at render or module scope**
(`UserContext` body, `PusherContext` line 4, the 5 files in the inventory). In App Router, `'use client'`
components **still server-render during prerender**, so those would crash `next build`. Guarding every call
site is large and error-prone.

Faithful-port approach (matches "SEO later"): mount the entire provider stack + routed pages inside a
component loaded via `next/dynamic(() => import('./app-shell'), { ssr: false })` from a `'use client'`
`providers.tsx`. Nothing in the app tree server-renders; behavior matches the current SPA exactly. The
server `layout.tsx` only emits `<html><body>`, `<head>` (fonts, favicon, anti-FOUC theme script), and
metadata. **Phase 8 (SEO)** selectively re-introduces real SSR for `/`, `/use-cases`, `/plan-price`, and
adds `app/blog/**` as proper Server Components — those get pulled out of the shell then.

`globals` CSS to import in `app/layout.tsx`: `src/index.css` (tokens + `@theme`), `driver.js/dist/driver.css`,
`nprogress/nprogress.css`. NOTE: `styles/global.css` is **live** (imported by `src/pages/GuestHome.jsx` —
holds the Calendly overlay z-index fix + `.bg-grid` / `.text-gradient-cyan` utilities); leave that import
where it is, do not treat it as dead.

### Provider decoupling needed (Phase 2)

- `src/contexts/UserContext.jsx` calls `useNavigate()` (react-router) in `UserProvider` body but never uses
  it (`navigate('/login')` is commented; `window.location.href` used instead). **Delete the import + call.**
- `axiosConfig.js` imports `{ hardLogout }` from `@contexts/UserContext` (currently only referenced inside a
  commented block). Keep the export but ensure the import chain no longer pulls react-router.

---

## PHASES

Status key: `TODO` · `IN PROGRESS` · `BLOCKED` · `DONE`

### Phase 0 — Planning & branch setup — status: DONE

- [x] Read handoff + verify codebase inventory
- [x] Lock decisions with owner
- [x] Write this `task.md`
- [x] Create branch `feat/next-ts-migration` off `new-convoyai-os` (@ `694a8a8`)
- [x] Record baseline: **Vite `npx vite build` SUCCEEDS** with `NODE_OPTIONS=--max-old-space-size=6144` (default heap OOMs per prior notes). ~1m22s. Main bundle `index-*.js` 3.21 MB (965 KB gz), `grid-*.js` chunk 1.35 MB (393 KB gz). `dist/` = 82 MB. Rollup warns on >500 KB chunks (pre-existing, expected).
- [x] Owner reviewed & approved the plan (2026-09-09).
- **Done when:** branch exists, baseline recorded, owner has reviewed the plan. ✅

### Phase 1 — Next + TS toolchain bootstrap — status: DONE

- [x] Installed `next@15.5.25`, `@mui/material-nextjs@^6` (using its `v15-appRouter` export), `@tailwindcss/postcss@^4`; dev: `typescript@5`, `@types/node@20`, `eslint-config-next@15`. Vite deps kept as escape hatch.
- [x] `package.json` scripts → `dev/build/start/lint` = next; kept `dev:vite`/`build:vite`/`lint:eslint`.
- [x] `tsconfig.json` written (allowJs, checkJs:false, strict:false, **strictNullChecks:false** — Next auto-adds `true`, keep reverting until Phase 7; Next rewrites/reformats this file on each `next dev`/`build`). Added `@screens/*` alias.
- [x] `next.config.mjs` (minimal: reactStrictMode, `eslint.ignoreDuringBuilds:true`, `typescript.ignoreBuildErrors:true`, `images.unoptimized:true`). `next-env.d.ts` auto-generated + gitignored.
- [x] `postcss.config.mjs` → `@tailwindcss/postcss`. **Verified**: 177 KB `app/layout.css` with `--color-surface-0`, `--color-accent-cyan`, `.bg-surface-0`, `.font-display`, `.light` overrides all present. `tailwind.config.js` left in place (harmless).
- [x] `app/layout.tsx` (server): html/head/body, imports `../src/index.css` + `driver.css` + `nprogress.css`, ported anti-FOUC theme `<script>`, Google Fonts `<link>`, `metadata.title='ConvoyAI'` + `metadata.icons`→`/favicon.png`, wraps `<AppRouterCacheProvider options={{key:'mui'}}>` → `<Providers>`.
- [x] `app/providers.tsx` (`'use client'`): `dynamic(() => import('./app-shell'), { ssr:false })` — the whole-app client boundary.
- [x] `app/app-shell.tsx` (`'use client'`): provider stack ported 1:1 from `main.jsx` minus `<BrowserRouter>` (QueryClient→Theme→i18n→User→Pusher→Toast→Modal); `<Modal/>` mounted here.
- [x] `app/page.tsx` — placeholder (replaced in Phase 3).
- [x] `.env.local` (`NEXT_PUBLIC_*`), gitignored via `*.local`. `.gitignore` += `/.next/`, `/out/`, `next-env.d.ts`, `*.tsbuildinfo`.
- [x] **Codemod pulled forward** (needed to boot): `import.meta.env.VITE_*` → `process.env.NEXT_PUBLIC_*` — 9 sites / 8 files (`axiosConfig.js`, `UserContext`, `PusherContext`, `AccountSettings`, `FleetMap`, `Map`, `VehicleDetailModal`, `fakeBackend/handlers.js`).
- [x] Removed unused `useNavigate` (react-router) from `src/contexts/UserContext.jsx`.
- [x] favicon: `index.html` referenced `/src/assets/favicon.png` but the file is `favIcon.png` (capital I) — it was 404ing pre-migration. Copied `favIcon.png` → `public/favicon.png`.
- [x] **`next build` PASSES** (`EXIT=0`, ~20 s, `/` + `/_not-found` prerendered static, 103 kB First Load JS). `next dev` boots ~2 s, `/` → 200.
- [x] **Manual browser check DONE** (owner, 2026-09-09): `npm run dev` → placeholder page renders, browser console clean.
- **Done when:** `next dev` boots, placeholder renders with Tailwind + tokens, no console errors. ✅

#### ⚠️ Structural discovery — `src/pages/` collided with Next's Pages Router

Next auto-activates the **Pages Router** for any `src/pages/` dir (independent of `app/`), so it compiled all
62 legacy page files as routes and the build failed. **Fix applied:** `git mv src/pages src/screens`.
`@pages/*` repointed to `src/screens/*` in `tsconfig.json` / `jsconfig.json` / `vite.config.js`; new
`@screens/*` alias added as the going-forward name; relative `../pages/` imports in `App.jsx`,
`SubNavbar.jsx`, `AllRoutes.jsx` patched to `../screens/`. **Everywhere below that says `src/pages/**` now
means `src/screens/**`.**

#### Deferred issues found during Phase 1 (fix when the owning route is ported)

- `src/screens/Success.jsx` imports `react-query` (v3 name; not installed) — likely dead. Verify + fix/delete in Phase 3.
- `src/GuestHomeComponents/assets/hero-twin.mp4` is ES-imported in `Hero.jsx` → needs a webpack media loader (extend R15 to `.mp4/.webm`). Blocks `/` (GuestHome) until the `next.config.mjs` asset rule lands (Phase 3/4).

### Phase 2 — Routing skeleton + provider/bootstrap migration — status: DONE

**Approach taken: a compat shim, not per-call-site rewrites.** `src/lib/router-compat.jsx` (`'use client'`)
reimplements the exact react-router subset the app uses on top of `next/navigation`. The codemod was then
just an import-source swap (`from 'react-router-dom'` → `from '@lib/router-compat'`) across **46 files**
(the 53 importers minus 7 dead/entry files: `main.jsx`, `App.jsx`, `AllRoutes.jsx`, `AuthWrapper.jsx`,
`RouteLoader.jsx`, `GuestHomeComponents/{main,App}.jsx`, `GuestHomeComponents/.../Layout.jsx`). Added `@lib`
alias (tsconfig / jsconfig / vite).

- [x] `src/lib/router-compat.jsx` exports: `useNavigate`, `useLocation`, `useParams` (re-exported from next), `useSearchParams` (returns `[params, setSearchParams]` tuple like react-router), `Link` (maps `to`→`href`), `NavLink` (function `className`/`style`/`children` + `isActive` via `usePathname`, `/` special-cased), `Navigate` (effect → `router.replace`), `setRouterState`.
  - **`location.state` bridge:** react-router's ephemeral nav state has no App Router equivalent. Shim stashes it in a single-slot `sessionStorage` key that `useLocation().state` reads. Covers the only pattern this app uses (navigate → read once on next screen); all 12 call sites already use `?.state?.x || fallback` so they degrade safely. `navigate(-1)` supported (no call site uses it). Multi-hop/back-button state history NOT preserved.
- [x] Codemod applied (46 files). `grep -rlE "from ['\"]react-router" src` → only the 7 excluded files remain (they leave the graph in Phase 7; `react-router-dom` stays installed until then).
- [x] `app/not-found.tsx` (`'use client'`) → `<NotFound/>`. Mirrors `<Route path="*">`.
- [x] `app/route-progress.tsx` (`'use client'`) → NProgress on `usePathname()` change (ported from `RouteLoader.jsx`, same 400 ms timeout; dropped its `useSearchParams` — original only watched `pathname`, and it avoids the Suspense-boundary requirement). Mounted in `app-shell.tsx`.
- [x] `app/bootstrap.tsx` (`'use client'`) → ported `main.jsx` `bootstrapApplication` (demo path: `import()` `setupDemoMode` + `SimulationEngine.resumeAll` lazily, behind a `ready` gate) **+** `App.jsx`'s `initializePusher(user.id)` effect. Mounted in `app-shell.tsx` wrapping `{children}`.
- [x] `app/app-shell.tsx` updated: `<RouteProgress/>` + `<Bootstrap>{children}</Bootstrap>` + `<Modal/>` inside `<ModalProvider>`.
- [x] `app/(public)/layout.tsx` (`'use client'`) → `<NonAuthLayout>`. `app/(public)/page.tsx` → `/` placeholder (moved from `app/page.tsx`; Phase 3 → GuestHome).
- [x] `app/(app)/layout.tsx` (`'use client'`) → ports `AuthWrapper`: `!isLoggedIn` → `setRouterState({from})` + `router.replace('/login')`, else `<AuthLayout>`. `AuthLayout`'s own `/api/user/:id/dashboards` fetch left untouched.
- [x] **Route-group `layout.tsx` / `page.tsx` / `not-found.tsx` must carry `'use client'`** — they render legacy hook-using components, and without the directive Next RSC-renders them on the server → `useState`/hook errors (hit this with `NonAuthNavBar`). Rule for Phase 3: every `app/**/page.tsx` and route-group layout gets `'use client'`. Root `app/layout.tsx` stays server (owns `<html>`/metadata).
- [x] **Asset-import webpack rule added to `next.config.mjs`** (pulled forward from R15): svg/png/jpg/gif/webp/mp4/webm/mp3/... → `asset/resource` (URL string, Vite-compatible), with those exts excluded from `next-image-loader`. Needed for `Login.jsx` (`.png`) and `NotFound.jsx` (`.svg`) to build.
- [x] Proof routes built + served: `next build` **EXIT=0** for `/` (524 B), `/_not-found`, `/home` (191 kB — full `AuthLayout` tree: LeftSidebar/Navbar/Breadcrumb/GlobalPacketListener compile), `/login` (325 kB). `next dev`: `/`→200, `/login`→200, `/home`→200, unknown→404. No compile errors.
- [ ] **Browser eyeball owed** (no browser tooling this session): render-correctness of `/login` + authed `/home` shell not visually verified — build/compile only.
- **Done when:** react-router imports gone from the live graph ✅, app compiles ✅, `/` + `/login` render through real layouts ✅ (+ `/home` through `AuthLayout`).

### Phase 3 — Port all routes into `app/` tree — status: DONE

Generated with `scratchpad/gen-routes.mjs` from the exact `AllRoutes.jsx` arrays. **49 `app/**/page.tsx`**
files (8 public + 41 app; the 10 tab-family routes collapsed into 3 `[tab]` pages). Each simple page is
`'use client'; import X from '@screens/…'; export default X;`.

- [x] Every `publicRoutes` + `authProtectedRoutes` entry has a `page.tsx`. `/` → `@screens/GuestHome` (builds fine — `styles/global.css` + the Hero `.mp4` resolve via the Phase 2 webpack rule).
- [x] Dynamic segments: `[id]`, `[token]`, `[userId]`, `[companyId]`, `[productId]`, `[ruleId]`. Component `useParams()` (via compat = `next/navigation`) reads the same keys.
- [x] **Tab families → single `[tab]` segment** + `notFound()` guard against the allowed set. `app/(app)/{products,edit-products,all-products}/[productId]/[tab]/page.tsx`. Verified the components derive the active tab from `location.pathname.includes('configuration'|…)` (unaffected — `usePathname()` returns the full path) and `navigate(\`/products/${id}/${tabId}\`)` still drives it.
- [x] `/roles-permission` + `/members` → both `RolesPermission`. `/users` + `/users/[userId]/{profile,security,activity}` → all `AllUser`. Kept all.
- [x] `WEBGLMARINA` — confirmed **no route** registered (`UnityControlMarina` is a dead import in the dead `AllRoutes.jsx`). Not ported. `/tutorials` route stays commented out (pre-existing; non-goal to fix).
- [x] `src/screens/Success.jsx` (bad `react-query` import) — imported nowhere, not in any graph. Left for Phase 7 deletion.
- [x] **`next build` EXIT=0** — clean production build, all 49 routes + `/_not-found` compiled, 37 prerendered + 12 dynamic, BUILD_ID emitted. ~2.6 min.
- [x] `next dev` smoke: first 18 routes hit (public + heavy app routes incl. `/assets` 6404 modules, `/fleet-management` 6592) all → **200**; then the dev server OOM-died mid-run (on-demand compilation accumulates memory across many heavy routes in one session — **not a code issue**, `next build` is clean). See dev warning below.
- [ ] Per-route visual/behaviour parity is **Phase 4** work (+ browser eyeball). Only build + HTTP-200 confirmed so far.
- **Done when:** `app/` covers 100% of `AllRoutes.jsx` ✅; `AllRoutes.jsx`/`App.jsx`/`AuthWrapper.jsx` imported only by the (dead, unreferenced) `src/App.jsx` ✅.

> **Dev-mode memory:** `next dev` compiles routes on demand and can exhaust the default Node heap after
> visiting many heavy routes in one session (some pull 6k+ modules). If dev crashes, run
> `NODE_OPTIONS=--max-old-space-size=4096 npm run dev`. `next build` is unaffected (already uses `6144`).

### Phase 4 — Parity pass (make it actually run) — status: IN PROGRESS (build ✅ / runtime pass owed)

**Big finding: the `ssr:false` app-shell removed the need for per-component `ssr:false` wrappers.**
`next build` compiles AND prerenders every route — including `/map` (leaflet), `/assets` (Unity + reactflow +
antd Tree, 6404 modules), `/fleet-management`, `/webgl-*` — with **zero SSR/prerender crashes**, because
nothing in the app tree renders on the server. The two "fix SSR crashes / add `ssr:false`" bullets below are
therefore **N/A unless a runtime issue surfaces** in the manual pass.

- [x] ~~SSR/prerender crashes from module-scope browser access~~ — N/A (app-shell is `ssr:false`; `next build` clean).
- [x] ~~`next/dynamic({ssr:false})` for leaflet/apex/gridstack/unity/reactflow~~ — N/A for the same reason. Revisit only if a specific component misbehaves at runtime.
- [x] `next build` green — `NODE_OPTIONS=--max-old-space-size=6144 npx next build` → EXIT=0, all 49 routes + `/_not-found`, BUILD_ID emitted. Media assets (`hero-twin.mp4`, `error404.svg`, `.webp`/`.ttf`, leaflet marker PNGs) all emitted to `.next/static/media/`.
- [x] `next dev` HTTP smoke — 200 for a representative sample of every route shape (public, app, `[id]`, nested `[userId]`, `[companyId]`, `[productId]/[tab]`): `/ /register /forget-password /reset-password /plan-price /use-cases /verify-token/x /home /assets /fleet-management /rule-builder /simulation /map /manage-product /profile /dashboard/5 /users /users/9/profile /companies/list /companies/3/users /companies/3/company-settings /analytics /products/7/{configuration,history} /all-products/7/devices`. (Next 15 dev auto-restarts on a memory threshold — the `000`s in the logs are that restart window, not failures.)
- [x] MSW worker file (`public/mockServiceWorker.js`) is `2.15.0` = installed `msw` — no regen needed.
- [x] Demo-login flow reviewed (`Login.jsx`): demo creds → `localStorage.clear()` + `setupDemoMode(true)` → `post('/api/login')` (MSW-intercepted) → `handleLogin` → `navigate`. `app/bootstrap.tsx` re-runs `setupDemoMode` + `SimulationEngine.resumeAll()` on the next full load when `localStorage.user.isDemo`. Matches old `main.jsx`/`Login.jsx` behavior. **Runtime-untested.**
- [x] **Owner's runtime-parity fixes** (from their code analysis + initial testing, 2026-09-09) — folded in, `next build` still green:
  - `Navbar.jsx`, `AuthLayout.jsx`, `Assets.jsx`: `user.isDemo` → `user?.isDemo` (guards against a null `user` during first client render — likely a real crash they hit).
  - `Login.jsx`: `BACKEND_ORIGIN` `https://api.example.com` → `https://api.example.com` (Google OAuth origin now matches the real API host).
- [x] Owner reports: code analysed, initial testing OK. Full runtime pass deferred to the Vercel Preview deploy (Phase 5).
- [ ] **MANUAL RUNTIME PASS — deferred by owner to the Vercel Preview (Phase 5).** Checklist retained for that pass. Run `NODE_OPTIONS=--max-old-space-size=4096 npm run dev` locally, or verify on the Preview URL.
  - [ ] `/` guest home, `/use-cases`, `/plan-price`
  - [ ] `/login` email+password, Google OAuth popup (COOP!), demo-account login
  - [ ] `/register`, `/forget-password`, `/reset-password`, `/verify-token/:token`
  - [ ] Authenticated shell: sidebar sections + permission gating, Navbar, Breadcrumb, theme toggle (no FOUC), i18n en/ar toggle + RTL, logout
  - [ ] `/dashboard/:id` (DeviceStatusGrid), `/home`
  - [ ] `/assets` digital twin (antd Tree, FlowChart, Unity building viewer, floor plan)
  - [ ] `/rule-builder`, `/new-rule`, `/new-rule/:ruleId`
  - [ ] `/map` (Leaflet + MapTiler light/dark)
  - [ ] `/manage-product`, `/product-configuration/:id`, `/products/:productId/*`, `/integration`
  - [ ] `/roles-permission` + `/members`
  - [ ] `/simulation` (demo)
  - [ ] `/fleet-management` — all 7 tabs (Dashboard, Map, Vehicles, Drivers, Geofences, Yards, Trips) + detail modals
  - [ ] Super-admin pages load: `/users`, `/companies/list`, `/all-products`, `/devices`, `/analytics`, `/assign-permission`
  - [ ] `/module-management`, `/plan-management` (ComingSoon)
  - [ ] a form submit round-trip (toast.promise behavior via apiHelper)
  - [ ] direct-URL deep link to a protected route while logged out → redirect to `/login`
  - [ ] 404 path → `not-found`
- **Done when:** `next build` passes and every smoke-test box is checked with no visual/behavioral regression vs baseline.

### Phase 5 — Deployment parity — status: DONE

- [x] **`vercel.json` rewritten.** Removed the SPA catch-all `rewrites` (`/(.*) → /`) — App Router owns routing; leaving it would rewrite every URL to `/`. Kept the Unity `.gz` `Content-Encoding`/`Content-Type` header rules **and added the matching set for `/DiaryFarm/Build/*.gz`** (the `/webgl-farm` Unity build — the old `vercel.json` only covered `/unity/Build/`, so DiaryFarm's `.gz` files were served without `Content-Encoding: gzip` and Unity's loader was falling back to slow in-JS gunzip + a console warning; this is a fix, not a regression). Added `"framework": "nextjs"`. Kept headers in `vercel.json` (not `next.config`) — the `(.*)`-group source syntax is already proven on the current deploy, and mirroring into `next.config.headers()` risks double-applied headers.
- [ ] **OWNER — Vercel project settings before the Preview deploy:**
  - Set env vars (Preview **and** Production scope): `NEXT_PUBLIC_API_URL` (= `https://api.example.com/`), `NEXT_PUBLIC_PUSHER_KEY` (`098d674314cb128d59a1`), `NEXT_PUBLIC_PUSHER_CLUSTER` (`ap2`), `NEXT_PUBLIC_MAPTILER_KEY` (`YqZKyPcryZaCxduve1FH`). (The old `VITE_*` vars can stay or be removed — nothing reads them now.)
  - If the Vercel build OOMs (local needs `--max-old-space-size=6144`): add env var `NODE_OPTIONS = --max-old-space-size=8192`. Vercel's default build container may be fine without it — try first.
  - Framework preset should auto-detect **Next.js** (build `next build`, output `.next`). No "Output Directory" override, no custom install command.
- [ ] **OWNER — deploy a Preview from `feat/next-ts-migration`** and verify on the deployed URL:
  - all routes load; client-side nav + hard refresh on a deep route both work (no more SPA-rewrite fallback — App Router serves each path directly)
  - `/webgl-building` + `/webgl-farm` Unity load (check DevTools Network: `.gz` responses have `content-encoding: gzip`, no Unity gunzip warning)
  - `/map` + Fleet map: MapTiler tiles (light/dark)
  - Pusher connects for a non-demo account (realtime dashboard/twin updates)
  - Google OAuth popup completes against the deployed origin (COOP — R7)
  - `/locales/{en,ar}/*.json` fetch (i18n); language toggle + RTL
  - demo account: MSW intercepts, Fleet tabs + simulation work
- **Done when:** Preview deploy behaves identically to current production; owner sign-off.

### Phase 6 — Incremental TypeScript conversion — status: DONE

Convert `.jsx`→`.tsx` / `.js`→`.ts` in dependency order, keeping `next build` + `tsc --noEmit` green after
each batch. `allowJs:true` means un-converted `.jsx` keeps working indefinitely — this phase is deliberately
incremental and can be finished by the team over time as they touch files.

- [x] **Batch 1 (commit `febb0d7`)** — API/query/router foundations:
  - `src/types/api.ts` (new) — `ApiEnvelope` / `ApiResult<T>` / `ApiError` / `LaravelPaginated` / `User` / `Role` / `Permission` / `Company` / `LoginResponse`.
  - `axiosConfig.ts`, `reactQueryConfig.ts`, `src/utils/apiHelper.ts` (typed `get/post/put/del → Promise<ApiResult<T>>`), `src/hooks/{useSimpleQuery,usePaginatedQuery}.ts`, `src/lib/router-compat.tsx`.
- [x] **Batch 2 (commit `65c43f8`)** — all 5 contexts: `UserContext` / `ThemeContext` / `ModalContext` / `ToastContext` / `PusherContext` `.jsx`→`.tsx`, typed context values, `'use client'` added, module-scope `localStorage` reads guarded with `typeof window`.
- [x] Batches 1–2: import codemod to strip explicit `.js`/`.jsx` extensions from importers of renamed modules (~29 files). `next build` EXIT=0, `tsc --noEmit` **0 errors** after each.
- [x] **Batch 3 (commit `fa42ab7`)** — "clean rename" pass:
  - Stripped explicit local-import extensions **repo-wide** (114 files) so bulk renames don't dangle.
  - `git mv` `.jsx`→`.tsx` / `.js`→`.ts` for every `src/` file that type-checks clean **with no code changes** — **246 files** (most `src/assets` icons, `src/skeletons`, many `src/components`, `src/forms`, `src/utils`, `GuestHomeComponents`, `ConvoyAIDemo`, simpler screens).
  - `src/types/assets.d.ts` — ambient `declare module '*.png' | '*.svg' | '*.mp4' | …` (asset imports type as the URL string the `next.config.mjs` webpack rule produces).
  - Method note: a full mass-rename produced ~1295 loose-type `tsc` errors (implicit-any props, `{}` access) — reverted the 218 files that errored back to `.jsx` so **`tsc --noEmit` stays at 0**. Those 218 need real per-file typing (Phase 7 / incremental), they are not blocked (build works via `allowJs` / `ignoreBuildErrors`).
- **Progress: 257 / 484 `src/` files are now `.ts(x)`** (`tsc` 0 errors, `next build` green). 227 `.js(x)` remain = 218 needing type work + 9 dead entry files.
- [ ] **Remaining `.jsx` needing real typing (Phase 7 / incremental):** the 218 reverted files — heaviest: `src/utils/fakeBackend/{fleetControllers,controllers,db}.jsx` (~180 errs), `screens/{ProductConfiguration,ManageDevice,FleetDashboard,Simulation,AccountSettings}.jsx`, `components/Grid.jsx`, `forms/DashboardForms/MixChartForm.jsx`, `forms/MultiStepForm/AddDevices.jsx`, `forms/FormComponents/ShowAndHide.jsx`. Full list: `git log -1 --stat fa42ab7` inverse, or re-run `npx tsc` after `git mv`-ing a batch. Pre-existing latent bugs surfaced (not caused by migration, all in parked/edge code): `screens/AllUser onRefetch` undefined ×6, `forms/FormComponents/ReuseAbleModel InputField` undefined, `components/Widgets/DeviceWidgets/* → '../Widgets/WidgetInitialDiv'` wrong path ×14, `GuestHomeComponents/pages/* → '@/components/sections'` (no `@/` alias).
- [ ] Delete dead entry files (Phase 7): `src/main.jsx`, `src/App.jsx`, `src/routes/{AllRoutes,AuthWrapper,RouteLoader}.jsx`, `src/GuestHomeComponents/{main,App}.jsx`, `src/GuestHomeComponents/components/layout/Layout.jsx`, `src/screens/Success.jsx`.
- **Done when:** no `.jsx` remain (except any deliberately `@ts-nocheck`, listed here), `next build` + `tsc` green.

> **Convention for the rest:** rename `git mv X.jsx X.tsx`; add prop `interface`s where cheap, `any` where
> not (`strict:false` tolerates it); strip any explicit `.jsx` extension from that file's importers; run
> `npx tsc --noEmit` (must stay at 0) + `next build`. New shared types go in `src/types/`.

### Phase 7 — Tighten strictness + cleanup — status: MOSTLY DONE (commit `7121a25`)

- [x] `next.config.mjs`: `typescript.ignoreBuildErrors` → **false**. `tsc --noEmit` is clean; `next build` now runs "Checking validity of types".
- [x] Delete the 9 dead entry files (`src/main.jsx`, `App.jsx`, `routes/{AllRoutes,AuthWrapper,RouteLoader}.jsx`, `GuestHomeComponents/{main,App}.jsx`, `GuestHomeComponents/.../Layout.jsx`, `screens/Success.jsx`). `src/routes/` gone.
- [x] **`git mv` the last 218 `src/` `.jsx`→`.tsx`.** `src/` is now **475 `.ts(x)` / 0 `.js(x)`** — 100% TypeScript. Files that don't type-clean yet carry `// @ts-nocheck -- TODO(ts-migration): …` (grep it — ~218 files; the type-cleanup backlog).
- [x] Remove Vite: deleted `vite.config.js`, `jsconfig.json`, `index.html`, `tailwind.config.js`, `src/index.css.bak`, `eslint.config.js`. Uninstalled `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `eslint-plugin-react-refresh`, `@eslint/js`, `globals`, `react-router-dom`. Scripts: dropped `dev:vite`/`build:vite`/`preview`/`lint:eslint`; added `typecheck`.
- [x] ESLint: `.eslintrc.json` → `next/core-web-vitals`; `npm run lint` runs (exit 0, ~`no-img-element` warnings). `eslint.ignoreDuringBuilds` **kept `true`** — ~2900 pre-existing issues, cleanup is a separate track (not a migration blocker).
- [x] Enabled the strict-family flags that were already **error-free**: `strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`, `alwaysStrict`, `noFallthroughCasesInSwitch`.
- [x] `styles/global.css` Calendly z-index fix — **still live** (imported by `src/screens/GuestHome.tsx`), not deleted. Also holds `.bg-grid` / `.text-gradient-cyan` utilities.
- [x] `CLAUDE_FRONTEND_CONTEXT.md` — migration addendum added at top. `HOW_TO_TEST.md` — Next run commands added.
- [ ] **Remaining (incremental, team-driven):**
  - `strictNullChecks` (~114 errors) then `noImplicitAny` (~291) then `strict: true` — one flag per PR, per the original plan.
  - Remove `// @ts-nocheck` from the ~218 files as they get typed (start with the 82 that have a single error; the 34 near-identical `src/assets/icons/MUIicons/*` share one `fontSize` overload fix).
  - Pre-existing latent bugs surfaced by the conversion (all in parked/edge code, not migration-caused): `screens/AllUser` undefined `onRefetch` ×6, `forms/FormComponents/ReuseAbleModel` undefined `InputField`, `components/Widgets/DeviceWidgets/* → '../Widgets/WidgetInitialDiv'` wrong path ×14, `GuestHomeComponents/pages/* → '@/components/sections'` (no `@/` alias).
  - Optional: `eslint.ignoreDuringBuilds` → false once the legacy lint backlog is burned down.
- **Done when (full):** `strict: true`, zero `@ts-nocheck`, lint clean. **Done enough to ship:** ✅ now (100% TS, type-checked build, no Vite).

### Phase 8 — SEO foundation — status: TODO (SEPARATE FOLLOW-UP, not part of the port)

Placeholder so it isn't forgotten. After parity: Metadata API + `generateMetadata` per public page, `app/sitemap.ts`, `app/robots.ts`, convert `/`, `/use-cases`, `/plan-price` to Server Components where feasible, add `app/blog/**` (MDX or CMS). Spin this out into its own CURRENT TASK block when reached.

---

## RISK REGISTER

| #   | Risk                                                                                                     | Mitigation                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | 53 files use react-router primitives — large invasive codemod                                            | Do it mechanically in Phase 2 with grep-driven passes; `useSearchParams` has no setter usage so the hard case doesn't apply.                       |
| R2  | Module-scope `localStorage` reads crash SSR/prerender                                                    | Known list of 6 files (inventory). Guard or relocate reads. Consider `output: 'standalone'` + all app routes effectively dynamic.                  |
| R3  | MUI v6 + App Router style flash / hydration mismatch                                                     | `@mui/material-nextjs` `AppRouterCacheProvider` in root layout. Verify in Phase 4.                                                                 |
| R4  | Tailwind v4 pipeline change (`@tailwindcss/vite` → PostCSS)                                              | `@tailwindcss/postcss` + `postcss.config.mjs`. Verify `@theme` + `.light` compile early in Phase 1.                                                |
| R5  | Unity WebGL: `window` at import + gz headers + huge assets                                               | `next/dynamic ssr:false`; port `.gz` headers to `next.config.js`; verify on Vercel Preview (Phase 5).                                              |
| R6  | react-leaflet / apexcharts / gridstack / reactflow SSR breakage                                          | `next/dynamic ssr:false` wrappers (Phase 4).                                                                                                       |
| R7  | Google OAuth popup + `postMessage` + COOP; Next may add security headers                                 | Test explicitly in Phase 4 (local) + Phase 5 (deployed). Tune COOP/COEP in `next.config.js` headers if broken.                                     |
| R8  | MSW must intercept before first query fires                                                              | `ready` state gate in `app/bootstrap.tsx`; don't render `(app)` children until worker started (demo only).                                         |
| R9  | Anti-FOUC theme script currently inline in `index.html` `<head>`                                         | Re-add as inline `<script dangerouslySetInnerHTML>` in `app/layout.tsx` `<head>` (runs before paint).                                              |
| R10 | `next build` OOM (like Vite did)                                                                         | `NODE_OPTIONS=--max-old-space-size=6144`; record working command.                                                                                  |
| R11 | Long-lived branch drifts from `main`                                                                     | Rebase/merge `main` at the end of each phase; keep phases shippable-ish.                                                                           |
| R12 | i18n RTL (`ar`) + detector uses `localStorage`/`navigator`                                               | Keep i18n fully client-side in `providers.tsx`; do NOT adopt `next-i18next`. Verify `dir="rtl"` toggle.                                            |
| R13 | `AuthLayout` fetches dashboards list; timing vs auth guard                                               | Guard in `(app)/layout` runs first; `AuthLayout` unchanged below it.                                                                               |
| R14 | Pre-existing `dist/` and `.bak` files, `@locales` alias points at missing dir                            | Clean in Phase 7; don't let stale aliases mask errors.                                                                                             |
| R15 | **58 asset ES imports** (`import x from '*.svg'                                                          | '*.png'                                                                                                                                            | ...`) used as `<img src={x}>`. Vite → URL string; Next webpack → `StaticImageData`object → broken`src`. | Phase 4: add `next.config.js` `webpack` rule so `.svg/.png/.jpg/...` imports resolve to a URL string (Vite-compatible, e.g. `type:'asset/resource'` taking precedence over `next-image-loader`), OR codemod to `x.src`. Also covers `leaflet/dist/images/*.png` in `MarkerIcon.jsx`. No `?url`/`?raw`/`?react`/`import.meta.url` usages exist (checked). |
| R16 | `'use client'` still prerenders on server → `localStorage`/`window` at render scope crashes `next build` | Resolved by the `ssr:false` app-shell decision above. If any component is later pulled OUT of the shell for SSR, it must guard its browser access. |

---

## PROGRESS LOG

Append newest entries at the top. Each entry: date — phase — what changed — what's next.

- **2026-09-10 (17)** — **Strict-typing follow-up, Unit 10 — Map/Simulation/misc** (commit `60e413e`). Typed `screens/{Map,Simulation,Alarms,ConnectorHealthPage}`. `Map`: leaflet tuple casts. `Simulation` (799 L): `Record<string, any>` for the config/form/error/payload maps (nested arrow params still need explicit `: any`), inline-typed sub-components, curried change handler typed. `Alarms`/`ConnectorHealthPage`: small, card sub-components inline-typed. **This completes all 10 screen units.** Remaining `@ts-nocheck`: Unit 5b (3 giant Fleet files — `VehicleDetailModal`, `TripDetailModal`, `FleetDashboard`) + the low-level leaf components/forms/fakeBackend the owner's brief said to leave. `tsc --noEmit` 0, `tsc --strict` 0-for-unit, `next build` green. **161 `@ts-nocheck` files left.**
- **2026-09-10 (16)** — **Strict-typing follow-up, Unit 9 — Assets/WebGL** (commit `f9ee5c2`). Typed `screens/{Assets,WEBGLBUILDING,WEBGLFARM,WEBGLMARINA}` — type-only, no restructuring (highest visual-risk area). Added Unity `Window` globals to `src/types/modules.d.ts`. WEBGL screens: `useRef<HTMLCanvasElement | null>`, `(e: KeyboardEvent)` handlers. `Assets`: antd `Tree` render/select props cast `(x: any)` / `as any` (antd `DataNode` ≠ the app's node shape); `IconMapper` indexed via `(IconMapper as any)[key]`; `setState<any>` updaters need explicit `(prev: any) =>`. `tsc --noEmit` 0, `tsc --strict` 0-for-unit, `next build` green. **165 `@ts-nocheck` files left. Resume at Unit 10.**
- **2026-09-10 (15)** — **Strict-typing follow-up, Unit 8 — Roles/Users/Admin** (commits `d102f64` `1f9fdb5`). Typed 12 screens: `StatusFilterContent`, `EditCompany`, `EditUser`, `CompanyLocation`, `AllDevices`, `AllAsset`, `Allproducts`, `AllCompaniesList`, `InternalUser`, `PermissionToggle`, `RolesPermission`, `AccountSettings`. List screens = RadixTable pattern; the three form screens = `useForm<T>` + `yupResolver(...) as any` + `Record<string,boolean>` permission maps. `AllUser.tsx` deliberately **kept `@ts-nocheck`** (pre-existing `onRefetch` ReferenceError — added the missing prop so callers type-check + the guarded calls work, but full typing deferred per owner). Added `src/types/modules.d.ts` (`declare module 'react-scrollspy'`). Many `@ts-nocheck` component signature widenings (`AddLocation`, `GLobalCheckBox`, `GlobalRadioGroup`, `CardRole`, `CustomAvatar`, `TableSkeleton`, `CreateProductFromPayload`). `RadixTable` types: `DataTableColumn.sortable?`, `DataTableProps.defaultRowsPerPage?`, `DataTableBulkAction.id: string|number`. `tsc --noEmit` 0, `tsc --strict` 0-for-unit, `next build` green. **169 `@ts-nocheck` files left. Resume at Unit 9.**
- **2026-09-10 (14)** — **Strict-typing follow-up, Unit 7 — Rules** (commit `0cdd6d0`). Typed `screens/{RuleBuilder,AddNewRule}`. `RuleBuilder`: `DataTableColumn[]` columns (`accessor` widened to `string | null` in `RadixTable`), typed handlers, `any[]` rule state. `AddNewRule`: `RuleFormValues` + `RuleCondition` interfaces, `useForm<RuleFormValues>` + `useFieldArray`, template-string `setValue` paths cast `as any`, mapping-helper params `any`. `@ts-nocheck` signature widenings: `ConfirmDelete` (optional `itemName`/`title`/`message`), `TableSkeleton` (`count?`), `EmailAction`/`SmsAction` (`inputStyles?`), `RuleBuilderDemo` (`return null`). Removed dead imports + deleted empty `screens/Rules.tsx`. 3 latent bugs flagged (react-query v4 `keepPreviousData`/`isPreviousData`; `ConfirmDelete` ignored props). `tsc --noEmit` 0, `tsc --strict` 0-for-unit, `next build` EXIT=0. **181 `@ts-nocheck` files left. Resume at Unit 8.**
- **2026-09-10 (13)** — **Strict-typing follow-up, Unit 6 — Products/Devices** (commit `9ab991f`). Typed props/state/handlers for `screens/{ManageProduct,ManageProductConfig,ProductConfiguration,ManageDevice,ManageDeviceConfig,ManageConfiguration,ProtocolIntegration,Integration}`; product/device entities stay `any`. Gave `RadixTable` (`DataTable`) a real exported props contract (`DataTableProps`/`DataTableColumn`/`DataTableBulkAction`; internals still `@ts-nocheck`) — this was Unit 7's job, done early because 6 needs it. `Button` `ButtonProps.sx?` compat shim; `useSimpleQuery` `key` widened to allow array keys; small `@ts-nocheck` signature widenings (`AddDevices`, `ConfirmActivationModal.itemName?`, `DropDownMenuRadix.id?`, `IntegrationContent`, `ProductConfigurationDemo` `return null`). 6 latent bugs flagged (see list above). `tsc --noEmit` 0, `tsc --strict` 0-for-unit, `next build` EXIT=0. **183 `@ts-nocheck` files left. Resume at Unit 7.**
- **2026-09-10 (12)** — **Wrote `TYPING_HANDOFF.md`** — full standalone resume doc for the strict-typing follow-up (recipe, strict-verify snippet, per-unit file lists + gotchas, global groundwork, latent bugs). Synced this section's commit hashes. **State: Units 1–5 done (HEAD `92c06b9`), resume at Unit 6.** `tsc --noEmit` 0, `next build` green, 191 `@ts-nocheck` files left.
- **2026-09-10 (11)** — **Strict-typing follow-up, Units 1–5** (commits `6617d40 3821fd7 bd7d635 945e01f 92c06b9`). Hand-wrote props/state/handler/ref types for shared form primitives, Auth (5 screens), app shell/shared (11 files), Dashboard/Home (3), Fleet (12 files). Global groundwork: `ApiResult` reshaped loose, query hooks generic, `apiHelper` `any` default, `disableStaticImages`, `@types/leaflet`, `UserContext.uploadedImage` nullable. Deferred Unit 5b (the 3 giant Fleet files). `tsc --noEmit` 0 and `tsc --strict` 0-for-unit after each; `next build` green after each.
- **2026-09-09 (10)** — **Phase 7 done → migration complete** (commit `7121a25`). Owner verified 2nd Preview deploy. Deleted 9 dead entry files; `git mv` the last 218 `src/` `.jsx`→`.tsx` (`@ts-nocheck` on the not-yet-typed ones); `src/` is 100% TypeScript. `typescript.ignoreBuildErrors` → false — `next build` now type-checks and passes. Removed Vite entirely (config, deps, `react-router-dom`, `index.html`, `jsconfig.json`). `.eslintrc.json` → `next/core-web-vitals`. Enabled the 5 error-free strict-family flags. Docs updated (`CLAUDE_FRONTEND_CONTEXT.md` addendum, `HOW_TO_TEST.md`). **Remaining = optional hardening** (`strictNullChecks`/`noImplicitAny`/`strict`, un-`@ts-nocheck`, lint backlog) + Phase 8 SEO.
- **2026-09-09 (9)** — **Phase 6 batch 3** (commit `fa42ab7`): 1st Vercel Preview verified OK by owner → resumed. Repo-wide local-import extension strip + `git mv` of the 246 `src/` files that type-check clean untouched. `tsc --noEmit` kept at 0 by reverting the 218 error-files back to `.jsx` (they need real per-file typing → Phase 7). **257/484 src files now TS.** `next build` green. **Next:** owner does a 2nd Preview deploy; on sign-off → Phase 7 (delete dead files, type the 218, enable strict).
- **2026-09-09 (8)** — **Phase 6 foundations done** (batches 1–2, commits `febb0d7` `65c43f8`). Converted the highest-fan-in modules to TS: `src/types/api.ts` (new shared types), the API/axios/query-hook layer, `router-compat`, and all 5 contexts. `next build` + `tsc --noEmit` both clean (0 TS errors) after each batch. Remaining `.jsx`→`.tsx` (~467 files) is genuinely incremental — `allowJs` keeps them working; documented the conversion recipe + order in the Phase 6 section for the team. **Next:** either keep grinding Phase 6 batches (i18n/validation → shared components → screens), or pause here for the owner's Vercel Preview deploy (Phase 5) and Phase 7 cleanup.
- **2026-09-09 (7)** — **Phase 4 build-verified + Phase 5 config done** (commits `4afb6f8` owner parity fixes, `7603b31` deploy config). `vercel.json`: SPA rewrite removed, DiaryFarm `.gz` headers added, `framework: nextjs`. Owner did initial code analysis + testing, deferred full runtime pass to the Vercel Preview. `next build` green throughout.
- **2026-09-09 (6)** — **Phase 3 DONE.** Generated 49 `app/**/page.tsx` from `AllRoutes.jsx` (script in scratchpad). Tab families → `[tab]` segment + `notFound()` guard. `/` wired to GuestHome. `next build` EXIT=0 — all routes compile & prerender cleanly (~2.6 min). `next dev` smoke confirmed 200s for the routes hit before dev OOM-died (dev-only, on-demand compile memory; `next build` fine — documented workaround added). Owed: per-route visual parity (Phase 4). **Next:** Phase 4 — parity pass: fix `'use client'`/SSR issues if any surface at runtime, `next/dynamic ssr:false` wrappers for leaflet/apex/gridstack/unity where needed, demo-mode e2e (MSW+Dexie+Pusher), full manual smoke of every route family.
- **2026-09-09 (5)** — **Phase 2 DONE.** Built `src/lib/router-compat.jsx` (react-router→`next/navigation` shim) and codemodded 46 files to import from it (`@lib` alias added). Created `app/not-found.tsx`, `app/route-progress.tsx`, `app/bootstrap.tsx` (MSW demo + sim + pusher init, `ready` gate), route groups `app/(public)` + `app/(app)` with `NonAuthLayout` / auth-guard+`AuthLayout`. Added the svg/png/mp4 → URL-string webpack rule to `next.config.mjs`. Learned: route-group `layout`/`page`/`not-found` files need `'use client'` or Next SSR-renders legacy hook components server-side and errors. `next build` green for `/ /_not-found /home /login`; dev serves all with correct status codes. Owed: browser eyeball of `/login` + `/home`. **Next:** Phase 3 — generate `app/**/page.tsx` for all ~78 routes from `AllRoutes.jsx` (dynamic segments, tab families), wire `/` → GuestHome (needs `styles/global.css` + the `.mp4` — rule now in place), delete/verify `Success.jsx` (`react-query`).
- **2026-09-09 (4)** — **Phase 1 DONE.** Installed Next 15.5.25 + TS toolchain; wrote `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `app/{layout,providers,app-shell,page}.tsx`, `.env.local`. Pulled the `import.meta.env`→`process.env` codemod forward (9 sites). **Hit + fixed a structural blocker**: `src/pages/` = Next Pages Router → renamed to `src/screens/` (62 files, aliases + 3 relative-import files patched). `next build` and `next dev` both green; Tailwind v4 tokens verified in the emitted CSS. Owed: one manual browser eyeball of the placeholder. **Next:** Phase 2 — route groups `(public)`/`(app)`, port both layouts + auth guard, `app/bootstrap.tsx` (MSW/sim/pusher), NProgress, and the repo-wide react-router→`next/navigation` codemod (53 files).
- **2026-09-09 (3)** — Phase 0 DONE → starting Phase 1. Created branch `feat/next-ts-migration`. Recorded Vite baseline (builds OK w/ 6 GB heap, ~1m22s, 3.2 MB main bundle). Read all provider/config sources. Findings added: (a) refined to an `ssr:false` app-shell architecture to sidestep wholesale `localStorage`-at-render SSR crashes; (b) `styles/global.css` is live via `GuestHome.jsx`, not dead; (c) `UserContext` has an unused `useNavigate` to delete; (d) 58 asset ES imports need a webpack rule (R15). **Next:** Phase 1 — `npm i next` + toolchain, write `tsconfig.json`/`next.config.js`/`postcss.config.mjs`/`app/layout.tsx`/`app/providers.tsx`, boot `next dev` to a placeholder.
- **2026-09-09 (2)** — Phase 0 — Verified codebase inventory (counts, react-router usage ×53 files, env usage, 6 SSR-unsafe module-scope reads, Tailwind/MSW/deploy wiring). Locked the 4 decisions with the owner. Wrote this `task.md` (replaced prior scratch content — a sample login API response, still in git history at `task.md@694a8a8`).
- **2026-09-09 (1)** — Read `CLAUDE_FRONTEND_CONTEXT.md` in full; built project understanding.

---

## Archive

_(empty)_
