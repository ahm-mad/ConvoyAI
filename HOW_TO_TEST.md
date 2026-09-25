# How to test the redesigned ConvoyAI app locally

> **⚠️ 2026-09-09:** The app is now **Next.js 15 (App Router) + TypeScript**, not Vite.
> Ignore the zip/backup steps below (that was a pre-git redesign hand-off). To run it now:
>
> ```
> npm install
> npm run dev            # Next dev server (add NODE_OPTIONS=--max-old-space-size=4096 if it restarts on memory)
> # or a production check:
> NODE_OPTIONS=--max-old-space-size=6144 npm run build && npm run start
> npm run typecheck      # tsc --noEmit (must stay clean)
> ```
>
> `.env.local` needs `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PUSHER_KEY`,
> `NEXT_PUBLIC_PUSHER_CLUSTER`, `NEXT_PUBLIC_MAPTILER_KEY`. The route-by-route
> QA checklist below is still valid — the routes and behaviour are unchanged.
> Migration detail: `task.md`.

---

This zip is your **entire frontend project** with every change from this
session applied — not a diff. A handful of large binary files (Unity WebGL
builds, videos, images) were excluded since they're unchanged and you
already have them; everything else is included.

## 1. Back up first (you don't have git yet)

Copy your current project folder somewhere safe before overwriting anything:

```
cp -r /path/to/ConvoyAIFrontend /path/to/ConvoyAIFrontend_backup
```

## 2. Apply the new files

Unzip `convoyai_full_project_noc_redesign.zip` and copy everything from it
**into** your real project folder, overwriting matching files. Because the
large media/Unity folders were excluded from this zip, copying it over won't
touch or delete anything in `public/unity`, `public/DiaryFarm`, or your
existing images/videos in `src/assets` — those stay exactly as they are.

## 3. Install and run

```
cd /path/to/ConvoyAIFrontend
npm install
npm run dev
```

Open whatever URL Vite prints (usually `http://localhost:5173`).

## 4. What to check

Log in, then walk through these — flip the sun/moon theme toggle (top-right
of the topbar) on a few of them to confirm both light and dark work:

- **Shell** — sidebar, navbar, active-nav states
- **Login / Register** — and try Forgot Password / Reset Password / Verify
  Account too, those got a full pass this session
- **Dashboard** — the widget grid, add-widget panel, and drop a few
  different widget types onto it (Battery, Temperature, Water Leak, Tank
  Level, etc.) — these had a real bug fixed (invisible black text) so
  worth specifically checking
- **Assets / Digital Twin** — the antd Tree is the single highest-risk
  change in the whole session (different theming system than the rest of
  the app) — check it in both themes
- **Devices, Rules (list + add/edit), Map**
- **Admin** — Companies, Users, Roles & Permissions, Account Settings
- **Product configuration** — Manage Product → device config → protocol
  integration (HTTP/MQTT tabs)
- **Tutorials page** — never touched until late in this session
- **A broken URL** (e.g. `/this-does-not-exist`) — to see the 404 page,
  also fixed late in this session
- **Toast notifications** — trigger any success/error toast (e.g. save
  something) — the global toast styling was a real bug fix
- **The page-transition loading bar** at the very top of the screen —
  navigate between any two pages and watch for it. It was hardcoded violet
  and never touched until the very last pass, so it's worth a specific look
  since it fires on literally every navigation in the app

## If something looks wrong

Most likely culprits, in order of probability:

1. A page/component that wasn't in scope this session (there's a long tail
   of small files we didn't get to)
2. The antd Tree in Assets — flagged above as the highest-risk item
3. Something Unity-specific that needs the actual WebGL build present to
   render correctly (those folders were intentionally excluded from testing
   here since they're unchanged, but confirm they still load)

Tell me what you find and I'll dig in.
