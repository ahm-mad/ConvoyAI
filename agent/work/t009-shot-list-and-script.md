# T-009 — ConvoyAI demo video shot list + voiceover script (REFERENCE ONLY as of 2026-10-03 recording session — see note below)

**Status update (2026-10-03, during actual recording):** the owner is recording freely rather than following
this script's exact shots/order/wording — they said directly they didn't read it while recording the Live
Map clip. This file is now reference material only (tone, pacing, which features are worth hitting), not a
prescriptive script the footage must match. The actual captions and voiceover script get written AFTER each
clip exists, by Claude reviewing the real footage frame-by-frame and fitting text to what's actually on
screen — see `decisions.md`'s "Workflow pivot" entry and `progress.md`. Do not hand this table's caption/
voiceover columns to the owner as-is; they need to be redone per clip once footage exists.

General conventions (captions, tone, standalone/mergeable structure): see
`agent/work/portfolio-video-style-guide.md`. This file is the ConvoyAI-specific content.

**All open questions from the draft are now answered by the owner.** Capture method: each shot is
recorded as its own clean clip (`mcp__claude-in-chrome__gif_creator`, all five overlay options —
`showClickIndicators/showDragPaths/showActionLabels/showProgressBar/showWatermark` — set `false`), caption
text baked in via a DOM overlay before capture. ~3:40 total estimate, 13 shots.

**AI emphasis (owner, 2026-10-03):** this project is the portfolio's AI-differentiated entry (the owner's
other project already covers IoT), so AI is shown at two separate points rather than one isolated stop —
reinforces it's woven through the product, not bolted on. Verified live before locking this in: the AI
Copilot's "Predict maintenance" response is genuinely strong — specific data-driven numbers, embedded
mini risk-bars per vehicle, and action buttons, not a placeholder.

**Correction (2026-10-03, later in the same recording session):** the original plan had THREE AI
touchpoints, including a "Predict maintenance"/"HOS breach risk" quick-action supposedly on the Vehicles
page (shot 8, row below). That feature does not exist anywhere in the codebase — checked
`src/components/VehicleDetailModal.tsx` directly, no match. "Predict maintenance"/"HOS breach risks" only
exist as AI Copilot starter-prompt suggestions (`src/components/shell/CopilotChat.tsx`,
`src/components/fleet/OverviewHero.tsx`, `src/components/shell/CommandPalette.tsx`), not a Vehicles-page
button. The owner chose (of three options offered) to drop this touchpoint entirely rather than fold it
into the `/ai` shot or build it as a real feature — there are now only TWO AI touchpoints in the script:
the Overview insight card and the `/ai` deep-dive. Shot 8 is now just the vehicle-creation flow, no AI
content. Do not re-introduce a "Vehicles AI quick-action" shot unless the owner asks for the feature to
actually be built first.

**Map-toolbar contrast fix:** done and pushed (`7c5040f`) ahead of recording, since the map is the longest
single shot.

**Positioning update (owner, 2026-10-03):** the video must read as a serious **full-stack** platform (real
backend + polished frontend), not just a frontend demo, on top of the AI emphasis above. Title card and two
voiceover lines updated to say so explicitly (shots 0/2/11/12 below). Note on honesty: the product genuinely
has a real Express + Supabase backend (324-operation API, real RBAC enforcement, Socket.IO real-time
events) — these are true, general claims about the product's architecture. The recording itself still uses
**showcase/demo data** for visual richness (per the pre-capture checklist), so voiceover describes the
product's real capabilities, not a claim that this specific video's numbers are live from production —
same "honesty in claims" principle as the style guide, just spelled out here since it's easy to blur the
two when writing backend-emphasizing lines.

---

## Shot list

| #   | Screen / URL                                         | On-camera action                                                                                                                                                                                                                                                                                                                                                                    | On-screen caption                                                            | Voiceover line                                                                                                                                                     | Est.   |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 0   | title card                                           | Static card, brand gradient background                                                                                                                                                                                                                                                                                                                                              | _(the card itself: "ConvoyAI — Full-stack fleet management, powered by AI")_ | _(silent, or a 1-2s musical sting if the owner adds one)_                                                                                                          | 3s     |
| 1   | `/` (landing, logged out)                            | Load, let the hero map's live vehicles animate a beat, slow scroll to the tagline                                                                                                                                                                                                                                                                                                   | _(none — cold open into the brand)_                                          | "This is ConvoyAI — fleet management built around a live, AI-assisted map, not a spreadsheet with a sidebar."                                                      | 15s    |
| 2   | `/` scroll further                                   | Scroll through proof/testimonials/how-it-works                                                                                                                                                                                                                                                                                                                                      | **"Full-stack: real backend, real-time data"**                               | "Built on a real Express and Supabase backend — real-time tracking, predictive maintenance, and an AI copilot that actually knows your fleet."                     | 13s    |
| 3   | `/login`                                             | Show the live night-map panel behind the login form                                                                                                                                                                                                                                                                                                                                 | **"Secure, role-based access"**                                              | "Every account is scoped by role — dispatcher, fleet manager, or admin."                                                                                           | 10s    |
| 4   | `/fleet-management/operations/overview`              | Load the Overview hero — KPI tiles, radar sweep — then let the camera rest a beat on the **AI insight card** (AI touchpoint #1)                                                                                                                                                                                                                                                     | **"Fleet Overview"**                                                         | "The moment you log in, you see what matters — and the AI is already surfacing what needs attention."                                                              | 20s    |
| 5   | `/fleet-management/operations/map`                   | **The hero shot.** Load, let 3D vehicles move along real roads for a few seconds, zoom into one (triggers its real 3D model), click it to open the vehicle card, show the highlighted route                                                                                                                                                                                         | **"Live Fleet Map"** → **"Real 3D vehicles, road-accurate routing"**         | "This is the centerpiece — every vehicle rendered as a real 3D model, moving at real speed, following actual roads. Click any truck and its live route lights up." | 45s    |
| 6   | same, zoomed out                                     | Zoom out to the clustered fleet view, open the fleet list panel                                                                                                                                                                                                                                                                                                                     | **"Full fleet, one view"**                                                   | "Zoom out and the whole fleet clusters cleanly — zoom back in and every vehicle is individually trackable."                                                        | 15s    |
| 7   | `/fleet-management/operations/trips`                 | Click two status chips to multi-select (Planned + In progress), open "Create Trip"                                                                                                                                                                                                                                                                                                  | **"Plan and dispatch trips"**                                                | "Dispatchers can filter by multiple statuses at once, and spin up a new trip — vehicle, driver, route — in seconds."                                               | 20s    |
| 8   | `/fleet-management/operations/vehicles`              | Show the vehicle creation flow (no AI content here — see the correction note above)                                                                                                                                                                                                                                                                                                 | **"Fleet, fully managed"**                                                   | _(tbd — no longer the AI line; revisit wording since the old voiceover referenced a feature that doesn't exist)_                                                   | 15s    |
| 9   | `/ai`                                                | **AI touchpoint #2, the deep dive — revised 2026-10-10, see the detailed recording script below the table.** Two distinct Q&A threads (fuel-cost, HOS/driver-risk) + one Automations toggle + the three bottom forecast panels — deliberately different content from the Overview card's "Summarise yesterday"/"Show wear trend" exchange already captured in `overview_page.webm`. | **"AI Copilot"**                                                             | "Ask it anything about your fleet, in plain language, and it answers from your real data — with the numbers to back it up, and one-click actions to act on it."    | 50-55s |
| 10  | `/fleet-management/analytics/fuel` or `/utilisation` | Switch between two analytics views, hover a chart                                                                                                                                                                                                                                                                                                                                   | **"Analytics that go deep"**                                                 | "Fuel, maintenance, utilisation — every report built for a real operations team, not a toy dashboard."                                                             | 18s    |
| 11  | `/roles-permission`                                  | Show the roles list, open one role's permission grid                                                                                                                                                                                                                                                                                                                                | **"Real role-based access, enforced end-to-end"**                            | "Granular roles and permissions, enforced all the way through the backend — ready for a real multi-team company."                                                  | 13s    |
| 12  | title card                                           | Static card, same text as #0                                                                                                                                                                                                                                                                                                                                                        | _(the card itself)_                                                          | "ConvoyAI — a full-stack platform built for fleets that need to see everything, in real time."                                                                     | 10s    |

**Total estimate: ~3:50.**

---

## `/ai` detailed recording script (2026-10-10, revised — AI is now the project's biggest selling point)

Verified live in the controlled tab before writing this. The AI module is presented as real, proper enterprise AI in captions/voiceover — no "preview/mock" caveat — per the owner's explicit call: the real backend is ~95% built in a separate repo and will be wired in later, this Claude session is UI-only on purpose. `CopilotChat.tsx`'s "thinking" delay is now variable (not a fixed 900ms) so each answer pauses a believable amount before appearing — longer for data-heavy answers, with jitter.

**Before recording:** make sure you're on the rebuilt production server (`next start -p 3000`, not dev) so the variable-delay change is live, and that you're already logged in (don't record the login step on this page — that's `login.webm`'s job).

1. **Load `/ai` cold.** Let the empty Copilot state sit for a beat — orb icon, "What should we look at?", the subtitle line. This establishes it as its own full workspace.
2. **Click into the chat input and type exactly:** `Which vehicles will cost the most in fuel this week?` — press Enter. Wait for the orb to finish "thinking" and the answer to type out: the 4-vehicle fuel-cost bars (KHI-2291, LHE-1180, KHI-0764, ISB-3302, each with a money figure).
3. **Click the chip "Create idle-reduction plan"** (left-hand chip, under the bars). Wait for the plan response: "Drafted a plan: cap idling at 10 minutes... Projected saving is [X] per week."
4. **Click into the chat input again and type exactly:** `Who's at risk of an hours-of-service breach?` — press Enter. Wait for the answer: "Three drivers are predicted to reach their hours limit before 19:00..."
5. **Click the chip "Reassign trips"** (left-hand chip). Wait for: "Moved two afternoon trips to drivers with 3+ hours left. All three drivers now finish inside their limit."
6. **Toggle the "Book services automatically" switch ON** in the right-hand Automations panel (it starts off by default) — a real, visible state change, not a chat message.
7. **Scroll down** to the bottom row — **move your cursor over the right-hand column or page margin to scroll, not over the chat panel itself**, since the chat has its own internal scroll and will eat the scroll input otherwise. Let the three panels register for a couple seconds each: Maintenance forecast (bars), Fuel spend forecast (chart), Driver risk score (rings).

That's the whole shot, ~50-55s. Nothing from this sequence repeats the Overview card's already-recorded "Summarise yesterday" → "Show wear trend" exchange.

---

## Pre-capture checklist (do once, right before recording)

- [x] Map toolbar 3D-toggle contrast fixed (`7c5040f`)
- [ ] Showcase data mode ON (realistic Pakistani fleet — 56 vehicles, 44 drivers, ~160 trips, named yards)
- [ ] No `ZZ…`-prefixed test records visible anywhere in the recorded screens
- [ ] Console clean on every screen in the list above
- [ ] Browser window at a clean, consistent size (no devtools open, no extension banners)
- [ ] Logged in as the seeded user beforehand for the app shots; logged-out state staged for landing/login
- [ ] Specific trip picked for shot 7 (any representative Planned trip with a clean route is fine — pick at
      capture time)
- [ ] Specific vehicle picked for shot 8 (any vehicle with upcoming maintenance reads well)
