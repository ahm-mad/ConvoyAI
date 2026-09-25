# backend_frontend_sync — how this folder works

The owner runs two separate Claude Code sessions with no shared context: one here
(`fe-convoyai`, Next.js/TS), one in the Node backend repo (`node-backend`). Neither has access to the
other's code. This folder is the bridge: it's a **plain folder, not a git repo of its own** — the owner
copies it by hand between the two project roots (`cp -r` the whole folder over the other side's copy).

**Never assume the other repo's code.** Only trust what's written in this folder. If something needed
isn't here, that's a gap to fill in — not something to guess at.

## Read order for a session picking this up

1. **`STATUS.md`** — first thing to check. Says what's done, in progress, blocked, and — the "Last
   synced" line at the top — whether the copy you're looking at might already be stale.
2. **`FACTS.md`** — stable architecture facts (transport, auth, envs, test credentials). Rarely changes.
3. **`communication/flows/`** — one file per user-facing flow, each a sequential page/button → API table.
   Check here before re-deriving a flow that's already been mapped.
4. **`communication/findings.md`** — cross-repo issues log. Check before reporting something that's
   already tracked.
5. **`api_contract/`** — the OpenAPI contract. Per its own `API_CONTRACT.md` §0: don't scan it up front,
   open only the one module file (`api_contract/openapi/<module>.yaml`) you actually need, when you hit a
   missing/unclear detail or an error.

## Who writes what

- **Frontend scope:** this repo only (`src/`, `app/`). Writes flow files from real frontend code + a live
  test against the real backend (never demo/mock data — see `FACTS.md`).
- **Backend scope:** `node-backend/` only. Writes/regenerates `api_contract/` from its own code
  (contract-first, per that doc's own §1) and copies the updated `api_contract/` + any `findings.md`
  responses over.
- **Findings:** add a row, don't fix the other side's code. Mark it `resolved` (date + what changed) once
  whichever side owns it fixes it — never delete a row, the history stays visible that way.
- **New flow:** copy `communication/flows/_template.md`, fill it from the real current code, say which
  steps were live-tested vs. read-from-code only.
- **Finished flow:** once a flow is fully shipped and stable, move its file from `communication/flows/`
  into `archive/` (`git mv` on whichever side's own repo tracks this copy) so the active folder only shows
  what's still relevant.

## Owner's role

Copy this whole folder over the other side's copy whenever a session finishes touching it. A session updates the
"Last synced" line itself, right when it edits anything in this folder, and tells the owner a copy is owed — not
wait to be asked. If a session's copy looks stale (missing something you know exists on the other side), say so
rather than silently working from it.

## ⭐ STANDING OWNER RULE — never break what already works (BOTH sides, the WHOLE project, every module)

**Owner, 2026-09-25 ~08:25 PKT — "very important":** whatever we build, **do not break previous things**. This is not only about Fleet: the whole project currently works as far as the owner has tested it, and it must stay that way. **If anyone needs to change anything that already exists, FIRST ask the owner, and only after the owner agrees inform the other side (in this folder) before it ships.**

**What counts as "changing something that exists"** (ask first): an existing endpoint's response shape, field meaning, number definition, default, ordering, validation, error message, permission or status code; an existing socket event / payload; a schema or migration that touches existing data; a shared dependency or config; on the frontend — an existing screen's behaviour, layout, route or copy, a shared component (Modal, apiHelper, tokens, layout shell) or a shared hook. **Fixing a bug in existing behaviour also counts** (numbers the owner has seen will change) — describe it and ask.

**What is fine without asking:** purely **additive** work that changes nothing when unused — a new endpoint, a new optional parameter / field, a new screen or component behind its own route — but it must be verified not to alter existing behaviour, and it is still announced here as usual.

**How to work under this rule**
1. **Prefer additive + opt-in:** new endpoints / optional params / new routes / new components; keep the old path working until the replacement is verified **and the owner approves** the switch (then the old one is removed in its own, announced step).
2. **Ask the owner properly:** say exactly what changes, who is affected (the other side, which screens / consumers), the recommended option, and how to roll back — a short choice list with a recommended option first. One focused batch.
3. **Inform the other side** in this folder (a flow-file section + a `STATUS.md` line, per the usual routine) — with the exact list of changed responses / behaviours — **after** the owner's answer and **before** it ships; nothing existing changes silently.
4. **Regression discipline before "done":** diff the change (`git diff`), run the type-check / test suite, re-check the neighbouring features that share the code or endpoint (live, not just by reading), compare the contract before / after (backend: `openapi:check`, changed-operations list; frontend: `tsc --noEmit` + the affected screens), and say plainly what was **not** regression-tested.
5. **No drive-by changes:** don't "clean up" or "improve" unrelated existing code / behaviour while building something else.
6. **If something existing does break:** stop, tell the owner and the other side, restore it first, then continue.

(Backend's own summary of the same rule is at the end of this file.) Recorded in the frontend repo in `task.md`, `FLEET_ANALYTICS_DESIGN.md` (D-13) and the assistant memory; the backend session was told by the owner directly and should record it the same way.

### "Last synced" line — mandatory format, BOTH sides (frontend and backend)

The first line of `STATUS.md` **must** carry the **date AND the time with its timezone**, plus which side wrote it:

```
> **Last synced: 2026-09-24 15:18 PKT, by backend.**
```

- Get the real value with `date '+%Y-%m-%d %H:%M %Z'` — never type it from memory, never guess, never drop the time.
- **A date-only line (e.g. `2026-09-24 PKT`) is invalid** — it can't tell you which of two same-day copies is newer,
  which is the whole point of the line. Fix it and say so if you find one.
- Update it on **every** edit to anything in this folder (not just when copying), so the newest edit is always visible.

### Do not reformat `api_contract/` (generated)

`api_contract/` is **generated by backend** (`npm run openapi:write`) and CI fails on any drift (`openapi:check`). Do not run
Prettier (or any formatter) over it, and do not hand-edit it — even whitespace-only changes (e.g. table separator rows in
`API_CONTRACT.md`) count as drift. If you need a contract change, ask backend. (Found 2026-09-24: a formatter pass over
`API_CONTRACT.md` broke the drift check; backend regenerated it.)

### Never delete or condense the other side's sections (both sides)

Flow files in `communication/flows/` are a shared history. **Add sections; do not remove, shorten or rewrite sections the
other side wrote — and do not replace a whole file with only your new section.** If a file gets long, move the *whole* flow
into `archive/` once it is fully shipped and stable (see `archive/README.md`) instead of trimming it. If you must correct
something the other side wrote, add a dated note under it. (Found 2026-09-24 18:50 PKT: a returned copy of
`flows/04-fleet-management.md` contained only §16 — §1–§15 were missing and were restored from the frontend's git history.)

### Never break what already works — project-wide, BOTH sides (owner rule, 2026-09-25)

The whole project — not only Fleet Management — works as far as the owner has tested it. **Whatever either side builds must not break existing behaviour anywhere** (products, devices, dashboards, assets, rules, auth, fleet …). If something that already exists **has to** change (an endpoint, a response field / number / status value, a permission, a screen's behaviour):

1. **Ask the owner first** — do not decide it inside a flow file or a code change; plain text, options + a recommendation.
2. **Then inform the other side** here: list it under an explicit **"Changes to EXISTING behaviour"** checklist in the flow file and add a `STATUS.md` paragraph, so the other session can adapt (frontend: types / adapters / screens; backend: contract / tests).
3. Prefer **additive** changes (new endpoint, optional parameter, new field); keep defaults that reproduce today's behaviour until the owner approves a change; deprecate before removing (keep an alias for a release); never silently rename or drop a field.
4. Before shipping, **re-test the unchanged flows** (not only the new one) against the real backend, and say which ones you re-tested. The backend snapshot-diffs a broad set of read endpoints around every rebuild and runs the whole test suite.

A "Changes to EXISTING behaviour" section that says **None** is the goal; one that lists something must name the owner's approval.
