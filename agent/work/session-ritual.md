# Session ritual — start, during, and end of every session

Purpose: any session (after `/clear`, a crash, a context limit, or a different chat) must pick up exactly where the last one stopped, and no file may be forgotten. Follow this literally. When the owner says "end session", "I'm going to /clear", "switching session", "wrap up" (or the context is nearly full), run the **End ritual** immediately, without being asked twice.

---

## A. START ritual (first thing in every session — before touching code or answering the task)

1. **Read, in this order** (they are short; don't re-read the project):
   1. `CLAUDE.md` (auto-loaded) — rules + pointers.
   2. `agent/work/progress.md` — the live resume point. Note "Task in flight", "Resume here", "Uncommitted work", blockers.
   3. `agent/work/tasks.md` — active + backlog.
   4. `agent/work/decisions.md` — so you never re-ask decided things.
   5. `agent/README.md` → then ONLY the docs relevant to the task (Fleet: `domains/fleet*.md`; UI: `architecture/design-system-and-ui.md`; API: `backend/*`). Check `agent/status/coverage.md` before opening source files: if an area is listed as "skimmed only", read the actual file before editing it.
   6. `agent/rules/owner-rules-and-workflow.md` if you have not applied it in this session yet (never-break-existing, UI bar, no hardcoding, feature-request flow, push/commit etiquette).
2. **Verify reality against the notes** (notes can be stale): `git status --short`, `git log --oneline -5`, `git diff --stat`. If the working tree differs from "Uncommitted work" in `progress.md`, trust git, reconcile, and note the difference in `progress.md`.
3. **Environment check** (only if the task needs it): `node_modules` present? (`npm install` if not) · dev server running? · backend reachable (`curl -s localhost:8080/ready`)? Record anything unusual under "Environment" in `progress.md`.
4. **Tell the owner in 3–5 lines**: what task is in flight, where it stands, what you will do next, anything blocked/uncertain. If nothing is in flight, say so and ask for the next task.
5. **If the owner gives a new task:** write it into `tasks.md` first (T-### block: their words, scope/non-goals, acceptance criteria, sub-steps), ask clarifying questions as short choice lists (recommended option first), get answers, then set it `IN PROGRESS` and open its section in `progress.md`. Don't start coding before the plan is agreed for anything non-trivial.
6. Append a line to the "Handoff log" in `progress.md`: `<date> — session started; resuming T-### at <step>` (or "new task T-###").

---

## B. DURING the session (rolling updates — this is what makes a crash survivable)

After **every meaningful step** (a sub-step finished, a decision made, a file group edited, a test run, a blocker found) update `agent/work/progress.md`:

- tick the sub-step in the task checklist (`tasks.md` mirrors ticks for big steps),
- "Files touched" (paths + one-line why),
- "Decisions" (also append to `decisions.md` if it is a decision the owner made or a design choice others must respect),
- "Next step" (concrete: file + action),
- "How to verify" (exact commands / URLs / what to click / expected result),
- "Uncommitted work" (from `git status --short`).

Also while working:

- Follow the owner rules (ask before changing existing behaviour; additive/opt-in otherwise; verify live; say what was NOT verified).
- If you discover a doc in `agent/` is wrong, fix it right away (small edit) and mention it in `progress.md`.
- If you find a new bug/idea outside the task scope: add it as a TODO in `tasks.md` backlog; do NOT fix it drive-by.
- Long session? Refresh the "Resume here" block every ~10 tool-heavy steps even if nothing "finished".

---

## C. END ritual (run when: the task is done, the owner says to stop/clear/switch, you are told the context is near full, or you are about to hand off)

Work through this checklist top to bottom and **tick each item in your final message to the owner**:

### C1. Verify and stabilise

- [ ] Code compiles: `npm run typecheck` (0 errors). If relevant: `npm run build` (only when the dev server is stopped) and `npm run lint` on touched files.
- [ ] Live/behavioural check done for what changed (dark + light and widths for UI work; neighbouring features re-checked) — or explicitly listed as NOT verified.
- [ ] No stray debug code, temp files, test data left behind (ZZ-prefixed test records deleted or listed).
- [ ] Dev server / helper processes stopped if you started them (see `rules/owner-rules-and-workflow.md` §E stop recipe).

### C2. Update the tracking files (nothing may stay only in your head)

- [ ] `agent/work/progress.md` — rewrite the **Resume here** block so a zero-memory reader can continue: task id/title, current step, done ✔ / next ➜ list, files touched, decisions, blockers, exact verify steps, `git status` summary, environment notes. Add a Handoff-log line.
- [ ] `agent/work/tasks.md` — statuses/checkboxes correct; new TODOs discovered are added; open questions for the owner listed.
- [ ] `agent/work/archive.md` — if a task is 100 % done AND verified: move it here (summary, files, commits, verification, NOT-verified items → new TODOs) and remove it from `tasks.md` and `progress.md`.
- [ ] `agent/work/decisions.md` — every new decision appended (date, decision, reason, who).

### C3. Update the knowledge base if your work made it stale

- [ ] Domain doc(s) in `agent/domains/` (routes, components, hooks, behaviours, gotchas, new files).
- [ ] `agent/file-map.md` if files/routes were added, moved or deleted; `agent/architecture/*` if patterns changed; `agent/architecture/dependency-map.md` if imports/dead-code changed materially.
- [ ] `agent/backend/*` if API usage changed (new endpoints used, contract facts learned).
- [ ] `agent/status/current-state-and-open-items.md` (deferred list, known bugs, verification debt) and `agent/status/coverage.md` (mark newly read areas).
- [ ] If you touched `backend_frontend_sync/`: bump `STATUS.md` "Last synced" (`date '+%Y-%m-%d %H:%M %Z'`, by frontend), tell the owner a copy is owed, never Prettier it (see `backend/sync-folder-protocol.md`).
- [ ] `task.md` (repo root, legacy tracker) — do NOT maintain it; `agent/work/` replaced it for new work.

### C3b. Memory

- [ ] If the owner taught you a NEW durable preference/correction this session, save it to auto-memory (`/home/chirp/.claude-usama/projects/-media-chirp-Personal-Freelancing-convoyai/memory/`), one topic per file. Do not save task status there (that belongs in `agent/work/`).

### C4. Git

- [ ] Do NOT commit or push unless the owner asked. If they asked: stage exact files, logical commits, trailer per harness reminder, record hashes in `archive.md`/`progress.md`. Report `git status` at the end.

### C4b. Next-session prompt (owner will ask "give me the initial prompt for the new session")

- [ ] Rewrite the "Current prompt" block in `agent/work/next-session-prompt.md` following its rules (self-contained, task id, exact next step, verified/NOT verified, pending decisions, constraints, first actions) — consistent with `progress.md`.
- [ ] Print that same prompt in a code block in the final message so the owner can paste it after `/clear`.
- [ ] Also do this whenever the owner asks for the prompt mid-session (after refreshing `progress.md` first).

### C5. Hand-off message to the owner (final reply of the session)

Short, in this shape:

1. What was done this session (bullets).
2. What is verified vs NOT verified.
3. Where to resume (task id, step) — "the next session reads `agent/work/progress.md`".
4. Open questions / decisions needed from the owner.
5. Anything owed (backend folder copy, approvals, test data cleanup).
6. The checklist above with ✔/✘ so the owner can see nothing was skipped.

---

## D. Quick reference — who owns what

| Question                                                  | File                                                   |
| --------------------------------------------------------- | ------------------------------------------------------ |
| What must be done?                                        | `agent/work/tasks.md`                                  |
| Where exactly did we stop?                                | `agent/work/progress.md`                               |
| What is finished?                                         | `agent/work/archive.md`                                |
| Why did we decide X?                                      | `agent/work/decisions.md`                              |
| How does the project work?                                | `agent/README.md` + docs                               |
| What was already read in depth?                           | `agent/status/coverage.md`                             |
| What are the standing rules?                              | `agent/rules/owner-rules-and-workflow.md`              |
| What is deferred/known-broken?                            | `agent/status/current-state-and-open-items.md`         |
| What do I paste as the first message of the next session? | `agent/work/next-session-prompt.md` ("Current prompt") |

## E. Context-window discipline

- Watch context size. At ~60–70 % of the window, finish the current sub-step, refresh `progress.md`, and suggest the owner run the END ritual + `/clear` before starting any large mechanical change (mass renames, refactors across many files) — auto-compaction in the middle of a scripted multi-file change is the main way work gets lost.
- Prefer scripted, reviewable bulk edits (write the script to the scratchpad, run, review `git diff --stat`) over hand-editing dozens of files.
- Big reads go to `agent/` docs, not into chat: if you learn something reusable, write it into the docs immediately.

**QA cadence reminder:** full production build + 40-route crawl + axe = end of phase / pre-recording only (owner 2026-09-28, see rules/owner-rules-and-workflow.md). During a phase: typecheck + targeted live checks only.
