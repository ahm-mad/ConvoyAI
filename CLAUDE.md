# CLAUDE.md — project entry point

Next.js 15 (App Router) + TypeScript frontend of **ConvoyAI** (formerly ConvoyAI, old repo FE-ConvoyAI; renamed 2026-09-26 in T-001) (IoT/digital-twin platform with a large **Fleet Management** module). The backend (Express + Supabase) is a separate repo and is **out of scope** in this workspace — treat it as the API described in `backend_frontend_sync/api_contract/`.

**Do not re-read the whole repo. Read `agent/README.md` first** — it is a persistent knowledge base written after a full read of all code and markdown (architecture, per-domain docs, owner rules, current state, dependency map, file map). Then open only the files a task actually touches.

Non-negotiable owner rules (details: `agent/rules/owner-rules-and-workflow.md`):

1. Never break what already works — ask the owner before changing any existing behaviour/endpoint/shared component; additive/opt-in work is fine.
2. UI quality bar is enterprise-grade (dark + light, all states, tokens only, WCAG AA); load the `dataviz` skill before chart code.
3. No hardcoded timezone / currency / units (per-company settings; API is always metric).
4. Never use the demo account for testing; verify against the real backend; push only when asked; don't start the deferred lists in `agent/status/current-state-and-open-items.md`.

**Session ritual (mandatory): follow `agent/work/session-ritual.md` — START checklist at the beginning of every session, rolling updates during work, END checklist when the task is done or the owner says wrap up / /clear / switch session (or context is nearly full).**

**Resume protocol (mandatory):** after reading `agent/README.md`, read `agent/work/progress.md` (where the last session stopped) and `agent/work/tasks.md`; continue from "Resume here" without re-planning. While working, keep `progress.md` updated after every meaningful step; when a task is fully done and verified, move it to `agent/work/archive.md`; record decisions in `agent/work/decisions.md`. Rules: `agent/work/README.md`.

Setup: `node_modules` is not installed in this copy → `npm install`; `npm run dev` (guarded), `npm run typecheck`, `npm run build` (needs `NODE_OPTIONS=--max-old-space-size=6144`). Keep `agent/` up to date when you learn something the docs got wrong.
