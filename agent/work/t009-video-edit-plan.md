# T-009 — final video edit plan (2026-10-10)

Reference doc for the post-recording editing phase. All 6 raw clips are recorded and confirmed
final (see `progress.md`). This file is the detailed technical plan for turning them into one
finished video; `decisions.md` has the dated decision entries, this file has the how.

## Purpose and constraints (owner, 2026-10-10)

The finished video must work in **any** of these contexts without changes:

1. **Standalone** — attached to a portfolio page or an Upwork proposal for a job posting similar
   to this project.
2. **As a modular segment inside a bigger ~10-13 min reel**, structure: ~40s personal intro
   (owner's own face/voice) → a project video (this one, or another of the owner's projects) →
   possibly a second project video → closing CTA (owner's face/voice again). **The order of "this
   project" vs "the other project" is not fixed** — this video must not assume it plays first or
   second, and must not reference being first/next/previous ("as you just saw", "coming up" etc).

This video's own open/close title cards act as self-contained chapter markers for exactly this
reason — they already don't reference position, keep them that way.

**Quality bar:** this is the owner's first Upwork portfolio piece as a new freelancer — effectively
a magnum opus. Zero tolerance for anything that reads as unpolished: test-data flashes, status
glitches, inconsistent framing/resolution between cuts, typos in burned-in captions (even if the
owner's spoken/typed words during recording had one).

**Length target: 6:00–6:30** (chosen option "B — Balanced" of 3 presented; A was ~4:30-5:00 tight,
C was ~7:30-8:00 full tour). Raw footage across all 6 clips is ~11:52, so roughly half needs
cutting — see per-clip plan below.

## Tooling

`ffmpeg` was NOT installed for most of this project (see older memory/decisions notes) — the owner
installed it on 2026-10-10 (`sudo apt install -y ffmpeg`, confirmed v4.4.2-0ubuntu0.22.04.1). It is
now available for trimming, scaling, burning in captions and concatenation. Durations/resolutions
below were read with `gst-discoverer-1.0` (already on the machine) since it was faster for a first
pass; `map_page.mp4`'s H.264 stream isn't decodable by the installed gst plugins, so its duration
(~4:51) comes from the earlier recording-session's own verification, and its resolution (1280x738)
was confirmed via a single VLC scene-filter frame grab.

## Source clips (all in `~/Videos/Screencasts/`)

| Clip                                              | Raw duration | Resolution     |
| ------------------------------------------------- | ------------ | -------------- |
| `landing_page.webm`                               | 0:57         | 1915×920       |
| `login.webm`                                      | 0:19         | 1915×920       |
| `overview_page.webm`                              | 1:12         | 1915×920       |
| `map_page.mp4`                                    | ~4:51        | 1280×738 (OBS) |
| `vehicle_driver_geofence_yard_trip_incident.webm` | 2:48         | 1920×920       |
| `ai.webm`                                         | 1:45         | 1920×920       |
| **Total raw**                                     | **~11:52**   | mixed          |

## Canvas / resolution decision

Final canvas: **1920×920**, matching 5 of 6 clips natively (no quality loss on those). Only
`map_page.mp4` (1280×738, OBS output) needs scaling up to fit — accept a small, honest softness
cost on that segment rather than downscaling the other 5 clips to match the lower-res one. Not
avoidable without re-recording the map in OBS at a higher resolution, not worth it given how strong
that footage's content is.

## Per-clip findings and fix decided

### `landing_page.webm` (57s raw)

Full marketing-site scroll: hero (with an embedded mini-browser mockup of the live map) → feature
tabs (Live map / Trips & dispatch / Analytics / Convoy Copilot, each with its own mini mockup,
including the Copilot one already showing the same "Which vehicles will cost the most in fuel this
week?" example used later in the AI module — nice reinforcement) → "Everything in one place"
feature cards → a dedicated "Ask your fleet anything" Copilot marketing section → final CTA band +
footer. No issues found. Good 3-beat montage candidate (hero / Copilot teaser section / final CTA)
rather than a full linear scroll, given the tight time budget (~57s raw against maybe 15-20s final).

### `login.webm` (19s raw)

Split-screen login (night map + testimonial on the left, sign-in form on the right). Clean through
typing credentials and clicking "Sign in". **Issue: 3-9 seconds after the Sign In click, it lands
on a Device Status page showing obviously fake placeholder data** ("sample device name", "device2",
"second dev", "3 total devices") for several seconds before the showcase data layer overwrites it
with real-looking numbers (~87 devices, GPS-xxx-#### codes) around second 7 after landing. **Fix:
end this clip's segment right after the Sign In click** (or a brief loading/redirect beat) — never
show the Device Status page at all; it isn't needed content anyway.

### `overview_page.webm` (72s raw)

More content-rich than the original shot list accounted for: "Good morning, Hassan" hero with the
live map widget + AI insights card (3 ranked suggestions) → AI Copilot chat exchange ("Summarise
yesterday" → "Show wear trend") → KPI tile row (availability/utilisation/on-time/cost-per-km/fuel
economy/open issues) → Fleet status donut + "Needs attention" alerts panel (licence-expiry,
maintenance-overdue, incident entries, each with real-looking driver/vehicle names and dates) →
further down: yard occupancy, busiest geofences, an incidents-by-severity bar chart, a "where the
money goes" cost-breakdown donut, and a top-vehicles-by-distance ranking. **This deserves more
final-cut time than originally budgeted** given how much is here. **Note:** this clip was recorded
before the AI "thinking" indicator was upgraded (see `decisions.md`'s 2026-10-10 entries), so its
chat exchange shows the old 3-bouncing-dots indicator, not the new spinner+cycling-phrases one used
in `ai.webm`. Not worth re-recording for this alone — **keep this clip's AI moment brief/teaser-only**
(just enough to register the insight card + one quick exchange) so the older indicator never sits on
screen long enough to be a noticeable inconsistency; let `ai.webm` carry the full "thinking" moment.

### `map_page.mp4` (~4:51 raw, 1280×738)

The browser starts **windowed** (full Chrome chrome + GNOME top bar visible — this is the
documented crop issue from the original recording session, 0:00-0:08), goes **fullscreen** around
0:08, stays clean through to roughly 3:50, then **drops out of fullscreen again** to show a Vehicle
detail modal's Fuel tab (a mundane, not-hero-worthy moment), and ends back in windowed mode around
4:45-4:51.

**Resolved: no crop filter needed.** Since only ~45-55s of this 4:51 clip is going in the final cut
anyway, select highlight segments **entirely from inside the clean fullscreen window (~0:08 to
~3:50)** and never touch the chrome-visible opening or the modal-interrupted ending. This fully
replaces the earlier "top-edge crop 0:00-0:08" TODO in `progress.md` — simpler and avoids any risk
of the crop filter clipping real content at different points in different exported segments.

**Strong highlight moments found inside the clean window** (timestamps approximate, re-verify
exact in/out points when actually cutting):

- ~0:08-0:15 — fullscreen map just loaded, full 40-vehicle fleet view (good establishing beat)
- ~0:75 — tilted 3D perspective, a highly detailed individual truck model rendered close-up
- ~1:40 — bird's-eye view, dashed geofence circle around a yard with real building footprints
- ~2:05 — search/filter demo (typed "prime" into the fleet search, list + map both filter live)
- ~3:10 — **satellite imagery toggle** — a genuinely different map style not in the original shot
  list, farmland/road detail, visually striking
- ~3:30 — satellite view zoomed out over a full city with a vehicle info popup open
- ~3:50 — 3D truck cluster near a yard terminal, light map style

### `vehicle_driver_geofence_yard_trip_incident.webm` (2:48 raw)

Already reviewed and confirmed final earlier this session (see `progress.md`/`decisions.md`,
2026-10-10 entry). Covers Vehicles (create + detail modal), Drivers (detail + assignments),
Geofences, Yards, Trips, plus bonus Assignments and Incidents pages. No new issues found on
re-review. Will need the heaviest proportional cut of all 6 clips (168s raw against maybe 60-70s
final) since it covers 7 distinct areas — pick the single clearest beat per area rather than
showing full CRUD flows.

### `ai.webm` (1:45 raw)

Already reviewed and confirmed final earlier this session. **Issue (already flagged): last ~2
seconds shows the footer status bar flash "Reduced service"** (a real but transient API hiccup;
backend confirmed healthy afterward). **Fix: trim before the footer scrolls into view** — the three
bottom panels are already fully visible before that happens, so nothing of value is lost.

## Cross-clip rule found during this review (new, not previously documented)

**Never let any clip scroll far enough to reveal the app's own footer status bar.** Beyond the
`ai.webm` "Reduced service" risk, the footer also shows a **"Showcase data · sample fleet"** badge
(honest, but undercuts the "real enterprise platform" framing agreed for the whole video, especially
the AI module positioning decision). Treat this as a universal trim boundary across all clips, not
just the two cases already found.

## Editing approach

- **Cut, don't speed up**, for anything dead or redundant: typing pauses, modal open/close
  animations, repeated chip clicks, dwell time on a static screen.
- **Light speed-ramp (1.3-1.8x)** only for genuinely continuous motion that's just "more of the
  same" — the landing page's long scroll, or watching trucks drive for several uneventful seconds
  on the map.
- **Keep the AI "thinking" delay at real speed at least once** in the AI module segment — that is
  the entire point of the variable-delay + spinner + cycling-phrases work done earlier this
  session; speeding it up would undo it. If the final cut shows two AI answers, let the first
  thinking pause play fully; the second can cut from "thinking" straight to the answer already
  resolving rather than sitting through both pauses in full.
- **Hard cuts between beats, not fades** — reads cleaner for a software product demo.
- **Captions**: short on-screen titles timed to appear right as the camera settles on each new
  screen, not layered over active clicking — matches the existing `portfolio-video-style-guide.md`
  conventions.
- **Caption/segment lengths should roughly match a natural voiceover reading pace** (~150 wpm) for
  that beat, so when the owner records the voiceover afterward it lines up without re-cutting.

## Status / next step

This plan is agreed (owner, 2026-10-10) but **no cutting, scaling or concatenation has been done
yet**. Next step: write the exact cut list (precise in/out timestamps per clip) sized to hit the
6:00-6:30 target, plus the matching voiceover script section for each beat, THEN execute with
ffmpeg (trim → scale/pad map clip → burn in captions → concatenate → single output file, muted,
since voiceover audio is recorded separately by the owner and synced afterward in their own tool).
