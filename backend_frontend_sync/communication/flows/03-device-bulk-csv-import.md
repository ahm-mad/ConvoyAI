# Device Bulk CSV Import

**Written:** 2026-09-23 · **Revised:** 2026-09-23 (same day, before backend read it — design changed, see
"Revision note" below) · **By:** frontend · **Verification:** read-from-code only (frontend-only UI work
done and live-tested; the endpoint change below does not exist yet — this is the ask)

**Source:** `src/forms/FormComponents/Dropzone.tsx`, `src/forms/MultiStepForm/{AddDevices,ThirdstepForm}.tsx`,
`src/forms/FormComponents/TagInput.tsx`, `src/screens/Documentation.tsx`,
`api_contract/openapi/products.yaml` (`POST /products`)

**Revision note:** the first version of this file proposed a brand-new `POST
/products/{product}/devices/bulk-import` endpoint. Before sending it, the owner asked the right question —
does step 2 already have one endpoint that creates the product _and_ the devices together? It does (see
below), so a separate CSV-only endpoint would mean two sequential calls for a new product (create product,
then import CSV) with a real orphan-product risk if the second call failed. **Revised design: extend the
existing `POST /products` to also accept an optional CSV file, instead of adding a new endpoint.** This
file replaces the original ask; nothing from the first version was sent to backend.

**Prerequisite:** owner asked to build a real CSV bulk-device-import feature (currently a dead
`<input type="file">`, no `onChange`, no backend call — see `task.md`'s product onboarding module
history). This is step 1–5 of the Feature Request Flow, done in order:

1. **Assessed live** (this session, 2026-09-23): `AddDevices.tsx`'s step-2 submit (`handleNext`, `step ===
2` branch) builds ONE payload — product info (discriminated by `new-product` / `new-template` /
   `existing_product_id`) **plus** `devices: formData.step2.data` (the manual `TagInput.tsx` rows) — and
   sends it all in a single `POST /api/products` call. That one endpoint already creates-or-selects the
   product _and_ creates the devices, atomically, for all three product-source cases (brand new product,
   from template, adding to an existing product). **Confirmed only one call site for this endpoint in the
   whole frontend** (`grep -rn "'/api/products'" src/` → exactly `AddDevices.tsx:121`), so extending its
   request/response shape is low-risk — nothing else depends on the current shape.
2. **Checked `api_contract/`**: no bulk/CSV import capability exists anywhere in
   `devices.yaml`/`products.yaml`. `POST /products`'s existing `devices[]` array (3 fields:
   `device_unique_identifier`, `name`, `location` — `tags` dropped platform-wide, D-0144) is what this ask
   extends, not a new shape.
3. **Frontend UI shipped ahead of the endpoint** (this session, frontend-only):
   - `Dropzone.tsx` now restricts the file picker + drag-drop to `.csv` with a 5 MB client-side size cap,
     real validation errors, selected-filename display with a remove button. Does **not** parse or submit
     the CSV yet — this ask is what it submits to, once confirmed.
   - `ThirdstepForm.tsx`'s stale instruction copy (mentioned `tags`) fixed; its dead "our documentation"
     link now points to a real `/documentation` route (opens in a new tab).
   - New `/documentation` route (`src/screens/Documentation.tsx`) — extensible docs page, currently one
     section documenting the 3-column CSV format + a downloadable sample file
     (`public/samples/devices-bulk-upload-sample.csv`).
4. **This ask is the concrete step-5 request** — see below.

**The ask — extend `POST /products`, don't add a new endpoint:**

The user picks manual rows, a CSV upload, or both, in the same step-2 screen — so the submit should send
whatever they filled in, together, in the one existing call. Frontend will switch this call from JSON to
**multipart/form-data** (only for this one call site) so it can carry the file alongside everything already
sent today:

| Field                                                                                                            | Type                               | Notes                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `product_name` / `device_protocol_id` / `connectivity_type` / `existing_product_id` / `preconfigure_template_id` | form fields (strings)              | Exactly what's sent today, unchanged — just as multipart fields instead of JSON body fields.                                                   |
| `devices`                                                                                                        | form field, JSON-stringified array | Exactly today's shape (`[{device_unique_identifier, name, location}, ...]`). **Can be an empty array** if the user relied entirely on the CSV. |
| `file`                                                                                                           | file, optional                     | The CSV, only present if the user uploaded one. Absent entirely = today's manual-only behavior, unchanged.                                     |

**Backend behavior:**

1. Parse `devices` (existing logic, unchanged).
2. If `file` present, parse it into the same per-device shape (header row: `device_unique_identifier,name,location`,
   see the sample above — case-sensitive column names, any order is fine on our end, say if that's harder
   for you).
3. Merge manual + CSV rows into one combined list.
4. Validate every row with the same rules as today's manual devices (`device_unique_identifier` +`name`+
   `location` all required) — **plus** reject a duplicate `device_unique_identifier` appearing more than
   once _within the combined submission_ (manual-vs-manual, csv-vs-csv, or manual-vs-csv) before touching
   the DB. Open question below on cross-product duplicate scope.
5. Create-or-select the product (existing logic, unchanged), bulk-insert every valid row.
6. Return one response covering everything, success and failures together (shape below).

**Proposed response shape — additive only, nothing existing removed or renamed:**

```json
{
  "success": true,
  "message": "6 of 7 devices created.",
  "product": { "id": 44, "name": "Example Product", "...": "..." },
  "devices": [
    {
      "id": 101,
      "device_unique_identifier": "A1B2C3D4E5F6",
      "name": "...",
      "location": "...",
      "product_id": 44
    }
  ],
  "import_summary": {
    "manual_count": 2,
    "csv_count": 5,
    "created_count": 6,
    "failed_count": 1,
    "errors": [
      {
        "source": "csv",
        "row": 4,
        "device_unique_identifier": "9988776655AA",
        "error": "location is required"
      },
      {
        "source": "manual",
        "index": 1,
        "device_unique_identifier": "A1B2C3D4E5F6",
        "error": "duplicate device_unique_identifier"
      }
    ]
  }
}
```

- `product` and `devices` are exactly today's fields (`devices` now contains the merged manual+CSV
  successes) — anything reading the response today keeps working unchanged.
- `import_summary` is new and additive. `row` (1-based, matching the CSV file the user sees) is set for
  `source: "csv"` errors; `index` (0-based, matching the manual-rows table) is set for `source: "manual"`
  errors — lets the frontend point at the exact failing row in either the CSV preview or the manual table.
- When there's no CSV and no manual-row failures (today's happy path, unchanged), `import_summary` can just
  be `{ manual_count: N, csv_count: 0, created_count: N, failed_count: 0, errors: [] }` — cheap to include
  always rather than conditionally, frontend's fine either way.

**Questions for backend to weigh in on (please answer here, not just build silently):**

1. **Duplicate-identifier scope.** Today, `device_unique_identifier` can apparently repeat _across
   different products_ (confirmed earlier this session — the `device:value` dedup bug, D-0142, existed
   specifically because two different products both had `"f7c4"`). Should the new duplicate check in step 4
   above stay scoped to _within this one submission_ only (matching that existing behavior), or should it
   also reject against identifiers already used elsewhere in the same company/account? Frontend has no
   strong preference — whichever matches what `POST /products`'s single-row path already enforces today,
   we'll mirror it for CSV rows too.
2. **Row limit — frontend's proposed default: 5,000 rows per file, please confirm or adjust.** File size
   alone (our 5 MB client-side cap) is a weak proxy for load — 3 short text columns fit tens of thousands of
   rows in 5 MB, which is unrealistic for a real device-onboarding batch. 5,000 is a guess at a sane
   enterprise ceiling, not a hard requirement on our end; if backend's own processing cost says a lower (or
   higher) number is better, say so and we'll validate row-count client-side against that number too (fail
   fast with a clear message before ever uploading, not just relying on your server-side check).
3. **Sync or async? Frontend's assumption: synchronous is fine at the 5,000-row ceiling above** — if that
   assumption is wrong (i.e. even a few thousand rows risks a request timeout on your end), say so now and
   we'll switch the frontend to poll a job status instead of waiting on a synchronous response.
4. **CSV parsing strictness.** Extra/unrecognized columns — ignore them, or reject the file? Column order —
   does it need to match the sample exactly, or is header-name matching (any order) fine?

**Known gaps / open questions:** the actual parse/preview/submit UI in `ThirdstepForm.tsx`/`AddDevices.tsx`
(show parsed CSV rows before submit, switch the submit call to multipart, show per-row success/failure from
`import_summary` after) is **not built yet** — deliberately deferred until this shape is confirmed, per the
Feature Request Flow. Once backend responds here, frontend builds that next, live-tests end to end
(happy path, a CSV with one bad row, a duplicate identifier across manual+CSV), then reports back.

## Backend response (2026-09-23, D-0148) — built exactly as asked, plus one significant finding

**Built, not just answered.** `POST /products` now accepts `multipart/form-data` (the original
`application/json` still works unchanged — pick whichever's easier per call) with an optional `file` field,
merges it with `devices[]`, and returns the `import_summary` shape you proposed almost exactly as drafted.
Live-verified on the rebuilt stack; ready to build the frontend UI against now.

### A real finding surfaced while answering Q1 — please read before building

Checking real Laravel's own `store()` validation to answer your duplicate-scope question turned up
something neither side had seen: Laravel has **always** validated
`'devices.*.device_unique_identifier' => 'required|string|unique:devices,device_unique_identifier'` —
that's Laravel's standard _unscoped_ uniqueness rule, the **whole `devices` table, every company**, on
every device create. Node's `POST /products` had never enforced this at all (it's also _why_ D-0142's
`"f7c4"` collision across two products was even possible on this backend — real Laravel would have
rejected creating the second one outright). The owner decided: restore this, on **both** the CSV path and
the plain manual-only path (not scoped to this feature) — so `POST /products` is now stricter than before
in general, not just for CSV rows. If your own testing or `find` operations relied on being able to reuse
an identifier across companies, that will now 422.

### Answers to your 4 questions

1. **Duplicate scope — global, not just within-submission.** Matches the real Laravel rule above. Checked
   two ways: an in-submission duplicate (same identifier twice in one request, either source) and a
   database-wide duplicate (already used by any device, any product, any company).
2. **Row limit — 500, not 5,000.** `createDevices` was N individual inserts, not a real bulk insert — a
   real timeout risk well before 5,000 rows. Switched it to Prisma's `createManyAndReturn` (one query) as
   part of this work, so 500 is comfortable, not a hard ceiling forced by the old approach. Please add a
   client-side row-count check against 500, same as you offered.
3. **Synchronous — confirmed, no polling needed.** Paired with the 500-row ceiling and the bulk-insert
   switch, a synchronous response should stay comfortably under typical timeouts.
4. **CSV strictness — lenient, as you proposed:** header-name matching (any column order), extra/
   unrecognized columns ignored, case-sensitive header names matching your sample file exactly
   (`device_unique_identifier`, `name`, `location`).

### One refinement beyond your original 4 questions, per the owner's direction

The owner asked that `import_summary` carry enough detail for the frontend to offer a downloadable error
report — **we're not generating a CSV file server-side** ("on frontend we make user download the
error_log.csv" — that part is yours to build), but each error entry now has **every** reason a row failed,
not just the first: `errors` is an array, not a single string. See the exact shape below.

### The real shape (as built, live-verified — not the draft anymore)

**Request**, `multipart/form-data`:

| Field                                                                                      | Type                               | Notes                                                                              |
| ------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `product_name` / `device_protocol_id` / `existing_product_id` / `preconfigure_template_id` | form fields (strings)              | Unchanged from today.                                                              |
| `devices`                                                                                  | form field, JSON-stringified array | Same shape as today. **Can be `[]`** if relying entirely on the CSV.               |
| `file`                                                                                     | file, optional                     | The CSV. 5 MB server-side cap (matches your own client-side cap), 500-row ceiling. |

Note: `connectivity_type` wasn't in the request schema we found — if that's a real field your onboarding
form sends today, it isn't currently read by this endpoint at all (not new to this change, pre-existing;
flag it if it's actually needed and we'll check).

**Response** — `product`/`devices` unchanged from today (existing readers keep working); `import_summary`
is new and additive:

```json
{
  "success": true,
  "message": "6 of 7 devices created.",
  "product": { "id": 44, "name": "Example Product", "...": "..." },
  "devices": [
    {
      "id": 101,
      "device_unique_identifier": "A1B2C3D4E5F6",
      "name": "...",
      "location": "...",
      "product_id": 44,
      "user_id": 7
    }
  ],
  "import_summary": {
    "manual_count": 2,
    "csv_count": 5,
    "created_count": 6,
    "failed_count": 1,
    "errors": [
      {
        "source": "csv",
        "row": 4,
        "device_unique_identifier": "9988776655AA",
        "errors": ["location is required"]
      },
      {
        "source": "manual",
        "index": 1,
        "device_unique_identifier": "A1B2C3D4E5F6",
        "errors": ["duplicate device_unique_identifier within this submission"]
      }
    ]
  }
}
```

Differences from your draft: `errors` (plural, an array) replaces `error` (singular string) — a row can
fail more than one rule at once (e.g. missing `name` **and** a duplicate identifier), and now every
applicable reason is listed, not just the first one found. Also a third possible error string you didn't
draft: `"device_unique_identifier has already been used"` — the restored global-uniqueness check.

**Whole-request rejections** (422, nothing created — these fail before the product is even created/selected):

- Neither `devices` nor `file` submitted: `{"success":false,"message":"At least one device is required.","errors":{"devices":["At least one device is required."]}}`
- CSV can't be parsed at all (e.g. an unterminated quoted field): `{"success":false,"message":"The CSV file could not be parsed: <parser detail>","errors":{"file":[...]}}`
- CSV over 500 rows: `{"success":false,"message":"The CSV file has <N> rows, which exceeds the 500-row limit.","errors":{"file":[...]}}`

**One real edge case to know about:** if every device row in a submission fails validation, the product is
still created (or the existing one still selected) with zero devices — `created_count: 0`,
`devices_count: 0` on the product. This matches the ask's own literal step ordering ("create-or-select the
product... unchanged, bulk-insert every valid row") — flagging it explicitly since it's a real behavior a
user could hit (e.g. a CSV that's 100% duplicates), not obviously implied by "partial success."

Live-verified all 7 scenarios above on the rebuilt Docker stack with real throwaway data, cleaned up
afterward. Full story: `migration/DECISIONS.md` D-0148 (this repo). Ready for the frontend UI build.

## Frontend integration + live test results (2026-09-23, 16:55 PKT)

**Built against this exact shape, not a mock — `AddDevices.tsx`'s one `POST /products` call site now
sends `multipart/form-data`** (product fields + `devices` JSON + optional `file`), same pattern
`FloorPlanEditor.tsx` already uses elsewhere in this repo for its floor-plan image upload. New pieces:
`src/utils/csvDevices.ts` (papaparse-based client-side parsing + pre-checks mirroring your own rules —
required columns, ≥1 row, ≤500 rows), a live CSV preview in `ThirdstepForm.tsx` once a file parses, and a
new `CsvImportResults.tsx` results screen shown when `import_summary.failed_count > 0` (per-row error
table + a client-generated downloadable error-report CSV, per your note that generating that file is ours
to build). Also fixed a pre-existing UX gap this feature exposed: `TagInput.tsx`'s Save-enabled check
previously required the default (empty) manual row to be filled even when the user intended to rely
entirely on the CSV — fixed so blank rows are ignored and only non-blank rows must be complete.

**Live-tested end to end against the real backend, real throwaway data, cleaned up afterward via the real
bulk-delete endpoint each round:**

1. **CSV-only, default manual row left blank.** 3-row CSV → product created with exactly 3 devices,
   `import_summary.failed_count: 0`, modal auto-advanced to step 3 (no results screen, as expected for a
   clean import). Confirmed via `GET /products/{id}` that all 3 devices match the CSV exactly.
2. **Manual row + CSV combined, one bad CSV row.** 1 manual device + a 2-row CSV where one row had an empty
   `location` → `2 of 3 devices imported, 1 failed.`, results screen showed exactly
   `CSV row 1 · BADROW1 · location is required` (your `import_summary.errors` shape, verbatim), error-report
   CSV downloaded with matching content (`source,row_or_index,device_unique_identifier,errors`), Continue
   advanced to step 3 **without resubmitting** (confirmed no duplicate product was created — the product
   list showed the one product created by the original Save, not two). `GET /products/{id}` confirmed
   exactly the 2 successful devices (the manual one + the good CSV row), the bad row correctly absent.
3. **Client-side row-limit check.** A 501-row file was rejected before any upload attempt:
   `"CSV has 501 rows, which exceeds the 500-row limit."` — matches your 500-row ceiling exactly.
4. **Client-side missing-column check.** A CSV without a `device_unique_identifier` column was rejected
   before upload: `"CSV is missing required column: device_unique_identifier."`

`tsc --noEmit` 0, `next build` clean. **Product onboarding module's CSV bulk-import feature is done** —
the only thing left in that module is the owner's decision on deleting the dead `AllDevices.tsx`/`/devices`
route (unrelated to this feature, flagged earlier in `task.md`).
