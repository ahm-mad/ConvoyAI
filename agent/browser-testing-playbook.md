# Browser testing playbook (moved here from Claude's cross-session memory, 2026-09-27)

Everything below was learned the hard way, in earlier sessions, while verifying this frontend live in a
browser. It previously lived only in Claude's own memory (`~/.claude-usama/.../memory/*.md`), which a
different assistant or model cannot read — that is why it is copied here in full. Read this before doing
any live browser verification of this project, whichever tool you use to drive the browser.

## The owner's testing standard

The owner wants the UI checked **live in a real browser, thoroughly** — every reachable page and every
top-nav menu item, every safe control exercised — never sampled. After an earlier session said "QA complete"
and the owner asked "is every page, every button working?", a stricter, full pass was required. **Never say
"everything works" after only sampling a few screens.** State plainly what was verified and what was not.

## Logging in

- Backend runs locally at `localhost:8080` (see `agent/environment-and-safeguards.md`).
- Seeded test user: `junead@chaminade-hs.org` (company 2, currency PKR). The password is **not** stored in
  any file — ask the owner for it in chat if you need it.
- **Log in only on `localhost`. Never use the demo account** (`demoAccount@chirptech.io` from the old
  workspace) — it is a client-only mock and proves nothing about the real product.
- The login token lives in the browser tab's `localStorage` on `localhost:3000`, so switching the same port
  between `next dev` and `next start` keeps you logged in.
- To see a **logged-out** page (landing `/`, `/login`, `/register`) without losing your session: stash the
  `token` and `user` localStorage keys, clear them, navigate, then restore them from the stash afterwards.
  Example (run in the page's JS console / via a JS-exec tool):
  ```js
  localStorage.setItem(
    'qa-auth-stash',
    JSON.stringify({
      token: localStorage.getItem('token'),
      user: localStorage.getItem('user'),
      isFirstLogin: localStorage.getItem('isFirstLogin'),
    })
  );
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // ... navigate, test, then:
  const s = JSON.parse(localStorage.getItem('qa-auth-stash') || 'null');
  if (s) {
    if (s.token !== null) localStorage.setItem('token', s.token);
    if (s.user !== null) localStorage.setItem('user', s.user);
    if (s.isFirstLogin !== null) localStorage.setItem('isFirstLogin', s.isFirstLogin);
    localStorage.removeItem('qa-auth-stash');
  }
  ```
  This was used successfully several times in the 2026-09-27 session with no problems.

## Screenshot / viewport quirks (Claude-in-Chrome extension specifically)

- Screenshots are **cropped** to about 1254×604 CSS px of a larger (e.g. 1536×740) viewport unless the
  actual Chrome window is in the foreground (not minimised, not occluded). Set
  `document.documentElement.style.zoom = '0.8'` via a JS-exec call to see the full page width — **but only
  for taking the screenshot**: reset it to `''` before running any further interaction script, because CSS
  `zoom` also distorts click coordinates, fixed-position panels, and (observed 2026-09-27) can make map
  controls and coordinate math behave oddly. Never zoom on Leaflet/MapLibre map pages while interacting with
  them — tiles and marker projections mis-size.
- **Deep scroll positions on a long page return a blank screenshot** (solid cream/background colour, no
  real content), even though the DOM at that scroll position is correct and fully rendered. Confirmed
  2026-09-27 on the ConvoyAI landing page (a ~4000+ px tall page) at multiple scroll depths. Workaround: set
  every `<section>` you don't need to `style.display = 'none'` except the one you want to see, then
  `scrollTo(0)` — this brings the section of interest near the top of a now-short page, where screenshots
  work normally. (Reload the page afterwards, or set `display` back to `''` on every section, to undo this.)
  When you only need to confirm a specific value rendered (not see the pixels), reading the DOM/computed
  style directly is more reliable and much cheaper than fighting this limitation.
- Click coordinates can miss at devicePixelRatio ≠ 1 (this machine reports 1.25). Prefer `find` + a ref
  click, or a JS `.click()` on an element located by `aria-label`/text, over raw pixel coordinates.
- A tool result saying "browser-internal URL" after a `navigate` call means the tab context is stale — call
  `tabs_context_mcp` once and retry.
- `resize_window` opens behaviour is inconsistent for testing responsive layouts reliably; a same-origin
  `<iframe>` injected at the width you want (e.g. `width:390px` for a phone check) is more reliable and was
  used successfully throughout the 2026-09-27 session for mobile-width checks.

## Animation / rendering quirks in the controlled tab

- The controlled tab frequently reports `document.visibilityState === 'hidden'`, which means
  `requestAnimationFrame` never fires and `setInterval`/react-query polling can be paused or throttled —
  animations, `CountUp`, and any WebGL map look "frozen" even though nothing is actually broken. Verify
  state through the DOM / computed styles instead of trusting what a screenshot shows moving.
  - This project has a **QA-only fix** for exactly this: set `localStorage['convoyai-qa-raf'] = '1'` and
    reload; `src/components/map/qaRaf.ts` then fakes `requestAnimationFrame`, timers and page visibility so
    the map animates even in a backgrounded tab. It ticks from a Web Worker **with backpressure** (it waits
    for an acknowledgement before sending the next tick) — an earlier version without backpressure spun a
    full CPU core and froze the tab; never remove the backpressure wait if you touch this file.
- **`IntersectionObserver` was observed to never fire even once** in this session's Chrome-extension tab —
  confirmed by observing a plain `document.body` with no other code involved, and it stayed broken even
  after explicitly re-focusing the tab/window. Meanwhile `requestAnimationFrame` and native `scroll`/`resize`
  DOM events fired completely normally throughout. This is very likely specific to this browser-automation
  environment, not something a real visitor's browser would ever do — but because of it, any code in this
  project whose behaviour needs to be verified live through this extension should prefer a scroll+rAF-based
  check over `IntersectionObserver` where practical (see `src/components/landing/LazyMount.tsx` and
  `ScrollStory.tsx`'s step-detection, both deliberately written this way on 2026-09-27 for this reason, and
  it made them independently verifiable in-session too).
- **Hidden-tab timer throttling** (a separate, real Chrome behaviour, not an extension quirk): a background
  tab gets Chrome's "intensive throttling" after about five minutes, so a `setTimeout`-based wait loop can
  fire only about once a minute — a `javascript_exec` call that waits this way will look like "renderer
  frozen or unresponsive" (hitting a ~45 s tool timeout) even though the app itself is fine. Fixes: open a
  **fresh tab** (new tabs are not throttled for their first few minutes), keep every JS call short (a few
  actions, not a long wait loop), or wait with a `MessageChannel`-based sleep instead of `setTimeout`:
  ```js
  window.__sleep = ms =>
    new Promise(res => {
      const end = performance.now() + ms;
      const c = new MessageChannel();
      c.port1.onmessage = () => (performance.now() >= end ? res() : c.port2.postMessage(0));
      c.port2.postMessage(0);
    });
  ```
  Keep every single JS-exec call under about 35 s of real wall time, and every batch of calls under about
  45 s. If a tab genuinely freezes, find and kill only its renderer process (`ps aux --sort=-%cpu | grep
chrome` looking for a `--type=renderer` process, or check CPU with `top -b -n 2` since a plain `ps` %CPU
  figure is averaged over the process's whole lifetime and can be misleading) — never kill the whole browser,
  the dev server, or other tabs.

## Code-correctness pitfalls this specific codebase has (verified, not hypothetical)

- **`// @ts-nocheck` hides real bugs from `tsc`.** Many files (for example `src/components/RadixTable.tsx`)
  start with this pragma, so `npm run typecheck` passing 0 errors does **not** mean those files have no
  undefined identifiers or missing imports — a missing `Search` import once crashed the Products page while
  typecheck stayed green. Always also exercise the actual code path in a live browser. To scan specifically
  for undefined names inside `@ts-nocheck` files: copy `src/`, `app/` and `tsconfig.json` to a scratch
  folder, strip every `@ts-nocheck` line, run `tsc --noEmit` there, and filter for error codes `TS2304`
  (cannot find name) and `TS2552` (did you mean...).
- **The pre-commit hook reformats staged files.** `lint-staged` runs Prettier on commit; after any commit,
  re-read a file before editing it again with a string-replace tool — an edit written against the
  pre-commit formatting can silently fail to match the now-reformatted text, or (worse) match the wrong
  place.
- **CSS layer pitfall.** Every rule in `src/styles/components.css` must stay inside `@layer components`. A
  rule placed outside that layer wins over Tailwind utilities unexpectedly — this once made a button lose
  its `absolute` positioning and render as a bar across the map.
- **The ESLint config is broken** (mid flat-config migration) — do not rely on `npm run lint` for anything.
- **`ConvoyMap` did not call `map.resize()` on its own** until this was fixed on 2026-09-27 (see
  `agent/architecture/map-kit.md`'s "Two real bugs..." section) — any map that mounts before its container's
  final size is settled used to project every marker to the wrong pixel. Now fixed generally with a
  `ResizeObserver`, but worth knowing if an _older_ commit of this code is ever checked out.
- **Raw `map.easeTo()`/`flyTo()`/`jumpTo()` calls take `[lon, lat]`**, the opposite order from the
  `<ConvoyMap center>` **prop**, which takes `[lat, lon]` and converts it internally. Mixing the two up is
  silent (the numbers stay "valid" coordinates, just projected somewhere else on Earth) — see the same
  map-kit.md section for the real incident this caused (a Punjab-area camera landed in the Arctic).
- **Dev-server auto-restart.** Next.js's dev server restarts itself once enough routes have compiled in one
  process; if a page you just navigated to shows a raw error overlay ("Next.js ... Webpack") right after a
  code change, it is very likely mid-recompile — reload once rather than assuming the change broke
  something.
- **Backend noise to ignore:** the pm2 process `convoyai-http` crash-loops with `EADDRINUSE` on port 8080
  because a different backend process already serves it; the API still works fine
  (`curl localhost:8080/ready`). This is not a frontend problem and is out of scope.

## Whole-app crawl method (only needed at the end of a phase — see the QA-cadence rule)

1. Stop the dev server, `rm -rf .next`.
2. `NODE_OPTIONS=--max-old-space-size=6144 npm run build`.
3. `npx next start -p 3000`.
4. In a logged-in tab, for each route: create a hidden same-origin `<iframe>` (`position:fixed;left:-2000px`
   keeps it off-screen but still fully rendered), append it, wait ~9–15 s, then check the iframe's
   `document.body.innerText` for `/Application error|client-side exception|is not defined/` and remove the
   iframe. This checked dozens of routes per tab in earlier sessions without issue.
5. Restart `npm run dev` afterwards (never leave `next start` running as the "current" dev process).
6. Add an axe-core accessibility pass only when the change was structural — axe can be injected via a
   `<script>` tag pulled from a CDN (e.g. jsdelivr) inside the same iframe technique.

## Test-data hygiene

Throwaway records created while testing are prefixed `ZZ...` so they are easy to find and delete again.
Delete what you create. (Hard-delete now exists for never-used vehicles/drivers/yards in the real backend,
if that programme is ever resumed — currently out of scope, see `agent/status/current-state-and-open-items.md`.)
