# Next-session prompt (regenerated at every END ritual — this is the "Current prompt" block)

> Paste the block below as your first message after `/clear`, a new session, a new machine, or a different AI tool. It is written to be self-contained: it does not assume you've read anything else first, even though in Claude Code `CLAUDE.md` auto-loads and points back to `agent/`.

```
You are resuming work on ConvoyAI, a Next.js 15 (App Router) + TypeScript frontend project, at this exact
path: /media/chirp/Personal/Freelancing/convoyai. It is a git repo; current branch is `staging`
(origin git@github-personal:ahm-mad/ConvoyAI.git), last commit 22b1281, working tree should be clean except
agent/work/progress.md possibly ahead — check `git status --short`. Branch `main` is the ORIGINAL,
pre-revamp code kept untouched as a reference — never merge `staging` into it, and never merge/finalize
until the owner explicitly says so. `agent/` and `CLAUDE.md` are themselves tracked in git (owner decision,
2026-09-27) specifically so a plain `git clone` of this repo on any machine, opened by any AI tool, brings
this entire knowledge base with it — if you are reading this file at all, you already have everything else
in `agent/` too.

STEP 0 — read these files yourself, in this exact order, before writing or changing anything:
  1. CLAUDE.md (repo root) — short entry point, confirms the rules below.
  2. agent/work/progress.md — the exact point this session stopped at ("RESUME HERE" near the top). This is
     more current than agent/README.md's banner right now; trust progress.md first.
  3. agent/work/tasks.md and agent/work/decisions.md — task statuses and every decision made, with reasons.
  4. agent/rules/owner-rules-and-workflow.md — every standing rule the owner has given.
  5. agent/browser-testing-playbook.md and agent/environment-and-safeguards.md before any live browser work.

WHAT THIS PROJECT IS: ConvoyAI is a portfolio/showcase project (NOT a real production app) — a rebrand of
an older IoT/fleet-management codebase called ConvoyAI. Its purpose is to be presented through screenshots
and a demo video to attract freelance clients, not to be operated by real fleet dispatchers. Standing rules
that override what you might otherwise assume is good engineering judgement:
  - The real Express+Supabase backend is a separate repo and PERMANENTLY out of scope for development.
    Never work on it or `backend_frontend_sync/` (gitignored). Every frontend screen either uses a real
    backend endpoint, or the "showcase data layer" (static TypeScript fixtures under `src/utils/showcase/`,
    toggled via localStorage key `convoyai-showcase` — a rich 56-vehicle Pakistani demo fleet).
  - Visual richness explicitly beats usability/efficiency, but NOT realism of vehicle motion — moving
    vehicles must look like real enterprise GPS tracking (proper speed, road-following), never cartoony.
  - QA SCOPE RULE (permanent): mobile widths, Firefox/Safari, and performance/frame-rate measurement are
    OUT OF SCOPE ENTIRELY, not just deferred. Accessibility (axe/WCAG AA) stays in scope.
  - Light theme only. Orange primary + gold secondary + indigo for AI features; "moving" vehicle status is
    its own green token (`--color-moving`), not brand orange. Every styling value comes from the token layer.
  - Invented/sample content (names, numbers, testimonials) must read as genuinely credible, never generic
    placeholder text.
  - Never use the demo account; log in only on localhost with the seeded test user
    junead@chaminade-hs.org — ask the owner for the password in chat if you don't have it (don't write it
    to any file).
  - Commit in logical steps and push to `staging` at each sensible boundary — pre-authorised; never touch
    `main`. Use the attribution trailer lines your harness gives you.
  - Never start anything in the deferred/backlog lists (`tasks.md`'s Backlog section,
    `agent/status/current-state-and-open-items.md` §3) unless the owner explicitly asks.
  - Dev server: ALWAYS start with `npm run dev` (= guarded `scripts/dev-safe.sh`), never bare `next dev`.
    It does NOT auto-restart on exit (owner decision, 2026-10-03, after an old version silently kept
    respawning in the background and fighting a production server for port 3000, corrupting `.next`) — if
    it dies, run `npm run dev` again. Never run `next build`/`next start` while `npm run dev` is running —
    they share `.next` and will corrupt each other. Right now (check `ps aux | grep "[n]ext"` to confirm
    still true), a PRODUCTION server (`npx next start -p 3000`) is deliberately left running for T-009
    recording — do not kill it without checking with the owner first, they may be mid-recording.

CURRENT TASK: T-009 — record demo video(s) + screenshots for the owner's portfolio. STATUS: recording in
progress, methodology settled, 3 clips done, the Live Map walkthrough was just demoed live and the owner is
about to record that clip themselves.

  Full context: `agent/work/tasks.md`'s T-009 entry, `agent/work/t009-shot-list-and-script.md` (the locked
  13-shot script/voiceover), `agent/work/portfolio-video-style-guide.md` (reusable captions/tone/structure
  conventions — also meant to guide editing the owner's OTHER already-recorded portfolio project's video).

  HOW RECORDING ACTUALLY WORKS (settled after trying several approaches — do not re-propose the ruled-out
  ones): no ffmpeg on this machine (Wayland, no sudo) and the GIF tool only captures ~1 frame per discrete
  automation action (not continuous video) — both ruled out as the real capture method. Instead: Claude
  demonstrates/rehearses each shot live in the Claude-in-Chrome controlled tab (narrating what to click and
  when) on the PRODUCTION server (localhost:3000, avoids the dev-mode badge); the owner then performs that
  exact sequence themselves while recording with GNOME's own screen recorder (Prt Sc button), producing real
  `.webm` clips in `~/Videos/Screencasts/`. Claude reviews each resulting clip by extracting frames with VLC
  (no ffmpeg exists): `vlc -I dummy <file> --video-filter=scene --vout=dummy --scene-path=<dir under ~/, not
  /tmp — snap-sandboxed> --scene-format=jpg --rate=8`, wrapped in a ~45-60s Bash timeout (use `cvlc`-less
  invocation; the snap package has no `cvlc` binary).

  DONE SO FAR: `landing_page.webm`, `login.webm`, `overview_page.webm` recorded and reviewed, all confirmed
  good (owner flagged minor scroll jerk on landing, attributed it to their own mouse, said keep as final —
  do not re-litigate). A real, reproducible crash bug was found and fixed during Live Map prep: switching
  map style (Light/Dark/Satellite) while a route/trail was active threw an uncaught MapLibre error that
  crashed the whole app — fixed in 5 files (`RouteLayer.tsx`, `GeofenceLayer.tsx`, `HeatLayer.tsx`,
  `HistoryLayer.tsx`, `PinLayer.tsx`, commit `eda7b95`), documented in `agent/architecture/map-kit.md`'s
  "Gotcha" note and `decisions.md`. The full Live Map feature walkthrough was then demoed live in the
  controlled tab, clean, no console errors: style tour, 3D toggle, zoom/clustering, vehicle select + card,
  trail Replay (speed-coloured animated trail), the Demo menu (time-lapse speed, "Start the fleet tour",
  and a **"Clean view for recording"** button that strips the UI down to just the map — worth using for
  part of this shot), Layers panel, fleet search, alert strip. Not yet demoed (minor): fit-fleet/follow
  icon, fullscreen button, comparing all 3 vehicle-icon styles side by side.

  NEXT STEP: the owner records the Live Map clip themselves (same sequence just demoed) using GNOME's
  recorder while the production server (already running on :3000) stays up — then hand the resulting
  `.webm` to Claude to review via the VLC method, same as the first 3 clips. After that, in order: Vehicles
  page (AI touchpoint #2 — maintenance/HOS quick-action), Trips (multi-select status + create-trip flow),
  quick glimpses of Drivers/Yards, Analytics ×4 sub-pages in one montage, Roles & permissions (RBAC), then
  the AI workspace deep-dive at `/ai` (explicitly NOT skippable — the big AI moment). Assignments/
  Geofences/Incidents were tentatively agreed skippable as redundant but NOT yet explicitly confirmed by
  the owner — ask before skipping. Closing title card reuses `~/Downloads/convoyai-video-assets/title-card.jpg`.

  CONSTRAINT: total merged video ≤5 minutes, owner's explicit call — do NOT ask for shorter re-recordings
  to hit this; compress in post (speed up clips, trim dead air/redundancy) once all raw clips exist. Not
  started yet. Captioning/splicing the final clips together has no tool decided yet (likely needs the owner
  to install ffmpeg at that point) — deferred, "no rush."

  SEPARATE, NOT YET STARTED: taking portfolio screenshots while the owner keeps the tab in foreground
  (mentioned as a distinct post-video task, not blocked on the video being finished).

AFTER T-009 IS FULLY DONE, the owner's stated remaining roadmap (do not start early): merge `staging` →
`main` (owner's call on timing) → T-010 (public README, BLOCKED until the owner supplies an example README
from another of their portfolio repos; the README will likely embed/link the T-009 material) → T-011 (bring
the separate backend repo into this one as a monorepo — structural/assembly only, do NOT read/audit the
backend source when it arrives; the owner rotates the MapTiler/Pusher keys themselves first).

FIRST ACTIONS, in order: (1) `git status --short` and `git log --oneline -5`, compare against this prompt —
trust git over any written note if they disagree; (2) `ps aux | grep "[n]ext"` and `curl -s -o /dev/null -w
"http=%{http_code}\n" localhost:3000/` to confirm the production server the owner needs for recording is
still alive (if not, `npx next start -p 3000` — NOT `npm run dev`, which would conflict if they're also
running a dev server, and would show the dev badge on camera); (3) if the owner says they already recorded
the Live Map clip, find it (likely `~/Videos/Screencasts/`) and review it via the VLC method before saying
anything else; (4) tell the owner in 2-3 lines where things stand and continue the shot list from "Vehicles
page" onward, demoing each remaining shot live before they record it, exactly as done for the first 4 clips.

When the owner says "wrap up", asks to `/clear`, or switches sessions/models again: follow
agent/work/session-ritual.md's END checklist, and rewrite this same block for whoever comes next.
```
