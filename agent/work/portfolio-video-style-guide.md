# Portfolio demo video — reusable style guide

Not project-specific. Written so the same conventions apply whether a video is edited from Claude-captured
clips (like ConvoyAI's) or from footage recorded entirely outside Claude (like the owner's other project,
already recorded, still needs voiceover/captions/cutting). Keep this file in sync if the conventions change
while editing either video — it's the single source of truth for "how our portfolio videos look and sound."

## Structure: standalone + mergeable

Every project's video is its own self-contained chapter:

- Opens and closes on a short **title card** (project name + one-line positioning, ~2-3s each).
- The voiceover script never references anything outside that project ("as shown before," "the other
  project," etc.) — it has to make sense whether it's played alone or spliced into a longer reel.
- This lets the owner use each project's segment two ways: (a) concatenated — intro-with-face (~30-50s) +
  project A (2-4 min) + project B (2-4 min) = one ~5-9 min hero video for the portfolio homepage / Upwork
  profile, or (b) standalone — just one project's segment attached to a cover letter or a job post that
  needs that specific skillset shown.

## Captions

- **Short section titles only** — a lower-third naming what's on screen ("Live Fleet Map", "AI Copilot"),
  not a transcript of the voiceover. The voiceover carries the explanation; captions just orient the viewer
  between beats.
- One caption per shot/scene, shown for roughly the first 2-3s of that shot, then faded (exact timing is an
  editing-stage decision, not locked here).
- Title case, short noun phrases ("Live Fleet Map" not "This is our live fleet map").

## Voiceover tone

Short, confident, benefit-led. One sentence per shot wherever possible — what it _does for the user_, not
what it's built with ("Click any truck and its live route lights up," not "built with deck.gl and
WebGL"). Avoid filler ("so basically," "as you can see"). Read fast enough that a ~2.5-4 min project segment
doesn't drag.

## Honesty in claims

Describe what the product genuinely does, confidently — never invent a specific technical claim that isn't
true (e.g. don't say "powered by GPT-4" unless that's literally the case). If a feature is a convincing
scripted/mocked demo rather than a live integration, describe the _experience_ it delivers rather than
asserting unverified backend specifics.

## Shot pacing

- The single most impressive/differentiating feature of a project gets the longest single shot (ConvoyAI:
  the live map, ~45s). Everything else is 10-25s beats.
- Don't visit every single screen a project has — pick the screens that look best on camera and tell the
  clearest story; a long feature list reads as padding, not as impressive.

## Clean-view discipline

Before capturing/recording anything: no test/throwaway data visible (ConvoyAI's convention is `ZZ…`-prefixed
records — delete or filter them out of what's shown), no console errors, no half-built states, realistic
and specific sample data everywhere on screen (never "Test Company" / "Lorem ipsum" — see ConvoyAI's
"invented content must look genuinely real" rule, which is a good default for any portfolio project).
