# Machine, environment & safeguards (moved here from Claude's cross-session memory, 2026-09-27)

This file exists so a session running under a **different model or tool** (not Claude Code, no access to
Claude's own memory system) still has this information. It was previously known only through Claude's
memory files under `~/.claude-usama/.../memory/*.md`, which a different assistant cannot read. Read this
once; it rarely changes.

## The owner's machine

- Ubuntu 22.04, **15 GB RAM, 8 CPU cores, only 2 GB swap**, no early-OOM protection installed by default.
- On 2026-09-29 the machine froze completely (keyboard/mouse/trackpad unresponsive, needed a hard reboot)
  because a Chrome renderer tab grew to ~5.8 GB / 85% CPU (load average 17 on 8 cores) while the dev server
  and a `typecheck` were also running at the same time. **Lesson: never run several heavy jobs at once** —
  a production build, a full route crawl, several Chrome tabs on the live map, and a `typecheck` should not
  overlap. Space them out.

## The resource-guard safeguard (already installed, do not touch or duplicate)

A user-level (no sudo) systemd service is already installed and running:

- Binary: `~/.local/bin/resource-guard`; service: `resource-guard.service` (systemd --user).
- Behaviour (the owner asked for exactly this, after rejecting a noisier first version): **one desktop
  notification** when RAM usage reaches 80% (i.e. less than 20% free), listing the biggest processes with
  the exact `kill <PID>` command for each. It only fires again once available RAM has gone back above 25%
  ("re-arms"). It never kills anything itself.
- `resource-guard --status` prints the current numbers once; `resource-guard --test` sends a sample
  notification. Log file: `~/.local/state/resource-guard.log`.
- **The owner explicitly does not want more than this**: no swap/CPU/load-average triggers (an earlier
  version alerted every 30 s because swap stayed above 80%, which was wrong and was removed), no earlyoom,
  no zram, no sysctl changes, no separate "Chrome launcher" or process-listing helper scripts. **Do not
  re-propose any of these** — the owner already declined them once.
- If the machine feels slow before starting more work, run `resource-guard --status` first rather than
  guessing.

## Dev server rules (repeated from `agent/rules/owner-rules-and-workflow.md`, restated here for completeness)

- Start the dev server **only** with `npm run dev` (the guarded wrapper `scripts/dev-safe.sh`, which caps
  memory around 5 GB via `systemd-run` and logs to `.dev-logs/`). Never `next dev` directly.
- The owner wants the dev server to stay **under roughly 4 GB RAM**. If it grows past that: stop it,
  `rm -rf .next`, restart via `npm run dev`.
- Next.js's own dev server **restarts itself** ("approaching memory threshold") once enough routes have
  compiled in one process — this is normal, not a bug, and it happens more the more routes you visit.
- **Never run `next build` while the dev server is running** — they share the `.next` directory and will
  corrupt each other's output. Stop the dev server first.
- For a whole-app route crawl (needed only at the end of a phase or before a recording — see the QA-cadence
  rule below), the working method is: stop dev, `rm -rf .next`, `NODE_OPTIONS=--max-old-space-size=6144 npm
run build`, `npx next start -p 3000`, crawl every route through hidden same-origin iframes in a logged-in
  Chrome tab (create an iframe, wait ~15 s, check the iframe's `document.body.innerText` for
  `/Application error|client-side exception|is not defined/` and listen for iframe `error` events), then
  restart `npm run dev` afterwards.
- **Killing dev/build processes**: always kill by **PID**, found via `ps aux | grep "[n]ext"` (the bracket
  trick keeps the grep pattern from matching the grep command itself, which matters for the exact same
  reason `pkill -f` is dangerous below). Never run `pkill -f "next start"` (or any pattern) inside a shell
  command that also contains that same text on its own command line — the pattern will match your own shell
  process and kill it instead of the target.

## Backend (out of scope, but a fact worth knowing)

The real Express+Supabase backend happens to be reachable at `localhost:8080` on this machine
(`curl -s localhost:8080/ready` → `{"status":"ready","checks":[{"name":"postgres","ok":true},{"name":"redis","ok":true}]}`).
The frontend never needs it for this project's actual work (backend is permanently out of scope — see the
product-direction rules), but the login screen and the seeded test user only work when it is up, and some
non-showcase pages (`/api/modules`, monthly-registrations) still call it live even in showcase mode (a known,
accepted gap — see `agent/status/current-state-and-open-items.md`).
