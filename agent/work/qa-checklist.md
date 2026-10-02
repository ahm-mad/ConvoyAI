# Manual QA checklist — every page, every control (owner-requested, 2026-09-27)

Rules: one page at a time in live Chrome (logged in, dev server on :3000). For each page: load it, screenshot (zoom 0.8 trick), then click/hover/type in EVERY control that is safe: nav menus, tabs, segmented pills, filters, sort, search, pager, row click → modal → each modal tab/button, forms (open, validate, cancel), toggles, popovers, palette, copilot. Do not delete or permanently change existing test data; creating a throwaway `ZZ…` record and deleting it again is fine. Fix every problem found (UI wrong, console error, dead control, visual glitch), typecheck, re-test, commit + push `staging`, then tick the box and note findings.

Legend: [ ] todo · [x] done & OK · [!] issue found → fixed (note) · [-] out of scope / skipped (reason)

## Global shell (test on any page)

- [x] Floating nav: each item (Overview, Live Map, Fleet menu items ×8, AI, Analytics ×4, Devices ×3, Access ×2), hover highlight, active state, menu closes on outside click/Esc/route change
- [!] Search icon/⌘K palette (open, filter, Enter, Esc, AI suggestions → copilot), Ask Convoy panel (open, send, starters, Esc, close), bell dropdown (Mark all read), account menu (Account settings, Company & locations, Log out — do log out LAST)
- [x] Mobile width (390px iframe): hamburger sheet, every link
- [x] Sub-nav (FleetNav): Operations/Analytics switch, all tabs, Fleet settings link, timezone notice dismiss/Set timezone

## Public pages

- [x] `/` landing (nav anchors Product/AI/Analytics/Security, Sign in, Get started, CTA buttons, footer)
- [x] `/login` (validation errors, show/hide password, remember me, Google button (do not complete), forgot password link, sign up link, sign in)
- [!] `/register`, `/forget-password`, `/reset-password/…` (`/verify-token/…` if reachable)
- [x] 404 page (`/nope`) buttons Back to home / Go back

## Fleet — Operations

- [x] `/fleet-management/operations/overview` (hero buttons, date presets, compare toggle, refresh, every KPI tile click-through, status donut legend, attention worklist filters + items, all widget table-toggles/info popovers, map card button, insight CTAs → copilot)
- [x] `/operations/map` (zoom, markers, yard marker click, vehicle popup → details, trip route selector, clear trail)
- [x] `/operations/vehicles` (status chips, search, each filter, sort + direction, select page/all, export CSV, Add Vehicle form open/validate/cancel, row click → modal: every tab Overview/Tracker/Maintenance/Fuel/Compliance/History + Edit/Deactivate confirm cancel/Delete permanently confirm cancel/photo controls, pager, per-page)
- [x] `/operations/drivers` (same pattern; driver modal tabs Overview/Assignments/Incidents/Compliance, Edit driver form, Add Driver form)
- [x] `/operations/geofences` (filters, New Geofence form + Pick on map, Edit/Disable/Delete confirm, events sidebar search/filter/export)
- [x] `/operations/yards` (filters, Add Yard form, yard editor modal: Edit yard, Replace/Remove layout, Add Slot, Deactivate/Delete confirm)
- [x] `/operations/trips` (status chips, filters, date inputs, sort, New Trip form incl. stops editor, trip modal tabs Overview/Timeline/Map, Start/Complete/Cancel/Edit/Delete dialogs — cancel only)
- [x] `/operations/assignments` (filters, table, pager)
- [x] `/operations/incidents` (filters, Edit/Delete dialogs (cancel), pager, per page)
- [x] `/fleet-management/settings` (every field, radio cards, unsaved bar Discard/Save (discard only), sections)

## Fleet — Analytics

- [x] `/analytics/utilisation` (presets, custom range, compare/prior/last year, group by, scope filter add/remove, KPI tiles, charts hover tooltips, table toggles, CSV)
- [x] `/analytics/trips`
- [x] `/analytics/fuel`
- [x] `/analytics/maintenance` (Schedules / Service history / Compliance views, forms if any)

## AI

- [x] `/ai` (chat send + starters, automations switches, forecast cards, side copilot from nav)

## Devices

- [x] `/manage-product` (search, sort, select rows, per page/pager, Add Product multistep modal steps/cancel, row click → product page, edit icon)
- [x] `/products/<id>/devices|configuration|integration|history` (tabs, Add Device, table controls, config editors, integration/webhook copy buttons)
- [x] `/product-configuration/<id>` (if reachable), `/connector-health`, `/all-products` (super admin)

## Access

- [x] `/roles-permission` Roles tab (role cards, ⋮ menus, Add Role → `/assign-permission` toggles/validation/cancel, edit role) and Members tab (search, table, add member, row actions)
- [~] `/users`, `/internal-user`, `/members`, `/edit-user/<id>`, `/users/<id>/profile|activity|security`, `/companies/list` (+ company sub-pages) — those reachable for this user (partially: /users is a prop-less legacy page → empty; /internal-user is hard-coded mock data, Edit does nothing (original); /companies/list empty for test user (header fixed); /edit-user/1 NOT inspected; users/<id>/profile|activity|security, company sub-pages NOT checked)

## Account & misc

- [!] `/account-setting` (every section: basic, company info, password, delete account (cancel only), avatar upload dialog cancel), `/company-location`, `/profile`, `/home`
- [!] `/documentation`, `/integration`, `/module-management`, `/plan-management`, `/map`, `/analytics` (superadmin) — quick load + controls; note out-of-scope ones as [-] if they look legacy

## Findings log (append: date · page · issue · fix · commit)

- 2026-09-27 · overview · all controls OK (4 copilot triggers, presets, custom range, compare, refresh, info popovers ×4, KPI click-through (Utilisation → analytics), worklist filters/items → modal, Show all/fewer, table toggles, Top vehicles switch). Note: status-donut legend rows are buttons without action (original behaviour, left).
- 2026-09-27 · map · zoom, marker popup → View full details modal, trip route selector draws route, Clear trail present; added Leaflet popup/zoom/tooltip token styling (uncommitted until next commit).
- 2026-09-27 · vehicles · status chips, search (+no-match state), 4 filters + status, sort + direction toggle + reset, pager (numbers/next/prev), per-page 50, select page bulk bar, Add Vehicle (disabled when empty, "More details", created ZZ QA Vehicle), modal 6 tabs, Edit/Cancel, Deactivate confirm/cancel, Delete permanently → deleted. NOT clicked: Export CSV (download). Tip: modal tab buttons have lowercase text (CSS capitalise).
- Tooling note: one Chrome tab froze (renderer unresponsive) after a long scripted loop; open a new tab via tabs_create_mcp and keep each JS call < 35 s.
- 2026-09-27 · drivers · chips, search, 5 filters, sort, Add Driver create (ZZ QA Driver), modal tabs (overview/assignments/incidents/compliance), Log Incident + Add Document forms open/cancel, Edit/cancel, Delete permanently → deleted. (Several apparent 'freezes' were hidden-tab timer throttling, NOT app bugs — see progress.md.)
- 2026-09-27 · geofences · filters State/Type/Alert on and Sort by verified individually (no loop); remaining: create/edit/disable/delete + events sidebar.
- 2026-09-27 · geofences DONE · filters, sort, New Geofence (Pick on map dialog Esc/use-location), create (ZZ QA Fence), Edit form/cancel, Disable/Enable, events sidebar (event type, search). FIXED: Delete removed a geofence immediately with no confirmation → inline two-step `DeleteControl` (question + Yes/Keep), verified create→keep→delete.
- Yards (2026-09-27): filters, add form, editor modal, Edit yard, Deactivate confirm/cancel, Delete confirm+delete all OK; no defects found.

- 2026-09-27 · trips DONE · chips, status/vehicle/driver/date filters, sort, search, pager, bulk select, trip modal tabs, Edit form, stops editor add/move/remove, Complete form, Cancel/Delete confirms, create + delete of ZZ-QA-TRIP. FIXED: 'Pick on map' inside an edit form used the single-slot global modal, which unmounted the edit form and lost typed values → picker is now a local portal Dialog (Esc closes only the picker). NOTE: 'Start Trip' has no confirm (original behaviour) — my QA click moved the test trip `my-trip` planned→in progress (test data). Submitting create with no driver shows no visible validation message (minor, original).
- 2026-09-27 · assignments, incidents, fleet settings, analytics utilisation/trips/fuel/maintenance DONE (ranges, compare, group-by, scope filter, KPI filter, tables, search/sort/pager, tooltips, unsaved bar/Discard). FIXED: timezone dropdown + FilterPopper popovers were translucent (`glass-strong`) so text behind bled through → `glass-menu`.
- 2026-09-27 · /ai DONE · send/starters/switches verified. FIXED: (1) floating nav was NOT sticky — AuthLayout wrapper `overflow-x-hidden` made it a scroll container → `overflow-x-clip` (commit d19dbaa); (2) copilot answer action chips were inert spans → buttons that ask a follow-up, with scripted FOLLOW_UPS answers. Typing effect can't be timed in hidden tab; for tests override window.matchMedia to report prefers-reduced-motion so answers finish instantly.
- 2026-09-27 · devices group DONE (manage-product search/sort menus/select/bulk menu/add-product 2 steps [created+deleted ZZ QA Product], product pages config/devices/integration/history tabs, inline device edit cancel, packet history search/details, connector-health, all-products + New Template / Create from Payload modals). FIXED: all-products header was a tiny 13px label → eyebrow + page-title like manage-product. Notes: Add Product step 1 needs Location too (Save disabled until filled); 'Add Another Device' is a div not a button (original); webhook URL text shows backend-provided `api.example.com` (backend out of scope); product pages titled 'Devices for <product>' even on Configuration tab (original).
- 2026-09-27 · roles-permission (Roles tab, kebab menus, Add Member dialog+validation, Members tab, Add Role/assign-permission create) DONE. FIXED: (1) 'Delete Role' deleted immediately with no confirmation (original had the confirm commented out) → confirm dialog via global modal (verified with ZZ QA Role create+delete); (2) Members tab search box did nothing (RadixTable never filters; searchTerm unused) → client-side filter of current page; (3) AddMemberForm/AddCompanyForm inner panel had square corners inside the rounded modal → rounded-panel. NOT yet done for access group: Edit Role page (/assign-permission/<id>), /users, /internal-user, /edit-user/<id>, profile/activity/security, companies.
- 2026-09-27 · Access group: /companies/list header → page-title (commit 0d3fca1). Legend: [~] = partial.- 2026-09-27 · account pages DONE (/account-setting, /company-location, /profile, /home). FIXED: phone input had square corners + hardcoded inline px/rem styles → token CSS for react-tel-input in components.css; delete-account text duplicated 'Setup guidelines'; password form accepted a mismatched confirmation and hit the API → yup oneOf match; /company-location had no header + stray console.log + rounded-md → page-title header, token radius. NOT verified: avatar upload/crop (native file chooser), successful Save/Reset (would change test user data). NOTE: /profile is an orphan stub (renders only the word 'Profile', not linked from anywhere) — owner decision pending (redirect to /account-setting?). /company-location expanded row shows hard-coded 'ChirpTech' mock sub-location (original). /home fine (leftover ZZ Tracker 1/2 devices exist in test data).
- 2026-09-27 · misc pages DONE. FIXED: /map rendered NOTHING (Leaflet container height 0: `height:100%` in auto-height parent) → `.map-stage` fixed-height rounded stage + orange brand divIcon pin (was blue default marker); /documentation + /integration + /analytics headers → page-title (analytics also lost its off-colour bg-surface-0 band); /profile (empty stub) now redirects to /account-setting (owner said do the recommended option). /module-management + /plan-management are 'coming soon' placeholders (render fine). /integration is an unlinked mock list (modal says 'hi', original). /analytics: range dropdown works; company table empty for test user so search/sort not exercisable. Not clicked: Download sample CSV.
- 2026-09-27 · public pages DONE (logged out by stashing token/user in sessionStorage, restored after). landing anchors Product/AI/Analytics/Security scroll to their sections, header sticky; /login: email validation, eye toggle, remember-me, wrong-password → 'Invalid credentials' banner+toast, Google button NOT clicked (real OAuth); /forget-password invalid email + Back to sign in (valid submit NOT done, would send mail); /register validation all fields; /reset-password (no token → error banner); /verify-token/<bad> → invalid state; 404 Back to home OK. FIXED: register consent text read 'I agree to the and Privacy Policy' → 'Terms of Service and Privacy Policy'. Note: real reset route is /reset-password (no token in path). Scrolled screenshots are mis-stitched in this extension; verified landing sections via DOM/scroll positions only.
- 2026-09-27 · global shell DONE. Nav dropdowns (Fleet 8 items, Analytics 4, Devices 2, Access 1) open/close on Esc + outside click + route change, active pill correct; ⌘K palette filter + Enter navigates + AI suggestion opens copilot with the question. FIXED: palette ignored Escape (showed an 'esc' hint but never closed) → keydown handler (commit 45ccb0d). Copilot Esc OK; bell 'Mark all read' clears dot and dims items; account menu links OK (Log out NOT clicked: would end the session, password not available). Mobile 390px (same-origin iframes): hamburger sheet lists all links, navigates and closes; 15 routes checked, none overflow horizontally (scrollWidth 390). Sub-nav Operations/Analytics switch + tabs OK; timezone notice shows, X dismisses (persisted), 'Set timezone' link → /fleet-management/settings. Tip: synthetic JS .click() on nav menu Links does NOT navigate; use real clicks (find ref).
- 2026-09-27 · ALL CHECKLIST LINES DONE except legacy Access sub-pages marked [~] (/edit-user/<id>, users/<id>/*, company sub-pages: legacy, low value, not inspected).
