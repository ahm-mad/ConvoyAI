# T-009 — Demo video shot list, voiceover script, on-screen captions (DRAFT, not recorded yet)

Format locked with the owner (2026-10-03): **one continuous hero video**, ~3.5–4 min, **on-screen
captions = short section titles only** (voiceover carries the actual explanation). Capture method:
each numbered shot below is recorded as its own clip (GIF tool, all debug overlays off — no click
circles, no action labels, no watermark, no progress bar), with the caption text baked into the page
before capture (DOM overlay, not added in editing). The owner stitches the clips into one continuous
video in their own editor, adds voiceover reading the script lines, adds music/transitions.

**Why separate clips instead of one unbroken recording:** the walkthrough crosses several real page
navigations (landing → login → app) and the capture tool is clip-based. This is normal video-production
practice anyway — even "continuous" product demos are almost always cut together from multiple takes,
which also means any one shot can be re-recorded without redoing the whole thing.

**Status: DRAFT.** Nothing has been recorded. The owner should edit this file (voiceover wording, pacing,
which shots to cut/add) before anything is captured — once captions are baked into a clip, re-wording
means re-recording that clip.

---

## Pre-recording clean-view checklist (do once, right before capturing)

- [ ] Showcase data mode ON (realistic Pakistani fleet — 56 vehicles, 44 drivers, ~160 trips, named yards)
- [ ] No `ZZ…`-prefixed test records visible anywhere in the recorded screens
- [ ] Console clean on every screen in the list below (no red errors)
- [ ] Map toolbar "3D" contrast fix decided one way or the other (open item from the QA pass) — doesn't
      need fixing to record, but worth a conscious decision since it'll be on camera
- [ ] Browser window at a clean, consistent size (no devtools open, no extension banners)
- [ ] Logged in as the seeded user beforehand for the app shots; logged-out state staged for landing/login shots

---

## Shot list

| #   | Screen / URL                                          | On-camera action                                                                                                                                                                                                 | On-screen caption                                                       | Suggested voiceover line                                                                                                                                           | Est. |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | `/` (landing, logged out)                             | Load the page, let the hero map's live vehicles animate for a beat, slow scroll to reveal the tagline                                                                                                            | _(none — cold open)_                                                    | "This is ConvoyAI — fleet management built around a live, AI-assisted map, not a spreadsheet with a sidebar."                                                      | 15s  |
| 2   | `/` scroll further                                    | Scroll through proof/testimonials/how-it-works                                                                                                                                                                   | **"Built for real fleet operations"**                                   | "Real-time tracking, predictive maintenance, and an AI copilot that actually knows your fleet."                                                                    | 12s  |
| 3   | `/login`                                              | Show the live night-map panel behind the login form                                                                                                                                                              | **"Secure, role-based access"**                                         | "Every account is scoped by role — dispatcher, fleet manager, or admin."                                                                                           | 10s  |
| 4   | `/fleet-management/operations/overview`               | Load the Overview hero — KPI tiles, radar sweep, AI insight preview                                                                                                                                              | **"Fleet Overview"**                                                    | "The moment you log in, you see what matters: active vehicles, trips in progress, and anything that needs attention."                                              | 18s  |
| 5   | `/fleet-management/operations/map`                    | **The hero shot.** Load the live map, let 3D vehicles move along real roads for a few seconds, zoom into one vehicle (triggers its real 3D model), click it to open the vehicle card, show the highlighted route | **"Live Fleet Map"** then **"Real 3D vehicles, road-accurate routing"** | "This is the centerpiece — every vehicle rendered as a real 3D model, moving at real speed, following actual roads. Click any truck and its live route lights up." | 45s  |
| 6   | same, zoomed out                                      | Zoom out to show the clustered fleet view, open the fleet list panel                                                                                                                                             | **"Full fleet, one view"**                                              | "Zoom out and the whole fleet clusters cleanly — zoom back in and every vehicle is individually trackable."                                                        | 15s  |
| 7   | `/fleet-management/operations/trips`                  | Show the status chips, click two to multi-select (e.g. Planned + In progress), open "Create Trip"                                                                                                                | **"Plan and dispatch trips"**                                           | "Dispatchers can filter by multiple statuses at once, and spin up a new trip — vehicle, driver, route — in seconds."                                               | 20s  |
| 8   | `/ai`                                                 | Open the AI workspace, ask one of the scripted example questions, show the response                                                                                                                              | **"AI Copilot"**                                                        | "Ask it anything about your fleet — maintenance risk, cost trends, which driver is due for a break — and it answers from your real data."                          | 20s  |
| 9   | `/fleet-management/analytics/fuel` or `/utilisation`  | Switch between two analytics views, hover a chart                                                                                                                                                                | **"Analytics that go deep"**                                            | "Fuel, maintenance, utilisation — every report built for a real operations team, not a toy dashboard."                                                             | 18s  |
| 10  | `/roles-permission`                                   | Show the roles list, open one role's permission grid                                                                                                                                                             | **"Enterprise-grade access control"**                                   | "Granular roles and permissions, ready for a real multi-team company."                                                                                             | 12s  |
| 11  | back to `/fleet-management/operations/map` or landing | Wide closing shot, map still animating                                                                                                                                                                           | **"ConvoyAI"** (logo/wordmark)                                          | "ConvoyAI — built for fleets that need to see everything, in real time."                                                                                           | 10s  |

**Total estimate: ~3:35.**

---

## Open questions for the owner before locking this

1. Shot 7/8 need specific picks: which trip to open, which AI question to ask (should read as a real,
   specific question, not generic — e.g. "Which trucks are due for maintenance this month?").
2. Confirm the map-toolbar contrast item (owner-gated, from the QA pass) before shot 5/6 — it'll be on
   camera.
3. Any screens to ADD that aren't here (e.g. Devices/Products, since that's a priority module too)?
4. Confirm voiceover tone: current draft is short, confident, benefit-led. Want it more technical, more
   casual, or longer/more detailed per section?
5. Logo/closing shot (#11) — is there a final logo treatment to end on, or should it just hold on the map?
