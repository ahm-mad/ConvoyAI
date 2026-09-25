# ConvoyAI API contract — companion to `reference/openapi.yaml` + `reference/openapi/*.yaml`

**Contract version 1.0.0** · generated 2026-09-21, split into modules 2026-09-22 · backend: `node-backend/` (Node 22 / Express 5 / Prisma / Socket.IO) · base URL: `/api` (unversioned)

This is the document to hand to the **frontend session**, together with the whole `reference/openapi.yaml` + `reference/openapi/` bundle (copy all of it — it's small, a few hundred KB total). It has three parts:

1. **`reference/openapi.yaml`** — a small **index**: conventions header, auth/servers, and an `x-modules` map of module name → file. It has no `paths` of its own — start here, then open the one module file you actually need.
2. **`reference/openapi/<module>.yaml`** — **21 files, one per module** (`auth.yaml`, `products.yaml`, `devices.yaml`, `dashboards.yaml`, `assets.yaml`, `rules.yaml`, `rbac.yaml`, `users.yaml`, `connectivity.yaml`, `peripheral.yaml`, the seven `fleet-*.yaml` files, `billing.yaml`, `onboarding.yaml`, `superadmin.yaml`) — each is a **complete, self-contained OpenAPI 3.1 document** (its own `openapi`/`info`/`servers`/`security`/`components`, nothing `$ref`'d into another file): every operation in that module, its auth requirement, path/query/body schemas (including the lenient Laravel-style shapes the server accepts), every response shape, and every error message the code can raise. §7 below links each module's section straight to its file. All 22 files together are **generated from the backend code** and checked in CI, so they cannot silently drift from what the server does.
3. **This file** — conventions, the realtime (Socket.IO) API (§4 — the section to hand over for the Pusher replacement), the things that do not fit in OpenAPI (quirks the frontend relies on, known gaps and problems found while writing the contract, operations that are not implemented), and a generated index of all operations linking to their module files.

> **How the frontend session should use it:** you don't need to scan the whole contract if most integrations already work — read §5 (_Known problems_) and §6 (_not implemented_) first, since those are the operations worth double-checking regardless. Beyond that, work endpoint-by-endpoint as issues come up: find the operation in §7's index (or grep for its path), open just that module's `.yaml` file (operationId is `<method><Path>`, e.g. `postAssetsByIdComponents`), and compare the request you send / response fields you read against its schema. Anything you rely on that the contract does not state — or contradicts — is a finding to report back to the backend session, **not** something to work around silently.

---

## 1. How the contract is produced and changed (contract-first)

None of `reference/openapi.yaml` or `reference/openapi/*.yaml` is hand-edited. They're assembled by `npm run openapi:write` (in `node-backend/`) from:

| Input                                                                               | Gives                                                                                                             |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| the mounted Express routers                                                         | which operations exist, and each route's auth guard (`x-auth`, `x-required-roles`, `x-required-permissions`)      |
| the Zod schemas each controller `parseOrThrow`s                                     | request path/query/body schemas (converted with Zod's `toJSONSchema`, input side, so leniency is preserved)       |
| the TypeScript types of each controller's `res.json(...)`                           | response schemas (`x-shape-source: typescript`)                                                                   |
| a static trace of `throw new …Error("…")` through controller → service → repository | the literal error messages per status code                                                                        |
| `src/platform/openapi/contract/` (curated data)                                     | conventions text, quirk/deviation notes, tested-with-frontend markers, real example responses, response overrides |

Every operation is assigned to exactly one module file by its first tag (one path can still have methods split across two files — e.g. `/devices/{id}`'s `GET`, D-0128's `componentsDevices` handler, lives in `assets.yaml`, while its `PUT`/`DELETE` live in `devices.yaml`; §7's index shows each operation next to its own file regardless). `npm run openapi:check` (a CI step) regenerates everything, reconstructs one logical document from all 22 files, and **fails on any difference** from what's committed (files added/removed/changed) or from this file's generated index. So the workflow for **any API addition or change is contract-first**: change the schema/route/annotation → `npm run openapi:write` → review the diff across whichever module file(s) changed → commit all of it. A change to the API that is not reflected there cannot be merged.

Provenance flags in the YAML: `x-shape-source: typescript | curated`; `x-tested-with-frontend: {log_row}` = the operation was exercised from the real frontend (row in `API_TESTING_LOG.md`) and matched Laravel's behavior; `x-quirks`, `x-deviation` (a _deliberate_ difference from Laravel, with the DECISIONS number), `x-alias-of` (PATCH mounted next to PUT).

Contract changelog: **1.0.0 (2026-09-21)** — first production-grade contract (replaces the frozen Phase-0 file, which had 236 stale operations). **2026-09-22** — §4 realtime updated: `dashboard:update`/`building:update` built (D-0139). **2026-09-22 (D-0140)** — split into a small index + 21 per-module files (was one 860 KB file); `info.version` stays 1.0.0, no operation/schema content changed.

## 2. Conventions

- **Base URL / versioning.** All paths are under `/api`. There is no version segment; breaking changes bump `info.version` and are recorded here.
- **Authentication.** `Authorization: Bearer <token>`. The token is `token` (identical to `access_token`) from `POST /login`, an HS-signed JWT valid **7 days** (D-0125; Laravel's was short-lived). It embeds the user's roles and permissions; guards read those, so a permission change takes effect at the next login. `POST /logout` revokes the token. `refresh_token` + `POST /refresh` exist but the frontend does not use them (KNOWN_ISSUES 11.64). A missing, malformed, expired or revoked token is always HTTP **401** `{"success":false,"message":"Authentication required"}`.
- **Authorization.** Roles seen: `admin` (per-company), `platform_operator` (cross-tenant). Permissions seen: `all-fleet` (all fleet endpoints), `manage users`. Failure = HTTP **403** `Requires role: X` / `Requires permission: X`. Many endpoints also enforce **company scoping**: touching another company's record is a 404 (or 403 where noted), never a leak.
- **Envelope.** Success: `{ "success": true, "message"?: string, …payload }`. Error: `{ "success": false, "message": string, "errors"?: { "<field or dot.path>": string[] } }`. `errors` appears only on 422.
- **Status codes.** 200/201 success · 401 unauthenticated · 403 forbidden · 404 not found · 409 conflict · **422 validation _and_ most business-rule failures** (Laravel's ad-hoc 500s for business errors are 422 here) · 500 unexpected (`"Internal server error"`, no detail) · 502 upstream service failed (e.g. AI provider).
- **HTTP 200 with `success:false`.** A few endpoints report a "no results" business outcome as 200 + `success:false` (e.g. `GET /products?user_id=…` with no match). These are `anyOf` branches of the 200 response. Conversely one 404 carries `success:true` (`GET /attribute/preference/setting/{id}`, Laravel parity). Do not branch on HTTP status alone for these.
- **Validation messages** come straight from Zod, e.g. `Invalid input: expected string, received undefined`, with the same text repeated under `errors.<field>`. Business-rule 422s use Laravel's literal sentences (listed per operation in the YAML).
- **Ids** are JSON integers, except a few asset endpoints (see _Known problems_). In Socket.IO payloads ids are **strings**.
- **Timestamps.** Two formats coexist because the frontend was built against Laravel: ISO-8601 with milliseconds and `Z` (`2026-09-21T12:34:56.789Z`, `format: date-time`) and Laravel's `Y-m-d H:i:s` (`x-format`; some are in the _owner's_ timezone). The schema of each field says which. Laravel serialised `updated_at` with 6 fractional digits; Node emits 3.
- **Optimistic concurrency (D-0176, fleet `PUT`s).** Every fleet record's `PUT` (vehicles, drivers, yards, yard slots, geofences, trips, maintenance schedules / logs, fuel logs, compliance documents, incidents) accepts an optional body field `expected_updated_at` — the record's `updated_at` as the client last saw it. If the record changed since, the answer is **HTTP 409** `{ success: false, message, current: { id, updated_at, updated_by, updated_by_user } }` and nothing is written. Without the field nothing changes. The comparison is at whole seconds (the column has no sub-second precision). Deletes, deactivate/reactivate, bulk actions and uploads are not covered.
- **Pagination.** Three styles: (a) the Laravel paginator — `{ current_page, data, first_page_url, from, last_page, last_page_url, links, next_page_url, path, per_page, prev_page_url, to, total }`; (b) this app's `{ items, pagination }`; (c) **offset-style `page` on `GET /products`**: the page served is `floor(page / per_page) + 1` (so `page=0` and `page=1` with `per_page=10` are both page 1). Everything else uses a 1-based `page`.
- **Lenient requests.** Like Laravel: numeric strings are accepted where an integer is expected, `"0"`/`"1"`/`0`/`1`/`true`/`false` for booleans (only where the schema shows the union), `""` becomes `null`, unknown keys are ignored. Whitespace is trimmed on the endpoints that say so. The generated request schemas already express these unions — do not tighten them client-side.
- **Uploads** (`POST /floor-plans`, `/vehicles/{id}/image`, `/yards/{yardId}/layout`, `/profile/{user}/update`) are `multipart/form-data`, one file field (`image`, or `profile_image` for the profile), **max 10 MB** (3 MB for the profile picture); files are stored in Cloudflare R2 and the response carries public URLs.
- **JSON body limit is 100 KB** (Express default) — larger bodies are rejected (see _Known problems_). **No rate limiting** is implemented.
- **CORS.** Allowed origins come from `CORS_ALLOWED_ORIGINS` (the frontend's origin must be listed); methods `GET,HEAD,PUT,PATCH,POST,DELETE`; credentials are not used.
- **Health.** `GET /health` (liveness, outside `/api`) and `GET /ready` (Postgres + Redis) return small JSON; not part of the contract.

## 3. Auth flows worth knowing

- **Register → verify.** `POST /register` creates the user, company and a placeholder subscription, and sends the branded verification e-mail; the e-mail link points at the frontend route `{FRONTEND_URL}/verify-token/{token}`, which must call `POST /verify-token` with `{ "token": "…" }`; `POST /resend-verification-email` re-sends. Logging in before verifying → 403 `Please verify your email first.`.
- **Login** returns `{ success, message, user, token, access_token, refresh_token, … }`; `user` is the _login-style_ object (`company`, `roles[].permissions`, `companyInfo`, `role_type`, `social_provider`). The frontend routes on `companyInfo`.
- **Google login (popup flow).** `GET /auth/google/redirect` → JSON `{ redirect_url }`; the frontend opens it in a popup; Google returns to `GET /auth/google/callback`, which answers with an **HTML page** that `window.opener.postMessage({ type: "GOOGLE_AUTH_SUCCESS", token, user, … }, FRONTEND_URL)` and closes. Failure: redirect with `?error=auth_failed`. New social users get a company, the admin role and a placeholder subscription first. Only `google` is a valid `{provider}`.
- **Password reset:** `POST /forgot-password` → e-mail → `POST /verify-reset-token` → `POST /reset-password`.

## 4. Realtime — Socket.IO (this **replaces Pusher**)

> **Status: complete as of 2026-09-22 (D-0139).** The old stack pushed live data through **Pusher**; the Node backend has **no Pusher at all** — it has a Socket.IO server with ten events (six per-user + four company-wide fleet events, §4.2/§4.6), including the per-dashboard and per-building ones that were deferred at the end of the contract task (§4.5 below covers the earlier "build later" decision and what changed). The frontend still needs to migrate from `pusher-js` to `socket.io-client` (§4.4) — that migration itself is out of scope for this backend repo.

### 4.1 Connecting

```ts
import { io } from 'socket.io-client';

const socket = io(API_ORIGIN, {
  // same origin as the REST API, e.g. http://localhost:8080
  path: '/socket.io', // server setting SOCKET_IO_PATH (default "/socket.io")
  auth: { token: accessToken }, // the same JWT as the REST API's Bearer token
  transports: ['websocket', 'polling'],
});

socket.on('connect_error', err => {
  // err.message: "Authentication required" | "Invalid token"
  // no/expired/invalid token -> log in again; do not retry blindly
});
socket.on('device:value', e => {
  /* … */
});
socket.on('alarm:state', e => {
  /* … */
});
socket.on('packet:initial', e => {
  /* … */
});
socket.on('notification:new', e => {
  /* … */
});
socket.on('dashboard:update', e => {
  /* … */
});
socket.on('building:update', e => {
  /* … */
});
// fleet events — company-wide room, only if the token carries the fleet permission (§4.6)
socket.on('fleet:position', e => {
  /* … */
});
socket.on('geofence:event', e => {
  /* … */
});
socket.on('trip:update', e => {
  /* … */
});
socket.on('fleet:changed', e => {
  /* … */
});
```

- **Handshake auth** is the JWT in `auth.token` (not a header, not a query string). Missing/empty → `connect_error` "Authentication required"; bad/expired → "Invalid token". A logged-out (revoked) token is **not** re-checked at handshake, only signature/expiry.
- **Rooms.** On connect the server puts the socket in room `user:{id}`, where `id` comes **only from the verified JWT** — the client never supplies or chooses an id, and there is nothing to subscribe to. A client only ever receives events for its own user. **Fleet room:** if the same verified JWT also carries a `companyId` **and** the `all-fleet` permission, the socket is additionally put in `company:{companyId}` (§4.6) — again derived only from the token, never from anything the client sends. (Pusher's channel was declared private but actually public — KNOWN_ISSUES 11.36.)
- **Reconnection.** Socket.IO's client reconnects automatically with the same `auth`; if the token expired meanwhile the reconnect fails with `connect_error` "Invalid token" — refresh the `auth.token` (`socket.auth = { token }; socket.connect()`). Events emitted while disconnected are **not** replayed; re-fetch state over REST after reconnecting.
- **Scaling.** Events originate in the worker process and reach the API process through the Socket.IO Redis adapter; nothing for the client to do.
- **CORS** for the socket is driven by the same `CORS_ALLOWED_ORIGINS` list.

### 4.2 Events the server emits today

All ids are **strings**. The first six events go to one user's room only; the four fleet events go to the company's fleet room (§4.6).

| Event              | Payload                                                                                                                                    | Fires when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device:value`     | `{ deviceId: string, productId: string, cleanedPacket: { [attribute]: unknown } }`                                                         | A device packet was ingested (HTTP webhook or MQTT) and its cleaned values stored — once per packet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `alarm:state`      | `{ ruleId: string, deviceId: string, state: "alert" \| "normal", message: string }`                                                        | A rule's alarm changed state (raised → `alert`, cleared → `normal`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `packet:initial`   | `{ productId: string }`                                                                                                                    | The **first** packet for a newly issued ingestion token arrived (the frontend uses this to move a product from "waiting for first packet" to configurable).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `notification:new` | `{ notificationId: string, title: string, message: string }`                                                                               | An in-app notification was created for the user by a rule action. The durable row already exists — dedupe against `GET /notifications` by `notificationId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `dashboard:update` | `{ dashboardId: string, widgets: [{ widgetId: string, values: [{ attribute_name: string, attribute_value: unknown, is_alert: 0\|1 }] }] }` | A packet updated one or more widgets bound (via `widget_settings.device`) to the packet's device, **and** that widget's widget is assigned to a dashboard. **Not a delta** of the whole dashboard — only the widgets the packet actually touched; merge into existing widget state by `widgetId`, same as `GET /dashboards/{id}`'s own `values` shape (`attribute_name`/`attribute_value`/`is_alert` are the same three keys, reused as-is). `is_alert` reflects the widget's own bound rule (`widget_settings.rule_id`, active **and** flagged `is_for_widget`/`is_for_all`) — a widget with no such rule always reports `is_alert: 0`, whether or not it triggers any separate `alarm:state`. |
| `building:update`  | `{ buildingId: string, deviceId: string, deviceIdentifier: string, asset: <same object `GET /assets/{id}`'s `asset` field returns> }`      | A packet's device is linked (via an asset component) to an asset. **Full current state of the whole asset tree**, not a delta — same shape as `GET /assets/{id}` (`id`/`name`/`type`/`icon`/`description`/`children[]`/`alerts_count`; each component: `is_alert`/`alert_attributes`/`latest_device_values`/…), evaluated for the packet's own user, so it matches what a `GET /assets/{id}` refresh would show right then.                                                                                                                                                                                                                                                                     |
| `fleet:position`   | `{ vehicleId: string, deviceId: string, latitude: number, longitude: number, speed: number \| null, heading: number \| null, recordedAt: string (ISO), tripId: string \| null }` | A tracker **currently installed in a vehicle** reported a GPS position (§4.6). Company room. `tripId` = the vehicle's in-progress trip or `null`. |
| `geofence:event`   | `{ id: string, geofenceId: string, geofenceName: string, yardId: string \| null, vehicleId: string, vehicleName: string \| null, eventType: "enter" \| "exit", occurredAt: string (ISO), tripId: string \| null }` | A vehicle really entered/left a geofence (every real transition, regardless of the geofence's `alert_on`) (§4.6). Company room. |
| `trip:update`      | `{ tripId: string, reason: "created" \| "started" \| "stop_arrived" \| "stop_departed" \| "stop_updated" \| "updated" \| "destination_reached" \| "completed" \| "cancelled" \| "deleted", status: string, awaitingCompletion: boolean, destinationReachedAt: string \| null, stop: <stop object> \| null, occurredAt: string (ISO) }` | A trip changed (§4.6). Company room. `stop` = the full stop object (`GET /trips/{id}` `planned_yards[]` shape incl. `events[]`) for the three `stop_*` reasons, else `null`. |
| `fleet:changed`    | `{ entity: "vehicle" \| "driver" \| "yard" \| "yard_slot" \| "geofence", id: string, action: "created" \| "updated" \| "deactivated" \| "reactivated" \| "deleted" \| "checked_in" \| "checked_out", occurredAt: string (ISO) }` | A fleet record was created / edited / deactivated / reactivated / deleted, or a vehicle was checked in / out of a yard slot (§4.6). Company room. A lightweight "refetch that list" signal — the payload carries no data. |
| `fleet:status_summary` | `{ total, moving, idle, parked, offline, no_tracker, occurredAt: string (ISO) }` | **D-0185 (flow 07 A9).** The exclusive fleet status counts (the same five states as `GET /fleet/dashboard` → `fleet_status`, summing to `total`), sent to the company room **only when they change**. A scheduled job checks once a minute, so a tracker that simply goes quiet (a timer-driven moving → offline change that produces no packet) is announced within about a minute. Counts only — refetch `GET /fleet/status-summary` for detail. Best-effort like every fleet event: keep refetch-on-reconnect. |

The client never emits any event to the server. Ids inside `dashboard:update`/`building:update` are strings (matching every other Socket.IO event); ids inside the nested `asset` object are **integers**, exactly like the `GET /assets/{id}` REST response it's reused from.

### 4.3 What the frontend uses today (Pusher) → what exists in Node

The frontend (`src/contexts/PusherContext.tsx`, `Grid.tsx`, `Assets.tsx`, `GlobalPacketListener.tsx`) connects with `pusher-js` (`NEXT_PUBLIC_PUSHER_KEY`, cluster `ap2`), subscribes to channel `broadcast-devices-realtime.{userId}`, and binds per-resource event names:

| Frontend binds (Pusher)                                                                                                             | Laravel payload the frontend reads                                                                                                                                                                                  | Node equivalent                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initial-packet-event.{productId}`                                                                                                  | `{ message: { message, product_id, product_name }, productId, userId, status }`                                                                                                                                     | **`packet:initial`** `{ productId }` — same moment, **different name and a smaller payload** (`message`/`product_name`/`status` are not sent; `productId` is a string). Bind once; filter by `productId`.                                                                                                                                                                                                                                        |
| `dashboard-values-event.{dashboardId}`                                                                                              | `{ widget_data: [{ widget_id, dashboard_id, values: [{ attribute_name, attribute_value, is_alert }] }], dashboard_id, userId, status, message }` (`Grid.tsx` merges `widget_data` into widget state by `widget_id`) | **`dashboard:update`** `{ dashboardId, widgets: [{ widgetId, values: [...] }] }` — same `values` item shape (`attribute_name`/`attribute_value`/`is_alert`), the dashboard id and widget ids move from the event name / a snake_case field into the (camelCase) payload; bind **once**, filter on `dashboardId` client-side, no more per-dashboard event name. `status`/`message`/the top-level `userId` are not sent (redundant with the room). |
| `building_values_event.{assetId}`                                                                                                   | `{ buildingAssetData: { asset: <formatted asset tree with alert badges>, device_id, device_identifier }, buildingId, userId, status, message }` (`Assets.tsx`)                                                      | **`building:update`** `{ buildingId, deviceId, deviceIdentifier, asset }` — `asset` is the identical formatted tree (Laravel-parity snake_case field names preserved inside it); bind once, filter on `buildingId`. `deviceId`/`deviceIdentifier` replace `device_id`/`device_identifier` at the top level (camelCase, matching every other event's envelope); `status`/`message`/`userId` dropped, same reasoning as above.                     |
| alert state (folded into `dashboard-values-event`'s `is_alert`, plus a second producer with `{rule_id, device_id, state, message}`) | —                                                                                                                                                                                                                   | `alarm:state` (a distinct, always-real event)                                                                                                                                                                                                                                                                                                                                                                                                    |
| (Laravel never delivered `systemNotification` in real time)                                                                         | —                                                                                                                                                                                                                   | `notification:new`                                                                                                                                                                                                                                                                                                                                                                                                                               |

### 4.4 Migrating the frontend off Pusher

1. Replace `pusher-js` with `socket.io-client` as in §4.1 (one socket per logged-in user; `auth.token` = the login token).
2. Drop the per-id event names: bind `packet:initial`, `device:value`, `alarm:state`, `notification:new`, `dashboard:update`, `building:update` once each (not once per dashboard/product/asset id) and filter on the ids already inside each payload.
3. `Grid.tsx`'s widget-state merge and `Assets.tsx`'s `transformForWebglBuilding` can keep their existing merge/transform logic almost unchanged — `dashboard:update`'s `widgets[].values` and `building:update`'s `asset` are the same shapes those functions already consume, just reached through a different top-level envelope (`widgetId` instead of `widget_id`, `dashboardId` instead of the event name's `{dashboardId}`).

### 4.5 History: the events were deferred, then built (D-0139)

At the end of the API-contract task (2026-09-21) the user asked to document the gap and build these two events **later**, contract-first. On 2026-09-22 the user asked to implement them. Two things were decided first (both recorded in `DECISIONS.md` D-0139):

- **Event names:** `dashboard:update` / `building:update`, resource id inside the payload — the rewrite's original plan (D-0066), chosen over keeping Laravel's three inconsistent per-id names.
- **`building:update`'s `is_alert`:** Laravel's own equivalent has a real bug — `AssetController::checkComponentAlerts()` reads `auth()->id()` to pick which user's rules to check, but `/webhook` is an unauthenticated, device-token route, so `auth()->id()` is always null there and `is_alert` is **always `false`** on every live building push in real Laravel, regardless of actual rule state (only a manual `GET /assets/{id}` refresh, which _is_ authenticated, ever shows it correctly). The user chose to **make it actually work**: Node evaluates the packet's own resolved `userId`'s rules, so `is_alert` on `building:update` is live and correct, matching what a `GET /assets/{id}` refresh would show at that moment — a deliberate improvement over Laravel, not a byte-parity port. Logged as `KNOWN_ISSUES.md` 11.76.

Source of truth in code: `node-backend/src/modules/ingestion/ingestion.service.ts`'s `enqueueDashboardUpdates`/`enqueueBuildingUpdate` (producers, D-0139) and `platform/realtime/{socket,events,emitter,realtime.worker}.ts` (transport, D-0066/D-0067).

### 4.6 Fleet events — the `company:{id}` room (D-0161, 2026-09-24)

- **Who receives them.** On connect, if the verified JWT has a `companyId` **and** the `all-fleet` permission (the same permission that gates every fleet REST route), the server also puts the socket in `company:{companyId}`. Nothing to subscribe to, nothing to send; a user of another company, a same-company user **without** the fleet permission, or a token without a company never receives them. (Changing a user's permissions takes effect on their next login/reconnect with a fresh token — the room is decided at handshake.)
- **`fleet:position`** — one per GPS position of a tracker installed in a vehicle (assigned trackers only; `vehicleId` is always set). `recordedAt` is the server's ingestion time (same as `device_positions.recorded_at`). Positions are frequent — update the marker, don't refetch.
- **`geofence:event`** — one per real enter/exit of a geofence by a vehicle.
- **`trip:update`** — after every trip change. `reason`: `created` (a trip was planned — also `POST /trips` by another operator), `started`, `stop_arrived` / `stop_departed` (first arrival/departure of a stop, by sensor **or** an operator), `stop_updated` (an operator replaced an existing time), `updated` (D-0175: `PUT /trips/{id}` succeeded — the trip's fields and/or its planned stops changed; `stop` is `null`, refetch the trip), `destination_reached`, `completed`, `cancelled`, `deleted` (`DELETE /trips/{id}` while planned — the trip no longer exists, `stop` is `null`; remove it from your list). **`reason: "destination_reached"` with `awaitingCompletion: true` is the "confirm completion" prompt signal** (the trip stays `in_progress` until `POST /trips/{id}/complete`). A stop that arrives at the last stop yields `stop_arrived` **then** `destination_reached`. `status`/`awaitingCompletion`/`destinationReachedAt` always reflect the trip *after* the change.
- **`fleet:changed`** (D-0163) — `{ entity, id, action, occurredAt }` after a vehicle, driver, yard, yard slot or geofence is created, edited, deactivated, reactivated or deleted (`action`: `created` / `updated` / `deactivated` / `reactivated` / `deleted`). A tracker or driver (un)assignment is reported as `updated` on the vehicle and/or driver; creating a yard with coordinates also reports its auto-created `geofence` as `created`, and editing a yard reports its linked geofence as `updated`. **D-0182:** deactivating / reactivating a yard also reports each linked geofence that was switched off / on as `geofence` `updated`, and checking a vehicle in / out of a yard slot reports `yard_slot` (id = the slot) with the new `action` values `checked_in` / `checked_out`. It is only a signal to refetch that list — your **own** action also echoes back, so refetch (or de-duplicate) rather than append. Trips use `trip:update` instead.
- **`fleet:status_summary`** (D-0185, flow 07 A9) — `{ total, moving, idle, parked, offline, no_tracker, occurredAt }` to the `company:{id}` room (same gate as the other fleet events: JWT company + `all-fleet`), only when the counts differ from the last announcement (a job runs every minute; an unchanged fleet is silent, so do not expect a heartbeat). The counts follow the company's position-freshness setting (`GET /fleet/settings`). Use it to keep the Overview status donut live without polling.
- **Delivery is best-effort.** Events are not replayed and a realtime hiccup never fails the underlying action, so refetch (`GET /trips/{id}/route`, positions, events) on (re)connect and on focus, and keep a slow safety poll.

## 5. Known problems and gaps (found while producing the contract — **documented, not fixed**; to be triaged with the user)

### 5.1 Frontend calls that Node does not serve (all currently 404 with Express's default HTML page)

| Frontend call                                                                                  | Where                                   | State                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DELETE /api/account/delete`                                                                   | `AccountSettings.tsx`                   | Laravel had it; **not implemented in Node** (D-0031: needs the company/user cascade plus Stripe cancellation; never assigned to a module). The "delete my account" button fails.                               |
| `GET /api/fleet/devices/{id}/history`                                                          | `FleetMap.tsx`                          | **Built 2026-09-24 (fleet completion step 1).** Laravel `FleetController::history` — `GET /fleet/devices/{deviceId}/history?limit=` (default 500, max 2000, oldest → newest, company-scoped; 404 `Device not found.`). See `communication/flows/05-fleet-api-design.md` 1.6. |
| `POST /api/companies/create-with-user`                                                         | `AddCompanyForm.tsx`                    | Laravel had it **unauthenticated** and echoing the plaintext password back (KNOWN_ISSUES 11.14a); **not implemented**. If built it must be authenticated (`platform_operator`) and must not echo the password. |
| `POST /api/companies/bulk/destroy`                                                             | `SuperAdminDashboard.tsx`               | **Wrong path in the frontend:** the real operation is `POST /api/companies/bulk-delete` (both Laravel and Node).                                                                                               |
| `POST /api/add-demo-product`, `GET /api/check-configured-devices`, `POST /api/simulate-packet` | `AddProductModal.tsx`, `Simulation.tsx` | Exist **only in the frontend's mock backend** (`src/utils/fakeBackend`); neither Laravel nor Node ever had them. The "add demo product" and packet-simulation screens cannot work against a real backend.      |

### 5.2 Response-shape gaps against Laravel (known, deliberately left for later)

- `GET /assets/{id}`, `PUT /assets/{id}` and the asset-tree summary (`GET /assets/{companyId}/tree`) still emit **string ids** (Laravel: integers). `GET /assets` and the component endpoints are integer (D-0129).
- The embedded `user` inside `/login`, `/members`, `/devices`, `/roles/company`… renders `created_at`/`updated_at` as ISO; Laravel's `User` accessor gave `Y-m-d H:i:s`. `updated_at` has 3 fractional digits vs Laravel's 6.
- `POST /register` returns an extra `refresh_token` and a leaner `user` than Laravel; `GET /attribute/preference/{id}` has Laravel's raw-model shape and a `success:true` 404 (like `/attribute/preference/setting/{id}`, D-0122) but has not been compared live.
- Write endpoints that render a bare device (`POST`/`PUT /devices/{id}`, enable/disable) lack the owner-timezone `created_at`/`user` treatment `GET /devices` has (D-0119).
- `is_selected` is integer `1`/`0` only on `/product-settings/{id}` and `/attribute/preference/setting/{id}`; `/devices/{id}/points` not compared.

### 5.3 Behavior problems found (server side)

1. **Malformed JSON body → HTTP 500** `{"success":false,"message":"Internal server error"}` (should be a 4xx). Same for a JSON body **larger than 100 KB** (Express default limit; Laravel accepted larger). Verified live.
2. **Unknown route → Express's default HTML 404** (`Cannot GET /api/nope`), not the JSON envelope. Clients must not `JSON.parse` a 404 blindly.
3. **`GET /product-settings/{id}` has no company check** (any admin can read another company's settings incl. the ingestion token) — same on Laravel; KNOWN_ISSUES 11.63.
4. Ingestion still uses the token-less placeholder lookup for MQTT (11.32); Node de-duplicates identical webhook payloads within a window (11.31), Laravel never did.
5. `assigned_device_ids` (`GET /devices/product/{id}`) is a cross-tenant list of ids (Laravel parity, D-0128).
6. Sampling the running server as an ordinary company admin, several list/GET endpoints answered 403/404 for reasons that are correct but easy to trip over: `GET /devices/{id}` takes an **asset component id** (not a device id) and `GET /devices/{id}/points` takes a device id; `GET /compliance-documents` requires `documentable_type` (`driver|vehicle`) and `documentable_id`; `GET /trips/{id}/gps-trail` needs a started trip with a device; `GET /mqtt-configurations/active` is 404 when none is configured; `GET /userDevices/list` is 404 `No record found.` for a user with none.

### 5.4 Contract limitations (honest edges of the generated schemas)

- A response property with **no `type`** means the code does not establish its value type (`any`/JSON columns such as `values`, `settings`, `raw` packets).
- `integer` vs `number` is inferred from the property name (`id`, `*_id`, `*_count`, `total`, `page`…); JSON cannot distinguish them at runtime.
- Types are derived from the code, not from live data: a field typed `string | null` may in practice always be filled.
- Examples (`examples` on 66 GET operations) are real dev-server responses, redacted (secrets and long tokens replaced by `<redacted>`, arrays cut to 2 items).
- Endpoints restricted to `platform_operator` (12) could not be exercised against a live server in this pass (no super-admin credentials were available); their schemas are code-derived only.

## 6. Operations that do **not** exist in Node (formally dropped or not implemented)

The frozen Phase-0 contract listed these; none is in `openapi.yaml`. Calling them returns 404.

| Operation                                                                                                                                                 | Why                                                                                        | Reference                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| `GET`/`POST /mqtts`                                                                                                                                       | Legacy per-user MQTT config, replaced by `/mqtt-configurations`                            | KNOWN_ISSUES 11.11         |
| `GET /get-encryption-key`                                                                                                                                 | Unauthenticated endpoint that returns an env var — must never exist                        | KNOWN_ISSUES 11.14a        |
| `GET /widget/{widgetId}/sensor-count`                                                                                                                     | Broken in Laravel (handler does not exist)                                                 | D-0069                     |
| `POST /attribute/preference/select`, `/unselect`                                                                                                          | Broken in Laravel (handlers do not exist); selection is done via `/store-product-settings` | KNOWN_ISSUES 11.18         |
| `POST /storeCleanPacket`                                                                                                                                  | Broken in Laravel (not HTTP-bindable)                                                      | KNOWN_ISSUES 11.17         |
| `POST /userDevices/activate`                                                                                                                              | Broken in Laravel (`checkIfEncrypted()` undefined)                                         | D-0053, KNOWN_ISSUES 11.23 |
| `POST /packet_values/{encoded}`                                                                                                                           | Debug route, stores nothing; third unrelated crypto scheme                                 | ingestion deep-dive        |
| `POST /stripe/attach-payment-method`, `/stripe/create-customer`, `/stripe/create-subscription`, `/stripe/payment-method`, `GET /stripe/subscription/{id}` | Real payment processing is deferred; the raw-card endpoint must never be ported            | D-0080, KNOWN_ISSUES 11.27 |
| `POST /webhooks/payment/{gateway}`                                                                                                                        | Payment gateway webhook — real billing deferred                                            | D-0080                     |
| `DELETE /account/delete`, `POST /companies/create-with-user`                                                           | **Not dropped — still to build** (frontend calls them, see §5.1)                           | this contract              |

Operations that exist in Node but not in the old frozen contract: `fleet-customers`, `contracts`, `rate-cards` CRUD (fleet CRM, new in the rewrite), plus `PATCH` aliases of `PUT` on dashboards/widgets/widget-settings.

## 7. Endpoint index (generated)

<!-- BEGIN GENERATED: endpoint-index (npm run openapi:write) -->

324 operations across 25 module files under [`openapi/`](openapi/) (index: [`openapi.yaml`](openapi.yaml)). Each module heading below links to its file. **Tested** = exercised from the real frontend (backend repo's own `migration/API_TESTING_LOG.md` row); **Notes** = has quirks/deviations (listed below, also inside that module's own file).

### assets — [`openapi/assets.yaml`](openapi/assets.yaml)

Assets, components, floor plans.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/assets` | token | List assets | row 19 | ⚑ |
| POST | `/assets` | token | Create asset |  |  |
| GET | `/assets/{companyId}/tree` | token | Get company assets tree |  | ⚑ |
| DELETE | `/assets/{id}` | token | Delete asset |  |  |
| GET | `/assets/{id}` | token | Get asset |  | ⚑ |
| PUT | `/assets/{id}` | token | Update asset |  | ⚑ |
| POST | `/assets/{id}/components` | token | Add components | row 15 | ⚑ |
| GET | `/assets/{id}/status-summary` | token | Get status summary |  |  |
| DELETE | `/bulk-delete` | token | Bulk delete assets |  |  |
| GET | `/components/{componentId}` | token | Get component |  |  |
| PUT | `/components/{componentId}` | token | Update component | row 16 | ⚑ |
| DELETE | `/components/{id}` | token | Delete component |  |  |
| GET | `/components/{id}/status-and-devices` | token | Status and devices |  |  |
| PUT | `/components/bulk-update` | token | Bulk update components | row 17 | ⚑ |
| GET | `/devices/{id}` | token | Components devices |  | ⚑ |
| POST | `/floor-plans` | token | Upload floor plan |  |  |
| GET | `/floor-plans/building/{assetId}` | token | Get building floor plans |  |  |
| GET | `/floor-plans/component/{assetComponentId}` | token | Get floor plan |  |  |

### auth — [`openapi/auth.yaml`](openapi/auth.yaml)

Login, registration, verification, password reset, Google popup login, token refresh/logout.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/auth/{provider}/callback` | public | Social callback | row 22 | ⚑ |
| GET | `/auth/{provider}/redirect` | public | Social redirect | row 22 | ⚑ |
| POST | `/change-password` | token | Change password |  |  |
| POST | `/forgot-password` | public | Forgot password |  |  |
| POST | `/login` | public | Login | row 1 | ⚑ |
| POST | `/logout` | token | Logout |  |  |
| POST | `/refresh` | public | Refresh |  |  |
| POST | `/register` | public | Register | row 21 | ⚑ |
| POST | `/reset-password` | public | Reset password |  |  |
| POST | `/verify-reset-token` | public | Verify reset token |  |  |

### billing — [`openapi/billing.yaml`](openapi/billing.yaml)

Billing gateways and events.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/plans` | token | List plans |  |  |
| POST | `/plans` | token + role `platform_operator` | Create plan |  |  |
| GET | `/plans/{plan}` | token | Get plan |  |  |
| PUT | `/plans/{plan}` | token + role `platform_operator` | Update plan |  |  |
| POST | `/plans/{planId}/assign-modules` | token + role `platform_operator` | Assign modules |  |  |

### connectivity — [`openapi/connectivity.yaml`](openapi/connectivity.yaml)

Connector health.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/connectors/{connector}/health` | token | Show | row 6 |  |
| GET | `/connectors/health` | token | Index | row 6 |  |
| GET | `/mqtt-configurations` | token | List |  |  |
| POST | `/mqtt-configurations` | token | Create |  |  |
| DELETE | `/mqtt-configurations/{id}` | token | Destroy |  |  |
| GET | `/mqtt-configurations/{id}` | token | Show |  |  |
| PUT | `/mqtt-configurations/{id}` | token | Update |  |  |
| POST | `/mqtt-configurations/{id}/test` | token | Test connection |  |  |
| GET | `/mqtt-configurations/active` | token | Get active |  |  |
| POST | `/webhook` | public | Store packet | row 11 | ⚑ |

### dashboards — [`openapi/dashboards.yaml`](openapi/dashboards.yaml)

Dashboards, widgets, widget settings, packet history, statistics, alarms.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/admin/dashboard` | token + role `admin` | List admin dashboards |  |  |
| GET | `/admin/manage-users` | token + role `admin` + perm `manage users` | Manage users |  |  |
| GET | `/dashboard/analytics` | token | Get analytics |  |  |
| GET | `/dashboard/packet-history` | token | Get packet history | row 24 | ⚑ |
| GET | `/dashboards` | token | List dashboards |  |  |
| POST | `/dashboards` | token | Create dashboard |  |  |
| DELETE | `/dashboards/{id}` | token | Delete dashboard |  |  |
| GET | `/dashboards/{id}` | token | Get dashboard |  |  |
| PATCH | `/dashboards/{id}` | token | Update dashboard |  |  |
| PUT | `/dashboards/{id}` | token | Update dashboard |  |  |
| GET | `/stats/count-all` | token | Count all |  |  |
| GET | `/user/{userId}/dashboards` | token | Get user dashboards |  |  |
| GET | `/users/all` | token | List all users |  |  |
| GET | `/users/monthly-registrations` | token | Monthly registrations |  |  |
| GET | `/widget-settings` | token | List widget settings |  |  |
| POST | `/widget-settings` | token | Store widget settings resource |  |  |
| DELETE | `/widget-settings/{widgetSetting}` | token | Delete widget setting |  |  |
| GET | `/widget-settings/{widgetSetting}` | token | Get widget setting |  |  |
| PATCH | `/widget-settings/{widgetSetting}` | token | Update widget settings |  |  |
| PUT | `/widget-settings/{widgetSetting}` | token | Update widget settings |  |  |
| GET | `/widgets` | token | List widgets |  |  |
| POST | `/widgets` | token | Create widget |  |  |
| DELETE | `/widgets/{widget}` | token | Delete widget |  |  |
| GET | `/widgets/{widget}` | token | Get widget |  |  |
| PATCH | `/widgets/{widget}` | token | Update widget |  |  |
| PUT | `/widgets/{widget}` | token | Update widget |  |  |
| POST | `/widgets/{widget}/settings` | token | Store widget settings |  |  |
| POST | `/widgets/graph-data` | public | Graph data |  |  |

### devices — [`openapi/devices.yaml`](openapi/devices.yaml)

Devices, commands, user devices.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/devices` | token | List devices | row 10 | ⚑ |
| POST | `/devices` | token | Create device |  |  |
| DELETE | `/devices/{id}` | token | Delete device |  |  |
| PUT | `/devices/{id}` | token | Update device |  |  |
| POST | `/devices/{id}/command` | token | Send command |  |  |
| PATCH | `/devices/{id}/disable` | token | Disable device |  |  |
| PATCH | `/devices/{id}/enable` | token | Enable device |  |  |
| GET | `/devices/{id}/points` | token | Get device points |  |  |
| POST | `/devices/bulk/commands` | token | Send bulk commands |  |  |
| POST | `/devices/bulk/destroy` | token | Bulk destroy |  |  |
| POST | `/devices/bulk/disable` | token | Bulk disable |  |  |
| POST | `/devices/bulk/enable` | token | Bulk enable |  |  |
| GET | `/devices/product/{product_id}` | token | Get devices by product | row 18 | ⚑ |
| GET | `/userDevices/list` | token | List user devices |  |  |

### fleet — [`openapi/fleet.yaml`](openapi/fleet.yaml)

Fleet positions.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/fleet/devices/{deviceId}/history` | token + perm `all-fleet` | History |  |  |
| GET | `/fleet/positions` | token + perm `all-fleet` | Positions |  | ⚑ |

### fleet-analytics — [`openapi/fleet-analytics.yaml`](openapi/fleet-analytics.yaml)

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/fleet/analytics/compliance` | token + perm `all-fleet` | Compliance report handler |  | ⚑ |
| GET | `/fleet/analytics/compliance/export` | token + perm `all-fleet` | Compliance report export |  | ⚑ |
| GET | `/fleet/analytics/fuel` | token + perm `all-fleet` | Fuel report handler |  | ⚑ |
| GET | `/fleet/analytics/fuel/export` | token + perm `all-fleet` | Fuel report export |  | ⚑ |
| GET | `/fleet/analytics/maintenance` | token + perm `all-fleet` | Maintenance report handler |  | ⚑ |
| GET | `/fleet/analytics/summary` | token + perm `all-fleet` | Summary |  | ⚑ |
| GET | `/fleet/analytics/trips` | token + perm `all-fleet` | Trips report handler |  | ⚑ |
| GET | `/fleet/analytics/trips/export` | token + perm `all-fleet` | Trips report export |  | ⚑ |
| GET | `/fleet/analytics/yards` | token + perm `all-fleet` | Yard summary |  | ⚑ |
| GET | `/fleet/attention` | token + perm `all-fleet` | List attention |  | ⚑ |
| GET | `/geofences/events/summary` | token + perm `all-fleet` | Geofence summary |  | ⚑ |

### fleet-crm-billing — [`openapi/fleet-crm-billing.yaml`](openapi/fleet-crm-billing.yaml)

Fleet customers, contracts, rate cards, invoices.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/billing/billable-events` | token + perm `all-fleet` | List pending events |  |  |
| GET | `/billing/gateways` | token + perm `all-fleet` | Gateways |  |  |
| GET | `/billing/invoices` | token + perm `all-fleet` | List invoices |  |  |
| POST | `/billing/invoices` | token + perm `all-fleet` | Create invoice |  |  |
| GET | `/billing/invoices/{id}` | token + perm `all-fleet` | Get invoice |  |  |
| POST | `/billing/invoices/{id}/initiate-payment` | token + perm `all-fleet` | Initiate payment |  |  |
| POST | `/billing/invoices/{id}/mark-paid` | token + perm `all-fleet` | Mark paid |  |  |
| GET | `/billing/invoices/{id}/payments` | token + perm `all-fleet` | Payment history |  |  |
| POST | `/billing/trips/{tripId}/billable-events` | token + perm `all-fleet` | Generate events |  |  |
| GET | `/contracts/{contractId}/rate-cards` | token + perm `all-fleet` | List rate cards |  |  |
| POST | `/contracts/{contractId}/rate-cards` | token + perm `all-fleet` | Create rate card |  |  |
| DELETE | `/contracts/{id}` | token + perm `all-fleet` | Delete contract |  |  |
| GET | `/contracts/{id}` | token + perm `all-fleet` | Get contract |  |  |
| PUT | `/contracts/{id}` | token + perm `all-fleet` | Update contract |  |  |
| GET | `/fleet-customers` | token + perm `all-fleet` | List fleet customers |  |  |
| POST | `/fleet-customers` | token + perm `all-fleet` | Create fleet customer |  |  |
| GET | `/fleet-customers/{customerId}/contracts` | token + perm `all-fleet` | List contracts |  |  |
| POST | `/fleet-customers/{customerId}/contracts` | token + perm `all-fleet` | Create contract |  |  |
| DELETE | `/fleet-customers/{id}` | token + perm `all-fleet` | Delete fleet customer |  |  |
| GET | `/fleet-customers/{id}` | token + perm `all-fleet` | Get fleet customer |  |  |
| PUT | `/fleet-customers/{id}` | token + perm `all-fleet` | Update fleet customer |  |  |
| DELETE | `/rate-cards/{id}` | token + perm `all-fleet` | Delete rate card |  |  |
| PUT | `/rate-cards/{id}` | token + perm `all-fleet` | Update rate card |  |  |

### fleet-dashboard — [`openapi/fleet-dashboard.yaml`](openapi/fleet-dashboard.yaml)

Fleet dashboards.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/fleet/dashboard` | token + perm `all-fleet` | Overview |  | ⚑ |
| GET | `/fleet/dashboard/alerts` | token + perm `all-fleet` | Alerts |  |  |
| GET | `/fleet/dashboard/financial` | token + perm `all-fleet` | Financial |  | ⚑ |
| GET | `/fleet/dashboard/trends` | token + perm `all-fleet` | Trends |  | ⚑ |
| GET | `/fleet/dashboard/vehicle-performance` | token + perm `all-fleet` | Vehicle performance |  | ⚑ |
| GET | `/fleet/dashboard/vehicle-performance/export` | token + perm `all-fleet` | Export vehicle performance |  |  |
| GET | `/fleet/status-summary` | token + perm `all-fleet` | Status summary |  | ⚑ |

### fleet-fuel-maintenance-compliance — [`openapi/fleet-fuel-maintenance-compliance.yaml`](openapi/fleet-fuel-maintenance-compliance.yaml)

Fuel logs, maintenance, compliance documents.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/compliance-documents` | token + perm `all-fleet` | List compliance documents |  | ⚑ |
| POST | `/compliance-documents` | token + perm `all-fleet` | Store compliance document |  | ⚑ |
| DELETE | `/compliance-documents/{id}` | token + perm `all-fleet` | Delete compliance document |  | ⚑ |
| PUT | `/compliance-documents/{id}` | token + perm `all-fleet` | Update compliance document |  | ⚑ |
| GET | `/compliance-documents/expiring-soon` | token + perm `all-fleet` | Expiring soon compliance documents |  | ⚑ |
| DELETE | `/fuel-logs/{id}` | token + perm `all-fleet` | Delete fuel log |  | ⚑ |
| PUT | `/fuel-logs/{id}` | token + perm `all-fleet` | Update fuel log |  | ⚑ |
| DELETE | `/maintenance-logs/{id}` | token + perm `all-fleet` | Delete maintenance log |  | ⚑ |
| PUT | `/maintenance-logs/{id}` | token + perm `all-fleet` | Update maintenance log |  | ⚑ |
| DELETE | `/maintenance-schedules/{id}` | token + perm `all-fleet` | Delete maintenance schedule |  | ⚑ |
| PUT | `/maintenance-schedules/{id}` | token + perm `all-fleet` | Update maintenance schedule |  | ⚑ |
| POST | `/vehicles/{vehicleId}/fuel-logs` | token + perm `all-fleet` | Store fuel log |  | ⚑ |
| POST | `/vehicles/{vehicleId}/maintenance-logs` | token + perm `all-fleet` | Store maintenance log |  | ⚑ |
| POST | `/vehicles/{vehicleId}/maintenance-schedules` | token + perm `all-fleet` | Store maintenance schedule |  | ⚑ |

### fleet-geofences — [`openapi/fleet-geofences.yaml`](openapi/fleet-geofences.yaml)

Geofences and their events.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/geofences` | token + perm `all-fleet` | List geofences |  | ⚑ |
| POST | `/geofences` | token + perm `all-fleet` | Create geofence |  | ⚑ |
| DELETE | `/geofences/{id}` | token + perm `all-fleet` | Delete geofence |  |  |
| PUT | `/geofences/{id}` | token + perm `all-fleet` | Update geofence |  | ⚑ |
| POST | `/geofences/bulk-delete` | token + perm `all-fleet` | Bulk delete geofences |  | ⚑ |
| POST | `/geofences/bulk-disable` | token + perm `all-fleet` | Bulk disable geofences |  | ⚑ |
| POST | `/geofences/bulk-enable` | token + perm `all-fleet` | Bulk enable geofences |  | ⚑ |
| GET | `/geofences/events` | token + perm `all-fleet` | List events |  | ⚑ |
| GET | `/geofences/events/export` | token + perm `all-fleet` | Export events |  | ⚑ |
| GET | `/geofences/export` | token + perm `all-fleet` | Export geofences |  | ⚑ |
| GET | `/geofences/options` | token + perm `all-fleet` | Geofence options |  | ⚑ |

### fleet-maintenance-due — [`openapi/fleet-maintenance-due.yaml`](openapi/fleet-maintenance-due.yaml)

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/maintenance-schedules` | token + perm `all-fleet` | List |  | ⚑ |
| GET | `/maintenance-schedules/export` | token + perm `all-fleet` | Export schedules |  | ⚑ |

### fleet-records — [`openapi/fleet-records.yaml`](openapi/fleet-records.yaml)

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/compliance-documents/counts` | token + perm `all-fleet` | Compliance counts |  | ⚑ |
| GET | `/fuel-logs` | token + perm `all-fleet` | List fuel logs |  | ⚑ |
| GET | `/fuel-logs/export` | token + perm `all-fleet` | Export fuel logs |  | ⚑ |
| GET | `/maintenance-logs` | token + perm `all-fleet` | List maintenance logs |  | ⚑ |
| GET | `/maintenance-logs/export` | token + perm `all-fleet` | Export maintenance logs |  | ⚑ |

### fleet-settings — [`openapi/fleet-settings.yaml`](openapi/fleet-settings.yaml)

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/fleet/settings` | token + perm `all-fleet` | Get settings |  | ⚑ |
| PUT | `/fleet/settings` | token + perm `all-fleet` | Update settings |  | ⚑ |

### fleet-trips — [`openapi/fleet-trips.yaml`](openapi/fleet-trips.yaml)

Trips.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/trips` | token + perm `all-fleet` | List trips |  | ⚑ |
| POST | `/trips` | token + perm `all-fleet` | Create trip |  | ⚑ |
| DELETE | `/trips/{id}` | token + perm `all-fleet` | Delete trip |  |  |
| GET | `/trips/{id}` | token + perm `all-fleet` | Get trip |  | ⚑ |
| PUT | `/trips/{id}` | token + perm `all-fleet` | Update trip |  | ⚑ |
| POST | `/trips/{id}/cancel` | token + perm `all-fleet` | Cancel trip |  | ⚑ |
| POST | `/trips/{id}/complete` | token + perm `all-fleet` | Complete trip |  | ⚑ |
| GET | `/trips/{id}/gps-trail` | token + perm `all-fleet` | Gps trail |  |  |
| GET | `/trips/{id}/route` | token + perm `all-fleet` | Route |  |  |
| POST | `/trips/{id}/start` | token + perm `all-fleet` | Start trip |  | ⚑ |
| POST | `/trips/{id}/stops/{stopId}/arrive` | token + perm `all-fleet` | Arrive stop |  |  |
| POST | `/trips/{id}/stops/{stopId}/depart` | token + perm `all-fleet` | Depart stop |  |  |
| POST | `/trips/bulk-delete` | token + perm `all-fleet` | Bulk delete trips |  | ⚑ |
| GET | `/trips/counts` | token + perm `all-fleet` | Trip counts |  | ⚑ |
| GET | `/trips/export` | token + perm `all-fleet` | Export trips |  | ⚑ |

### fleet-vehicles-drivers — [`openapi/fleet-vehicles-drivers.yaml`](openapi/fleet-vehicles-drivers.yaml)

Vehicles, drivers, assignments.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/assignment-history` | token + perm `all-fleet` | Company assignment history |  | ⚑ |
| GET | `/drivers` | token + perm `all-fleet` | List drivers |  | ⚑ |
| POST | `/drivers` | token + perm `all-fleet` | Create driver |  | ⚑ |
| POST | `/drivers/{driverId}/assign-vehicle` | token + perm `all-fleet` | Assign vehicle |  |  |
| POST | `/drivers/{driverId}/incidents` | token + perm `all-fleet` | Store incident |  | ⚑ |
| POST | `/drivers/{driverId}/unassign-vehicle` | token + perm `all-fleet` | Unassign vehicle |  |  |
| DELETE | `/drivers/{id}` | token + perm `all-fleet` | Delete driver |  | ⚑ |
| GET | `/drivers/{id}` | token + perm `all-fleet` | Get driver |  | ⚑ |
| PUT | `/drivers/{id}` | token + perm `all-fleet` | Update driver |  | ⚑ |
| GET | `/drivers/{id}/assignment-history` | token + perm `all-fleet` | Driver assignment history |  | ⚑ |
| POST | `/drivers/{id}/deactivate` | token + perm `all-fleet` | Deactivate driver |  | ⚑ |
| GET | `/drivers/{id}/incidents` | token + perm `all-fleet` | Driver incidents |  | ⚑ |
| POST | `/drivers/{id}/reactivate` | token + perm `all-fleet` | Reactivate driver |  | ⚑ |
| POST | `/drivers/bulk-deactivate` | token + perm `all-fleet` | Bulk deactivate drivers |  | ⚑ |
| POST | `/drivers/bulk-delete` | token + perm `all-fleet` | Bulk delete drivers |  | ⚑ |
| POST | `/drivers/bulk-reactivate` | token + perm `all-fleet` | Bulk reactivate drivers |  | ⚑ |
| GET | `/drivers/counts` | token + perm `all-fleet` | Driver counts |  | ⚑ |
| GET | `/drivers/export` | token + perm `all-fleet` | Export drivers |  | ⚑ |
| GET | `/drivers/options` | token + perm `all-fleet` | Driver options |  | ⚑ |
| GET | `/fleet/options` | token + perm `all-fleet` | Fleet options |  | ⚑ |
| GET | `/incidents` | token + perm `all-fleet` | Company incidents |  | ⚑ |
| DELETE | `/incidents/{id}` | token + perm `all-fleet` | Delete incident |  | ⚑ |
| PUT | `/incidents/{id}` | token + perm `all-fleet` | Update incident |  | ⚑ |
| GET | `/vehicles` | token + perm `all-fleet` | List vehicles |  | ⚑ |
| POST | `/vehicles` | token + perm `all-fleet` | Create vehicle |  | ⚑ |
| DELETE | `/vehicles/{id}` | token + perm `all-fleet` | Delete vehicle |  | ⚑ |
| GET | `/vehicles/{id}` | token + perm `all-fleet` | Get vehicle |  | ⚑ |
| PUT | `/vehicles/{id}` | token + perm `all-fleet` | Update vehicle |  | ⚑ |
| GET | `/vehicles/{id}/assignment-history` | token + perm `all-fleet` | Vehicle assignment history |  | ⚑ |
| POST | `/vehicles/{id}/deactivate` | token + perm `all-fleet` | Deactivate vehicle |  | ⚑ |
| GET | `/vehicles/{id}/fuel-logs` | token + perm `all-fleet` | Vehicle fuel logs |  | ⚑ |
| DELETE | `/vehicles/{id}/image` | token + perm `all-fleet` | Delete vehicle image |  | ⚑ |
| POST | `/vehicles/{id}/image` | token + perm `all-fleet` | Upload vehicle image |  | ⚑ |
| GET | `/vehicles/{id}/incidents` | token + perm `all-fleet` | Vehicle incidents |  | ⚑ |
| GET | `/vehicles/{id}/maintenance-logs` | token + perm `all-fleet` | Vehicle maintenance logs |  | ⚑ |
| POST | `/vehicles/{id}/reactivate` | token + perm `all-fleet` | Reactivate vehicle |  | ⚑ |
| GET | `/vehicles/{id}/yard-history` | token + perm `all-fleet` | Vehicle yard history |  | ⚑ |
| POST | `/vehicles/{vehicleId}/assign-device` | token + perm `all-fleet` | Assign device |  |  |
| POST | `/vehicles/{vehicleId}/unassign-device` | token + perm `all-fleet` | Unassign device |  |  |
| GET | `/vehicles/assignable-trackers` | token + perm `all-fleet` | List assignable trackers |  |  |
| POST | `/vehicles/bulk-deactivate` | token + perm `all-fleet` | Bulk deactivate vehicles |  | ⚑ |
| POST | `/vehicles/bulk-delete` | token + perm `all-fleet` | Bulk delete vehicles |  | ⚑ |
| POST | `/vehicles/bulk-reactivate` | token + perm `all-fleet` | Bulk reactivate vehicles |  | ⚑ |
| GET | `/vehicles/counts` | token + perm `all-fleet` | Vehicle counts |  | ⚑ |
| GET | `/vehicles/export` | token + perm `all-fleet` | Export vehicles |  | ⚑ |
| GET | `/vehicles/options` | token + perm `all-fleet` | Vehicle options |  | ⚑ |

### fleet-yards — [`openapi/fleet-yards.yaml`](openapi/fleet-yards.yaml)

Yards, slots, layouts.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| DELETE | `/yard-slots/{slotId}` | token + perm `all-fleet` | Delete slot |  | ⚑ |
| PUT | `/yard-slots/{slotId}` | token + perm `all-fleet` | Update slot |  | ⚑ |
| POST | `/yard-slots/{slotId}/check-in` | token + perm `all-fleet` | Check in |  | ⚑ |
| POST | `/yard-slots/{slotId}/check-out` | token + perm `all-fleet` | Check out |  | ⚑ |
| GET | `/yards` | token + perm `all-fleet` | List yards |  | ⚑ |
| POST | `/yards` | token + perm `all-fleet` | Create yard |  | ⚑ |
| DELETE | `/yards/{id}` | token + perm `all-fleet` | Delete yard |  | ⚑ |
| GET | `/yards/{id}` | token + perm `all-fleet` | Get yard |  | ⚑ |
| PUT | `/yards/{id}` | token + perm `all-fleet` | Update yard |  | ⚑ |
| POST | `/yards/{id}/deactivate` | token + perm `all-fleet` | Deactivate yard |  | ⚑ |
| POST | `/yards/{id}/reactivate` | token + perm `all-fleet` | Reactivate yard |  | ⚑ |
| DELETE | `/yards/{yardId}/layout` | token + perm `all-fleet` | Delete layout |  | ⚑ |
| POST | `/yards/{yardId}/layout` | token + perm `all-fleet` | Upload layout |  | ⚑ |
| POST | `/yards/{yardId}/slots` | token + perm `all-fleet` | Create slot |  | ⚑ |
| POST | `/yards/bulk-deactivate` | token + perm `all-fleet` | Bulk deactivate yards |  | ⚑ |
| POST | `/yards/bulk-delete` | token + perm `all-fleet` | Bulk delete yards |  | ⚑ |
| POST | `/yards/bulk-reactivate` | token + perm `all-fleet` | Bulk reactivate yards |  | ⚑ |
| GET | `/yards/export` | token + perm `all-fleet` | Export yards |  | ⚑ |
| GET | `/yards/options` | token + perm `all-fleet` | Yard options |  | ⚑ |

### onboarding — [`openapi/onboarding.yaml`](openapi/onboarding.yaml)

Plans/modules onboarding.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| POST | `/resend-verification-email` | public | Resend verification email | row 21 |  |
| POST | `/verify-token` | public | Verify token |  |  |

### peripheral — [`openapi/peripheral.yaml`](openapi/peripheral.yaml)

Ingestion webhook, protocols and MQTT configurations.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/contact` | token + role `platform_operator` | List contacts |  |  |
| POST | `/contact` | public | Create contact |  |  |
| DELETE | `/contact/{id}` | token + role `platform_operator` | Delete contact |  |  |
| GET | `/contact/{id}` | token + role `platform_operator` | Get contact |  |  |
| POST | `/highlight-attributes` | token | Highlight attributes |  |  |
| GET | `/notifications` | token | List notifications |  |  |
| POST | `/notifications` | token | Create notification |  |  |
| DELETE | `/notifications/{id}` | token | Delete notification |  |  |
| PUT | `/notifications/{id}/read` | token | Mark notification read |  |  |
| GET | `/settings/user` | token | List settings |  |  |
| GET | `/settings/user/edit/{id}` | token | Get setting |  |  |
| POST | `/settings/user/update` | token | Update settings |  |  |

### products — [`openapi/products.yaml`](openapi/products.yaml)

Products, product settings, attribute preferences, preconfigure templates, ingestion tokens.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/attribute/preference/{id}` | token | Get attribute preference |  | ⚑ |
| POST | `/attribute/preference/mapping-preview` | token | Preview mapping |  |  |
| POST | `/attribute/preference/mark-role` | token | Mark role |  |  |
| POST | `/attribute/preference/marked-as-unique` | token | Mark as unique identifier |  |  |
| DELETE | `/attribute/preference/setting/{id}` | token | Delete attribute preference |  |  |
| GET | `/attribute/preference/setting/{id}` | token | Get attribute preference settings | row 13 | ⚑ |
| PUT | `/attribute/preference/setting/{id}` | token | Update attribute preference |  |  |
| POST | `/attribute/preference/setting/store` | token | Create attribute preference |  |  |
| POST | `/attribute/preference/unmark-role` | token | Unmark role |  |  |
| POST | `/attribute/preference/unmark-unique` | token | Unmark as unique identifier |  |  |
| POST | `/get-encrypt-token` | token | Get encrypt token |  |  |
| GET | `/preconfigure-templates` | token | List templates |  |  |
| POST | `/preconfigure-templates` | token | Create template |  |  |
| GET | `/preconfigure-templates/{id}` | token | Get template |  |  |
| POST | `/preconfigure-templates/from-product/{productId}` | token | Create template from product |  |  |
| GET | `/preconfigure-templates/manufacturers` | token | List manufacturers |  |  |
| GET | `/product-settings/{id}` | token | Get product settings | row 12 | ⚑ |
| GET | `/products` | token | List products | row 8 | ⚑ |
| POST | `/products` | token | Create product | row 7 | ⚑ |
| DELETE | `/products/{product}` | token | Delete product |  |  |
| GET | `/products/{product}` | token | Get product devices | row 10 | ⚑ |
| PUT | `/products/{product}` | token | Update product |  |  |
| POST | `/products/bulk/destroy` | token | Bulk delete products |  |  |
| GET | `/products/company/{company_id}` | token | Get products by company |  |  |
| GET | `/protocols` | token | List protocols | row 23 | ⚑ |
| POST | `/protocols` | token | Create protocol |  |  |
| DELETE | `/protocols/{protocol}` | token | Delete protocol |  |  |
| GET | `/protocols/{protocol}` | token | Get protocol |  |  |
| PUT | `/protocols/{protocol}` | token | Update protocol |  |  |
| POST | `/store-product-settings` | token | Store product settings | row 14 | ⚑ |
| POST | `/store-user-preferences-attributes` | token | Store user preference attributes |  |  |

### rbac — [`openapi/rbac.yaml`](openapi/rbac.yaml)

Companies, roles, permissions, modules.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/companies` | token + role `platform_operator` | List companies | row 3 | ⚑ |
| POST | `/companies` | token + role `platform_operator` | Create company |  |  |
| DELETE | `/companies/{id}` | token + role `platform_operator` | Delete company |  |  |
| GET | `/companies/{id}` | token | Get company | row 4 | ⚑ |
| PUT | `/companies/{id}` | token | Update company | row 5 | ⚑ |
| POST | `/companies/bulk-delete` | token + role `platform_operator` | Bulk delete companies |  |  |
| GET | `/modules` | token | List modules for admin |  |  |
| POST | `/modules/create` | token | Create module |  |  |
| GET | `/modules/user/{userId}` | token | Get user modules |  |  |
| DELETE | `/permissions/{permissionId}/delete` | token + role `admin` | Delete permission |  |  |
| GET | `/roles/{roleId}` | token | Get role details |  |  |
| DELETE | `/roles/{roleId}/delete` | token + role `admin` | Delete role |  |  |
| PUT | `/roles/{roleId}/update` | token + role `admin` | Update role |  |  |
| GET | `/roles/company` | token | Get company roles |  |  |
| POST | `/roles/create` | token + role `admin` | Create role |  |  |
| GET | `/roles/user/{userId}` | token | Get user roles |  |  |
| GET | `/roles/user/{userId}/access-path` | token | Get user access path |  |  |

### rules — [`openapi/rules.yaml`](openapi/rules.yaml)

Rule builder.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/alarms` | token | List alarms |  |  |
| POST | `/alarms/{id}/acknowledge` | token | Acknowledge alarm |  |  |
| GET | `/rules` | token | List rules |  |  |
| DELETE | `/rules/{id}` | token | Delete rule |  |  |
| GET | `/rules/{id}` | token | Get rule |  |  |
| PUT | `/rules/{id}` | token | Update rule | row 20 | ⚑ |
| POST | `/rules/bulk/activate` | token | Bulk activate |  |  |
| POST | `/rules/bulk/deactivate` | token | Bulk deactivate |  |  |
| POST | `/rules/bulk/delete` | token | Bulk force delete |  |  |
| POST | `/rules/store` | token | Create rule | row 20 | ⚑ |
| GET | `/rules/users/{user}` | token | List rules |  |  |

### superadmin — [`openapi/superadmin.yaml`](openapi/superadmin.yaml)

Platform-operator views.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/superadmin/companies/users` | token + role `platform_operator` | Total users per company |  |  |
| GET | `/superadmin/subscriptions` | token + role `platform_operator` | Total subscriptions |  |  |

### users — [`openapi/users.yaml`](openapi/users.yaml)

Profile, members, settings.

| Method | Path | Auth | Summary | Tested | Notes |
|---|---|---|---|---|---|
| GET | `/members` | token | List members |  |  |
| POST | `/members` | token | Create member |  |  |
| GET | `/members/{id}` | token | Get member |  |  |
| PUT | `/members/{id}` | token | Update member |  |  |
| DELETE | `/members/bulk-delete` | token | Bulk delete members |  |  |
| GET | `/profile` | token | Get profile | row 2 | ⚑ |
| POST | `/profile/{user}/update` | token | Update profile |  |  |

### Operation notes (quirks and deviations)

#### GET `/assets`

- Ids are integers; `inventory_check` is the integer cast `0`/`1`/`null`.

#### GET `/assets/{companyId}/tree`

- KNOWN GAP: tree summary still emits string ids.

#### GET `/assets/{id}`

- KNOWN GAP: still emits **string** ids (Laravel: integers). Not yet fixed.

#### PUT `/assets/{id}`

- KNOWN GAP: response still emits string ids.

#### POST `/assets/{id}/components`

- Lenient payload: `inventory_check` accepts `"0"`/`"1"`/`0`/`1`; `""` becomes `null` for ids/type; extra `company_id` ignored.

#### GET `/assignment-history`

- `include_active` (string): the default includes open (not yet unassigned) assignments; `include_active=0` returns only closed (historical) ones; combines with `status`. `duration_days` is `floor` of whole days (0 for same-day) and `null` while the assignment is open.

#### GET `/attribute/preference/setting/{id}`

- Laravel's raw model attributes: integer `0`/`1` flags, `Y-m-d H:i:s` timestamps.
- A missing record is HTTP **404** with body `{ success:true, message:"Attribute preference not found" }` — `success` is `true` (Laravel parity).

#### GET `/attribute/preference/{id}`

- Same Laravel raw-model shape and `success:true` 'not found' body as `/attribute/preference/setting/{id}` (D-0122) — not yet compared live.

#### GET `/auth/{provider}/callback`

- Returns an **HTML page** (not JSON) that `postMessage`s `{ type: "GOOGLE_AUTH_SUCCESS", token, user, … }` to the opener (target origin = `FRONTEND_URL`) and closes itself; on failure it redirects with `?error=auth_failed`.
- New social users are onboarded (company, admin role, placeholder subscription) before the token is issued.

#### GET `/auth/{provider}/redirect`

- Google popup flow (only `google` is configured): returns JSON `{ redirect_url }`; the frontend opens it in a popup.

#### GET `/companies`

- Envelope is this app's own `{ items, pagination }`, not the Laravel paginator.

#### GET `/companies/{id}`

- Allowed for the caller's own company or a platform_operator; other companies → 403 `Not authorized to access this company.`

#### PUT `/companies/{id}`

- Same self-or-platform_operator rule as GET; Laravel has no ownership check here at all.

#### GET `/compliance-documents`

- **Opt-in paging (D-0164):** send `page` and/or `per_page` (default 20, max 100) and `data` becomes `{ items, pagination: { page, per_page, total, total_pages } }` (`total` counts the rows after search/filters); send neither and `data` is the flat array, as before. `search` is a case-insensitive contains match, `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`), `sort_order` is `asc`/`desc`; rows that tie on the sort column are ordered by id, so paging never duplicates or drops a row.
- Still scoped to one `documentable_type` + `documentable_id`. D-0164 adds `document_type`, `expiring_within_days` (expiry between today and today + N days), `expired` (`1` = expiry date before today; `0` = no expiry date or not yet expired), `search` (document number, type, notes), `sort_by` (`expiry_date`, `created_at`; default: expiry date, latest first).
- **Sorting (D-0167):** an explicit `sort_by` puts rows with an empty (NULL) value **last in both directions**; a list called without `sort_by` keeps its default order.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/compliance-documents`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### GET `/compliance-documents/counts`

- **Compliance-document counts (D-0188, flow 07 C4).** Every document of the company sits in exactly ONE of six buckets, judged against TODAY in the company timezone (`meta.timezone`, `meta.today`): `expired` (expiry before today), `expiring_0_7` (today up to 7 days ahead), `expiring_8_30`, `expiring_31_60`, `valid_after_60`, `no_expiry` (no expiry date). The six add up to `total`; for the cumulative "expiring within N days" add the buckets, or use `GET /compliance-documents/expiring-soon?within_days=N` for the records.
- `data` = `{ total, by_status { six buckets }, by_owner_type [{ documentable_type (vehicle | driver), total, six buckets }], by_document_type [{ document_type, total, six buckets }] }`; `by_document_type` is grouped by the stored spelling and ordered by `total` desc, then name. Optional filters `documentable_type` (`vehicle` | `driver`, else 422 `The selected documentable type is invalid.`) and `document_type` (exact, case-insensitive). `meta.buckets` echoes the definitions. Driver licences are NOT compliance documents — their state is `license_state` on `GET /drivers` / `GET /drivers/counts` (`expired | expiring | valid | none`).

#### GET `/compliance-documents/expiring-soon`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **`within_days` (D-0188, flow 07 C4):** optional, 1–365, default **30** (today's behaviour) — documents expiring within that many days, or already expired. A non-numeric or out-of-range value is a 422.

#### PUT `/compliance-documents/{id}`

- **Edit (D-0169):** same fields as the matching `POST`, all optional — send **only what changed**; `null` clears a nullable field; an empty body changes nothing. The record must belong (through its vehicle / driver) to the caller's company — another company's record is a plain 404, like a missing one. Not announced over the realtime socket (log-type records never were).
- Editable: `document_type`, `document_number`, `issue_date`, `expiry_date`, `notes`. The owner (`documentable_type` / `documentable_id`) is **not** editable.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### DELETE `/compliance-documents/{id}`

- **Delete (D-0169):** hard delete of the record; 404 when it does not exist (or belongs to another company).
- Compliance documents are metadata only (no file is attached).

#### PUT `/components/bulk-update`

- `null` / `""` fields are left unchanged (never cleared); `parent_id` must exist.

#### PUT `/components/{componentId}`

- Same lenient payload rules; `floor_plan_id` must exist.

#### GET `/dashboard/packet-history`

- **Deliberate deviation from Laravel (D-0136):** Empty placeholder rows (created when an ingestion token is generated, before the first packet) are hidden; Laravel lists them. Totals/pagination are consistent with the hidden rows.

#### GET `/devices`

- Each device's `created_at` is `Y-m-d H:i:s` in the owner's timezone; embedded owner `user` present.

#### GET `/devices/product/{product_id}`

- `assigned_device_ids` lists every assigned component device id (cross-tenant, Laravel parity).
- `userPreference` items use `id` (int), `attribute_key`, `is_selected` (1/0).

#### GET `/devices/{id}`

- Despite the path, `{id}` is an **asset component id** (the real Laravel handler is `componentsDevices`), and `type=asset|component` selects the lookup.

#### GET `/drivers`

- **Opt-in paging (D-0164):** send `page` and/or `per_page` (default 20, max 100) and `data` becomes `{ items, pagination: { page, per_page, total, total_pages } }` (`total` counts the rows after search/filters); send neither and `data` is the flat array, as before. `search` is a case-insensitive contains match, `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`), `sort_order` is `asc`/`desc`; rows that tie on the sort column are ordered by id, so paging never duplicates or drops a row.
- `search` matches first/last name (a `first last` phrase works in either order), licence number, email, phone. `assigned` = currently on a vehicle; `license_expiring_within_days` = licence expires between today and today + N days (already-expired licences are not included). `sort_by=name` orders by last then first name. Default order: last name.
- **Sorting (D-0167):** an explicit `sort_by` puts rows with an empty (NULL) value **last in both directions**; a list called without `sort_by` keeps its default order.
- D-0167: `license_state` = `expired` (expiry before today) | `expiring` (today … +30 days, the same window as `GET /compliance-documents/expiring-soon`) | `valid` (later than +30 days) | `none` (no expiry date recorded); it combines (AND) with `license_expiring_within_days`. `sort_by=status` is available.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/drivers`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/drivers/bulk-deactivate`

- **Bulk contract (D-0166):** body is **either** `{ ids: [...] }` **or** `{ filter: {...} }` (exactly one, else 422 `Provide either ids or filter (exactly one).`). At most **500** records per request (more ids → 422 `You can act on at most 500 records per request.`; a filter that matches more than 500 → 422 `The filter matches N records; the limit is 500 per request. Narrow the filter.`). `filter` takes the same parameters as the matching list (no paging/sort; flags may be JSON booleans, 0/1 or their string spellings). Each record is run, one after another, through the **same single-record action** (identical guards, messages and `fleet:changed` events), so partial success is normal: the response is always **HTTP 200** with `data.results` = one `{ id, ok, changed, label, message }` per record (a refusal or a 404 is `ok: false` with that message; `changed` and `label`: see D-0171 below) and `data.summary` = `{ mode: "ids"|"filter", matched, processed, succeeded, changed, failed }`. Duplicate ids are processed once; a record another operator changed in between simply reports its own message.
- Per-record guard: `Unassign this driver from their vehicle before deactivating them.`. In filter mode `include_inactive` defaults to `false`.
- D-0167: the `filter` also accepts `license_state` (see `GET /drivers`).
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).

#### POST `/drivers/bulk-delete`

- **Bulk hard delete (D-0178, C14):** `{ ids }` XOR `{ filter }` (the driver list's own filters), ≤ 500 per request, one after another through the single-record delete — so each record is deleted or refused with its own message (`ok: false`, the reason above). In filter mode `include_inactive` defaults to **true** (a never-used driver may already be deactivated). Response as for the other bulk actions (always 200, per-record `{ id, ok, changed, label, message }` + `summary`); a deleted record is `changed: true`.

#### POST `/drivers/bulk-reactivate`

- Same contract as `POST /drivers/bulk-deactivate`. In filter mode `include_inactive` defaults to `true`.
- D-0167: the `filter` also accepts `license_state` (see `GET /drivers`).
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).

#### GET `/drivers/counts`

- **Status counts (D-0179, B7):** for filter chips. Takes the driver list's own filters and `search` (`availability_status`, `employment_status`, `assigned`, `license_expiring_within_days`, `license_state`) but **never** its `status` / `include_inactive` / paging / sort, so choosing one chip does not zero the others. Response `data: { total, by_status: { active, inactive, suspended } }` — every status is always present (`0` when nothing has it) and `total` is their sum. Company-scoped. Additive; the list endpoints are unchanged.

#### GET `/drivers/export`

- **CSV export (D-0168):** takes the matching list's own `search` / filters / `sort_by` / `sort_order` (`page` / `per_page` are ignored) and streams **every** matching row as `text/csv; charset=utf-8` (UTF-8 BOM so Excel reads non-ASCII text, RFC 4180 rows with CRLF, header row first) with `Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHMMSS.csv"` (UTC) and `X-Export-Row-Count` = the number of data rows. Rows are read in pages of 500 with the list's own id-tie-broken order, so memory stays flat and no row is duplicated or dropped. **At most 50 000 rows:** a larger result is refused **before anything is sent** with HTTP 422 `The export matches N rows; the limit is 50000 per export. Narrow the filter.` (a normal JSON error body). Empty/NULL values are empty cells; dates are ISO 8601 (date-only columns `YYYY-MM-DD`); booleans are `true`/`false`. **Formula injection guard:** a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading apostrophe so a spreadsheet cannot run it. A failure after streaming has started aborts the connection (the download is then incomplete — the row count header lets a client detect it).
- Columns: id, first_name, last_name, email, phone, license_number, license_class, license_expiry_date, status, employment_status, availability_status, payroll_reference, hire_date, assigned, created_at. Filters: same as `GET /drivers`.

#### GET `/drivers/options`

- **D-0171 — `include_inactive=1`:** by default the options are active records only; with `include_inactive=1` they also offer the deactivated ones, for history-filter dropdowns (a trip or assignment may still refer to a deactivated record). Drivers: every status is offered (`inactive` and `suspended` too); a new `status` field is on every row. Each option row carries `status` so a UI can label deactivated rows.

#### POST `/drivers/{driverId}/incidents`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Incident names (D-0174):** every incident object also carries `driver` (`{ id, first_name, last_name }` or `null`) and `vehicle` (`{ id, name, plate }` or `null` — no vehicle on the incident, or one that is not the caller's company's). Resolved with one batched lookup per response.

#### GET `/drivers/{id}`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Incident names (D-0174):** every incident object also carries `driver` (`{ id, first_name, last_name }` or `null`) and `vehicle` (`{ id, name, plate }` or `null` — no vehicle on the incident, or one that is not the caller's company's). Resolved with one batched lookup per response.

#### PUT `/drivers/{id}`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### DELETE `/drivers/{id}`

- **Guarded hard delete (D-0178, C14):** a real delete, allowed ONLY for a driver that was never used — active or deactivated alike. It is refused with 422 `This driver can't be deleted because it has <what is in the way>. Deactivate it instead.` when any of these still reference it: trips, vehicle assignments, incidents, compliance documents. An unknown / other company's driver is a 404. Announces `fleet:changed` with `action: "deleted"`. There is no `expected_updated_at` on deletes.

#### GET `/drivers/{id}/assignment-history`

- `include_active` (string): the default includes open assignments; `include_active=0` returns only closed (historical) ones. `duration_days` is `floor` of whole days and `null` while open.

#### POST `/drivers/{id}/deactivate`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### GET `/drivers/{id}/incidents`

- **Paged detail sub-list (D-0170, B9):** **always** paged (unlike the opt-in lists) — `data` is `{ items, pagination: { page, per_page, total, total_pages } }`, `page` default 1, `per_page` default 20, max 100; `total` counts the rows after the filters. `search` is a case-insensitive contains match; `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`) and rows that tie are ordered by id so paging never duplicates or drops a row; an explicit `sort_by` puts empty (NULL) values last in both directions. The record shape is exactly the one embedded in the detail response. A vehicle / driver that is not in the caller's company is a plain 404 (`Vehicle not found.` / `Driver not found.`). `date_from` / `date_to` are inclusive bounds (a date or an ISO 8601 date-time; an invalid value → 422).
- The driver's incidents. Range column: `incident_date`; `severity` filter; `vehicle_id` limits to incidents involving one vehicle; `search` matches incident type and description. `GET /drivers/{id}` still embeds only the latest few.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Incident names (D-0174):** every incident object also carries `driver` (`{ id, first_name, last_name }` or `null`) and `vehicle` (`{ id, name, plate }` or `null` — no vehicle on the incident, or one that is not the caller's company's). Resolved with one batched lookup per response.

#### POST `/drivers/{id}/reactivate`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### GET `/fleet/analytics/compliance`

- **The compliance report (D-0191, flow 07 B7, second half) — point-in-time.** There is no `from` / `to` / `compare`: the API keeps no history of past compliance, so the report reads every expiry date as it is now. **Records** = every compliance document of the company (vehicle and driver documents) plus the licence of every driver that is not deactivated (a driver without a licence date is a `no_expiry` record). Each record is in exactly ONE of six classes against TODAY in the company timezone (`meta.timezone`, `meta.today`): `expired`, `expiring_0_7`, `expiring_8_30`, `expiring_31_60`, `valid_after_60`, `no_expiry` — the same classes as `GET /compliance-documents/counts` (C4).
- `data.summary` = `{ total, expired, expiring_0_7, expiring_8_30, expiring_31_60, valid_after_60, no_expiry, expiring_within_30_days, compliance_rate_pct, by_kind { documents, licences } }` (each block has the same fields). **`compliance_rate_pct` = records that are not expired ÷ records that have an expiry date** (`no_expiry` records are not judged; `null`, never `0`, when nothing can be judged). **`by_owner_type`** = `[{ owner_type (vehicle | driver), …block }]` for the DOCUMENTS; **`by_document_type`** = `[{ document_type, …block }]` for the documents (stored spelling ignoring case / spaces, most records first). **`upcoming`** = `[{ bucket, documents, licences, total }]` — what expires from today through today + `horizon_days` (7–365, default 90) per `interval` = `week` (default) | `month` bucket (`bucket` = the local date of the bucket start; today is the first day, so the first bucket can be partial); expired and `no_expiry` records are not in it.
- **`table`** = `{ items, pagination }` (`page` 1, `per_page` 20, max 100), one row per record: `{ kind (document | licence), record_id, owner { type, id, name | null }, document_type ('Driver licence' for a licence), document_number, expiry_date, days_until_expiry (negative once expired), status }`. Filters (they narrow the table and `meta.table_counts` only): `kind`, `status` (comma list or `status[]` of the six classes; unknown → 422 `The selected status is invalid.`), `documentable_type` (`vehicle` | `driver` — documents only), `document_type` (exact, case-insensitive), `search` (owner name, document type, document number); `sort_by` = `expiry_date` (default, soonest first — expired ones first; no date last) | `owner_name` | `document_type` | `kind` (+ `sort_order`; empty values last in both directions; unknown → 422 `The selected sort by is invalid.`). **Known limits:** computed in memory per request (small tables); a document whose owner no longer exists has `owner.name` `null`.

#### GET `/fleet/analytics/compliance/export`

- **CSV (D-0191, B7):** the table's own filters / sort (`page` / `per_page` ignored), every matching record — kind, record id, owner type / id / name, document type, document number, `expiry_date` (date only), `days_until_expiry`, `status`. Up to 50 000 rows, otherwise 422 `Narrow the filter.`

#### GET `/fleet/analytics/fuel`

- **The fuel report (D-0190, flow 07 B6).** `data` = `{ summary, series, by_vehicle_category, by_vendor, anomalies, table, previous_period? }`; `meta` = `{ from, to, timezone, interval, compare, generated_at, definition_version, economy_drop_pct, basis }`. Nothing is stored; computed per request from `fuel_logs`. **Definitions (the dashboard's own, so the numbers agree):** a fill belongs to the LOCAL calendar date of its `fill_date` (D-0183 A5); litres convert gallons (1 US gal = 3.785411784 L); a fill's cost is `total_cost`, else `cost` (a `total_cost` of 0 falls back to `cost`) and the average price per litre is judged over exactly the fills that carry a cost; economy = the full-tank method (D-0183 A3) over the fills of the range only; the fuel cost per km = fuel cost ÷ the completed trips' distance of the same range. Every vehicle of the scope counts — retired / sold ones too (history).
- **`summary`:** the metrics `fills`, `liters`, `total_cost`, `avg_price_per_liter`, `fuel_economy_km_per_l` and `fuel_cost_per_km`, each `{ value, previous, delta_abs, delta_pct }` (`previous` / deltas only with `compare` = `previous_period` | `previous_year`; `data.previous_period { from, to }` names the window; a metric with nothing to measure is `null`, never `0`), plus `samples { priced_fills, economy_intervals, fills_with_odometer }`. The summary, series, breakdowns and anomaly list always cover EVERY fill in scope; the table filters narrow only the table.
- **`series`** = one point per bucket `{ bucket, fills, liters, total_cost, avg_price_per_liter, fuel_economy_km_per_l }` (`bucket` = the local date of the bucket start). A fill sits in the bucket of its date; an economy INTERVAL (km since the previous full fill ÷ litres since) sits in the bucket of the fill that closed it, so the buckets add up to the range and `fuel_economy_km_per_l` is `null` in a bucket that closes no interval. **`by_vehicle_category`** = `[{ category | null, vehicles, fills, liters, total_cost, avg_price_per_liter, fuel_economy_km_per_l }]` grouped by the stored spelling, most litres first. **`by_vendor`** = `{ items [{ vendor | null, fills, liters, total_cost, avg_price_per_liter, fuel_economy_km_per_l }], other_count }` — grouped ignoring case and surrounding spaces, most spend first, `top_vendors` (1–50, default 10) limits `items`.
- **Anomalies** — `anomalies` = `{ total, by_type { over_capacity, economy_drop, odometer_backwards }, items }` (`top_anomalies` 1–100, default 20, newest first; an item is `{ fill_id, vehicle, fill_date, types, liters, tank_capacity_liters, economy_km_per_l, baseline_economy_km_per_l, drop_pct, odometer_km, previous_odometer_km }`). `over_capacity` = the fill's litres are above the vehicle's `tank_capacity_liters` (only when the capacity is known); `economy_drop` = a full-tank interval whose economy is more than `economy_drop_pct` (1–99, default **30**, echoed in `meta`) below the vehicle's OTHER intervals of the range — a vehicle with a single interval has no baseline; `odometer_backwards` = an odometer reading lower than the vehicle's previous fill (by date). These are flags for a person to check, not verdicts.
- **`table`** = `{ items, pagination }` (`page` 1, `per_page` 20, max 100), one row per fill: `{ fill_id, vehicle { id, name, plate, vehicle_category }, fill_date, volume, unit, liters, cost, price_per_liter, is_full_tank, odometer_km, economy_km_per_l (only on a fill that closes a full-tank interval), vendor, station_name, payment_method, receipt_reference, trip_id, anomaly_types }`. `sort_by` = `fill_date` (default, newest first) | `liters` | `cost` | `price_per_liter` | `vehicle_name` | `vendor` | `odometer_km` | `economy_km_per_l` (+ `sort_order`; empty values last in both directions, ties by id; unknown → 422 `The selected sort by is invalid.`); filters `vendor`, `payment_method` (exact, case-insensitive, spaces ignored), `is_full_tank` (`0` | `1` | `true` | `false`), `anomaly` (`1` = only flagged, `0` = only unflagged), `anomaly_type` (comma list or `anomaly_type[]`; unknown → 422 `The selected anomaly type is invalid.`), `search` (vendor, station, receipt reference, payment method, vehicle name / plate).
- **Parameters:** `from` / `to` (calendar dates in the company timezone; default = the last 7 local days, today included), `interval` = `day` (default) | `week` | `month` (more than **92 buckets** → 422 naming the fix), `compare`, the vehicle scope `vehicle_category`, `cost_centre`, `vehicle_id` (comma list or `vehicle_id[]`), `yard_id` (vehicles currently checked in there) — no `driver_id` (a fill has no driver). More than **200000** fills in the range → 422 (`narrow the range or add a filter`). **Known limits:** computed in memory per request; the economy uses only the fills of the range (the opening fill of an interval must be inside it), so short ranges often show `null`; the tank capacity is the vehicle's CURRENT one.

#### GET `/fleet/analytics/fuel/export`

- **CSV (D-0190, B6):** the fills table's own filters / sort (`page` / `per_page` ignored), every matching fill — id, vehicle id / name / plate, `fill_date` (date only), volume / unit / converted `liters`, cost, `price_per_liter`, full tank, odometer, `economy_km_per_l`, vendor, station, payment method, receipt reference, trip id and the `anomalies` flags. Up to 50 000 rows, otherwise 422 `Narrow the filter.`

#### GET `/fleet/analytics/maintenance`

- **The maintenance report (D-0191, flow 07 B7, first half).** `data` = `{ summary, series, by_service_type, by_vehicle_category, top_vehicles, schedules, fleet, previous_period? }`; `meta` = `{ from, to, timezone, interval, compare, generated_at, definition_version, due_soon_days, due_soon_km, basis }`. Nothing is stored; computed per request from `vehicle_maintenance_logs` and the schedules' computed due state (D-0184 C1). A log belongs to the LOCAL calendar date of its `service_date` (D-0183 A5); every vehicle of the scope counts for the costs — retired / sold ones too (history). **The company-wide tables already exist:** the schedules with their next-due date / km are `GET /maintenance-schedules` (C1), the logs are `GET /maintenance-logs` (C2) — this report is the analysis on top.
- **`summary`:** `maintenance_cost` (sum of the logs that carry a cost), `logs`, `avg_cost_per_log` (over the logs that have a cost; `null`, never `0`, when none has), `cost_per_km` (maintenance cost ÷ the completed trips' distance of the same range; `null` without cost or distance) and `vehicles_serviced` (distinct vehicles with a log), each `{ value, previous, delta_abs, delta_pct }` (`previous` / deltas only with `compare` = `previous_period` | `previous_year`; `data.previous_period { from, to }` names the window), plus `samples { logs_with_cost }`. **`series`** = one point per bucket `{ bucket, logs, cost, vehicles }` (`bucket` = the local date of the bucket start). **`by_service_type`** = `{ items [{ service_type, logs, cost, avg_cost, share_pct }], other_count }` — grouped ignoring case and surrounding spaces, most cost first (ties: more logs), `top_service_types` (1–50, default 10) limits `items`; **`by_vehicle_category`** = `[{ category | null, vehicles, logs, cost, avg_cost, share_pct }]` (stored spelling); **`top_vehicles`** = `{ items [{ vehicle { id, name, plate }, logs, cost, avg_cost, share_pct }], other_count }` (`top_vehicles` 1–50, default 10). `share_pct` = the share of the range's total cost (`null` when the total is 0).
- **`schedules` is point-in-time** (there is no schedule history): the computed due state of the schedules of the vehicles IN SERVICE in scope — `{ total, by_status { overdue, due_soon, ok, unknown }, by_due_window { overdue, due_0_7, due_8_30, later, unknown }, overdue_pct }`. `by_status` is the C1 status (the company's due-soon window applies; `meta.due_soon_days` / `due_soon_km`); `by_due_window` is by DATE: overdue (any limit passed), due in 0–7 days, 8–30 days, `later` (more than 30 days away — also a schedule that is due by odometer only), `unknown` (nothing computable); `overdue_pct` = overdue ÷ the schedules that have a state (`null` when none). **`fleet.vehicles_in_maintenance_now`** = vehicles in scope whose lifecycle status is `in_maintenance` right now. **Downtime days are NOT available:** the API stores only a vehicle's current lifecycle status, no status history (KNOWN_ISSUES 11.93) — a status-history table would be a migration and an owner decision.
- **Parameters:** `from` / `to` (calendar dates in the company timezone; default = the last 7 local days, today included), `interval` = `day` (default) | `week` | `month` (more than **92 buckets** → 422 naming the fix), `compare`, the vehicle scope `vehicle_category`, `cost_centre`, `vehicle_id` (comma list or `vehicle_id[]`), `yard_id` (vehicles currently checked in there) — no `driver_id` (a log has no driver). More than **200000** logs in the range → 422. **Known limits:** computed in memory per request; the schedule buckets follow the vehicles' CURRENT status; the costs are the logged `cost` only.

#### GET `/fleet/analytics/summary`

- **The Overview KPI tiles (D-0185, flow 07 B1).** `data.summary` has six tiles, each `{ value, previous, delta_abs, delta_pct, target }`: `fleet_availability` (active ÷ (active + in maintenance) vehicles, %, a point-in-time metric — there is no vehicle status history, so no `previous`), `utilisation` (% — completed-trip hours ÷ in-service vehicles × scheduled hours × local days, D-0183 A7), `on_time_pct` (completed trips that ended within the company grace of their planned end ÷ the completed trips that HAVE a planned end — `null` when none has one, D-0186), `cost_per_km` ((fuel-log cost + maintenance-log cost) ÷ completed-trip km), `fuel_economy` (full-tank method, km per litre) and `open_issues` (the attention feed's critical + warning items right now, also point-in-time). `target` = the company's KPI target from `GET /fleet/settings` (`null` when unset). A metric with nothing to measure is `null`, never `0`.
- **Parameters:** `from` / `to` (calendar dates in the company timezone; default = the last 7 local days, today included), `interval` = `day` (default) | `week` | `month`, `compare` = `none` (default) | `previous_period` (the immediately preceding window of the same length) | `previous_year` (the same calendar dates one year earlier; 29 Feb → 28 Feb) — with a comparison `previous`, `delta_abs` (points / units) and `delta_pct` (relative to the previous value; `null` when the previous is `0` or missing) are filled in and `data.previous_period { from, to }` names the window. Scope filters as on `GET /fleet/status-summary` (vehicle_category, cost_centre, vehicle_id, driver_id, yard_id). A range with more than **92 buckets** → 422 naming the fix (use a larger interval or a shorter range).
- **`data.series`:** one point per bucket `{ bucket: YYYY-MM-DD (local date of the bucket start), utilisation, on_time_pct, cost_per_km, fuel_economy }` for the sparklines (`null` where a bucket has nothing to measure). **`meta`:** `from`, `to`, `timezone`, `interval`, `compare`, `generated_at`, `definition_version` (bumps when a formula changes) and `data_quality` (`vehicles_total`, `vehicles_with_tracker`, and the `basis` of every metric). Read-only, additive.

#### GET `/fleet/analytics/trips`

- **The trips report (D-0189, flow 07 B5).** `data` = `{ summary, series, duration_histogram, delay_histogram, cancellation_reasons, table, previous_period? }`; `meta` = `{ from, to, timezone, interval, compare, generated_at, definition_version, on_time_grace_minutes, table_counts, basis }`. Nothing is stored; computed per request from `trips`. **Definitions:** a trip belongs to the period of its `actual_start_at`, else its `planned_start_at` (D-0183 A1); on-time is judged only over the COMPLETED trips that have a planned AND an actual end (D-0186) — on time = the actual end within the company's grace (`on_time_grace_minutes`) of the planned end — and is `null`, never `0`, when none can be judged; `delay_minutes` = actual end minus planned end, signed (negative = early), for the same trips.
- **`summary`:** the metrics `trips_total`, `trips_completed`, `trips_cancelled`, `cancellation_rate_pct` (cancelled ÷ all trips of the period), `on_time_pct` (+ `target` from `GET /fleet/settings`), `avg_delay_minutes`, `avg_duration_minutes` (completed trips), `actual_distance_km` (trips that have an actual distance — the dashboard's own definition) and `distance_variance_km` (actual − planned over the trips that have BOTH distances; `null` when none) each `{ value, previous, delta_abs, delta_pct }` (`previous` / deltas filled only with `compare` = `previous_period` | `previous_year`; `data.previous_period { from, to }` names the window); plus `counts { total, planned, in_progress, completed, cancelled }` (trips OF THE PERIOD — unlike the dashboard's `in_progress`, which is the number running right now), `samples { on_time, distance_variance, duration }`, `late_trips`, `planned_distance_km`. The summary, series and histograms always cover EVERY status; `status` narrows only the table.
- **`series`** = one point per bucket `{ bucket, total, planned, in_progress, completed, cancelled, on_time_pct, on_time_sample }` (`bucket` = the local date of the bucket start). **`duration_histogram`** = completed trips by `actual_duration_minutes`: under 30 min, 30–60, 1–2 h, 2–4 h, 4–8 h, 8 h or more (`from_minutes` ≤ duration < `to_minutes`). A duration just below zero (a trip started and completed in the same second stores −0.01) counts as under 30 min, so the classes add up to `samples.duration`. **`delay_histogram`** = the judged trips by signed delay: more than 30 min early, up to 30 min early or on the minute, up to 15 min late, 15–60 min late, 1–4 h late, more than 4 h late. **`cancellation_reasons`** = `{ total, items [{ reason, count, pct }], other_count }` — the cancelled trips grouped ignoring case and surrounding spaces, most first, a missing reason is `reason: null`, `top_reasons` (1–50, default 10) limits `items` and `other_count` counts the rest.
- **`table`** = `{ items, pagination }` (`page` 1, `per_page` 20, max 100): `{ trip_id, trip_reference, status, vehicle { id, name, plate } | null, driver { id, name }, customer { id, name } | null, origin_address, destination_address, period_start, period_date, planned_start_at, actual_start_at, planned_end_at, actual_end_at, delay_minutes, on_time, duration_minutes, planned_distance_km, actual_distance_km, distance_variance_km, cancellation_reason }`; `delay_minutes` / `on_time` are `null` for trips that cannot be judged. `sort_by` = `period_start` (default, newest first) | `status` | `vehicle_name` | `driver_name` | `delay_minutes` | `duration_minutes` | `actual_distance_km` | `distance_variance_km` (+ `sort_order`; empty values last in both directions, ties by trip id; unknown → 422 `The selected sort by is invalid.`); `search` = trip reference, origin / destination address, vehicle name, driver name; `status` (comma list or `status[]`; unknown → 422 `The selected status is invalid.`) narrows the table (and `meta.table_counts`) only.
- **Parameters:** `from` / `to` (calendar dates in the company timezone; default = the last 7 local days, today included), `interval` = `day` (default) | `week` | `month` (more than **92 buckets** → 422 naming the fix), `compare`, the vehicle scope `vehicle_category`, `cost_centre`, `vehicle_id` (comma list or `vehicle_id[]`), `yard_id` (vehicles currently checked in there) — retired / sold vehicles' trips are included —, **`driver_id` = the trip's OWN driver (unlike the vehicle-scope `driver_id` of `/fleet/analytics/summary` and the status / performance endpoints, which means the vehicle's current driver)**, `customer_id` (comma list or `customer_id[]`). More than **100000** trips in the range → 422 (`narrow the range or add a filter`). **Known limits:** computed in memory per request; a trip stores no cancellation timestamp, so a cancelled trip is placed by its planned start.

#### GET `/fleet/analytics/trips/export`

- **CSV (D-0189, B5):** the table's own filters / sort (`page` / `per_page` ignored), every matching trip — id, reference, status, vehicle / driver ids and names, customer id, addresses, planned / actual start and end, `delay_minutes`, duration, planned / actual distance, `distance_variance_km`, cancellation reason. Up to 50 000 rows, otherwise 422 `Narrow the filter.`

#### GET `/fleet/analytics/yards`

- **Yard occupancy and activity (D-0187, flow 07 B9).** `data.summary` = `{ yards_total, slots_total, occupied_now, occupancy_pct, check_ins, check_outs, avg_dwell_minutes, longest_dwell_minutes }`; `data.series` = one point per bucket `{ bucket, check_ins, check_outs }`; `data.table` = `{ items, pagination }` with one row per yard `{ yard_id, name, is_active, slots_total, occupied_now, occupancy_pct, check_ins, check_outs, avg_dwell_minutes, longest_dwell_minutes, longest_open_stay_minutes }`. Nothing is stored; everything is computed per request from `yards`, `yard_slots` and `yard_slot_events`.
- **Definitions:** `occupied_now` = open stays (checked in, not checked out) at the moment of the request; `occupancy_pct` = `occupied_now` ÷ `slots_total` × 100, one decimal, `null` when the yard has no slots — a **point-in-time** metric (there is no slot-occupancy history), so it does not change with `from` / `to`. `check_ins` / `check_outs` = stays checked in / out inside the period. Dwell = check-out minus check-in, over the stays **checked out inside the period** (`avg_dwell_minutes`, `longest_dwell_minutes`, `null` when none); `longest_open_stay_minutes` = the oldest still-open stay right now (`null` when nothing is parked). Deactivated yards are left out unless `include_inactive=1`.
- **Parameters:** `from` / `to` (calendar dates in the company timezone; default = the last 7 local days, today included), `interval` = `day` (default) | `week` | `month` (more than **92 buckets** → 422 naming the fix), `yard_id`, `include_inactive` (`0` | `1` | `true` | `false`), `search` (yard name), `sort_by` = `name` (default) | `occupancy_pct` | `occupied_now` | `slots_total` | `check_ins` | `check_outs` | `avg_dwell_minutes` (unknown → 422 `The selected sort by is invalid.`), `sort_order`, `page` (1), `per_page` (20, max 100). Empty values (`null`) sort last in both directions, ties by yard id. `meta`: `from`, `to`, `timezone`, `interval`, `generated_at`, `definition_version`, `basis`. A yard of another company is never visible (its id gives an empty table).
- **Known limits:** yard occupancy has no history, so a range in the past still reports the occupancy of now; a stay is attributed to the period of its check-in (`check_ins`, series) and of its check-out (`check_outs`, dwell), so a long stay that spans the whole range appears only in `occupied_now` / `longest_open_stay_minutes`; the table is computed in memory per request (fine for thousands of yards and stays).

#### GET `/fleet/attention`

- **ONE merged worklist (D-0185, flow 07 B2)** — always paged (`data: { items, pagination }`, `page` 1, `per_page` 20, max 100), most severe first, then the longest-waiting first (`since` ascending, unknown last). Item: `{ id, type, severity, title, entity: { type: vehicle | driver | trip, id, name }, since, action }` — `id` is a stable composite (`alarm:12`, `maintenance:5`, `document:3`, `licence:7`, `offline:2`, `incident:9`, `trip:4`, `yard:6`); `action` is a verb key the UI maps to a button (`review_alarm`, `schedule_service`, `renew_document`, `renew_licence`, `check_tracker`, `review_incident`, `fix_trip`, `check_out_vehicle`).
- **Sources and severities:** `alarm` (open alarms of devices installed in a vehicle — the alarm's own severity), `maintenance_overdue` (warning) / `maintenance_due_soon` (info) (from the schedule list, vehicles in service), `document_expired` (critical) / `document_expiring` (warning, within 30 days) for vehicle and driver documents, `licence_expired` (critical) / `licence_expiring` (warning, within 30 days) for drivers that are not deactivated, `vehicle_offline` (warning — a vehicle WITH a tracker silent for more than 24 h; a tracker that never reported has `since: null`), `incident_severe` (warning — severe incidents of the last 7 days), `trip_at_risk` (warning — a planned trip starting within 24 h whose vehicle is not `active` or whose driver is not `active`; the title says which), `yard_long_stay` (info — an open yard stay longer than `yard_days`, default 7). The constants are echoed in `meta.rules`.
- **Filters and counts:** `severity` and `type` (comma list or the `[]` spelling; unknown value → 422 `The selected severity is invalid.` / `The selected type is invalid.`), `yard_days` (1–365). `meta.counts` = `{ total, by_severity, by_type }` — `by_severity` ignores the `severity` filter and `by_type` ignores the `type` filter, so a chip never zeroes the others; `total` is the filtered total. Nothing is stored — the feed is recomputed on every request. Read-only, additive.

#### GET `/fleet/dashboard`

- **`fleet_only` (D-0182, L2):** `1` / `true` makes `data.alerts.total / critical / warning / info` count only open alarms whose device is **currently installed in a vehicle** (the same rule as `GET /fleet/dashboard/alerts?fleet_only=1`); default off = the company-wide counts, exactly as before. `offline_vehicles`, `expiring_documents` and `expiring_driver_licences` are unaffected (they are fleet-only already).
- **Retired and sold vehicles are left out (D-0182, L1):** `data.fleet_status` (`total`, `moving`, `idle`, `parked`, `offline`, `unknown`) and therefore `data.alerts.offline_vehicles` no longer count them — only `active` and `in_maintenance` vehicles are in the fleet (the rule utilisation already used, D-0160).
- **Company timezone (D-0183, A5):** `from` / `to` are calendar dates (`YYYY-MM-DD`) read in the company timezone from `GET /fleet/settings` (default `UTC` — today's behaviour until it is set); a missing `to` is today's local date; day / week / month buckets start at local midnight (weeks on Monday) and are labelled with their local date. `meta.timezone` names the zone.
- **Trip period (D-0183, A1):** a trip belongs to the period of its `actual_start_at`, else its `planned_start_at` (the rule `GET /trips` uses for `date_from` / `date_to`) — so `trips.total / completed / cancelled / planned`, `on_time_pct`, `avg_duration_minutes`, the planned-vs-actual distance and `trends.trips` all count the same trips. `on_time_pct` treats a completed trip as on time when it ended within `on_time_grace_minutes` (company settings, default 0) of its planned end. **D-0186:** `on_time_pct` is judged over the completed trips that HAVE a planned end (`on_time_sample` = how many); with none it is `null` — never a false `0` — and `distance_variance_km` = actual − planned over the trips that have BOTH distances (`distance_variance_sample`), `null` when none does (`planned_distance_km` and `actual_distance_km` keep their meaning; `actual_distance_km` still equals `utilisation.distance_km`).
- **One distance (D-0183, A2):** `utilisation.distance_km`, `trends.distance`, the vehicle table's `distance_km` and `trips.actual_distance_km` are all the completed trips' `actual_distance_km` for the period (that value is the operator's end − start odometer when both were given, else the distance driven according to the trip's tracker). Each vehicle-table row carries `distance_source` (`odometer` / `telemetry` / `trip` — the source of most of its km, `null` without distance); telemetry rollups will supersede this later.
- **One fuel definition (D-0183, A3):** fuel used = the period's fuel LOGS in litres (a `gallons` log is converted), everywhere — including the vehicle table's `fuel_used_liters` (the trip-level `fuel_used_liters` is no longer a KPI). Economy = the **full-tank method**: km between two consecutive full fills (by odometer) ÷ litres put in since the earlier one, summed per vehicle and distance-weighted for the fleet; `null` when no vehicle has two full fills with odometer readings in the period (`efficiency_basis: "full_tank"`). `fuel.cost_per_km` = fuel-log cost ÷ the period's trip distance (unchanged).
- **Exclusive status (D-0183, A4):** `fleet_status` = `moving` / `idle` / `parked` / `offline` / `no_tracker`, summing to `total`. `no_tracker` = no tracker installed (the deprecated alias `unknown` carries the same number for one release); `offline` = a tracker is installed but its latest position is older than `position_freshness_minutes` (company settings, default **15**, was a fixed 30) or it never reported. Because `no_tracker` is no longer counted in `offline`, `alerts.offline_vehicles` counts only vehicles that have a tracker.
- **Costs (D-0183, A6):** `financial.cost_breakdown.maintenance` = the sum of the period's maintenance-log costs (`service_date` in the range, local dates); `total_cost` = the breakdown's sum (fuel + maintenance).
- **Utilisation (D-0183, A7):** `available_hours` = vehicles **in service** (`active` — not in maintenance / retired / sold, by their current status) × `scheduled_hours_per_vehicle_per_day` (company settings, default 24) × the local days of the period; `rate` has two decimals; `basis: "trips"` says the figure is trip arithmetic (no telemetry rollup yet), `vehicles_in_scope` and `scheduled_hours_per_day` are returned; `idle_hours` stays 0 until telemetry rollups exist.

#### GET `/fleet/dashboard/financial`

- **Company timezone (D-0183, A5):** `from` / `to` are calendar dates (`YYYY-MM-DD`) read in the company timezone from `GET /fleet/settings` (default `UTC` — today's behaviour until it is set); a missing `to` is today's local date; day / week / month buckets start at local midnight (weeks on Monday) and are labelled with their local date. `meta.timezone` names the zone.
- **Costs (D-0183, A6):** `financial.cost_breakdown.maintenance` = the sum of the period's maintenance-log costs (`service_date` in the range, local dates); `total_cost` = the breakdown's sum (fuel + maintenance).

#### GET `/fleet/dashboard/trends`

- **Company timezone (D-0183, A5):** `from` / `to` are calendar dates (`YYYY-MM-DD`) read in the company timezone from `GET /fleet/settings` (default `UTC` — today's behaviour until it is set); a missing `to` is today's local date; day / week / month buckets start at local midnight (weeks on Monday) and are labelled with their local date. `meta.timezone` names the zone.
- **Trip period (D-0183, A1):** a trip belongs to the period of its `actual_start_at`, else its `planned_start_at` (the rule `GET /trips` uses for `date_from` / `date_to`) — so `trips.total / completed / cancelled / planned`, `on_time_pct`, `avg_duration_minutes`, the planned-vs-actual distance and `trends.trips` all count the same trips. `on_time_pct` treats a completed trip as on time when it ended within `on_time_grace_minutes` (company settings, default 0) of its planned end.
- **Buckets (D-0183):** weekly buckets are contiguous and Monday-aligned (the earlier port stepped a partial first week by 7 days and left the days in between out of every bucket); utilisation buckets use in-service vehicles × scheduled hours × the bucket's local days, two decimals.

#### GET `/fleet/dashboard/vehicle-performance`

- **Retired and sold vehicles are left out (D-0182, L1)** — the ranking lists only `active` and `in_maintenance` vehicles.
- **Company timezone (D-0183, A5):** `from` / `to` are calendar dates (`YYYY-MM-DD`) read in the company timezone from `GET /fleet/settings` (default `UTC` — today's behaviour until it is set); a missing `to` is today's local date; day / week / month buckets start at local midnight (weeks on Monday) and are labelled with their local date. `meta.timezone` names the zone.
- **One distance (D-0183, A2):** `utilisation.distance_km`, `trends.distance`, the vehicle table's `distance_km` and `trips.actual_distance_km` are all the completed trips' `actual_distance_km` for the period (that value is the operator's end − start odometer when both were given, else the distance driven according to the trip's tracker). Each vehicle-table row carries `distance_source` (`odometer` / `telemetry` / `trip` — the source of most of its km, `null` without distance); telemetry rollups will supersede this later.
- **Fuel and utilisation per vehicle (D-0183, A3 / A7):** `fuel_used_liters` and `fuel_cost` come from the fuel logs, `fuel_efficiency` from the full-tank method (`null` without an interval), `utilisation_rate` has two decimals against `scheduled_hours_per_vehicle_per_day`, `utilisation_basis: "trips"`.
- **Table controls (D-0184, flow 07 A8) — all optional, additive:** `page` / `per_page` (default 20, max 100) turn `data` into `{ items, pagination }` and add `meta.total` — **without them `data` is the flat array it always was**; `search` (contains, name or plate); `sort` (alias `sort_by`) accepts every column — the original five plus `vehicle_name`, `plate`, `vehicle_category`, `trip_count`, `fuel_efficiency`, `fuel_cost`, `maintenance_cost`, `cost_per_km`, `incident_count` — and `direction` (alias `sort_order`); empty (`null`) values sort last in both directions; an unknown `sort` still falls back to `utilisation_rate`.
- **New row fields (additive):** `vehicle_category`, `has_tracker`, `maintenance_cost` (the period's maintenance logs), `cost_per_km` = (fuel cost + maintenance cost) ÷ distance (`null` without distance), `incident_count` (incidents with that vehicle in the period).
- **Scope filters (D-0184, flow 07 B0):** `vehicle_category` (case-insensitive), `cost_centre`, `vehicle_id` and `driver_id` (comma list or the `[]` spelling — a driver filter means the vehicle's CURRENT driver), `yard_id` (vehicles currently checked in at that yard). Filters combine (AND); an unknown / foreign id simply matches nothing; a non-numeric id → 422 `The vehicle id must be a list of ids.`

#### GET `/fleet/options`

- D-0167: `data.vehicle_categories` = the distinct `vehicle_category` values in use in the caller's company, collapsed case-insensitively (the alphabetically first spelling is kept) and sorted — feed a Category dropdown; the `vehicle_category` filter on `GET /vehicles` matches case-insensitively.

#### GET `/fleet/positions`

- **Map viewport (D-0180, B8):** optional `bbox=minLng,minLat,maxLng,maxLat` (degrees, GeoJSON order) keeps only the trackers whose **latest position is inside** the box (edges inclusive); optional `limit` (1–5000) caps how many come back — the **most recently reported** are kept, newest first. Malformed, out-of-range or reversed (`min` above `max`, so also a box crossing the antimeridian) → 422 `The bbox must be four numbers: minLng,minLat,maxLng,maxLat (longitude -180..180, latitude -90..90, min not above max).`; `limit` outside 1–5000 → 422.
- **`meta` (only when `bbox` or `limit` was sent):** `{ total, limit, truncated }` — `total` = trackers in view (before the cap), `limit` = the cap sent (`null` if none), `truncated` = `total` is larger than what `data` holds. Without `bbox` and `limit` the body is exactly as before (flat `data` array, no `meta`, same order). `include_unassigned` still applies first.
- **Freshness (D-0183, A4):** every row also carries `age_seconds` (seconds since `recorded_at`) and `fresh` (`age_seconds` ≤ the company's `position_freshness_minutes`, default 15 — the same threshold the dashboard's `offline` uses).

#### GET `/fleet/settings`

- **Defaults (until a company saves):** `timezone: "UTC"`, `position_freshness_minutes: 15`, `idle_threshold_minutes: 5`, `scheduled_hours_per_vehicle_per_day: 24`, `on_time_grace_minutes: 0`, `maintenance_due_soon_days: 7`, `maintenance_due_soon_km: 500`, every KPI target `null`; `is_default: true` and `updated_at: null` while no row exists. Requires the `all-fleet` permission (a separate right is a later RBAC decision).
- **Who reads them:** the dashboard endpoints (timezone, freshness, scheduled hours, on-time grace), `GET /fleet/positions` (`fresh`). The maintenance due-soon window, idle threshold and KPI targets are stored for the analytics reports that come next.
- **`unit_system` (D-0192, frontend ask U1):** `metric` (default — `km`, `L`, `km/L`, the behaviour of every company until it chooses) | `us` (`mi`, US gallons, MPG) | `uk` (`mi`, litres, imperial MPG). It is a **display preference only**: the API keeps storing and returning METRIC everywhere (km, litres, metres, kg, km/h, `_km` / `liters` CSV columns) — the client converts for display and converts typed input back to metric before sending, so the contract stays one stable metric contract. `is_default: true` companies report `metric`.

#### PUT `/fleet/settings`

- **Partial update:** send only what changed; the row is created on the first save. Validation (422): `timezone` must be an IANA name (e.g. `Asia/Karachi`); `position_freshness_minutes` / `idle_threshold_minutes` 1–1440; `scheduled_hours_per_vehicle_per_day` 1–24; `on_time_grace_minutes` 0–1440; `maintenance_due_soon_days` 0–365; `maintenance_due_soon_km` 0–100000; percentage targets 0–100; other targets ≥ 0. A KPI target may be set back to `null`.
- **Optimistic concurrency (D-0176):** optional `expected_updated_at`; a stale value → 409 `{ message, current: { id, updated_at, updated_by, updated_by_user } }` and nothing is written (a company that has never saved is at `updated_at: null`).
- **`unit_system` (D-0192, frontend ask U1):** optional like every other field (`metric` | `us` | `uk`, not nullable); anything else → 422 `The selected unit system is invalid.`. An update that does not send it leaves it as it is; it is covered by `expected_updated_at` / 409 and the audit fields like the rest of the row. Changing it changes nothing in any response value — only what the frontend displays.

#### GET `/fleet/status-summary`

- **Exclusive status counts (D-0184, flow 07 B3)** with the same rules as `GET /fleet/dashboard` → `fleet_status` (moving / idle / parked / offline / no_tracker, summing to `total`; `offline` = a tracker whose latest position is older than the company's `position_freshness_minutes`), for the vehicles in scope (retired / sold vehicles are not in the fleet). `by_category` groups by the vehicle's category as stored (`category: null` = uncategorised); `coverage` = `with_tracker`, `no_tracker`, `tracker_pct`; `active_trips` = in-scope vehicles with a trip in progress. Purely additive.
- **Scope filters (D-0184, flow 07 B0):** `vehicle_category` (case-insensitive), `cost_centre`, `vehicle_id` and `driver_id` (comma list or the `[]` spelling — a driver filter means the vehicle's CURRENT driver), `yard_id` (vehicles currently checked in at that yard). Filters combine (AND); an unknown / foreign id simply matches nothing; a non-numeric id → 422 `The vehicle id must be a list of ids.`

#### GET `/fuel-logs`

- **Company-wide fuel logs (D-0188, flow 07 C3).** ALWAYS paged — `data: { items, pagination }` (`page` 1, `per_page` 20, max 100). Every item is the fuel-log object of `GET /vehicles/{id}/fuel-logs` (same field names, `volume` in its own `unit`) plus `vehicle: { id, name, plate, vehicle_category, lifecycle_status }`. Logs of retired / sold vehicles stay in the list.
- **Filters:** `from` / `to` (inclusive calendar dates on `fill_date`; a reversed range is swapped), `vehicle_id` (comma list or `vehicle_id[]`), `vehicle_category`, `vendor`, `payment_method` (exact, case-insensitive), `trip_id`, `is_full_tank` (`0` | `1` | `true` | `false`), `search` (vendor, station, receipt reference, payment method, vehicle name / plate). `sort_by` = `fill_date` (default, newest first) | `volume` | `total_cost` | `unit_price` | `vendor` | `odometer_km` | `vehicle_name` | `created_at`, `sort_order`; empty values last in both directions, ties by id. **`volume` sorts the stored number, so a list that mixes litres and gallons sorts by the number, not by the litres** (the summary and the CSV convert). There is no anomaly filter yet (it comes with the fuel report, B6).
- **`meta.summary`** covers the WHOLE filtered set: `{ count, liters, total_cost, avg_price_per_liter, logs_with_cost }`. `liters` converts gallons (1 US gal = 3.785411784 L) — the dashboard's own convention; `total_cost` is `total_cost`, else `cost` per log (also the dashboard's convention) over the logs that carry a cost; `avg_price_per_liter` = `total_cost` ÷ the litres of exactly those logs (`null`, never `0`, when no log has a cost). `meta.generated_at`.

#### GET `/fuel-logs/export`

- **CSV (D-0188, C3):** the list's own filters / sort (`page` / `per_page` ignored), every matching log — with a converted `liters` column next to `volume` / `unit`. Up to 50 000 rows, otherwise 422 `Narrow the filter.`

#### PUT `/fuel-logs/{id}`

- **Edit (D-0169):** same fields as the matching `POST`, all optional — send **only what changed**; `null` clears a nullable field; an empty body changes nothing. The record must belong (through its vehicle / driver) to the caller's company — another company's record is a plain 404, like a missing one. Not announced over the realtime socket (log-type records never were).
- `trip_id`, when sent, must be a trip of the same vehicle (422 `The selected trip id is invalid.`).
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### DELETE `/fuel-logs/{id}`

- **Delete (D-0169):** hard delete of the record; 404 when it does not exist (or belongs to another company).
- Fuel-economy figures are computed on read, so they follow.

#### GET `/geofences`

- **Opt-in paging (D-0164):** send `page` and/or `per_page` (default 20, max 100) and `data` becomes `{ items, pagination: { page, per_page, total, total_pages } }` (`total` counts the rows after search/filters); send neither and `data` is the flat array, as before. `search` is a case-insensitive contains match, `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`), `sort_order` is `asc`/`desc`; rows that tie on the sort column are ordered by id, so paging never duplicates or drops a row.
- `search` matches the name. `linked=1` = linked to a yard, `0` = a manual geofence; `yard_id`, `is_active`, `alert_on` filter as named. Default order: newest first.
- **Sorting (D-0167):** an explicit `sort_by` puts rows with an empty (NULL) value **last in both directions**; a list called without `sort_by` keeps its default order.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Map viewport (D-0180, B8):** `bbox=minLng,minLat,maxLng,maxLat` (degrees, GeoJSON order) keeps only geofences whose **circle overlaps** the box — a big geofence whose centre is just off-screen still matches. Malformed, out-of-range or reversed (`min` above `max`, so also a box crossing the antimeridian) → 422 `The bbox must be four numbers: minLng,minLat,maxLng,maxLat (longitude -180..180, latitude -90..90, min not above max).` Combines with every other filter, sort and paging; `total` counts the matches. Additive — without `bbox` nothing changes.

#### POST `/geofences`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/geofences/bulk-delete`

- Same contract as `POST /geofences/bulk-enable`; deletes each geofence (its events cascade), as `DELETE /geofences/{id}` does.
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).

#### POST `/geofences/bulk-disable`

- Same contract as `POST /geofences/bulk-enable`; sets `is_active` to false.
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).

#### POST `/geofences/bulk-enable`

- **Bulk contract (D-0166):** body is **either** `{ ids: [...] }` **or** `{ filter: {...} }` (exactly one, else 422 `Provide either ids or filter (exactly one).`). At most **500** records per request (more ids → 422 `You can act on at most 500 records per request.`; a filter that matches more than 500 → 422 `The filter matches N records; the limit is 500 per request. Narrow the filter.`). `filter` takes the same parameters as the matching list (no paging/sort; flags may be JSON booleans, 0/1 or their string spellings). Each record is run, one after another, through the **same single-record action** (identical guards, messages and `fleet:changed` events), so partial success is normal: the response is always **HTTP 200** with `data.results` = one `{ id, ok, changed, label, message }` per record (a refusal or a 404 is `ok: false` with that message; `changed` and `label`: see D-0171 below) and `data.summary` = `{ mode: "ids"|"filter", matched, processed, succeeded, changed, failed }`. Duplicate ids are processed once; a record another operator changed in between simply reports its own message.
- Sets `is_active` to true on each geofence.
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).

#### GET `/geofences/events`

- `limit` (default 50, max 200) bounds the flat list of newest events. **D-0164:** the geofence's `alert_on` filter now runs *before* `limit`/paging (it used to run after `limit`, so `limit=20` could return fewer than 20 rows and paging was impossible), so a page is full whenever more events exist.
- **Opt-in paging (D-0164):** send `page` and/or `per_page` (default 20, max 100) and `data` becomes `{ items, pagination: { page, per_page, total, total_pages } }` (`total` counts the rows after search/filters); send neither and `data` is the flat array, as before. `search` is a case-insensitive contains match, `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`), `sort_order` is `asc`/`desc`; rows that tie on the sort column are ordered by id, so paging never duplicates or drops a row. When `page`/`per_page` is sent, `limit` is ignored.
- Filters: `geofence_id`, `vehicle_id`, `trip_id`, `event_type` (`enter`/`exit`), `from`/`to` (inclusive `occurred_at` range, ISO 8601 with an offset or `Z`), `search` (geofence or vehicle name). `sort_by=occurred_at` with `sort_order` (default `desc`, newest first).

#### GET `/geofences/events/export`

- **CSV export (D-0168):** takes the matching list's own `search` / filters / `sort_by` / `sort_order` (`page` / `per_page` are ignored) and streams **every** matching row as `text/csv; charset=utf-8` (UTF-8 BOM so Excel reads non-ASCII text, RFC 4180 rows with CRLF, header row first) with `Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHMMSS.csv"` (UTC) and `X-Export-Row-Count` = the number of data rows. Rows are read in pages of 500 with the list's own id-tie-broken order, so memory stays flat and no row is duplicated or dropped. **At most 50 000 rows:** a larger result is refused **before anything is sent** with HTTP 422 `The export matches N rows; the limit is 50000 per export. Narrow the filter.` (a normal JSON error body). Empty/NULL values are empty cells; dates are ISO 8601 (date-only columns `YYYY-MM-DD`); booleans are `true`/`false`. **Formula injection guard:** a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading apostrophe so a spreadsheet cannot run it. A failure after streaming has started aborts the connection (the download is then incomplete — the row count header lets a client detect it).
- Columns: id, occurred_at, event_type, geofence_id, geofence, yard_id, vehicle_id, vehicle, trip_id. Filters: same as `GET /geofences/events`; each geofence's `alert_on` is applied first, exactly as in the list; `limit` is ignored.

#### GET `/geofences/events/summary`

- **Geofence activity (D-0187, flow 07 B9).** `data.summary` = `{ total, enter, exit, geofences_with_events, vehicles_involved, busiest_bucket }` (`busiest_bucket` = `{ bucket, total }` or `null` when there are no events); `data.series` = one point per bucket `{ bucket, enter, exit, total }`; `data.top_geofences` = `[{ geofence_id, name, yard_id, enter, exit, total }]`, most events first (ties by id). Nothing is stored; computed per request from `geofence_events`.
- **Which events count:** the same visibility rule as `GET /geofences/events` — an event is shown when its geofence's **current** `alert_on` is `both` or equals the event type (an `enter`-only geofence hides its exits and the other way round; changing a geofence's `alert_on` later changes what its history shows). Only the company's own geofences; an id of another company matches nothing.
- **Parameters:** `from` / `to` (calendar dates in the company timezone; default = the last 7 local days, today included), `interval` = `hour` | `day` (default) | `week` | `month` — **`hour` is limited to 168 buckets (7 days)**, other intervals to 92 buckets, otherwise 422 naming the fix; bucket labels are local (`YYYY-MM-DDTHH:00` for hours, local dates otherwise); `geofence_id`, `vehicle_id`, `yard_id` (the geofence's yard) filters; `top` (1–50, default 10). More than **200000** matching events in the range → 422 (`narrow the range or add a filter`). `meta`: `from`, `to`, `timezone`, `interval`, `generated_at`, `definition_version`, `basis`.
- **Known limits:** events exist only where a received packet showed a crossing (KNOWN_ISSUES 11.91 — a crossing entirely between two packets is not detected); `occurred_at` is the packet's receive time.

#### GET `/geofences/export`

- **CSV export (D-0168):** takes the matching list's own `search` / filters / `sort_by` / `sort_order` (`page` / `per_page` are ignored) and streams **every** matching row as `text/csv; charset=utf-8` (UTF-8 BOM so Excel reads non-ASCII text, RFC 4180 rows with CRLF, header row first) with `Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHMMSS.csv"` (UTC) and `X-Export-Row-Count` = the number of data rows. Rows are read in pages of 500 with the list's own id-tie-broken order, so memory stays flat and no row is duplicated or dropped. **At most 50 000 rows:** a larger result is refused **before anything is sent** with HTTP 422 `The export matches N rows; the limit is 50000 per export. Narrow the filter.` (a normal JSON error body). Empty/NULL values are empty cells; dates are ISO 8601 (date-only columns `YYYY-MM-DD`); booleans are `true`/`false`. **Formula injection guard:** a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading apostrophe so a spreadsheet cannot run it. A failure after streaming has started aborts the connection (the download is then incomplete — the row count header lets a client detect it).
- Columns: id, name, yard_id, yard (the yard's name), center_latitude, center_longitude, radius_m, alert_on, is_active, created_at. Filters: same as `GET /geofences`.
- D-0180: also takes `bbox` (see `GET /geofences`) — only the geofences overlapping the map box are exported.

#### GET `/geofences/options`

- **D-0171 — `include_inactive=1`:** by default the options are active records only; with `include_inactive=1` they also offer the deactivated ones, for history-filter dropdowns (a trip or assignment may still refer to a deactivated record). Geofences: disabled geofences are added; a new `is_active` field is on every row. Each option row carries `is_active` so a UI can label deactivated rows.

#### PUT `/geofences/{id}`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### GET `/incidents`

- **Company-wide incident list (D-0179, B7):** every incident of the caller's company (scoped through the driver — `driver_incidents` has no company column), **always paged** (`data: { items, pagination }`, `page` default 1, `per_page` default 20, max 100). Filters: `date_from` / `date_to` (inclusive, on `incident_date`), `severity`, `driver_id`, `vehicle_id` (both may be combined), `search` (type, description); `sort_by` `incident_date` (default, newest first) | `severity` | `created_at` — an explicit sort puts empty values last, ties broken by id; unknown `sort_by` → 422 `The selected sort by is invalid.`. Same incident object as `GET /drivers/{id}/incidents` (driver / vehicle briefs + audit fields). An unknown `driver_id` / `vehicle_id` just gives an empty page.

#### PUT `/incidents/{id}`

- **Edit (D-0169):** same fields as the matching `POST`, all optional — send **only what changed**; `null` clears a nullable field; an empty body changes nothing. The record must belong (through its vehicle / driver) to the caller's company — another company's record is a plain 404, like a missing one. Not announced over the realtime socket (log-type records never were).
- Editable: `incident_type`, `severity`, `incident_date`, `description`, `vehicle_id` (`null` clears it; a vehicle of another company → 422 `The selected vehicle id is invalid.`). The driver is not editable.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Incident names (D-0174):** every incident object also carries `driver` (`{ id, first_name, last_name }` or `null`) and `vehicle` (`{ id, name, plate }` or `null` — no vehicle on the incident, or one that is not the caller's company's). Resolved with one batched lookup per response.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### DELETE `/incidents/{id}`

- **Delete (D-0169):** hard delete of the record; 404 when it does not exist (or belongs to another company).

#### POST `/login`

- `token` and `access_token` are the same JWT.
- `user` is the login-style object: `company`, `roles` (with `permissions`), `companyInfo`, `role_type`, `social_provider` — the frontend routes on `companyInfo`.
- **Deliberate deviation from Laravel (D-0125):** Login token lives 7 days (Laravel: short-lived); `refresh_token` and `POST /refresh` exist but the frontend does not use them.
- **Deliberate deviation from Laravel (D-0102):** `guard_name` and `pivot` are deliberately not emitted on roles/permissions.

#### GET `/maintenance-logs`

- **Company-wide maintenance logs (D-0188, flow 07 C2).** ALWAYS paged — `data: { items, pagination }` (`page` 1, `per_page` 20, max 100). Every item is the maintenance-log object of `GET /vehicles/{id}/maintenance-logs` (same field names) plus `vehicle: { id, name, plate, vehicle_category, lifecycle_status }`. Logs of retired / sold vehicles stay in the list (`lifecycle_status` says so) — it is a history, not a fleet view; the dashboard's maintenance cost counts them too.
- **Filters:** `from` / `to` (inclusive calendar dates on `service_date`; a reversed range is swapped), `vehicle_id` (comma list or `vehicle_id[]=1&vehicle_id[]=2`; a non-numeric id → 422 `The vehicle id must be a list of ids.`; an id of another company matches nothing), `vehicle_category` and `service_type` and `vendor` (exact, case-insensitive), `min_cost` / `max_cost` (a log without a cost matches neither), `search` (service type, vendor, notes, vehicle name / plate). `sort_by` = `service_date` (default, newest first) | `cost` | `service_type` | `vendor` | `odometer_km` | `vehicle_name` | `created_at`, `sort_order`; an explicit sort puts empty values last in both directions, ties by id; unknown `sort_by` → 422 `The selected sort by is invalid.`.
- **`meta.summary`** covers the WHOLE filtered set, not the page: `{ count, total_cost, avg_cost, logs_with_cost }` — `total_cost` is the sum of the logs that have a cost, `avg_cost` = `total_cost` ÷ `logs_with_cost` (`null`, never `0`, when none has a cost). `meta.generated_at`.

#### GET `/maintenance-logs/export`

- **CSV (D-0188, C2):** the list's own filters / sort (`page` / `per_page` ignored), every matching log — id, vehicle id / name / plate, `service_date` (date only), service type, odometer, cost, vendor, notes, schedule id, created at. Up to 50 000 rows, otherwise 422 `Narrow the filter.`

#### PUT `/maintenance-logs/{id}`

- **Edit (D-0169):** same fields as the matching `POST`, all optional — send **only what changed**; `null` clears a nullable field; an empty body changes nothing. The record must belong (through its vehicle / driver) to the caller's company — another company's record is a plain 404, like a missing one. Not announced over the realtime socket (log-type records never were).
- **Schedule rule (owner Q8 "(a)"):** after a log is edited or re-linked (`maintenance_schedule_id` may point to another schedule **of the same vehicle**, else 422 `The selected maintenance schedule id is invalid.`), every schedule it touched (the old and the new one) has its `last_service_date` recomputed from its **newest remaining linked log** (by service date, then id) and its `last_service_odometer_km` from the newest linked log **that recorded an odometer reading**. Creating a log keeps its old behaviour (the schedule takes the new log's date).
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### DELETE `/maintenance-logs/{id}`

- **Delete (D-0169):** hard delete of the record; 404 when it does not exist (or belongs to another company).
- The linked schedule's `last_service_date` / `last_service_odometer_km` are recomputed from its newest remaining linked log (same rule as editing); when **no** log remains the schedule keeps its current values (the original baseline cannot be recovered once overwritten).

#### GET `/maintenance-schedules`

- **Company-wide schedules with COMPUTED due state (D-0184, flow 07 C1).** Always paged (`page` default 1, `per_page` default 20, max 100): `data: { items, pagination }`. Each item = the schedule + `vehicle { id, name, plate, vehicle_category, odometer_km }` + `next_due_date`, `next_due_odometer_km`, `days_until_due` (whole days, negative when overdue), `km_until_due` (negative when overdue; `null` without an odometer reading), `status` (`overdue | due_soon | ok | unknown`), `due_by` (`date | odometer` — the limit that decided an overdue / due_soon status) and the audit fields.
- **How the due state is computed (nothing is guessed):** a schedule counts from its last service — or, never serviced, from the operator's baseline (`odometer_baseline_date` / `odometer_baseline_km`): `next_due_date = base date + interval_days`, `next_due_odometer_km = base odometer + interval_km`. `overdue` = the due date strictly passed or the vehicle's odometer is at / past the due odometer; `due_soon` = within the company's window (`maintenance_due_soon_days` default 7, `maintenance_due_soon_km` default 500, from `GET /fleet/settings`); the worse limit wins; `unknown` = nothing computable (no interval or no base).
- **Filters / sort:** `status` (comma list or `status[]`), `vehicle_id`, `service_type` (exact, case-insensitive), `vehicle_category`, `due_before` (date), `search` (service type, vehicle name / plate), `include_inactive=1` (schedules of retired / sold vehicles are left out by default); `sort_by` `next_due_date` (default) | `status` (worst first) | `vehicle_name` | `service_type` | `last_service_date` | `days_until_due` | `km_until_due`, `sort_order`; empty values last in both directions. **`meta.counts`** = `{ total, overdue, due_soon, ok, unknown }` of the filtered set WITHOUT the `status` filter (a chip never zeroes the others), plus `due_soon_days`, `due_soon_km`. Purely additive — the per-vehicle schedule endpoints are unchanged.

#### GET `/maintenance-schedules/export`

- **CSV (D-0184, C1):** the list's own filters / sort (`page` / `per_page` ignored), every matching schedule with its computed due state.

#### PUT `/maintenance-schedules/{id}`

- **Edit (D-0169):** same fields as the matching `POST`, all optional — send **only what changed**; `null` clears a nullable field; an empty body changes nothing. The record must belong (through its vehicle / driver) to the caller's company — another company's record is a plain 404, like a missing one. Not announced over the realtime socket (log-type records never were).
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### DELETE `/maintenance-schedules/{id}`

- **Delete (D-0169):** hard delete of the record; 404 when it does not exist (or belongs to another company).
- The schedule's maintenance logs are **kept as history and unlinked** (`maintenance_schedule_id` becomes null) — the foreign key would otherwise refuse the delete. Response `Maintenance schedule deleted. Its maintenance logs were kept.`

#### GET `/product-settings/{id}`

- `is_selected` is integer `1`/`0` (only `is_unique_identifier` is boolean).
- No company check: any admin can read another company's settings and ingestion token (KNOWN_ISSUES 11.63 — same on Laravel; the user decides whether to close it).

#### GET `/products`

- `page` is **offset-style**, not a page number: the page served is `floor(page / per_page) + 1` (`page=0` and `page=1` with `per_page=10` both give page 1; `page=10` gives page 2). Mirrors Laravel; do not "fix" client-side.
- `data` is the full Laravel paginator plus a top-level `filters` echo.
- With a `user_id` filter that matches nothing the response is HTTP 200 `{ success:false, message:"No products found for the specified user.", filters }` with no `data` key.

#### POST `/products`

- `device_protocol_id`, `existing_product_id`, `preconfigure_template_id` accept `null` (= not chosen); a non-existent id is 422 with Laravel's literal message.

#### GET `/products/{product}`

- Devices under the product; `page` is 1-based here (unlike `GET /products`). Each device carries `type`, timestamps, `last_updated`, `latest_device_value` and the owner `user`; `created_at` is `Y-m-d H:i:s` in the owner's timezone.

#### GET `/profile`

- Raw user columns + `company` relation; Cashier billing columns (`stripe_id`, `pm_type`, `pm_last_four`, `trial_ends_at`) are deliberately excluded.

#### GET `/protocols`

- **Deliberate deviation from Laravel (D-0135):** Catalog reduced to `HTTPS` (id 1) and `MQTT` (id 2); Laravel had six rows.

#### POST `/register`

- Sends the branded verification e-mail (SMTP).
- Response carries an extra `refresh_token` and a leaner `user` than Laravel (payload-only comparison rule).

#### POST `/rules/store`

- Free-form `emailData`/`smsData`/`notificationData`; `selectedProduct` may be a number; `executionInterval` may be a numeric string; nested `""` become `null`.

#### PUT `/rules/{id}`

- Same lenient payload as `POST /rules/store`.

#### POST `/store-product-settings`

- `preference_toggle` values may be integers (`{"826":1}`); extra keys (`attributes`, `token`, `user_preferences`) are ignored. All checks run before any write.

#### GET `/trips`

- Always paged (Laravel paginator envelope, `page` default 1, `per_page` default 20, max 100) — unchanged. D-0164 adds `search` (reference, origin/destination address, purpose, vehicle name/plate, driver name), `sort_by` (`planned_start_at`, `created_at`, `status`, `trip_reference`) + `sort_order` (default: newest created first), and a multi-value `status` (`status=planned,in_progress` or `status[]=planned&status[]=in_progress`; each value must be `planned`, `in_progress`, `completed` or `cancelled`, otherwise 422 `The selected status is invalid.`).
- `date_from` / `date_to` compare against the trip's `actual_start_at` OR `planned_start_at` (a trip matches when either is inside the range); trips with neither are excluded once a date bound is given. They do not use `created_at`.
- **Sorting (D-0167):** an explicit `sort_by` puts rows with an empty (NULL) value **last in both directions**; a list called without `sort_by` keeps its default order.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/trips`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Stops (D-0175, B5):** each `planned_yards[]` entry also accepts `notes`; the same two new checks as the edit apply — a stop's departure can't be before its arrival (`planned_yards.N.planned_departure_at`) and at most 100 stops (`planned_yards`).

#### POST `/trips/bulk-delete`

- **Bulk contract (D-0166):** body is **either** `{ ids: [...] }` **or** `{ filter: {...} }` (exactly one, else 422 `Provide either ids or filter (exactly one).`). At most **500** records per request (more ids → 422 `You can act on at most 500 records per request.`; a filter that matches more than 500 → 422 `The filter matches N records; the limit is 500 per request. Narrow the filter.`). `filter` takes the same parameters as the matching list (no paging/sort; flags may be JSON booleans, 0/1 or their string spellings). Each record is run, one after another, through the **same single-record action** (identical guards, messages and `fleet:changed` events), so partial success is normal: the response is always **HTTP 200** with `data.results` = one `{ id, ok, changed, label, message }` per record (a refusal or a 404 is `ok: false` with that message; `changed` and `label`: see D-0171 below) and `data.summary` = `{ mode: "ids"|"filter", matched, processed, succeeded, changed, failed }`. Duplicate ids are processed once; a record another operator changed in between simply reports its own message.
- Only `planned` trips can be deleted — every other trip in the batch is refused per record with `Only planned trips can be deleted.` (a filter with no `status` therefore reports the non-planned matches as failures; send `status: ["planned"]` to target only deletable trips). Each deleted trip emits its `trip:update` `deleted` event.
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).

#### GET `/trips/counts`

- **Status counts (D-0179, B7):** for filter chips. Takes the trip list's own filters and `search` (`vehicle_id`, `driver_id`, `customer_id`, `date_from`, `date_to` — the date filters match `actual_start_at` OR `planned_start_at`, as on the list) but **never** its `status` / `include_inactive` / paging / sort, so choosing one chip does not zero the others. Response `data: { total, by_status: { planned, in_progress, completed, cancelled } }` — every status is always present (`0` when nothing has it) and `total` is their sum. Company-scoped. Additive; the list endpoints are unchanged.

#### GET `/trips/export`

- **CSV export (D-0168):** takes the matching list's own `search` / filters / `sort_by` / `sort_order` (`page` / `per_page` are ignored) and streams **every** matching row as `text/csv; charset=utf-8` (UTF-8 BOM so Excel reads non-ASCII text, RFC 4180 rows with CRLF, header row first) with `Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHMMSS.csv"` (UTC) and `X-Export-Row-Count` = the number of data rows. Rows are read in pages of 500 with the list's own id-tie-broken order, so memory stays flat and no row is duplicated or dropped. **At most 50 000 rows:** a larger result is refused **before anything is sent** with HTTP 422 `The export matches N rows; the limit is 50000 per export. Narrow the filter.` (a normal JSON error body). Empty/NULL values are empty cells; dates are ISO 8601 (date-only columns `YYYY-MM-DD`); booleans are `true`/`false`. **Formula injection guard:** a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading apostrophe so a spreadsheet cannot run it. A failure after streaming has started aborts the connection (the download is then incomplete — the row count header lets a client detect it).
- Columns: id, trip_reference, status, purpose, vehicle_id, vehicle, driver_id, driver, origin_address, origin_latitude, origin_longitude, destination_address, destination_latitude, destination_longitude, planned_start_at, planned_end_at, actual_start_at, actual_end_at, destination_reached_at, planned_distance_km, actual_distance_km, actual_duration_minutes, odometer_start_km, odometer_end_km, fuel_used_liters, cancellation_reason, notes, created_at. Filters: same as `GET /trips` (`status` as a list, `search`, dates, …).

#### GET `/trips/{id}`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### PUT `/trips/{id}`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Stop editing (D-0175, B5):** the body may carry `planned_yards` — the trip's stop list, replaced as a whole, **only while the trip is `planned`** (otherwise 422 `Stops can only be edited while the trip is planned.`; the other fields can still be edited on an `in_progress` trip). Each entry is `{ id?, yard_id, stop_purpose?, planned_arrival_at?, planned_departure_at?, notes? }`: an entry **with `id`** keeps that stop (a field left out keeps its value, `null` clears it), an entry **without `id`** creates a stop, a stop not listed is deleted; the order sent becomes `sequence` 1..n. Omitting `planned_yards` leaves the stops unchanged, `[]` removes them all. One transaction — all or nothing. Rules (also applied to `POST /trips`): every `yard_id` must be one of the caller's yards (422 `planned_yards.N.yard_id` `The selected yard id is invalid.`), a stop's departure can't be before its arrival (`planned_yards.N.planned_departure_at`), at most 100 stops (`planned_yards`), and an `id` must be a stop of this trip and appear once (`planned_yards.N.id`). NOT checked: stop times against the trip's window or each other, order, repeated yards. The response now also carries `planned_yards` (the stops after the edit). Every successful `PUT` emits `trip:update` with `reason: "updated"`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### POST `/trips/{id}/cancel`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/trips/{id}/complete`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/trips/{id}/start`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### GET `/vehicles`

- **Opt-in paging (D-0164):** send `page` and/or `per_page` (default 20, max 100) and `data` becomes `{ items, pagination: { page, per_page, total, total_pages } }` (`total` counts the rows after search/filters); send neither and `data` is the flat array, as before. `search` is a case-insensitive contains match, `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`), `sort_order` is `asc`/`desc`; rows that tie on the sort column are ordered by id, so paging never duplicates or drops a row.
- `search` matches name, plate, VIN, make, model, category. `status` (a `lifecycle_status`) wins over `include_inactive`; `has_tracker` / `has_driver` = a tracker is installed / an active driver is assigned (`1`) or not (`0`). Default order: name.
- **Sorting (D-0167):** an explicit `sort_by` puts rows with an empty (NULL) value **last in both directions**; a list called without `sort_by` keeps its default order.
- D-0167: `sort_by=year` is available, and `vehicle_category` is matched **case-insensitively** (`Van` = `van`); the distinct categories in use are served by `GET /fleet/options` → `vehicle_categories`.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/vehicles`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/vehicles/bulk-deactivate`

- **Bulk contract (D-0166):** body is **either** `{ ids: [...] }` **or** `{ filter: {...} }` (exactly one, else 422 `Provide either ids or filter (exactly one).`). At most **500** records per request (more ids → 422 `You can act on at most 500 records per request.`; a filter that matches more than 500 → 422 `The filter matches N records; the limit is 500 per request. Narrow the filter.`). `filter` takes the same parameters as the matching list (no paging/sort; flags may be JSON booleans, 0/1 or their string spellings). Each record is run, one after another, through the **same single-record action** (identical guards, messages and `fleet:changed` events), so partial success is normal: the response is always **HTTP 200** with `data.results` = one `{ id, ok, changed, label, message }` per record (a refusal or a 404 is `ok: false` with that message; `changed` and `label`: see D-0171 below) and `data.summary` = `{ mode: "ids"|"filter", matched, processed, succeeded, changed, failed }`. Duplicate ids are processed once; a record another operator changed in between simply reports its own message.
- Per-record guards are the single action's: `This vehicle has a trip in progress. Complete or cancel it first.`, `Unassign this vehicle's driver and tracker before deactivating it.`. In filter mode `include_inactive` defaults to `false` (an explicit `status` always wins).
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).
- D-0182 (L4): each vehicle goes through the same guards, so two new per-record refusals appear in `results[].message`: `Check this vehicle out of its yard before deactivating it.` and `This vehicle has planned trips. Cancel or delete them before deactivating it.`

#### POST `/vehicles/bulk-delete`

- **Bulk hard delete (D-0178, C14):** `{ ids }` XOR `{ filter }` (the vehicle list's own filters), ≤ 500 per request, one after another through the single-record delete — so each record is deleted or refused with its own message (`ok: false`, the reason above). In filter mode `include_inactive` defaults to **true** (a never-used vehicle may already be deactivated). Response as for the other bulk actions (always 200, per-record `{ id, ok, changed, label, message }` + `summary`); a deleted record is `changed: true`.

#### POST `/vehicles/bulk-reactivate`

- Same contract as `POST /vehicles/bulk-deactivate`. In filter mode `include_inactive` defaults to `true` (reactivate only makes sense for inactive vehicles; an explicit `status` wins).
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).

#### GET `/vehicles/counts`

- **Status counts (D-0179, B7):** for filter chips. Takes the vehicle list's own filters and `search` (`vehicle_category`, `fuel_type`, `ownership_type`, `has_tracker`, `has_driver`) but **never** its `status` / `include_inactive` / paging / sort, so choosing one chip does not zero the others. Response `data: { total, by_status: { active, in_maintenance, retired, sold } }` — every status is always present (`0` when nothing has it) and `total` is their sum. Company-scoped. Additive; the list endpoints are unchanged.

#### GET `/vehicles/export`

- **CSV export (D-0168):** takes the matching list's own `search` / filters / `sort_by` / `sort_order` (`page` / `per_page` are ignored) and streams **every** matching row as `text/csv; charset=utf-8` (UTF-8 BOM so Excel reads non-ASCII text, RFC 4180 rows with CRLF, header row first) with `Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHMMSS.csv"` (UTC) and `X-Export-Row-Count` = the number of data rows. Rows are read in pages of 500 with the list's own id-tie-broken order, so memory stays flat and no row is duplicated or dropped. **At most 50 000 rows:** a larger result is refused **before anything is sent** with HTTP 422 `The export matches N rows; the limit is 50000 per export. Narrow the filter.` (a normal JSON error body). Empty/NULL values are empty cells; dates are ISO 8601 (date-only columns `YYYY-MM-DD`); booleans are `true`/`false`. **Formula injection guard:** a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading apostrophe so a spreadsheet cannot run it. A failure after streaming has started aborts the connection (the download is then incomplete — the row count header lets a client detect it).
- Columns: id, name, plate, vin, vehicle_category, make, model, year, fuel_type, ownership_type, lifecycle_status, odometer_km, tank_capacity_liters, cost_centre, acquisition_date, acquisition_cost, length_m, width_m, height_m, gross_weight_kg, payload_kg, has_driver, has_tracker, checked_in, created_at. Filters: same as `GET /vehicles` (incl. `include_inactive`, which defaults to false).

#### GET `/vehicles/options`

- **D-0171 — `include_inactive=1`:** by default the options are active records only; with `include_inactive=1` they also offer the deactivated ones, for history-filter dropdowns (a trip or assignment may still refer to a deactivated record). Vehicles: `retired` and `sold` are added (`lifecycle_status` is already on every row). Each option row carries `lifecycle_status` so a UI can label deactivated rows.

#### GET `/vehicles/{id}`

- **Embedded lists (unchanged, kept for compatibility):** `maintenance_logs`, `fuel_logs` and `yard_history` hold only the latest 20 rows, `maintenance_schedules` is complete (a handful per vehicle), and `driver_assignment_history` is the vehicle's **whole** assignment history — for long-lived vehicles prefer the paged `GET /vehicles/{id}/assignment-history`, `/maintenance-logs`, `/fuel-logs`, `/yard-history` and `/incidents` (D-0170).
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **`driver_assignment_history` is capped (D-0182, L6):** the newest **20** assignments (newest first), like the other embedded lists. The full history is the paged `GET /vehicles/{id}/assignment-history`.

#### PUT `/vehicles/{id}`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### DELETE `/vehicles/{id}`

- **Guarded hard delete (D-0178, C14):** a real delete, allowed ONLY for a vehicle that was never used — active or deactivated alike. It is refused with 422 `This vehicle can't be deleted because it has <what is in the way>. Deactivate it instead.` when any of these still reference it: trips, driver assignments, tracker assignments, fuel logs, maintenance logs, maintenance schedules, incidents, geofence events, yard check-ins, compliance documents. Its stored photo is removed with it. An unknown / other company's vehicle is a 404. Announces `fleet:changed` with `action: "deleted"`. There is no `expected_updated_at` on deletes.

#### GET `/vehicles/{id}/assignment-history`

- `include_active` (string): the default includes open assignments; `include_active=0` returns only closed (historical) ones. `duration_days` is `floor` of whole days and `null` while open.

#### POST `/vehicles/{id}/deactivate`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Refusals (D-0182, L4):** besides a trip in progress and an assigned driver / tracker, deactivating is now also refused (422) while the vehicle is **checked in at a yard slot** — `Check this vehicle out of its yard before deactivating it.` — or has **planned trips** — `This vehicle has planned trips. Cancel or delete them before deactivating it.` (checked in that order, after the older guards).

#### GET `/vehicles/{id}/fuel-logs`

- **Paged detail sub-list (D-0170, B9):** **always** paged (unlike the opt-in lists) — `data` is `{ items, pagination: { page, per_page, total, total_pages } }`, `page` default 1, `per_page` default 20, max 100; `total` counts the rows after the filters. `search` is a case-insensitive contains match; `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`) and rows that tie are ordered by id so paging never duplicates or drops a row; an explicit `sort_by` puts empty (NULL) values last in both directions. The record shape is exactly the one embedded in the detail response. A vehicle / driver that is not in the caller's company is a plain 404 (`Vehicle not found.` / `Driver not found.`). `date_from` / `date_to` are inclusive bounds (a date or an ISO 8601 date-time; an invalid value → 422).
- Range column: `fill_date`. Also filters `trip_id`; `search` matches vendor, station name and receipt reference. `GET /vehicles/{id}` still embeds only the latest 20; `fuel_economy` there is computed over the vehicle's whole history.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/vehicles/{id}/image`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### DELETE `/vehicles/{id}/image`

- **D-0169 (B4):** removes the stored image file and clears `image_path`; **idempotent** — 200 even when the vehicle has no image. Announces `fleet:changed` (`vehicle` `updated`). Adding or replacing an image is still `POST /vehicles/{id}/image`.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### GET `/vehicles/{id}/incidents`

- **Paged detail sub-list (D-0170, B9):** **always** paged (unlike the opt-in lists) — `data` is `{ items, pagination: { page, per_page, total, total_pages } }`, `page` default 1, `per_page` default 20, max 100; `total` counts the rows after the filters. `search` is a case-insensitive contains match; `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`) and rows that tie are ordered by id so paging never duplicates or drops a row; an explicit `sort_by` puts empty (NULL) values last in both directions. The record shape is exactly the one embedded in the detail response. A vehicle / driver that is not in the caller's company is a plain 404 (`Vehicle not found.` / `Driver not found.`). `date_from` / `date_to` are inclusive bounds (a date or an ISO 8601 date-time; an invalid value → 422).
- Incidents whose `vehicle_id` is this vehicle. Range column: `incident_date`; `severity` filter; `driver_id` limits to one driver; `search` matches incident type and description.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Incident names (D-0174):** every incident object also carries `driver` (`{ id, first_name, last_name }` or `null`) and `vehicle` (`{ id, name, plate }` or `null` — no vehicle on the incident, or one that is not the caller's company's). Resolved with one batched lookup per response.

#### GET `/vehicles/{id}/maintenance-logs`

- **Paged detail sub-list (D-0170, B9):** **always** paged (unlike the opt-in lists) — `data` is `{ items, pagination: { page, per_page, total, total_pages } }`, `page` default 1, `per_page` default 20, max 100; `total` counts the rows after the filters. `search` is a case-insensitive contains match; `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`) and rows that tie are ordered by id so paging never duplicates or drops a row; an explicit `sort_by` puts empty (NULL) values last in both directions. The record shape is exactly the one embedded in the detail response. A vehicle / driver that is not in the caller's company is a plain 404 (`Vehicle not found.` / `Driver not found.`). `date_from` / `date_to` are inclusive bounds (a date or an ISO 8601 date-time; an invalid value → 422).
- Range column: `service_date`. Also filters `maintenance_schedule_id`; `search` matches service type, vendor and notes. `GET /vehicles/{id}` still embeds only the latest 20 (compatibility) — use this endpoint for the full history.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/vehicles/{id}/reactivate`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### GET `/vehicles/{id}/yard-history`

- **Paged detail sub-list (D-0170, B9):** **always** paged (unlike the opt-in lists) — `data` is `{ items, pagination: { page, per_page, total, total_pages } }`, `page` default 1, `per_page` default 20, max 100; `total` counts the rows after the filters. `search` is a case-insensitive contains match; `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`) and rows that tie are ordered by id so paging never duplicates or drops a row; an explicit `sort_by` puts empty (NULL) values last in both directions. The record shape is exactly the one embedded in the detail response. A vehicle / driver that is not in the caller's company is a plain 404 (`Vehicle not found.` / `Driver not found.`). `date_from` / `date_to` are inclusive bounds (a date or an ISO 8601 date-time; an invalid value → 422).
- Range column: `checked_in_at`. `yard_id` limits to one yard; `open=1` = the stay the vehicle is in right now (no check-out), `open=0` = finished stays; `search` matches the yard name and slot number. `GET /vehicles/{id}` still embeds only the latest 20.

#### POST `/vehicles/{vehicleId}/fuel-logs`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/vehicles/{vehicleId}/maintenance-logs`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/vehicles/{vehicleId}/maintenance-schedules`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/webhook`

- Ingestion for HTTPS devices. The `token` header is a Node-format ingestion token (`{iv,data,tag}`); Laravel-format tokens (`{data,hash}`) are rejected with 401 — devices need new tokens after cutover.
- The first packet for a fresh token is stored as the initial packet and answered `201 Initial Packet reacived` (sic — Laravel's literal).
- Identical payloads inside a short window are de-duplicated (KNOWN_ISSUES 11.31; Laravel never did).

#### PUT `/yard-slots/{slotId}`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### DELETE `/yard-slots/{slotId}`

- **D-0169 (B4):** refused with 422 `This slot has a vehicle checked in. Check it out first.` while a vehicle is checked in, and — a deliberately conservative default, because deleting a slot would also erase its check-in/out history — with 422 `This slot has check-in history and can't be deleted.` when it has any history at all. Otherwise 200 `Slot deleted.` and `fleet:changed` (`yard_slot` `deleted`).

#### POST `/yard-slots/{slotId}/check-in`

- **Realtime (D-0182, L3):** a successful check-in announces `fleet:changed { entity: "yard_slot", id: <slot id>, action: "checked_in" }` (new `action` value; a refused check-in announces nothing).

#### POST `/yard-slots/{slotId}/check-out`

- **Realtime (D-0182, L3):** a successful check-out announces `fleet:changed { entity: "yard_slot", id: <slot id>, action: "checked_out" }` (new `action` value).

#### GET `/yards`

- **Opt-in paging (D-0164):** send `page` and/or `per_page` (default 20, max 100) and `data` becomes `{ items, pagination: { page, per_page, total, total_pages } }` (`total` counts the rows after search/filters); send neither and `data` is the flat array, as before. `search` is a case-insensitive contains match, `sort_by` is limited to the listed columns (anything else → 422 `The selected sort by is invalid.`), `sort_order` is `asc`/`desc`; rows that tie on the sort column are ordered by id, so paging never duplicates or drops a row.
- `search` matches name and address. `has_coordinates` / `has_layout` = the yard has (`1`) / lacks (`0`) coordinates or an uploaded layout image; `sort_by=slots_count` orders by the yard's number of slots. Default order: newest first.
- **Sorting (D-0167):** an explicit `sort_by` puts rows with an empty (NULL) value **last in both directions**; a list called without `sort_by` keeps its default order.
- D-0167: `is_active=1` (active only) / `0` (deactivated only) — when given it wins over `include_inactive`; `has_slots=1|0`; `min_slots=N` (at least N slots); `sort_by=radius_m` orders by the radius of the yard's earliest linked geofence — yards with no linked geofence come last in both directions.
- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Map viewport (D-0180, B8):** `bbox=minLng,minLat,maxLng,maxLat` (degrees, GeoJSON order) keeps only yards whose **circle overlaps** the box — a yard's radius is its earliest linked geofence's; a yard without one is a point (its centre must be inside); yards without coordinates never match. Malformed, out-of-range or reversed (`min` above `max`, so also a box crossing the antimeridian) → 422 `The bbox must be four numbers: minLng,minLat,maxLng,maxLat (longitude -180..180, latitude -90..90, min not above max).` Combines with every other filter, sort and paging; `total` counts the matches. Additive — without `bbox` nothing changes.

#### POST `/yards`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### POST `/yards/bulk-deactivate`

- **Bulk contract (D-0166):** body is **either** `{ ids: [...] }` **or** `{ filter: {...} }` (exactly one, else 422 `Provide either ids or filter (exactly one).`). At most **500** records per request (more ids → 422 `You can act on at most 500 records per request.`; a filter that matches more than 500 → 422 `The filter matches N records; the limit is 500 per request. Narrow the filter.`). `filter` takes the same parameters as the matching list (no paging/sort; flags may be JSON booleans, 0/1 or their string spellings). Each record is run, one after another, through the **same single-record action** (identical guards, messages and `fleet:changed` events), so partial success is normal: the response is always **HTTP 200** with `data.results` = one `{ id, ok, changed, label, message }` per record (a refusal or a 404 is `ok: false` with that message; `changed` and `label`: see D-0171 below) and `data.summary` = `{ mode: "ids"|"filter", matched, processed, succeeded, changed, failed }`. Duplicate ids are processed once; a record another operator changed in between simply reports its own message.
- Per-record guard: `Check out all vehicles from this yard before deactivating it.`. In filter mode `include_inactive` defaults to `false`.
- D-0167: the `filter` also accepts `is_active`, `has_slots` and `min_slots` (see `GET /yards`).
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).
- D-0182 (L5): the linked geofence(s) of every yard that is deactivated are switched off too (see `POST /yards/{id}/deactivate`).

#### POST `/yards/bulk-delete`

- **Bulk hard delete (D-0178, C14):** `{ ids }` XOR `{ filter }` (the yard list's own filters), ≤ 500 per request, one after another through the single-record delete — so each record is deleted or refused with its own message (`ok: false`, the reason above). In filter mode `include_inactive` defaults to **true** (a never-used yard may already be deactivated). Response as for the other bulk actions (always 200, per-record `{ id, ok, changed, label, message }` + `summary`); a deleted record is `changed: true`.

#### POST `/yards/bulk-reactivate`

- Same contract as `POST /yards/bulk-deactivate`. In filter mode `include_inactive` defaults to `true`.
- D-0167: the `filter` also accepts `is_active`, `has_slots` and `min_slots` (see `GET /yards`).
- **D-0171 — `changed` and `label` on every result:** `label` is a human-readable name for the record (vehicle name, driver "first last", yard / geofence name, trip reference; `null` when the record does not exist or has no name), resolved for refusals and unknown ids too. `changed` is `true` when the action really changed the record and `false` when nothing was done — for every refusal, and for a record **already in the target state** (deactivating an already-deactivated vehicle/driver/yard, reactivating an already-active one, enabling/disabling a geofence already so): such a record is **not written and emits no realtime event**, its result is `ok: true, changed: false` with the message `Vehicle is already deactivated.` / `Vehicle is already active.` (likewise driver / yard) / `Geofence is already enabled.` / `Geofence is already disabled.`, and it counts in `succeeded` but not in `summary.changed`. A vehicle with lifecycle status `sold` counts as already deactivated (it is no longer turned into `retired`).

#### GET `/yards/export`

- **CSV export (D-0168):** takes the matching list's own `search` / filters / `sort_by` / `sort_order` (`page` / `per_page` are ignored) and streams **every** matching row as `text/csv; charset=utf-8` (UTF-8 BOM so Excel reads non-ASCII text, RFC 4180 rows with CRLF, header row first) with `Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHMMSS.csv"` (UTC) and `X-Export-Row-Count` = the number of data rows. Rows are read in pages of 500 with the list's own id-tie-broken order, so memory stays flat and no row is duplicated or dropped. **At most 50 000 rows:** a larger result is refused **before anything is sent** with HTTP 422 `The export matches N rows; the limit is 50000 per export. Narrow the filter.` (a normal JSON error body). Empty/NULL values are empty cells; dates are ISO 8601 (date-only columns `YYYY-MM-DD`); booleans are `true`/`false`. **Formula injection guard:** a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading apostrophe so a spreadsheet cannot run it. A failure after streaming has started aborts the connection (the download is then incomplete — the row count header lets a client detect it).
- Columns: id, name, address, latitude, longitude, radius_m (of the earliest linked geofence), slots_count, is_active, created_at. Filters: same as `GET /yards`.
- D-0180: also takes `bbox` (see `GET /yards`) — only the yards overlapping the map box are exported.

#### GET `/yards/options`

- **D-0171 — `include_inactive=1`:** by default the options are active records only; with `include_inactive=1` they also offer the deactivated ones, for history-filter dropdowns (a trip or assignment may still refer to a deactivated record). Yards: deactivated yards are added; a new `is_active` field is on every row. Each option row carries `is_active` so a UI can label deactivated rows.

#### GET `/yards/{id}`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

#### PUT `/yards/{id}`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Optimistic concurrency (D-0176, B13):** the body may carry `expected_updated_at` — the `updated_at` the client last saw for this record (ISO 8601, or `null` if it saw none). **Opt-in:** without the field the edit behaves exactly as before. If the record changed since (compared at whole seconds — the column has no sub-second precision), the request is refused with **409** `{ success: false, message: "This record was changed by someone else. Reload it and try again.", current: { id, updated_at, updated_by, updated_by_user } }` (`updated_by` `null` = an automatic change, e.g. a sensor) and **nothing is written**; refetch the record and retry. The check runs just before the write (no database lock), so it catches an edit form left open, not a same-instant collision. An unknown / other company's record is still 404.

#### DELETE `/yards/{id}`

- **Guarded hard delete (D-0178, C14):** a real delete, allowed ONLY for a yard that was never used — active or deactivated alike. It is refused with 422 `This yard can't be deleted because it has <what is in the way>. Deactivate it instead.` when any of these still reference it: trip stops, any slot with check-in / out history (so no vehicle in it), geofence events on its linked geofence. Its (empty) slots, layout image and linked geofence are removed with it. An unknown / other company's yard is a 404. Announces `fleet:changed` with `action: "deleted"`. There is no `expected_updated_at` on deletes.

#### POST `/yards/{id}/deactivate`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Linked geofence follows the yard (D-0182, L5):** every geofence linked to the yard is switched off with it (`is_active: false`) — an out-of-service yard no longer produces enter / exit events or fills trip stops — and switched on again by `POST /yards/{id}/reactivate`. Each geofence that flipped is announced as `fleet:changed` `geofence` `updated`.

#### POST `/yards/{id}/reactivate`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.
- **Linked geofence follows the yard (D-0182, L5):** every geofence linked to the yard is switched off with it (`is_active: false`) — an out-of-service yard no longer produces enter / exit events or fills trip stops — and switched on again by `POST /yards/{id}/reactivate`. Each geofence that flipped is announced as `fleet:changed` `geofence` `updated`.

#### POST `/yards/{yardId}/layout`

- **Replace already works:** uploading again replaces the existing layout (200 `Layout replaced.`; 201 `Layout uploaded.` when there was none) and deletes the old file. The slots keep their relative positions (`position_x` / `position_y` are fractions of the image, not pixels).

#### DELETE `/yards/{yardId}/layout`

- **D-0169 (B4):** removes the layout image (stored file + row); the slots stay with their relative positions; **idempotent** — 200 `Layout removed.` even when there is no layout. Announces `fleet:changed` (`yard` `updated`).

#### POST `/yards/{yardId}/slots`

- **Audit fields (D-0172, B6):** every record object in the response carries `created_by` and `updated_by` (user id strings, or `null`) plus `created_by_user` and `updated_by_user` (`{ id, first_name, last_name }` or `null`). `null` means *unknown* (the record was created before the audit columns existed) or — for `updated_by` — *automatic* (the last change came from a sensor or a worker, shown as "System"). On maintenance logs, fuel logs and incidents `created_by` is the existing `logged_by`.

<!-- END GENERATED: endpoint-index -->
