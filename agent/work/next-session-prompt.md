# Next-session prompt (regenerated at every END ritual — this is the "Current prompt" block)

> Paste the block below as your first message after `/clear`, a new session, a new machine, or a different AI tool. It is written to be self-contained: it does not assume you've read anything else first, even though in Claude Code `CLAUDE.md` auto-loads and points back to `agent/`.

```
You are resuming work on ConvoyAI, a Next.js 15 (App Router) + TypeScript frontend project, at this exact
path: /media/chirp/Personal/Freelancing/convoyai. It is a git repo; current branch is `staging`
(origin git@github-personal:ahm-mad/ConvoyAI.git), last commit 47ebbc7, working tree clean, everything
pushed. Branch `main` is the ORIGINAL, pre-revamp code kept untouched as a reference — never merge
`staging` into it and never record a demo video until the owner explicitly says so in chat. `agent/` and
`CLAUDE.md` are themselves tracked in git (owner decision, 2026-09-27) specifically so a plain `git clone`
of this repo on any machine, opened by any AI tool, brings this entire knowledge base with it — if you are
reading this file at all, you already have everything else in `agent/` too.

STEP 0 — read these files yourself, in this exact order, before writing or changing anything:
  1. CLAUDE.md (repo root) — short entry point, confirms the rules below.
  2. agent/README.md — full project index; its top banner has the latest status in one paragraph (NOTE:
     as of this prompt the banner is stale — it still describes 2026-09-29's state. Trust this prompt and
     agent/work/progress.md over that banner until a session refreshes it).
  3. agent/work/progress.md — the exact point this session stopped at ("RESUME HERE" near the top).
  4. agent/work/tasks.md and agent/work/decisions.md — task statuses and every decision made, with reasons.
  5. agent/rules/owner-rules-and-workflow.md — every standing rule the owner has given, including two new
     ones from this session (see below). Read this in full; it is short and nothing below replaces it.
  6. agent/browser-testing-playbook.md and agent/environment-and-safeguards.md before any live browser work.

WHAT THIS PROJECT IS: ConvoyAI is a portfolio/showcase project (NOT a real production app) — a rebrand of
an older IoT/fleet-management codebase called ConvoyAI. Its purpose is to be presented through screenshots
and a demo video to attract freelance clients, not to be operated by real fleet dispatchers. Standing rules
that override what you might otherwise assume is good engineering judgement:
  - The real Express+Supabase backend (a separate repo, at /media/chirp/Office/Projects/ConvoyAI/) is
    PERMANENTLY out of scope for development. Never work on it or `backend_frontend_sync/` (gitignored).
    Exception learned this session: pure INFRASTRUCTURE restarts (pm2 processes, Docker containers the
    backend depends on) are fine and sometimes necessary — see "backend infra" note below. Every frontend
    screen either uses a real backend endpoint, or a static TypeScript fixture under `src/utils/showcase/`
    (the "showcase data layer", toggled via localStorage key `convoyai-showcase`).
  - Visual richness explicitly beats usability and efficiency, but NOT realism of motion/behaviour — see
    the "video-animation vs real enterprise feel" rule below, restated and newly enforced this session.
  - QA SCOPE RULE (new, 2026-10-02, permanent): mobile widths, Firefox/Safari, and performance/frame-rate
    measurement are OUT OF SCOPE ENTIRELY for this project, not just deferred — it is demo-recording-only,
    never deployed live, so only the owner's own desktop Chrome during the actual recording matters. Do not
    add these to any QA checklist. Accessibility (axe/WCAG AA) stays in scope — that's a UI-quality bar.
  - Light theme only. Orange primary (#E8590C–#FF7A1A) + gold secondary + indigo for AI features; "moving"
    vehicle status is its own green token (`--color-moving`), not brand orange.
  - Every styling value must come from the token layer (`src/styles/tokens.css` + `components.css`).
  - Invented/sample content (names, numbers, testimonials) must read as genuinely credible, never generic
    placeholder text.
  - Never use the demo account; log in only on localhost with the seeded test user
    junead@chaminade-hs.org — ask the owner for the password in chat if you don't have it (don't write it
    to any file; this prompt deliberately omits it even though it was used this session).
  - Commit in logical steps and push to `staging` at each sensible boundary — pre-authorised; never touch
    `main`, never merge without being told. Use the attribution trailer lines your harness gives you.
  - Never start anything in the deferred/backlog lists (`agent/status/current-state-and-open-items.md` §3,
    `tasks.md`'s Backlog section) unless the owner explicitly asks.

NEW STANDING RULES FROM THIS SESSION (2026-10-02), both now also in `agent/rules/owner-rules-and-workflow.md`:
  1. "QA scope" rule above (mobile/cross-browser/performance permanently out of scope).
  2. **3D motion must match the already-approved 2D realism standard, always.** The owner restated the
     2026-09-27 map-realism fix (real speed, road-following, never "cartoony video-animation" movement)
     applies to anything that moves on the map, present or future, including the new 3D vehicle models. When
     building or changing ANY vehicle-motion-related feature, verify it inherits the existing
     `VehicleLayer` per-frame position/heading system rather than introducing a second, independent motion
     path — a second path is exactly how this kind of regression would sneak back in.
  Also learned (not a rule change, just useful): backend infrastructure (pm2 processes, Docker containers
  like `convoyai-node-dev-redis-1` / `-postgres-1` on ports 6389/5442) is fine to restart when the owner's
  laptop reboot leaves the backend half-broken — this is "keeping the dev environment running", not
  "working on the backend". Never touch the backend's actual code/config.

WHAT'S DONE THIS SESSION (2026-10-02, T-006 — now fully closed, see `archive.md`):
  Built real 3D vehicle models for the live map (glTF via deck.gl `ScenegraphLayer`, individual vehicles
  only, zoom ≥13, 3D mode only; flat icons unchanged everywhere/everywhen else). All 7 vehicle kinds work
  and are visible live, including bus (a showcase-data bug meant it never appeared until fixed). Found and
  fixed SEVEN real bugs along the way (two deck.gl↔maplibre-gl incompatibilities, a React Strict Mode race,
  a CSS selector bug, a missing size floor, a heading-orientation bug, a showcase-data bug, and a
  zoom-disproportion bug the owner found by hand). Full technical detail:
  `agent/architecture/map-kit.md`'s "3D vehicle models" section, `agent/architecture/showcase-data.md`'s
  "Bus vehicles..." section, and `agent/work/decisions.md`'s five 2026-10-02 entries. Everything is
  committed and pushed (`6f12f66` … `47ebbc7`) and T-006 has been moved to `agent/work/archive.md`.
  NOT verified this session (deliberately deferred, see below): the full route crawl + axe scan, and
  general visual-quality tuning of the 3D models' lighting/colour beyond "looks good, nothing short of the
  bar" (a quick pass, not a deep one).

WHAT'S OPEN — owner said (2026-10-02, this session's end) "quickly wrap these up and take video+pics for
showcasing, it's been too long" — meaning: move toward T-009 (recording) with real urgency, not necessarily
do every item below in the original recommended order. ASK the owner at the start of the next session which
of these they want first; do not assume:
  1. **The one heavy QA pass** (production build + full ~50-route crawl + axe scan) — per the QA-cadence
     rule this was always meant to happen once, right before recording. Due now. Nothing more should be
     built before this runs, since it's meant to certify the state that gets recorded.
  2. **T-008** (global UI consistency + enterprise-components pass + legacy Fleet leftovers G14/G15/G18/G20/
     G19) — not started. Given the owner's stated urgency, consider asking whether to skip or shrink this
     rather than assuming it must happen before recording; it was always "recommended, not locked" position.
  3. **T-009** (record demo video(s) + screenshots) — not started. Claude's role is prep only (shot list /
     script, a final clean-view pass with no debug artifacts or stray ZZ test data, confirming showcase data
     reads richly everywhere in the script) — there is no tool here that exports a finished video, only a
     short-GIF recorder. The owner does the actual screen capture. Agree the shot list with the owner before
     doing the clean-view pass.
  4. Merge `staging` → `main` — owner's call on timing, still not yet.
  5. **T-010** (public README) — BLOCKED until the owner supplies an example README from another of their
     portfolio repos; do after T-009 since the README will likely embed/link the recorded material.
  6. **T-011** (bring the backend into this repo as a monorepo) — far future, last step; do NOT read the
     backend source when it arrives, this stays a structural/assembly task only.

FIRST ACTIONS, in order: (1) `git status --short` and `git log --oneline -5`, compare against this prompt —
trust git over any written note if they disagree; (2) if running the app, start ONLY with `npm run dev`
(never `next dev` directly); (3) tell the owner in 2-3 lines where things stand (T-006 fully done and
shipped, now at the open-items list above); (4) ASK which of items 1-3 above to start on, given their stated
urgency to reach recording soon — do not assume the heavy-QA-first order is locked.

When the owner says "wrap up", asks to `/clear`, or switches sessions/models again: follow
agent/work/session-ritual.md's END checklist, and rewrite this same block for whoever comes next.
```
