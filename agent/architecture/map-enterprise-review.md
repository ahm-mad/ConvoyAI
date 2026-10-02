# Live map — enterprise / operator review (2026-09-27, T-006-R2)

Owner asked (not a bug hunt): is this how a big enterprise fleet map looks — too much data, too cluttered, too little? Reviewed by walking every feature live (default view, chips, search, saved views, looks light/night/satellite, 3D, icon styles, layers incl. heat + speed colours, vehicle card, route highlight, trip dropdown, modals).

**Bubbles:** count badges; vehicles that would overlap merge below zoom 8.5; orange = at least one moving, dark = none moving; click zooms in.

**Verdict:** calm, premium, NOT cluttered; data on the map is about right for screenshots, but too light for real operators.

- First glance: opens at country zoom, half the frame is Afghanistan/India/Nepal with ~6 bubbles → reads empty; the best visuals (selected vehicle + route, night + badges, 3D, satellite + route) appear only after clicks. Map is ~half the screen height (header + tabs + title card above it); big fleet products are full-bleed.
- Showcase: night + glossy badges and satellite + route look great. Heat layer blobs are heavy ("sausages"). Orange = brand + moving + route + selection → no colour semantics. Demo controls (speed ×, tour, clean) sit in the main toolbar next to real controls.
- Operators would miss: vehicle list panel (biggest gap), name/plate labels on vehicles at street zoom, alert strip, driver/trip/playback on the vehicle card, optional traffic/weather layers. Toolbar count (~15 icons) is acceptable.

**Recommended order (not started):** 1 hero default state · 2 fleet list panel inside the map (not an app-wide sidebar) · 3 labels at high zoom · 4 group demo controls under "Demo" · 5 taller map · 6 softer heat · 7 alert strip · 8 richer vehicle card · 9 semantic status colours (palette was the owner's choice: ask first).
