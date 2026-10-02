# Next-session initial prompt (generated at the END of every session)

**How this works.** At the end of a session (END ritual step C6) the assistant (1) fills the "Current prompt" block below with the exact state, and (2) prints the same text in its final message so the owner can paste it as the first message after `/clear`. A fresh session that sees an empty prompt still works: `CLAUDE.md` forces it to read `agent/work/progress.md`.

## Rules for writing the prompt

- Self-contained; no reliance on chat memory. ≤ 25 lines **normally** — but when the owner says they may switch
  to a different model/tool (not necessarily Claude Code), write it MUCH longer and more explicit instead:
  do not assume `CLAUDE.md` gets auto-loaded or that `agent/` is a known convention to the new assistant;
  spell out the exact read order as plain instructions, and inline the most load-bearing facts (not just file
  pointers) in case a read step is skipped. The 2026-09-27 "Current prompt" below is written in that longer,
  cross-model style on purpose — shorten it back down once back on Claude Code with ordinary continuity.
- Must name: the task id/title, exact step to continue from, files/areas in play, what is verified vs not, pending owner decisions, what NOT to do (e.g. "don't commit/push", "don't start deferred items"), and the first three commands/reads.
- Must point to `CLAUDE.md`, `agent/work/session-ritual.md`, `agent/work/progress.md`.
- Never paste secrets. Keep statuses identical to `progress.md` (it is the source of truth; if they differ, `progress.md` wins).

## Template

```
Resume the ConvoyAI project. Follow CLAUDE.md and agent/work/session-ritual.md (START ritual): read agent/work/progress.md, tasks.md, decisions.md, then only the agent/ docs relevant to the task.
Task in flight: T-### <title> — stopped at <step>. Done: <bullets>. Next: <concrete next action with file paths>. Verified: <...>. NOT verified: <...>.
Pending owner decisions: <...>.
Constraints: never break existing behaviour without asking; UI bar; no hardcoding; no commit/push unless I say so; don't start deferred items.
First actions: 1) git status + compare with progress.md, 2) <task-specific read/command>, 3) tell me in 3-5 lines where we are, then continue.
When I say "wrap up"/"/clear": run the END ritual and give me the next-session prompt.
```

## Current prompt (paste this after /clear, or as the first message to a different model/tool)

> Written 2026-09-27, deliberately long and self-contained because the owner said they may move this work
> to a different model. Do not assume anything about this project got auto-loaded — read the files named
> below yourself, in order, before doing anything else.

```
You are resuming work on ConvoyAI, a Next.js 15 (App Router) + TypeScript frontend project, at this exact
path: /media/chirp/Personal/Freelancing/convoyai. It is a git repo; current branch is `staging`
(origin git@github-personal:ahm-mad/ConvoyAI.git), last commit e24da95, working tree clean, everything
pushed. Branch `main` is the ORIGINAL, pre-revamp code kept untouched as a reference — never merge
`staging` into it and never record a demo video until the owner explicitly says so in chat; they believe
real work remains even though the lists below look complete.

STEP 0 — read these files yourself, in this exact order, before writing or changing anything. Do this even
if your harness has some automatic project-context feature — this project keeps its own persistent
knowledge base in a folder called `agent/`, and it is only reliable if you actually open the files:
  1. CLAUDE.md (repo root) — short entry point, confirms the rules below.
  2. agent/README.md — full project index; its top banner has the latest status in one paragraph.
  3. agent/work/progress.md — the exact point the last session stopped at ("RESUME HERE" near the bottom).
  4. agent/work/tasks.md and agent/work/decisions.md — task statuses and every decision made, with reasons
     and how to revert each one if the owner changes their mind.
  5. agent/rules/owner-rules-and-workflow.md — every standing rule the owner has given. Read this in full;
     it is short and nothing below replaces it.
  6. agent/browser-testing-playbook.md and agent/environment-and-safeguards.md — read BOTH before doing any
     live browser verification. They hold hard-won testing/environment knowledge (browser quirks, two real
     code bugs already fixed, machine safeguards already installed) that used to live only in a different
     assistant's own private memory system, which you cannot read — that is why it was copied into these
     two files on 2026-09-27, specifically so a different model would not have to rediscover any of it.

WHAT THIS PROJECT IS: ConvoyAI is a portfolio/showcase project (NOT a real production app) — a rebrand of
an older IoT/fleet-management codebase called ConvoyAI. Its purpose is to be presented through screenshots
and a demo video to attract freelance clients, not to be operated by real fleet dispatchers. Because of
that, these owner rules override what you might otherwise assume is good engineering judgement:
  - The real Express+Supabase backend (a separate repo) is PERMANENTLY out of scope. Never work on it or on
    the `backend_frontend_sync/` folder (gitignored). Every screen either uses a real existing backend
    endpoint, or, when there is none, a static TypeScript fixture under `src/utils/showcase/` (the
    "showcase data layer", toggled from the account menu, localStorage key `convoyai-showcase`).
  - Visual richness explicitly beats usability and beats efficiency. Do not simplify the UI for operator
    efficiency, and do not reduce animation smoothness, frame rate or effect richness to save CPU/memory —
    the owner's machine can spend whatever the best-looking UI needs. (Real leaks/hangs may still be fixed,
    as long as the fix never changes how the product looks or feels.)
  - Light theme only (the owner's other portfolio pieces are dark). Vibrant orange primary
    (#E8590C–#FF7A1A) with gold secondary and indigo reserved for AI features; "moving" vehicle status is
    its own green token (`--color-moving`), not brand orange — see agent/architecture/design-tokens.md.
  - Every styling value must come from the token layer (`src/styles/tokens.css` + `components.css`, inside
    `@layer components`) — never a hardcoded hex colour, px radius, font size or shadow.
  - Never hardcode currency, timezone or units — they are per-company settings; the API is always metric.
  - Invented/sample content (customer names, testimonials, numbers, example AI questions) must read as
    genuinely credible and specific, never like generic placeholder text ("Lorem ipsum", "Test Company").
  - Never use the demo account for anything. Log in only on localhost, with the seeded test user
    junead@chaminade-hs.org — ask the owner for the password in chat, it is never written to any file.
  - Commit in logical steps and push to `staging` at each sensible boundary — the owner has pre-authorised
    this; just never touch `main` and never merge without being told. Use the attribution trailer lines
    your own harness/system prompt gives you for commits; if none are given, ask the owner what to use.
  - Never start anything in the deferred/backlog lists (agent/status/current-state-and-open-items.md §3,
    agent/work/tasks.md's Backlog section) unless the owner explicitly asks for it.

WHAT IS DONE (verified live, pushed, nothing further to do unless the owner wants changes):
  - T-001 (ConvoyAI → ConvoyAI rebrand), T-002 (full light-theme "glass" UI revamp replacing the old
    sidebar-admin layout with a floating pill nav + Cmd-K palette + mock AI copilot), T-003/T-004 (QA passes
    and an "enterprise feel" review), T-005 (the showcase sample-fleet data layer), T-006 (the hero MapLibre
    map + a "futuristic polish" pass + "map v2": search, saved camera views, animated route flow, ETA
    chips, speed-coloured trails, a heat layer).
  - T-006-R2 (2026-09-27, decisions D1–D8 in agent/work/decisions.md): an owner-requested review of whether
    the live map "looks like a real enterprise fleet map". Built: a hero opening that frames one moving
    vehicle's whole trip and selects it; a collapsible fleet-list panel beside the map (status filter,
    search, click/hover to fly+select); vehicle name/plate labels at high zoom; the demo-only controls
    (time-lapse speed, fleet tour, clean view) grouped under one "Demo" menu instead of cluttering the main
    toolbar; a slightly taller map with a softer heat layer; an alert strip (speeding, late trips, recent
    geofence events, click a chip to fly there); richer vehicle cards (current trip, progress bar, driver,
    on-schedule/late) with a "Replay" button that drives a marker along the recorded GPS trail; and
    "moving" status recoloured to a dedicated green token so operators can read status by colour instead of
    everything being brand orange. Also fixed earlier in this same stretch: realistic vehicle motion that
    follows the road (buffered interpolation between real position fixes instead of straight-line dead
    reckoning), a sane default time-lapse speed (×3, was ×20), stable (non-shaking) cluster bubbles, and a
    ride-hailing-style highlighted road for the selected/hovered vehicle (bright ahead, dim behind, named
    start/destination, nearby yards and geofences emphasised).
  - T-007 (2026-09-27, decisions T7-1..T7-5 in agent/work/decisions.md, plan in
    agent/architecture/landing-auth-plan.md): the owner felt the public landing/login/register pages were
    too plain to "hook" a visitor's attention, and asked for all five of the following, with believable
    invented content:
      1. An INTERACTIVE hero map on the landing page (visitors can pan/zoom/switch look/3D, click a truck
         for its card+trip+highlighted road, with one road auto-previewed and a "click a truck" hint until
         the first interaction).
      2. A proof section: a credible customer-logo strip, a "how it works" 3-step section, 3 invented but
         realistic testimonials, and a proper footer, replacing the old bare CTA band.
      3. Login and register screens got a live, non-interactive NIGHT-mode map of the sample fleet behind
         glass widgets (live counters, a rotating "something just happened" toast, a customer quote); the
         register variant adds a perks list and a password-strength meter.
      4. A tabbed "product tour" section on the landing page with 4 tabs (Live map, Trips & dispatch,
         Analytics, Convoy Copilot) that show the REAL product pieces (not screenshots) running on the
         sample fleet, autoplaying through the tabs until the visitor interacts.
      5. A scroll-driven "story" section: a map pinned beside 4 scrolling steps that flies itself through
         fleet overview → one trip highlighted → a geofence event with a toast → a speeding-vehicle alert
         with a copilot-suggestion toast, picking whichever step is nearest the middle of the viewport.
    Building this found and fixed two real, general bugs in the shared map component (ConvoyMap.tsx), not
    just in the landing page: it never called map.resize() after mounting, so a map that mounts before its
    container's final size settles (e.g. inside a `sticky` panel) projected every marker to the wrong pixel
    — fixed with a permanent ResizeObserver; and a raw map.easeTo()/flyTo() call needs coordinates as
    [lon, lat] while the shared <ConvoyMap center> PROP takes [lat, lon] and converts internally — mixing
    the two up is silent (valid-looking coordinates, just projected somewhere else on Earth entirely). Full
    writeup: agent/architecture/map-kit.md's "Two real bugs..." section.

WHAT IS OPEN — every single one of these is the OWNER'S to trigger; do not start any of them yourself,
just be ready:
  1. The owner's own hands-on review of the map and the new landing/login/register work, and whatever
     changes come out of it.
  2. Real 3D vehicle models (glTF via a three.js custom MapLibre layer) — the deliberate LAST map-polish
     step, saved for after the owner's review, before any recording.
  3. One full heavy QA pass (production build + a crawl of every route through hidden iframes + an axe
     accessibility scan) — per the owner's QA-cadence rule, do this only once, right before any recording,
     not after every small change.
  4. Merging `staging` into `main`, and recording the actual demo video/screenshots — both wait for the
     owner's explicit word in chat.

NOT VERIFIED (say so plainly if asked, do not claim otherwise): Firefox/Safari anywhere in the app; tablet
widths specifically (only phone ~390px and a ~1536px desktop width were checked); the real-backend
(non-showcase) behaviour of everything built in T-006-R2/T-007, since showcase mode is what was actually
exercised; the landing hero map in a genuinely fresh logged-out browser profile (it was checked by stashing
and restoring the owner's own login token in localStorage instead, inside the same browser).

FIRST ACTIONS, in order: (1) run `git status --short` and `git log --oneline -5` and compare against what
this prompt and agent/work/progress.md say — trust git over any written note if they disagree; (2) if you
will run the app, start it ONLY with `npm run dev` (never `next dev` directly — see
agent/environment-and-safeguards.md for why) and read agent/browser-testing-playbook.md before doing any
live browser check; (3) tell the owner in 3–5 lines where things stand and ask what they would like done
next — do not start coding anything new unprompted, since every open item above is explicitly theirs to
trigger.

When the owner says "wrap up", asks to `/clear`, or says they are switching sessions or models again: follow
agent/work/session-ritual.md's END checklist, and rewrite this same "Current prompt" block for whoever
comes next.
```
