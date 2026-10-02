# `backend_frontend_sync/` — the bridge to the backend session (protocol)

**What it is:** a _plain folder (not a git repo)_ that the owner copy-pastes by hand between this repo's root and the separate `node-backend` repo's root, because the two Claude sessions share no context. In THIS workspace the backend is out of scope for now,
but the folder is part of the repo and holds the contract + the full history of decisions. Never assume backend code; only trust what is written there.

## Files

- `README.md` — rules (standing owner rule, mandatory "Last synced" format, never reformat `api_contract/`, never delete/condense the other side's sections).
- `STATUS.md` (117 KB) — line 3 `> **Last synced: <date> <time> <TZ>, by frontend|backend.**` (from `date '+%Y-%m-%d %H:%M %Z'`; a date-only stamp is invalid); per-module done/in-progress. Current stamp: **2026-09-25 17:36 PKT, by frontend**.
- `FACTS.md` — stable architecture facts (transport, auth, seeded test user, fleet definitions, bucket caps, unit system…). Update rows in place.
- `communication/flows/NN-*.md` — one file per flow, sequential sections written by whichever side; **add sections, never rewrite/remove the other side's**: 01 product onboarding, 02 packet history live view, 03 device bulk CSV import, 04 fleet management (§1–§25), 05 fleet API design (backend steps 1–7), 06 fleet enterprise readiness (asks B1–B13, C-series; §35 last frontend reply), **07 fleet analytics/dashboard (A/B/C/D/E/F rows; §1–§35)**, `_template.md`.
- `communication/findings.md` — cross-repo issue log (never delete rows; mark resolved with date). Open row: 2026-09-25 fuel economy on an `odometer_backwards` fill (question to backend).
- `api_contract/` — generated OpenAPI (see `backend/api-contract-index.md`). `archive/` — finished flows (empty).

## Flow 07 numbering (keep continuing it)

Backend sections §10–§13, §17–§20, §23, §24, §25 (B6), §26 (B7), §32 (last). Frontend §15, §16, §21, §22, §27–§31 (backend renumbered our old §25–§29 when it merged), §33 (reply to §25/§26/§32), §34 (+§34.5 status/asks A,B,C), §35 (frontend status index). **Next frontend section = §36.**

## Routine (only if a backend-dependent task comes up)

1. Before the owner pastes ours: `git tag sync-frontend-<date>-<time>` + copy the folder outside the repo (snapshot). 2. After a paste from backend: `git status --short`, `git diff --numstat HEAD -- backend_frontend_sync`, read the new stamp, diff removed lines of the flow files + STATUS + findings (backend once truncated a flow file — restore anything of ours that was dropped from git),
   semantic contract diff (python `yaml` over old vs new `openapi/*.yaml`: new/removed/changed operations and params), read the new sections. 3. Tell the owner in ~5 lines: what backend answered, what is newly BUILT, which existing responses changed, what can be built now. 4. Build ONLY against rows marked BUILT. 5. Every edit of the folder: bump the stamp with the real `date`, tell the owner a copy is owed. Before committing a pasted folder check numstat equals the pre-commit numstat (the pre-commit hook ignores the folder). NOTE: this workspace has only ONE commit and no tags — the previous workspace's snapshot tags/copies (`sync-frontend-20260925-*`, `/home/chirp/projects/fe-convoyai-sync-snapshots/`) did not come along.
