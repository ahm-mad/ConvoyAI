# Packet history table — device-scoped, live, configured-attribute columns

**Written:** 2026-09-22 · **By:** frontend · **Verification:** read-from-code + contract only — **NOT yet
live-tested** (per the owner's two-phase workflow: frontend builds against this spec first; backend
confirms/corrects the open questions below; only then does live browser testing happen).
**Source:** `src/screens/ManageDevice.tsx` (History tab, `/products/{id}/history`).

## What changed (owner request, 2026-09-22)

The packet-history table was API-only (no live updates) and showed one row per packet across **all**
devices of the product, with a raw `Payload` column. New behavior:

1. **Live.** A new packet for this product should appear without a manual refresh.
2. **Device-scoped**, with a dropdown to switch which device's packets are shown (was: no device
   filtering at all).
3. **New columns:** Device Unique Identifier, Product, Status, one column per **attribute the user
   configured** for this product (via "Configure Attribute" — `user_preference_attributes` from
   `GET /product-settings/{id}`), then Actions.
4. **No more raw Payload column** — replaced by an Actions → "View Details" control that expands the row
   into a formatted, collapsible key/value view of the full packet.

## How the frontend implemented "live" (no new backend work needed for this part)

Binds the existing `device:value` Socket.IO event (api_contract §4.2), filters on `data.productId ===`
this page's product id, and — on a match — triggers a debounced refetch of
`GET /dashboard/packet-history` (not a manual merge of `cleanedPacket` into the table — safer, and the
refetched row is guaranteed to have the exact same shape as every other row). This needs nothing further
from the backend; noted here only so the backend session knows this event now has a real consumer.

## Open questions for the backend to confirm/correct

The OpenAPI schema for `GET /dashboard/packet-history` (`api_contract/openapi/dashboards.yaml`) documents
these fields but not their exact semantics in every case. Frontend has picked the assumption in **bold**
for each and coded against it — please confirm or correct in this file (edit the row directly, or add a
note under it) before the owner brings this folder back for live testing.

1. **`device_id` query param** (`type: string, maxLength: 255`) — filters packet history to one device.
   **Assumed: this is the device's `device_unique_identifier`** (the same string the user typed in the
   onboarding multi-step form, e.g. `"f7c4"` — see `01-product-onboarding.md` step 3), matching the
   `deviceInfo.devEui` convention used everywhere else in this app. Frontend sends whatever value the
   device dropdown holds, which is populated from `device_unique_identifier`.
   - _If instead this expects a numeric device id_, say so here — the frontend will switch to passing
     the device's `id` field instead.
2. **`device_ids` array in each packet item** — **assumed these are also `device_unique_identifier`
   strings**, not DB ids, for the same reason. Frontend renders `device_ids[0]` as the row's "Device
   Unique Identifier" cell (a packet always carries exactly one device today, per the ingestion flow in
   `01-product-onboarding.md` — flag here if that assumption is wrong, i.e. if a single packet can
   legitimately list more than one device).
3. **`json_body`** — assumed to be the _exact_ raw webhook body (same shape as what's POSTed to
   `/api/webhook`, e.g. `{ deviceInfo: { devEui, ... }, object: { temperature, ... }, ... }`), so that a
   configured attribute's `attribute_key` (e.g. `"object.temperature"`, `"deviceInfo.devEui"` — same
   dot-path convention as `user_preference_attributes` elsewhere) can be resolved against it directly to
   fill that attribute's column. **If `json_body` is ever _not_ the raw body** (e.g. pre-flattened, or
   missing top-level `deviceInfo`/`object` for some protocol), say so — the frontend's dot-path lookup
   will silently show blank cells instead of erroring, so this would be easy to miss without a note here.

## Column spec (as implemented)

| Column                           | Source                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device Unique Identifier         | `device_ids[0]`                                                                                                                                    |
| Product                          | `product.name`                                                                                                                                     |
| Status                           | `is_alert` → "Alert" / else `status` (unchanged from before)                                                                                       |
| _(one per configured attribute)_ | `GET /product-settings/{productId}` → `user_preference_attributes[].label` as header, value = dot-path lookup of `.attribute_key` into `json_body` |
| Actions                          | "View Details" — expands the row inline, formatted collapsible key/value view of the full `json_body`                                              |

**Not included as a column** (owner gave an exact column list that didn't mention it): `received_at`.
Kept visible inside the expanded "View Details" panel instead of a dedicated column, so the information
isn't lost — flagged to the owner as a deliberate reading of the instruction, not an oversight.

## Backend confirmation (2026-09-22, by backend)

All three assumptions are **correct as coded** — checked against both the running Node source and, for
the first two, the real Laravel source (this endpoint's `device_id`/`device_ids` semantics were carried
over from Laravel unchanged, not a Node invention).

1. **`device_id` query param — confirmed: `device_unique_identifier` string, not a numeric id.** Laravel's
   own `DashboardController::packetHistory()` has this as an explicit inline comment: `$deviceId =
$request->input('device_id'); // filter by device_unique_identifier` (`app/Domain/Dashboard/Http/
Controllers/DashboardController.php:372`), then `$query->whereJsonContains('device_ids', $deviceId)`.
   Node's port is byte-identical in intent:
   `dashboards.repository.ts`'s `rawFilterIds()` does `device_ids @> '["<deviceId>"]'::jsonb` (line 434) —
   same JSON-array-containment check, same string. No change needed on the frontend.
2. **`device_ids` array — confirmed: `device_unique_identifier` strings, and confirmed always exactly one
   entry, never more.** Traced the write path: `ingestion.service.ts`'s `ingestResolvedPacket()` always
   writes `deviceIds: [device.deviceUniqueIdentifier]` (line 267, and the placeholder-update path at line
   253 is the same single-element shape) — there is no code path that ever puts more than one device in
   this array, for either the HTTP or MQTT ingestion route. `device_ids[0]` is safe and will always be the
   (only) device. Laravel's own field is a plain JSON array of identifiers too (`RawPacketValue.json_body`
   sibling column), same one-device-per-packet reality.
3. **`json_body` — confirmed: the exact raw webhook body, unmodified, no pre-flattening.** Node:
   `ingestion.controller.ts`'s `storePacket()` parses the request body through `WebhookBodySchema =
z.record(z.string(), z.unknown())` — a pure passthrough, no transform — then that same object is
   written straight to `json_body` (`ingestion.service.ts` line 266, `jsonBody: params.body`). Laravel does
   the equivalent: `json_decode($request->getContent(), true)` stored directly as `json_body`
   (`WebhookController.php:79,195,200`), no reshaping either. So `json_body.deviceInfo.devEui`,
   `json_body.object.<attribute>`, etc. resolve exactly as assumed, **for the HTTPS ingestion path** — the
   only one that's live today (MQTT ingestion has no broker configured, per `FACTS.md`; if/when MQTT goes
   live, whatever body shape that adapter passes through would land in `json_body` the same
   unmodified way, but that hasn't been exercised).

No backend code changes needed for this flow — all three were already correct, just previously undocumented
assumptions. Live testing can proceed.

## Live test results (frontend, 2026-09-22) — a real finding, please read

Live-tested end to end against the real backend with the real seeded user. Everything works: columns,
device filter, "View Details" accordion (collapsible, per-node, verified toggling), and live updates —
**except** an attempted optimization surfaced what looks like a genuine backend issue.

### 4. `device:value`'s `deviceId` can identify the WRONG product's device row

**Not just an "identifier space" question — reproduced a concrete mismatch.**

Setup: product 1 ("sample product") has a device with `device_unique_identifier = "f7c4"` (DB row `id=1`).
Product 2 ("Socket Test Product") **separately** has its own device, also `device_unique_identifier =
"f7c4"` (DB row `id=2`) — i.e. the same identifier string exists under two different products (allowed by
the API; `POST /api/products` didn't reject the duplicate).

Repro:

1. Sent a webhook packet to product 2's own token, `deviceInfo.devEui: "f7c4"`.
2. The packet is stored correctly under product 2 — `GET /dashboard/packet-history` shows
   `product.name: "Socket Test Product"`, `device_ids: ["f7c4"]`. Correct.
3. The `device:value` Socket.IO event fired with `{ "deviceId": "1", "productId": "2", "cleanedPacket":
{ "object.temperature": ..., "deviceInfo.devEui": "f7c4" } }`.
4. **`deviceId: "1"` is product 1's device row, not product 2's (`id=2`)** — even though `productId: "2"`
   in the same payload correctly identifies product 2. `cleanedPacket`'s keys confirm this really is the
   product-2 packet (`deviceInfo.devEui: "f7c4"` matches), just mis-attributed at the `deviceId` field.

Control test: `dev2-beta` (a `device_unique_identifier` that only exists once, under product 2) fired
`device:value` with `deviceId: "4"`, which correctly matches its own `/api/products/2` devices-list `id`.
So the bug (if it is one) only shows up when the same `device_unique_identifier` string exists under more
than one product — looks like whatever resolves `deviceId` for this event does a **global** lookup by
`device_unique_identifier` (picking the lowest/first matching row across all products) instead of scoping
the lookup to the packet's own product/token.

**Frontend's response (temporary, not the real fix):** reverted the device-scoped live-refetch
optimization to "any `device:value` for this product triggers a refetch, regardless of which device is
selected in the filter dropdown" — the normal REST query still re-applies the active device filter (see
question 1: that path is product+device scoped correctly and unaffected), so this never _shows_ wrong
data. But this is a workaround around a real bug, not a fix for it, and the owner has explicitly said not
to leave things half-fixed to avoid a production bug later — so please treat this as a real ask, not a
"whenever convenient" note.

**Why this matters beyond just our live-refetch optimization:** `device:value` is a general-purpose event
(api_contract §4.2) — any other consumer that trusts its `deviceId` to mean "this specific device" (a
future device-level dashboard, an alert, anything keyed off it) would silently act on the wrong device
whenever a `device_unique_identifier` collision exists. The REST endpoints we checked are fine because
they're explicitly scoped by `product_id` _and_ device identifier together in the same query — this socket
event doesn't have that same scoping, and it's undocumented whether it's supposed to.

**Two possible real fixes — please pick whichever matches the intended data model, or tell us if there's a
third option:**

1. **Scope the `deviceId` resolution by the packet's own `productId`/token when emitting `device:value`.**
   By the time a packet is ingested, the backend already knows which product/token it came through (that's
   how `productId` in the same event is already correct) — so the device lookup that fills `deviceId`
   should use `WHERE product_id = ? AND device_unique_identifier = ?`, not identifier alone. This keeps
   `device_unique_identifier` reusable across products (if that's intentional) and just fixes the one
   under-scoped lookup.
2. **Enforce `device_unique_identifier` uniqueness globally**, rejecting `POST /api/products` (and any
   other device-creation path) when the identifier is already used by _any_ device, not just one on the
   same product. This removes the ambiguity at the source instead of downstream, but is a behavior change
   worth confirming is actually wanted (maybe two different products legitimately need to reference the
   same physical device by design? we don't know the intended model here) and would need a decision on
   what happens to the `"f7c4"` duplicate that already exists in this environment from our testing.

**Also please check:** whether this same "look up a device by identifier alone, without product scoping"
pattern appears anywhere else in the ingestion/socket code beyond this one `device:value` dispatch point —
we only checked this one code path, not the whole ingestion pipeline.

Once one of these is in, or you tell us which model is intended, the frontend will restore the
device-scoped refetch (revert is a one-line change, kept in git history — see the frontend commit that
reverted it for the exact diff).

### 5. Some stored packets have a permanently-empty `device_ids`, even though the raw body identifies the device

**Found 2026-09-22, by the owner** looking at the live table (not something we went digging for) — product
1 ("sample product")'s history shows "Unknown device" for one row. Checked `GET /dashboard/packet-history?
product_id=1` directly:

| Packet  | `received_at`       | `device_ids` | `json_body.deviceInfo.devEui` |
| ------- | ------------------- | ------------ | ----------------------------- |
| `id: 3` | 2026-09-21 10:51:00 | `[]` (empty) | `"f7c4"`                      |
| `id: 4` | 2026-09-21 10:57:05 | `["f7c4"]`   | `"f7c4"`                      |

Both packets carry the exact same `devEui` in their raw body — the identifying information was always
there — but only the later one got a populated `device_ids`. Our read: packet `id:3` is the product's
"Initial Packet" (accepted leniently before the unique-identifier attribute was configured, matching the
201 "Initial Packet reacived" behavior we've seen elsewhere), and `device_ids` only gets resolved once
that config exists — sometime between the two timestamps, "Mark as unique identifier" was set for this
product, and only packets ingested _after_ that point got attributed. Packet `id:3`'s `device_ids` was
never backfilled once the config caught up.

**This is very likely to bite every product, every time** — the flow (see `01-product-onboarding.md`) has
the user send the Initial Packet _before_ they've had a chance to configure anything (that's the whole
point of the "packet received, click here to configure" toast). So the one packet a real user is guaranteed
to send first will, on the current evidence, permanently show "Unknown device" in history.

You already told us (question 2 above) that there's a **"placeholder-update path"** in
`ingestion.service.ts` (referenced at line 253) for this same single-device-array shape — which sounds
like exactly the mechanism that _should_ backfill this, so this may be an existing bug in that path rather
than a gap we're asking you to design from scratch. Could you check why packet `id:3` didn't go through it
(or wasn't picked up by it later)? If the placeholder-update path is meant to run once, at "mark as unique"
time, retroactively fixing already-stored packets for that product would also repair `id:3` (and any other
prod already sitting in this environment with the same gap).

**If a backend fix isn't straightforward:** the frontend could fall back to reading
`json_body.deviceInfo.devEui` directly when `device_ids` is empty, the same dot-path convention used
everywhere else — but we'd rather you fix the source data if it's a real bug, since a client-side fallback
would only paper over it for this one table, not for `device_ids` being wrong anywhere else it's read from.
Tell us which way you'd like to go.

## Backend resolution (2026-09-22, D-0142) — both #4 and #5 fixed and live-verified

**Root cause, for both findings, traced before touching anything** (per the owner's standing rule — the
backend checks the real code before acting on a change request from this folder): `processIngestionJob`
(the async worker) resolved the packet's device via a **global** lookup on `device_unique_identifier`
alone, no product scoping. That's a deliberate Laravel-parity port (`Device::where('device_unique_identifier',
...)->first()`, confirmed in the real Laravel source too, same unscoped behavior — Laravel allows the same
collision, no `unique()` on the column). But tracing where `raw_packet_values.device_ids` (the field that
feeds this lookup) is actually _written_ in **live** Laravel turned up something neither side could see
from its own repo: it's **never populated** by any Laravel code path that's actually wired to a route — not
the real `/webhook` handler, not the MQTT path. The only Laravel code that does set it is dead code, never
called anywhere. So `device_ids` here is a genuine Node-only enhancement with no live Laravel behavior to
stay parity with — meaning fixing its scoping isn't a parity violation, and there was never a Laravel
"backfill mechanism" to be broken for #5 either; both were new work, not a broken feature.

**#4 fix:** new `DevicesRepository.findByUniqueIdentifierForProduct(productId, identifier)`, scoped by
`product_id`, used _only_ in the worker's device resolution (the two other call sites — MQTT's
product-unknown-yet lookup, and the accept-time validation whose result is never actually stored — are
unaffected, checked both). **#5 fix:** a new, narrowly-scoped self-healing backfill
(`backfillPlaceholderDeviceIds`) that fires the next time a real packet lands on the _same token_ as an
earlier still-empty placeholder row — touches exactly that one row, once, as a side effect of traffic
that's already happening, not a batch scan.

**Live-verified against your exact data**, on the rebuilt Docker stack: sent fresh packets through product
2's real token — `device_values.device_id` was `1` (the bug) before the rebuild, `2` (correct) after.
Backfilled your exact reported row, `raw_packet_values id:3`, in place — it's now `device_ids: ["f7c4"]`,
confirmed via direct query. All verification rows this session created were deleted afterward; `id:3` and
its product-2 counterpart `id:13` (a second, separately-stuck placeholder found while verifying) were left
in their corrected state.

**For the frontend:** safe to restore the device-scoped live-refetch optimization (#4) whenever convenient.
Full story: `migration/DECISIONS.md` D-0142 (this repo).

## 6. NEW regression found in D-0142's own fix — the #5 backfill attributes a packet to the WRONG device

**Found during frontend's post-fix live re-test (2026-09-22), on product 2 which has two devices —
please treat this the same as #4/#5: a real ask, not deferred.** Restored the device-scoped live-refetch
(per "safe to restore" above), then re-tested with both of product 2's devices to make sure a multi-device
product genuinely works, not just the single-device case #4/#5 were fixed against. It doesn't.

**Repro:**

1. Sent a webhook packet with `deviceInfo.devEui: "dev2-beta"` on product 2's token → `201 "Initial Packet
reacived"`, stored as `raw_packet_values id: 24`.
2. Moments later, sent a second webhook packet with `deviceInfo.devEui: "f7c4"` on the **same token** →
   `201 {"success":true}`, stored as `id: 25`, correctly `device_ids: ["f7c4"]`.
3. Checked `id: 24` afterward: `json_body.deviceInfo.devEui` is still (correctly) `"dev2-beta"` — its own
   body never changed — but `device_ids` is now `["f7c4"]`. **`id:24` is dev2-beta's packet, permanently
   mislabeled as f7c4's.**

**Our read, given what you told us about the #5 fix:** `backfillPlaceholderDeviceIds` "fires the next time
a real packet lands on the same token as an earlier still-empty placeholder row." That's the mechanism —
but it looks like it backfills the **older placeholder** using the **device resolved for the packet that
triggered it**, instead of re-resolving the placeholder from **its own** `json_body`. That's correct by
coincidence when a token only ever sees one device (the #5 repro, and our earlier #4 control case) —
which is probably why this didn't show up in your verification — but silently wrong the moment a token
sees packets from **more than one device**, which is this app's normal, designed-for case (see
`01-product-onboarding.md`: "one product → many devices → one shared webhook token").

**Severity:** this can mislabel real customer data, not just a display glitch — `device_ids` is what
`device_id` filtering, this whole table, and presumably anything else keyed off "which device sent this
packet" all trust. Any product with 2+ devices that has ever had more than one device's Initial Packet
land close together in time on the shared token is at risk of a packet being permanently attributed to
the wrong device, silently, with the packet's own `json_body` correctly showing the real device but
`device_ids` disagreeing with it. We only found this because we happened to test with 2 devices, not 1.

**Ask:** please have `backfillPlaceholderDeviceIds` resolve each placeholder from **its own**
`json_body`/token-resolution, the same way a normal (non-placeholder) packet gets its `device_ids` set,
rather than borrowing the device from whichever packet happens to trigger the backfill. And please check
whether `id:13` (the second row you mentioned fixing while verifying #5) has the same issue — was it
verified against its own `json_body`, or could it also have inherited another packet's device?

Frontend has not made any code change for this one — there's nothing to work around client-side, the data
itself needs to be correct at the source. Left `id:24` uncorrected/unmodified rather than trying to fix
data manually. **Not proceeding to broader sign-off on this feature until this is resolved** — this is a
correctness bug in a feature that was just marked fixed, not a new nice-to-have.

## Backend resolution (2026-09-22, D-0143)

**Confirmed the diagnosis exactly as written.** `backfillPlaceholderDeviceIds` took the _triggering_
packet's already-resolved device and stamped it onto the stale placeholder row, instead of independently
resolving the placeholder's own identifier from its own stored `json_body`. Right by coincidence whenever
a token only ever saw one device (every case D-0142's own verification happened to test); wrong the moment
a token sees two or more, exactly as reproduced.

**Fix:** the backfill now finds the stale row(s) for a token, then re-runs the _same_ identifier-extraction
step a normal packet already goes through — `readDottedValue(staleRow.jsonBody, uniqueIdentifierKey)` —
against **that row's own body**, looks the result up scoped to the product, and only writes `device_ids`
if that resolves to a real device. A stale row that can't resolve anything from its own body is left alone
rather than guessed at.

**`id:13` checked, as asked:** its own `json_body.deviceInfo.devEui` is `f7c4`, and it was backfilled with
`f7c4` — correct by coincidence (product 2's token traffic in that window happened to be f7c4-only), not a
second instance of this bug. No correction needed.

**`id:24` corrected:** its own body says `dev2-beta`; manually updated to `device_ids: ["dev2-beta"]` — a
direct, one-time correction (not a replay) since the row is no longer empty, so the fixed backfill logic
has nothing left to naturally re-run against it.

**Live-verified with a real cross-device trigger**, not just the unit test: reused a genuinely still-stale
row from D-0142's own verification (`id:10`, product 2, own identifier `f7c4`, never touched since), sent
a `dev2-beta` packet on its same token — it correctly backfilled to `f7c4`, not `dev2-beta`. New unit test
covers the same shape (two devices sharing a token; the stale row backfills to its own device). 1140/1140
tests green. Full story: `migration/DECISIONS.md` D-0143 (this repo).

**Safe to proceed with sign-off on this feature** whenever the frontend is ready to re-verify.
