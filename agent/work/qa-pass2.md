# QA pass 2 — strict, per-control (T-003)

Method per page: (1) DOM inventory of every button/link/input/select/checkbox/tab (JS list), (2) exercise each incl. SUCCESSFUL submit with ZZ throwaway data, (3) check console errors, (4) widths 1536 / ~820 / 390, (5) record result. Legend: [x] works · [!] defect → fixed · [d] dead/fake control (decision pending) · [-] not testable (why) · [ ] todo.
Real clicks (find ref) for nav menu links; synthetic .click() does not navigate them.

## Pages

- [x] /fleet-management/operations/overview
- [x] /operations/map
- [!] /operations/vehicles (+modal, add/edit/delete)
- [x] /operations/drivers
- [x] /operations/geofences
- [!] /operations/yards
- [x] /operations/trips
- [x] /operations/assignments
- [x] /operations/incidents
- [x] /fleet-management/settings (successful save + restore)
- [x] /analytics/utilisation, trips, fuel, maintenance
- [x] /ai
- [!] /manage-product, /products/<id>/*, /connector-health, /all-products
- [!] /roles-permission (+ /assign-permission create/EDIT role), Members
- [x] Legacy: /users, /internal-user, /members, /edit-user/<id>, /users/<id>/profile|activity|security, /companies/list + sub-pages
- [x] /account-setting (successful save + restore), /company-location, /home
- [x] /documentation, /integration, /module-management, /plan-management, /map, /analytics(super admin)
- [x] Public: /, /login, /register, /forget-password, /reset-password, /verify-token/<t>, 404
- [x] Shell: nav, palette, copilot, bell, account menu, mobile sheet, sub-nav, tz notice
- [x] Tablet width (~820px) sweep of all main pages

## Findings log

- Harness: sessionStorage.zzboot holds JS helpers (__sweep clicks every non-destructive control by label, reports NOCHANGE/GONE/ERR; __type sets React-controlled inputs; __scope='[role=dialog]' to sweep modals). Re-inject with eval(sessionStorage.zzboot) after each navigation. Keep dev server < 4 GB (owner reminder).
- overview: all 62 controls exercised. [d] status donut legend (Fleet status ×5 rows) and cost-breakdown donut legend row are buttons that do nothing; KPI tile 'On-time delivery: no value. Open details' does nothing when there is no value (probably deliberate). Everything else responds (KPI click-through, worklist filters/items → modal, top-vehicle rows → dialog, metric switches). No console errors. Refresh gives no visible change (refetch only).
- map page has no <button> controls beyond the route select (pass 1 covered markers/popup).
- vehicles: status chips, select all/clear, 20 row modals open, modal tabs (Overview/Tracker/Maintenance/Fuel/Compliance/History) OK, all 6 filter selects + 7 sorts + per-page respond, no console errors. Successful paths: CREATE ZZ P2 Vehicle OK; EDIT save on seeded vehicle 15 → PUT 200 (reverted); DELETE permanently with confirm → removed. [backend] EDIT save on the freshly created vehicle 230 returned HTTP 500 from PUT /api/vehicles/230 even for a one-field change (frontend payload is only changed fields + expected_updated_at, identical shape to vehicle 15 which works) → backend issue, out of scope, reported to owner. Frontend shows toast.error. Not clicked: Export CSV, bulk Deactivate/Delete permanently (67).
- drivers: chips, select all/clear, pager, 7 selects (all options) respond, no console errors; modal tabs OK. Successful paths: CREATE ZZP2 Driver OK; EDIT save (last name) OK; Log Incident (ZZ P2 Incident) saved + listed; Add Document (needs Document type; Save stays disabled until filled, no message) saved; Delete permanently correctly REFUSED with toast (has incidents + docs) → Deactivate confirm OK. LEFTOVER test data: driver 'ZZP2 DriverEdited' (deactivated, has 1 incident + 1 doc) — cannot be deleted by design; incident 'ZZ P2 Incident' can be deleted on /operations/incidents. Assign-vehicle form not exercised (driver deactivated).
- geofences: 6 selects (all options) + pager + select-all OK; CREATE (ZZ P2 Fence), EDIT save, Disable/Enable, Delete confirm → removed; no console errors. Events sidebar filter select verified. Export CSV not clicked.
- yards: 5 filter selects + per-page + sorts OK; CREATE ZZ P2 Yard, EDIT save (name+address) persisted in list, Delete permanently confirm → removed (a 404 GET is logged right after because the open modal refetches the deleted yard; harmless). FIXED: yard editor modal header kept the OLD name after an edit (used the prop captured when opened) → now uses fetched yard name (YardLayoutEditor.tsx). Not tested: layout image upload (file chooser), Add Slot/check-in on a yard without layout.
- trips: status chips, 4 selects (all options), sorts, per-page, pager OK, no console errors. FULL LIFECYCLE with real saves: CREATE ZZ-P2-TRIP → Edit save (purpose) → Start Trip → Complete (fuel used) → status Completed; CREATE ZZ-P2-TRIP2 → Cancel (reason required, button disabled until typed) → Cancelled. Delete verified in pass 1. Note (original, unfixed): Create Trip with a required field missing does nothing and shows NO message (I hit this when the driver select reset after picking a vehicle). LEFTOVER test data: ZZ-P2-TRIP (completed) and ZZ-P2-TRIP2 (cancelled) — completed/cancelled trips cannot be deleted from the UI; my_trip earlier moved to in-progress in pass 1.
- assignments: read-only table; 3 selects, both date filters (future date → fewer rows, cleared → restored), pager OK. No create/edit UI exists here.
- incidents: 4 selects, sorts, per-page OK; EDIT save (type) persisted; DELETE with 'Yes, delete' confirm removed my ZZ incident. No errors.
- fleet settings: real SAVE (default trip-stale minutes 15→16) toast 'Fleet settings saved.', persisted after reload, RESTORED to 15 (saved again). Unit cards/timezone not re-saved.
- analytics (utilisation, trips, fuel, maintenance ×3 views): every control swept (ranges, compare, interval, add filter, info popovers, view-as-table, KPI tiles, tables), no console errors; table sorts verified to reorder rows (trips 7/7, fuel 6/8 — PRICE/L + STATION unchanged, probably identical seeded values). [d] 'Trips by outcome / Outcome mix' donut legend rows do nothing (same as overview legends), whereas the Compliance donut legend rows DO filter — inconsistent. 'Refresh' and 'Auto' have no visible effect (refetch / already active). Export CSV not clicked.
- /ai: 4 insight-action buttons, chat send (message appears, input clears), 4 automation switches all respond, no errors.
- devices: /manage-product row click is an intentional NO-OP (original ManageProduct.tsx onRowClick={()=>{}}); navigation is via Devices badge and edit icon (first visit compiles slowly, looked dead until route finished compiling). Full flow with real saves: ADD PRODUCT (ZZ P2 Product + first device; protocol credentials screen + Acknowledge) → Devices badge → ADD DEVICE OK → inline EDIT of Dev EUI cell saved → View Points dialog OK → Configuration: Product Name / raw packet are read-only until a packet arrives; 'Save & Validate' correctly refuses ('mark at least one attribute as Unique Identifier') → Integration HTTP/MQTT tabs → History → REMOVE PRODUCT needs typing the product name (Delete disabled for empty/wrong, enabled for exact) → removed, redirected to /manage-product. Console warning 'Unknown event handler property onOpenAutoFocus' from components/Select.tsx (documented inert original handler, left). 'Copy' buttons show no visible feedback in the automation tab (clipboard). Not tested: Save Configuration on Integration tab (would change product), bulk actions.
- connector-health: only a Refresh button (refetch, no visible change). all-products: New Template / Create from Payload / Add Product / Edit / Save as Template controls respond; FIXED: column-header Sort menu (Asc/Desc) was DEAD on /all-products (screen passed no onSort — same in original main) → wired server-side sort exactly like ManageProduct (opt-in: no sort params until a column is chosen); verified A→Z reorders. Note: column headers open an Asc/Desc menu (click, don't expect a direct toggle) — my earlier 'SAME' sort checks on such tables were menu opens, not defects.
- roles: ADD ROLE (name, description, 3 toggles) saved → role listed (5 roles); EDIT ROLE page prefilled correctly (name/desc/toggles), changed name + toggles → 'Update Role' persisted + redirected to list; DELETE ROLE confirm → removed. FIXED: creating a role gave NO feedback (form silently reset, original had the alerts commented out) → added success/error toasts (PermissionToggle.tsx). Not done: Add Member SUBMIT (would create a real user/possibly email); Members tab controls verified in pass 1.
- legacy: /members = same as Roles → Members tab (ok). /users, /users/<id>/profile|activity|security are all the same AllUser screen (route aliases in original) → 'No users found' for this account; Add User dialog opens (fields: names, email, phone, role, password, address, country, city, state; NOT submitted, would create a real user; validation-on-empty not re-verified this pass). /internal-user: hard-coded mock rows (John Smith … ), [d] 'Edit User' and 'Delete User' buttons do nothing (original mock). /edit-user/<id>: Products tab (lists that user's products; edit icons) + User Settings tab (embeds the account settings forms; empty for a non-existing user 1; dev warning UNSAFE_componentWillReceiveProps comes from react-phone-input-2). /companies/2/company-settings and /users load; company Users tab 'Edit User' navigates to /edit-user/<id> (works). companies list: empty for this user.
- account-setting: REAL SAVES: basic (last name +X → toast 'Successfully completed!', localStorage user updated, restored to Developer2); company info Save works and, as in the original AddLocation flow, REDIRECTS to /manage-product afterwards; zip verified back at original value 'f'. Not tested: avatar upload/crop, password change success (needs the real password), delete account.
- public + shell were verified control-by-control earlier the same day (pass 1 tail, see qa-checklist.md) incl. wrong-password login, validation, anchors, palette/copilot/bell/account menus, mobile sheet; not re-run with the harness. FIXED there: palette Escape.
- tablet 820px: 18 main routes loaded in iframes — none scroll the page horizontally (scrollWidth 820); analytics tables scroll inside their own container; visual check of utilisation OK (2-col KPI grid, hamburger nav).

## PASS 2 SUMMARY — dead / fake controls needing an owner decision (no behaviour changed yet)

1. Donut legend rows (overview 'Fleet status' ×5 + cost breakdown; analytics/trips 'Outcome mix') are buttons that do nothing (Compliance donut legend DOES filter). Options: wire to filters / render as plain text.
2. /internal-user: hard-coded mock users; 'Edit User' and 'Delete User' do nothing. /integration list: unlinked mock, modal says 'hi'. /company-location: hard-coded 'ChirpTech' row, bookmark icon inert. /users + aliases: 'No users found' (unwired screen). module/plan management: 'coming soon'.
3. KPI tile 'On-time delivery … Open details' does nothing when there is no value.
4. Create Trip / some forms: missing required field → nothing happens and NO message.
5. [backend, out of scope] PUT /api/vehicles/<new id> returned HTTP 500 for a freshly created vehicle (edit of seeded vehicle 15 works).
   Leftover test data: driver 'ZZP2 DriverEdited' (deactivated, 1 document), trips ZZ-P2-TRIP (completed) + ZZ-P2-TRIP2 (cancelled) — cannot be deleted from the UI; old ZZ Tracker devices.

## Follow-up (owner said 'continue with the donut thing'): donut legends wired

- StatusDonut gained an optional `canSelect(key)` (slices without a target render as plain rows, not buttons).
- Overview 'Fleet status': 'No tracker' → opens Vehicles pre-filtered 'No tracker' (writes sessionStorage `list:vehicles:server`), Moving/Idle/Parked/Offline → Live map. Overview cost donut: Fuel → /analytics/fuel, Maintenance → /analytics/maintenance?view=history; Driver/Tolls/Other are plain rows (no target page).
- Analytics/Trips 'Outcome mix': Completed/Cancelled filter the Trips table below (chip shows active) and scroll to it; 'Open' (= planned+in progress, no single filter) picks whichever of the two is larger. Verified live. 'On-time delivery' KPI with no value stays non-clickable on purpose.

## Follow-up: silent forms fixed (owner: 'continue with these fix forms')

- New `components/RequiredHint.tsx` ('Required: a, b') shown above the submit row of: Add Vehicle, Add Driver, Add Yard, New Geofence, Create Trip, Log Incident, Add Document, Cancel Trip reason. Create Trip's handler now toasts the specific missing item (vehicle / driver / origin / destination) instead of returning silently (driver was the silent case: button enabled but nothing happened). Verified live on Create Trip.
