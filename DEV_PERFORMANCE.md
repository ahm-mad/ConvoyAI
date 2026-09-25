# DEV_PERFORMANCE.md — `next dev` memory runaway: findings, tooling, next steps

> **Read this first if you're resuming the dev-server memory / laptop-freeze investigation.**
> Written 2026-09-18. Everything here concerns **local development only**. Production
> (`next build` / Vercel) is unaffected — see §6.

---

## 0. TL;DR

- **Symptom:** `npm run dev` → open pages in Chrome → `next-server` balloons (kernel logs showed
  OOM-kills at ~7.1–7.4 GB RSS, 200% CPU, ~90 °C) → laptop (Dell Vostro 5490, 15 GB RAM, 2 GB swap)
  hangs → forced power-off. Kills first appeared 2026-09-18, i.e. after the js→ts commits.
- **Root cause of the _runaway_ (found 2026-09-19, second incident): a code-level compile explosion in
  ONE route, not the cache.** `/roles-permission` crashed the dev server (JS heap OOM at 2.5 GB, then
  4.96 GB on the restart; the open Chrome tab re-requested it every restart → crash loop, 99 °C, 1.8 GB
  swap). It reproduced from a **fresh process AND a fresh `.next`** (3.9–4.1 GB → cap-kill), so it is not
  the cache. Cause: `src/utils/ReactIconDynamicImport.tsx` holds ~64 `() => import('@assets/icons/ReactIcon/XIcon')`
  entries; each wrapper imported one icon from one of ~20 giant `react-icons` packs (`md` 2 MB, `pi`
  5.7 MB, 85 MB total). `/roles-permission` reaches it (RolesPermission → CardRole → AddMemberForm →
  IconWrapper), and webpack dev compiles every dynamic import eagerly, so it parsed ~20 packs at once.
  **Fixed** (§2b). Proof: map emptied → 1.7 GB / 10.7 s; local-icon fix → **1.83 GB / 10.9 s** (was 4 GB+ killed).
- **The first incident (2026-09-18, `/login`, 3.7 GB in 9 s) is still not fully explained.** `rm -rf .next`
  fixed it then, so a stale cache was blamed — but the same "wipe .next" did NOT help `/roles-permission`,
  and `/login` doesn't reach the icon map. Treat "stale cache" as a plausible one-off, unproven.
- **Separate, structural cause of _heavy_ dev memory:** webpack dev keeps the module graph of every
  compiled route in memory. With a **healthy** cache, RSS still climbs ~1 GB → ~4 GB as you open pages
  (§3). This is normal Next-webpack behaviour on this dependency set; it is not a bug and not TS.
- **What's in place now:** `npm run dev` is a guarded wrapper (memory cap, logs, monitor, auto-restart);
  `npm run dev:report` summarises a session after a freeze (§4, §5).
- **Not caused by TypeScript** (SWC strips types; no type-check in dev) and **not caused by**
  `src/utils/fakeBackend` (msw/dexie/`Data.tsx`) — stubbing it out changed nothing (§2).

---

## 1. Evidence collected (facts)

| #   | Fact                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Kernel journal: boot −2 had 3 OOM-kills of `next-server`, boot −1 had 2; each with anon-rss ≈ 7.1–7.4 GB. Nothing else >~450 MB. Boots −3..−5: none. No thermal/GPU/disk errors → memory exhaustion + swap thrash. |
| 2   | Backend (4 Node procs via pm2, ~500 MB) is **not** involved.                                                                                                                                                       |
| 3   | Reproduced _without a browser_ (`curl localhost:3000/` then `/login`) under a 4 GB cgroup cap: RSS 767 → 1309 → 2386 → 3000 → 3772 MB in ~9 s, then cap-kill. `/` compiled fine (2229 modules, 2.3 s).             |
| 4   | `rm -rf .next` → `/login` compiled in 3.1 s (2495 modules), peak ~1.1 GB.                                                                                                                                          |
| 5   | Warm restart (cache populated by the healthy run) → `/`,`/login`,`/home`,`/assets` fine (max 2.4 GB at `/assets`).                                                                                                 |
| 6   | Stray `~/package.json` + `~/package-lock.json` (Jan 2026) made Next infer the workspace root as `$HOME` (startup warning). Setting `outputFileTracingRoot` removed the warning; **no measurable memory effect**.   |
| 7   | Production build: `NODE_OPTIONS=--max-old-space-size=6144 npx next build` → exit 0, 75 s, **4.0 GB peak RSS**, 37 static pages.                                                                                    |

## 2. Hypotheses tested

| Hypothesis                                                                      | Result                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fakeBackend / msw / dexie / `Data.tsx` pulled in by `Login.tsx` (static import) | **Ruled out.** Stubbing the import left `/login` at 3.6 GB peak. (It is still worth making lazy — see §7.)                                                                                                                                                                                                                                            |
| Stale `.next` cache                                                             | Cured the **1st** incident (`/login`, fact 4) — cause still unproven; did **not** explain the 2nd (`/roles-permission`).                                                                                                                                                                                                                              |
| Stray lockfile → workspace root = `$HOME`                                       | Fixed the warning; no memory effect. Kept (harmless).                                                                                                                                                                                                                                                                                                 |
| `experimental.webpackMemoryOptimizations: true`                                 | **No effect** (identical curve). Removed.                                                                                                                                                                                                                                                                                                             |
| Lower V8 heap (`--max-old-space-size=2048`)                                     | Reclaims some slack (RSS fell to ~2.3 GB after `/manage-product`) but compile **peaks** unchanged (~3.4–3.8 GB). Not a fix by itself.                                                                                                                                                                                                                 |
| `next dev --turbopack`                                                          | **Not viable now:** every route 500s — `Module parse failed` on `./src/GuestHomeComponents/assets/hero-twin.mp4`. Turbopack has no equivalent of our custom webpack `asset/resource` rule (`next.config.mjs`) that makes `png/svg/mp4/…` imports resolve to URL strings (~58 call sites). Memory numbers from that run are meaningless (all errored). |
| Custom webpack asset rule looping                                               | Not the runaway cause. Not otherwise examined.                                                                                                                                                                                                                                                                                                        |
| Stale `.next` explains everything                                               | **Disproved for the 2nd incident** (fresh `.next` still crashed `/roles-permission`).                                                                                                                                                                                                                                                                 |
| Icon-pack dynamic imports (`ReactIconDynamicImport`)                            | **CONFIRMED root cause of the `/roles-permission` crash** (§2b).                                                                                                                                                                                                                                                                                      |
| Circular imports / barrels (`madge`)                                            | **Not tested.**                                                                                                                                                                                                                                                                                                                                       |

## 2b. The fix for the icon-pack blowup (applied)

- `src/assets/icons/ReactIcon/iconManifest.json` — `{ "MdAir": "md", … }` (70 icons → pack).
- `scripts/gen-react-icon-data.mjs` (`npm run gen:icons`, runs `--verify`) — copies just those 70 SVG trees
  out of `node_modules/react-icons/<pack>/index.mjs` into the generated
  `src/assets/icons/ReactIcon/iconData.ts` (41 KB; `GenIcon(tree)` from the tiny `react-icons/lib`).
  `--verify` renders every icon with the original pack and the local copy and requires **byte-identical
  markup** (result: all 70 identical).
- The 70 `ReactIcon/*.tsx` wrappers now `import { MdAir } from './iconData'` instead of `'react-icons/md'`.
  Their exports/props are unchanged. **To add an icon:** add `"NewName": "pack"` to `iconManifest.json`,
  run `npm run gen:icons`, import from `./iconData`.
- Verified: `tsc` 0 errors; `next build` OK (39 s, was 48 s); `/roles-permission` and `/users/1/profile`
  each compile alone at ~1.8–1.9 GB.
- Other files still import `react-icons/*` directly (~80 files; md/pi/fa/… ) — those are heavy too but did
  not blow up on their own. Same trick can be applied later if another route misbehaves (use the closure
  scripts idea in §7).

## 2d. Is the icon fix behaviour-neutral? Evidence — and how to REVERT it

**What changed (and only this):** in each of the 70 `src/assets/icons/ReactIcon/*.tsx` wrappers, exactly one line —
`import { MdAir } from 'react-icons/md';` → `import { MdAir } from './iconData';`. Component bodies, props,
default exports, and every consumer (`ReactIconDynamicImport.tsx`, `IntegrationSubNav.tsx`, all forms)
are untouched. New files: `iconData.ts` (generated), `iconManifest.json`. Also `.prettierignore` gained
`src/assets/icons/ReactIcon/iconData.ts` so the pre-commit prettier hook can't reformat the generated file.

**Evidence it is neutral (all re-checked before committing):**

1. `git diff --numstat` on the wrappers: 70 files, +70 −70, every file exactly 1/1; the only changed lines
   normalise to one pattern (`import { X } from 'PACK'` → `import { X } from './iconData'`).
2. `npm run gen:icons` (→ `--verify`): for all 70 icons, `renderToStaticMarkup` of the original react-icons
   component and of the local `GenIcon(tree)` copy (with `className`, `size`, `title` props) are
   **byte-identical**. (react-icons icons _are_ `GenIcon(<tree>)`; we copy the tree verbatim via JSON.parse.)
3. Regenerating `iconData.ts` is reproducible (`cmp` identical).
4. `tsc --noEmit` 0 errors · `next build` exit 0 (39 s) · `/roles-permission` and `/users/1/profile` serve HTTP 200.
5. Round-trip: `--revert` returns the wrappers to exactly their pre-change git content (empty `git diff`), and
   re-applying gives back exactly the optimized state.
   Caveat: verified at the markup level + build/serve. Not visually eyeballed in a browser (identical markup ⇒
   identical rendering).

### How to revert (pick one)

**A. Git (cleanest).** Find the commit: `git log --oneline -- src/assets/icons/ReactIcon/iconData.ts`
(subject starts `perf(dev): stop /roles-permission compiling ~20 react-icons packs`), then
`git revert <that-sha>`. This restores the 70 wrapper imports and removes `iconData.ts`, `iconManifest.json`,
the `gen:icons` script/generator changes and the `.prettierignore` line.

**B. Keep the files, undo the effect only:**

```bash
node scripts/gen-react-icon-data.mjs --revert   # wrappers import from 'react-icons/<pack>' again (tested)
git rm src/assets/icons/ReactIcon/iconData.ts   # optional: nothing imports it after the revert
npx tsc --noEmit                                 # expect 0 errors
```

**Consequence of reverting:** `/roles-permission` (and any route reaching `ReactIconDynamicImport`, e.g. via
`AddMemberForm` / `AddUserForm` / `AddCompanyForm` / `DashboardForms/*`) goes back to 4 GB+ compile and the
dev server can crash (see §0). Production is not affected either way.

**Re-apply later:** `git revert` the revert commit, or run `npm run gen:icons` (regenerates `iconData.ts` from the
manifest) and re-point each wrapper's import to `'./iconData'`.

## 2c. What is STILL heavy after the fix (structural, not a bug)

Full-route sweep after the fix (fresh `.next`, heap 2560 MB, cap 5 GB): `/` 0.9 GB → `/home` 2.2 → `/assets`
3.5 → `/manage-product` 3.8 → `/analytics` 4.2 → `/users` 4.4 → **server cap-killed at `/users/1/profile`
(~4.5 GB)** — but `/users/1/profile` compiled ALONE peaks only 1.9 GB, so this is accumulation, not a
pathological route. Before the fix the same kind of sweep died earlier (`/analytics`, 4 GB cap).
Tested and rejected: `devtool:false` (no source maps) → ~15–20 % lower (3.4 GB at `/analytics`) but still
grows to 4.5 GB and hurts debugging; `webpackMemoryOptimizations`; `transpilePackages:['react-icons']`
(no effect); 2 GB heap (trims slack only). So a full click-through of the whole app in one dev session can
still reach the cap; `dev-safe` then restarts the server (warm cache: ready in ~2 s).

## 3. Healthy-cache memory profile (webpack dev, heap 3072 MB, fresh `.next`)

Peak next-server RSS while compiling each route (from `sweep` runs; killed by the 4 GB cap at `/analytics`):

```
/ 923MB  /login 981-1086  /register 1087  /use-cases 1588-1651  /home 2200-2241  /dashboard/1 2373
/assets 3350-3488  (5.8-5.9k modules!)  /manage-product 3746-3844  /map 3688  /profile 3833  /analytics 4012+ (killed)
```

Module counts: `/` 2.2k · `/login` 2.5k · `/home` 3.0k · **`/assets` 5.9k** · `/manage-product` 2.9k.
With heap 2048 MB the same sweep survived `/analytics` but died at `/users` (cap 4 GB).
Conclusion: a full click-through of the app under webpack dev cannot stay under ~2 GB.
Dev chunk sizes: `(app)/layout.js` ≈ 19 MB, `analytics/page.js` ≈ 6 MB, fakeBackend chunk ≈ 3.5 MB.

## 4. Tooling (all in the repo; dev-only)

| File                              | Role                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `scripts/dev-safe.sh`             | What `npm run dev` runs. Cap + heap limit + logs + monitor + auto-restart + `.next` guard.       |
| `scripts/dev-monitor.sh`          | Black-box recorder, started by dev-safe; fsync'd every sample.                                   |
| `scripts/dev-report.sh`           | `npm run dev:report` — summarise the latest session.                                             |
| `package.json`                    | `dev` → dev-safe · `dev:raw` → plain `next dev` · `dev:report` → report.                         |
| `.gitignore`                      | `/.dev-logs/` (file uses **CRLF** — edit it byte-safely, e.g. with `sed`, not Python text mode). |
| `scripts/gen-react-icon-data.mjs` | `npm run gen:icons` (generate + verify) / `--revert` — see §2b, §2d.                             |
| `next.config.mjs`                 | `outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url))`.                           |

**`npm run dev` does:**

1. Refuses to start if a `next-server` is already running.
2. If `.next/BUILD_ID` exists (left by `next build`) → `rm -rf .next` first.
3. Runs `npm run dev:raw` inside `systemd-run --user --scope -p MemoryMax=$DEV_MEM_CAP -p MemorySwapMax=0`
   (default **5G**; falls back to uncapped with a WARNING if systemd-run is unavailable), with
   `NODE_OPTIONS="--max-old-space-size=$DEV_HEAP_MB --report-on-fatalerror --report-directory=.dev-logs"`
   (default heap **2560**).
4. Timestamps every server line into `.dev-logs/session-<ts>.log`.
5. Monitor → `.dev-logs/monitor-<ts>.log`, one line / 2 s:
   `next= chrome= avail= swap= memstall= cpustall= temp= route=[last Compiling/Compiled/GET line]`,
   plus `PEAK` lines (each +250 MB high-water mark) and `SNAPSHOT` blocks (top procs by RSS/CPU when
   next > 2500 MB, avail < 3000 MB or temp ≥ 85 °C; throttled to 1 per 20 s).
6. If the server exits **without you pressing Ctrl-C** (cap-kill / crash) → logs
   `RESTART: dev server exited unexpectedly (peak next=…MB, last route=[…])` and restarts it
   (max `DEV_MAX_RESTARTS`=3 per 10 min; **gives up immediately if the same route crashed the server twice in a row** — added after the `/roles-permission` crash loop). Note: the exit _status_ is unreliable (a cap-kill can look like
   status 0) — that's why "unexpected = you didn't ask" is the detector.
7. Keeps only the 15 newest session/monitor logs.

**Env knobs:** `DEV_MEM_CAP` (5G) · `DEV_HEAP_MB` (2560) · `DEV_MAX_RESTARTS` (5) ·
`DEV_MONITOR_INTERVAL` (2) · `DEV_NEXT_WARN_MB` (2500) ·
`DEV_HEAP_SNAPSHOT=1` (opt-in: `--heapsnapshot-near-heap-limit=1`, writes a large `.heapsnapshot`
into `.dev-logs/` — the real "what is holding the memory" data; needs headroom to write).

## 5. What to do after a hang / forced reboot

1. `cd ~/projects/fe-convoyai && npm run dev:report` (or `bash scripts/dev-report.sh <monitor-log>` for an older one).
2. Paste the output to Claude. It prints: session events (restarts/kills), PEAK lines with the route at
   that moment, worst routes by RSS, heaviest module counts, last 12 monitor samples, last SNAPSHOT
   (who was using memory/CPU), max temp / min avail RAM / max memory-stall, and kernel OOM lines for
   this and the previous boot.
3. How to read it:
   - `next=` climbing while `chrome=` flat → dev server is the hog (expected pattern so far).
   - `chrome=` climbing or another process at the top of SNAPSHOT → not Next.
   - Last monitor sample **much earlier** than the moment you rebooted → the whole machine froze
     (memory-stall/thrash) before the sampler could write; look at `avail`/`memstall` just before.
   - A `RESTART:` line = the cap saved the laptop; the line names the route being compiled.
4. First-aid if it recurs: stop dev (the wrapper now gives up by itself after the same route crashes twice
   in a row — close the browser tab too, or it re-requests the route), then **keep the evidence before wiping**:
   `mv .next /tmp/next-bad` (the first incident's stale cache was deleted un-inspected, so we never learned
   _why_ it went bad — compare its size/contents, e.g. `du -sh /tmp/next-bad/cache/*`, and tell Claude), then start dev again. Never run uncapped `next dev` while
   investigating.
5. Older backend-session harness (`~/convoyai-monitor/`, outside the repo) still exists and does the same
   job manually; the in-repo tooling supersedes it.

## 6. Production / Vercel impact: none

- `dev-safe.sh`/`dev-monitor.sh`/`dev-report.sh` and `.dev-logs/` are dev-only; Vercel never runs the
  `dev` script and `scripts/` isn't bundled.
- `next.config.mjs` change (`outputFileTracingRoot` = repo root) matches what Vercel uses; verified
  `next build` exit 0 after it.
- Hobby tier notes (**from memory — verify on Vercel's pricing/limits page**): build container memory
  is ample vs our 4.0 GB build peak (task.md: if a Vercel build OOMs, set env
  `NODE_OPTIONS=--max-old-space-size=8192`); the app is a client-only shell (`ssr:false`) so serverless
  runtime is minimal; `public/` is ~72 MB (unity 46 MB + DiaryFarm 26 MB) so heavy use of the 3D pages
  counts against Hobby bandwidth; Hobby is non-commercial use only.

## 7. Recommended next steps (none done yet), cheapest first

1. (done) Tooling + icon fix committed — see `git log`.
2. **Make `Login.tsx` import fakeBackend lazily** (`const { setupDemoMode } = await import(...)` inside
   the demo-login handler, as `app/bootstrap.tsx` already does). Small win; also correct hygiene.
3. **Cut the module graph** (this is the real, structural fix): consolidate icon sources
   (lucide + ~20 `react-icons/*` packs + `@mui/icons-material`), avoid pulling antd/three/reactflow into
   `/assets` eagerly (lazy-load the tree/3D viewers), review whether three UI libraries (MUI, antd,
   Radix) are all needed. Measure with the sweep in §8 after each change.
4. **Turbopack**: needs a Turbopack-compatible replacement for the asset-URL rule (e.g. a small local
   loader, or move media into `public/` and reference by URL string). Then re-run the sweep; Turbopack
   normally uses far less memory.
5. (Method that found the icon culprit) resolve a route's static import closure with the TypeScript API +
   tsconfig paths and count per-import subtree size / external packages — a route with 70+ files all importing
   `react-icons/*` stood out immediately (screen closures are normally 7–30 files). Then bisect by stubbing.
6. Run `npx madge --circular --extensions ts,tsx src app` (hypothesis never tested).
7. If a freeze recurs with the new tooling → use `dev:report` + `DEV_HEAP_SNAPSHOT=1` to see what holds memory.

## 8. Reproduction / measurement recipe (cap-safe)

```bash
cd ~/projects/fe-convoyai && rm -rf .next
npm run dev            # in one terminal (capped + logged)
# in another terminal — hit routes without a browser and watch .dev-logs/monitor-*.log:
for r in / /login /home /assets /manage-product /map /profile /analytics; do
  curl -s -o /dev/null -m 120 -w "$r %{http_code}\n" localhost:3000$r; done
npm run dev:report
```

(A full-route sweep script used during the investigation lived in the session scratchpad and is not
kept; the loop above is the minimal equivalent. Route list = `find app -name page.tsx`; dynamic
segments can be given dummy values like `/dashboard/1`.)

## 9. "Did the JS→TS / Vite→Next conversion cause this?" — straight answer

- **TypeScript: no.** Dev uses SWC, which strips types without checking them.
- **The runaway: a code-level problem that already existed in the Vite app** (64 dynamic imports over ~20
  giant icon packs). Vite dev didn't choke on it because it pre-bundles dependencies once and serves modules
  on demand; Next's webpack dev eagerly compiles every dynamic import. Not caused by the TS conversion or
  by a faulty migration — the migration just exposed it. (The first `/login` incident remains unexplained.)
- **The steady heaviness: partly the Vite→Next switch, by tool design.** Vite dev pre-bundles
  node_modules once and serves files on demand; Next's webpack dev builds and holds a module graph per
  route. This app is dependency-heavy (3 UI libs, many icon packs, three/reactflow/apexcharts/chart.js/
  msw/dexie) and everything is a client bundle (`ssr:false` root shell — a deliberate "faithful port"
  choice), so nothing is offloaded to the server. The migration itself was faithful (prod build + Vercel
  previews work); it is not "converted improperly" and Next handles much larger apps. The old Vite app's
  dev memory was **not measured**, so "was fine in React" is the owner's observation, not a benchmark.
