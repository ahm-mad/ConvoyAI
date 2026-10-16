# T-009 — final cut list and voiceover script (2026-10-10)

Exact beat-by-beat plan to turn the 6 raw clips into one ~6:14 video. Built from a precise
re-review of every clip (real timestamps via `ffmpeg -vf fps=1`, not estimated). Approved high-level
plan is in `t009-video-edit-plan.md` — this file is the executable version: precise in/out points,
captions, and the matching voiceover line for every beat.

**Total: 6:14** (target was 6:00-6:30, "Option B"). Timestamps are approximate to the second —
refine by eye during the actual cut, these are starting points, not frame-locked.

**How to read this table:** "Source in/out" is the timestamp range inside the RAW clip to use.
"Final position" is where that beat lands in the finished video. Caption = on-screen burned-in
text. VO = the line to read aloud when recording the voiceover afterward (record to this script,
not to the old `t009-shot-list-and-script.md`, which is reference-only).

---

## 0. Title card — open

**Final: 0:00-0:04 (4s)**
Static card, brand gradient.
**Caption (the card itself):** "ConvoyAI — Full-stack fleet management, powered by AI"
**VO:** _(silent, or a 1-2s musical sting if you add one)_

## 1. Landing page

Source: `landing_page.webm`

| Beat | Final          | Source in/out                                         | Caption                                       | VO                                                                                                            |
| ---- | -------------- | ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1a   | 0:04-0:11 (7s) | 0:00-0:04, hold/slow push-in to fill 7s               | "Fleet management, reimagined"                | "This is ConvoyAI — fleet management built around a live, AI-assisted map, not a spreadsheet with a sidebar." |
| 1b   | 0:11-0:17 (6s) | 0:44-0:48 ("Ask your fleet anything" Copilot section) | "AI built in from day one"                    | "Built on a real Express and Supabase backend, with an AI copilot that actually knows your fleet."            |
| 1c   | 0:17-0:24 (7s) | 0:55-0:57 (final CTA band + footer, hold)             | _(none — let "Get started free" read itself)_ | _(silent)_                                                                                                    |

## 2. Login

Source: `login.webm`
**Final: 0:24-0:32 (8s)** — source 0:00-0:08 (split-screen, credentials typed, "Sign in" clicked). **Stop here — never show the Device Status page that follows** (fake placeholder data flashes for several seconds, see edit plan).
**Caption:** "Secure, role-based access"
**VO:** "Every account is scoped by role — dispatcher, fleet manager, or admin."

## 3. Overview

Source: `overview_page.webm`. **Do not open the AI chat in this section** — keep the AI insight card static/teaser-only, since this clip has the old 3-dot thinking indicator (pre-upgrade); let `ai.webm` carry the real AI moment.

| Beat | Final           | Source in/out                                                      | Caption                            | VO                                                                                                                     |
| ---- | --------------- | ------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 3a   | 0:32-0:40 (8s)  | 0:00-0:05 ("Good morning, Hassan" hero + AI insights card, static) | "Fleet Overview"                   | "The moment you log in, you see what matters — and Convoy AI is already surfacing three ways to save money this week." |
| 3b   | 0:40-0:50 (10s) | 0:27-0:34 (KPI tile row)                                           | "Every metric, one glance"         | "Utilisation, on-time delivery, cost per kilometre — live, not a monthly report."                                      |
| 3c   | 0:50-1:00 (10s) | 0:46-0:53 (Fleet status donut + Needs attention panel)             | "Nothing falls through the cracks" | "Licences, maintenance, incidents — ranked by what actually needs attention first."                                    |
| 3d   | 1:00-1:14 (14s) | 0:60-0:71 (Incidents chart + cost donut + top vehicles, quick pan) | "Analytics, built in"              | "And it goes deep — cost breakdowns, incident trends, which vehicles are earning their keep."                          |

## 4. Live Map (hero section)

Source: `map_page.mp4` — scale/pad to 1920×920. **Use ONLY the clean fullscreen window (~0:08-3:50 raw) — never the chrome-visible opening or the modal-interrupted section after ~3:50.**

| Beat | Final           | Source in/out                                         | Caption                                   | VO                                                                                                                   |
| ---- | --------------- | ----------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 4a   | 1:14-1:22 (8s)  | 0:08-0:15 (fullscreen load, 40-vehicle view)          | "Live Fleet Map"                          | "This is the centerpiece — every vehicle rendered as a real 3D model, moving at real speed, following actual roads." |
| 4b   | 1:22-1:35 (13s) | 1:12-1:22 (tilted 3D close-up truck)                  | "Real 3D vehicles, road-accurate routing" | "Zoom into any truck, and you're looking at a genuine 3D model — not a pin on a map."                                |
| 4c   | 1:35-1:49 (14s) | 1:38-1:50 (bird's-eye geofence + buildings)           | "Every yard, every geofence"              | "Every yard has its own geofence — the system knows the moment a vehicle enters or leaves."                          |
| 4d   | 1:49-1:59 (10s) | 2:03-2:11 (search "prime" filter)                     | "Find any vehicle, instantly"             | "Search by name or plate, and the map finds it instantly."                                                           |
| 4e   | 1:59-2:13 (14s) | 3:08-3:20 (satellite toggle-in)                       | "Switch views in one click"               | "Switch to satellite in one click — real terrain, real buildings, same live data."                                   |
| 4f   | 2:13-2:25 (12s) | 3:28-3:38 (satellite zoomed-out city + vehicle popup) | "City-scale visibility"                   | "Zoom out, and the whole city's traffic is yours to see."                                                            |
| 4g   | 2:25-2:39 (14s) | 3:48-3:58 (3D truck cluster near yard)                | "Every truck, accounted for"              | "Every truck, every yard, accounted for — in real time."                                                             |

## 5. Operations (Vehicles/Drivers/Geofences/Yards/Trips/Incidents)

Source: `vehicle_driver_geofence_yard_trip_incident.webm`. **Avoid ~2:38 (Assignments page with filter dropdown open) — the footer is visible in that frame.**

| Beat | Final           | Source in/out                                                                                 | Caption                          | VO                                                                                                    |
| ---- | --------------- | --------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 5a   | 2:39-3:01 (22s) | 0:00-0:03 (list) → 0:08-0:18 (create form + "Vehicle added" toast) → 0:28-0:34 (detail stats) | "Fleet, fully managed"           | "Add a vehicle in seconds, and its whole profile — distance, speed, current driver — is right there." |
| 5b   | 3:01-3:16 (15s) | 1:22-1:30 (Driver detail, Assignments tab)                                                    | "Every driver, every assignment" | "Every driver's history — vehicles driven, trips completed, distance covered — on one page."          |
| 5c   | 3:16-3:28 (12s) | 1:36-1:44 (Geofences list + live events sidebar)                                              | "Geofences that actually alert"  | "Geofences with real-time exit alerts, tied straight to the trip that triggered them."                |
| 5d   | 3:28-3:43 (15s) | 1:54-2:02 (Yard slot layout modal)                                                            | "Yards, mapped slot by slot"     | "Every yard mapped down to the parking slot — check a vehicle in or out with one click."              |
| 5e   | 3:43-4:03 (20s) | 2:12-2:20 (Trip detail, Overview tab) → 2:26-2:32 (Trips list)                                | "Plan and dispatch trips"        | "Full trip detail — route, driver, vehicle — and the whole dispatch board in one list."               |
| 5f   | 4:03-4:15 (12s) | 2:42-2:48 (Incidents list)                                                                    | "Every incident, logged"         | "Every incident logged against a driver and a vehicle, searchable by severity."                       |

(~9s of the 105s budget is slack folded into beat hold-times above, not a separate beat.)

## 6. AI Workspace (the selling point)

Source: `ai.webm`. **Let the first "thinking" pause play at full real speed** — that's the whole point of the spinner+phrases work. The second one (beat 6c) can cut from "thinking" straight to the resolving answer.

| Beat | Final           | Source in/out                                                                       | Caption                               | VO                                                                                                                                                                                              |
| ---- | --------------- | ----------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6a   | 4:24-4:32 (8s)  | 0:00-0:05 (empty state)                                                             | "AI workspace"                        | "Ask it anything about your fleet, in plain language."                                                                                                                                          |
| 6b   | 4:32-4:50 (18s) | 0:25-0:40 (fuel question typed → full thinking pause → bars answer)                 | "It answers from your real data"      | "...with the numbers to back it up." _(let the on-screen thinking phrases carry most of this beat)_                                                                                             |
| 6c   | 4:50-5:04 (14s) | 0:40-0:48 ("Create idle-reduction plan" chip → plan answer, thinking trimmed short) | "One-click actions, not just answers" | "One click, and it drafts the plan — idling capped, drivers notified, savings projected."                                                                                                       |
| 6d   | 5:04-5:22 (18s) | 0:65-0:80 (HOS question → answer, thinking trimmed)                                 | "It reasons about compliance, too"    | "Ask about compliance risk, and it doesn't just flag it — it tells you who's affected and why."                                                                                                 |
| 6e   | 5:22-5:36 (14s) | 0:88-0:95 (Reassign trips chip → answer + automations toggle)                       | "Let it act on its own"               | "One toggle, and it's booking services and rerouting trips automatically — no one has to ask."                                                                                                  |
| 6f   | 5:36-6:04 (28s) | 0:96-1:02 (bottom 3 panels, held)                                                   | "Forecasts, not just history"         | "Maintenance forecasts, fuel projections, driver risk scores — all looking forward, not back. This is what makes ConvoyAI different — not just a dashboard, a fleet manager that never sleeps." |

**Stop before 1:03** — footer "Reduced service" flash starts there.

## 7. Title card — close

**Final: 6:04-6:14 (10s)**
**Caption (the card itself):** "ConvoyAI — a full-stack platform built for fleets that need to see everything, in real time."
**VO:** "ConvoyAI — built for fleets that need to see everything, in real time."

---

## Full voiceover script (continuous, for reading/practice)

1. _(silent — title card)_
2. "This is ConvoyAI — fleet management built around a live, AI-assisted map, not a spreadsheet with a sidebar."
3. "Built on a real Express and Supabase backend, with an AI copilot that actually knows your fleet."
4. _(silent — CTA card)_
5. "Every account is scoped by role — dispatcher, fleet manager, or admin."
6. "The moment you log in, you see what matters — and Convoy AI is already surfacing three ways to save money this week."
7. "Utilisation, on-time delivery, cost per kilometre — live, not a monthly report."
8. "Licences, maintenance, incidents — ranked by what actually needs attention first."
9. "And it goes deep — cost breakdowns, incident trends, which vehicles are earning their keep."
10. "This is the centerpiece — every vehicle rendered as a real 3D model, moving at real speed, following actual roads."
11. "Zoom into any truck, and you're looking at a genuine 3D model — not a pin on a map."
12. "Every yard has its own geofence — the system knows the moment a vehicle enters or leaves."
13. "Search by name or plate, and the map finds it instantly."
14. "Switch to satellite in one click — real terrain, real buildings, same live data."
15. "Zoom out, and the whole city's traffic is yours to see."
16. "Every truck, every yard, accounted for — in real time."
17. "Add a vehicle in seconds, and its whole profile — distance, speed, current driver — is right there."
18. "Every driver's history — vehicles driven, trips completed, distance covered — on one page."
19. "Geofences with real-time exit alerts, tied straight to the trip that triggered them."
20. "Every yard mapped down to the parking slot — check a vehicle in or out with one click."
21. "Full trip detail — route, driver, vehicle — and the whole dispatch board in one list."
22. "Every incident logged against a driver and a vehicle, searchable by severity."
23. "Ask it anything about your fleet, in plain language."
24. "...with the numbers to back it up."
25. "One click, and it drafts the plan — idling capped, drivers notified, savings projected."
26. "Ask about compliance risk, and it doesn't just flag it — it tells you who's affected and why."
27. "One toggle, and it's booking services and rerouting trips automatically — no one has to ask."
28. "Maintenance forecasts, fuel projections, driver risk scores — all looking forward, not back. This is what makes ConvoyAI different — not just a dashboard, a fleet manager that never sleeps."
29. "ConvoyAI — built for fleets that need to see everything, in real time."

## Status

Plan complete, nothing cut yet. Next step: execute with ffmpeg (trim each beat → scale/pad the map
clip to 1920×920 → burn in captions → concatenate in order → single muted output file). Owner
records the voiceover separately against this script and syncs it in their own tool afterward.
