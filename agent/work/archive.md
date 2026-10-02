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

## T-006 · Phase 2 — hero map (2A), futuristic polish (2B), map v2, 3D vehicle models · DONE 2026-10-02

- Summary: MapLibre GL hero map (3D terrain/sky/buildings, 3 vehicle icon styles, light/night/satellite looks); realistic motion (buffered road interpolation, ×3 default demo speed, stable clusters, route highlighting); an operator review pass (D1–D8: fleet list panel, alert strip, richer vehicle cards, trail replay, "moving" recoloured to a dedicated green token); map v2 (search, saved camera views, animated route flow, ETA chips, speed-coloured trails, heat layer); a futuristic motion/icon/AI-orb polish pass (B1–B8); and, as the final map-polish step, real 3D glTF vehicle models (deck.gl `ScenegraphLayer`) for individual vehicles once zoomed in (≥ zoom 13) while in 3D mode, with flat icons everywhere else.
- Files/areas changed: `src/components/map/**` (ConvoyMap, layers, vehicle/, vehicle3d/), `src/utils/showcase/{simulation,routes,dataset}.ts`, `public/models/vehicles/**`, `scripts/{generate-vehicle-models,fix-vehicle-model-axes}.mjs`, design tokens for `--color-moving`.
- Commits: too many to list individually across the whole phase; the 3D-vehicle-models tail end is `6f12f66`, `95b4666`, `7449448`, `825244b`, `47ebbc7` (2026-10-02). Full chronology: `decisions.md`'s 2026-09-27 through 2026-10-02 entries, `tasks.md`'s T-006 history, `phase2-map-and-futuristic-plan.md`.
- Verified by: typecheck clean throughout; a full production build + ~50-route crawl + axe at the end of 2A/2B (phase2 plan §9d, §10a); the 3D-models addition verified live across all 8 places `VehicleLayer` mounts, against a fresh production build (0 errors, 53 routes), and via the owner's own hands-on check (which found and got a real zoom-disproportion bug fixed, `47ebbc7`).
- NOT verified / follow-ups: the route crawl + axe scan were NOT re-run after the 3D-vehicle-models work specifically (deliberately deferred to end-of-phase per the QA-cadence rule) — due now, right before T-009's recording. Firefox/Safari, mobile widths, and performance measurement are permanently out of scope for this project (demo-recording-only), not follow-ups.
- Docs updated: `agent/architecture/{map-kit,phase2-map-and-futuristic-plan,showcase-data}.md`, `agent/rules/owner-rules-and-workflow.md`, `agent/work/{tasks,progress,decisions}.md`.
