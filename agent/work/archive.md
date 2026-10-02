# Archive — 100% completed and verified tasks (append-only)

Format per entry:

```
## T-### · <title> · DONE <date>
- Summary:
- Files/areas changed:
- Commits: <hash(es) or "uncommitted">
- Verified by: (typecheck/build/live checks, widths/themes, what was exercised)
- NOT verified / follow-ups: (each becomes a new TODO in tasks.md)
- Docs updated: (agent/ files touched)
```

---

## Pre-history (work done before this workspace, for reference)

The completed tasks of the original project (Next/TS migration, product onboarding, asset module, Fleet operations + enterprise readiness, Fleet analytics slices through B7/U1) are summarised in `agent/history/task-md-digest.md`; the full detail is in `task.md` at repo root.

## Entries

_(none yet in this workspace)_

## T-003 · Strict QA pass 2 (every control, successful paths) · DONE 2026-09-27

- Summary: click-everything harness + real create/edit/delete/save paths with ZZ data across all fleet, analytics, devices, access, account and legacy pages, tablet width, donut drill-downs, silent-form fixes. Full log: `agent/work/qa-pass2.md`.
- Commits: d6b183d … 545ffe2 (fixes: yard modal name, all-products sort, role toasts, donut legends, RequiredHint, palette Esc, /map height, register copy, phone input, password confirm).
- Verified by: typecheck, live Chrome checks, production build + iframe route crawls (last full crawl at 5175a2a).
- NOT verified / follow-ups: avatar upload, real password change, Log out, Google sign-in, CSV exports, bulk deletes, Add Member submit; backend 500 on PUT /api/vehicles/<new id> (out of scope). Leftover ZZ data: driver ZZP2 DriverEdited, trips ZZ-P2-TRIP/-TRIP2, ZZ Tracker devices.
- Docs updated: qa-pass2.md, qa-checklist.md, tasks.md, decisions.md.
