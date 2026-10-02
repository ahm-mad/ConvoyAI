# agent/work/ — task tracking that survives /clear and session switches

Goal (owner requirement): the whole process must be **seamless, resumable and cross-session**. Any session — after `/clear`, a crash, a context limit, or a different chat — must be able to continue exactly where the last one stopped by reading these files, without the owner re-explaining.

## Files

| File           | Purpose                                                                                                                                                                                         | Who edits                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `tasks.md`     | Backlog + active tasks: id, title, owner's words (verbatim intent), status, acceptance criteria, sub-steps. Single source of truth of WHAT is to be done.                                       | Any session, when the owner gives/changes a task                       |
| `progress.md`  | **The resume point.** Live state of the task in flight: current step, what is done, what is next, files touched, decisions made, blockers, exact commands/tests to re-run, uncommitted changes. | Updated CONTINUOUSLY (after each meaningful step), not only at the end |
| `archive.md`   | Tasks that are 100% completed and verified, with date, summary, commits/files, how it was verified, what was NOT verified. Append-only.                                                         | Move here from `tasks.md` when done                                    |
| `decisions.md` | Owner decisions and design decisions taken while working (dated, with reason), so they are never re-asked.                                                                                      | Append when a decision is made                                         |

**The detailed start / during / end checklists are in `session-ritual.md` — follow them literally.** Trigger phrases for the END ritual: "end session", "wrap up", "I'll /clear", "switching session", or context nearly full.

## Protocol summary (every session MUST follow; details in `session-ritual.md`)

1. **Start:** read `CLAUDE.md` → `agent/README.md` → `agent/work/progress.md` (resume point) → `agent/work/tasks.md`. If `progress.md` shows a task in flight, tell the owner in 3–5 lines where it stands and continue from "Next step" — do not restart or re-plan.
2. **New task from the owner:** add it to `tasks.md` (owner's intent in their words, acceptance criteria, sub-steps as a checklist, status `TODO`). Ask questions before building if scope is unclear (choice lists, recommended option first). Then set it `IN PROGRESS` and open a section in `progress.md`.
3. **While working:** after every meaningful step update `progress.md` (checklist ticks, files changed, decisions, what to do next, how to verify). Write it as if the next reader has zero memory. Keep uncommitted-work notes accurate (`git status` summary).
4. **Context getting long / owner about to /clear / stopping:** immediately write a full handoff into `progress.md` ("Resume here" block).
5. **Done:** verify (see `agent/rules/owner-rules-and-workflow.md` regression rules), then move the task to `archive.md` (with verification notes + what wasn't verified), clear its section in `progress.md`, and update any `agent/` doc the change made stale (domain docs, `status/current-state-and-open-items.md`).
6. **Never** mark something done that was not verified; list unverified items as new TODOs.
7. Keep each file concise and current; archive rather than delete. Statuses: `TODO` · `IN PROGRESS` · `BLOCKED (why)` · `DONE (in archive)`.
8. Commit rules: only when the owner asks; stage exact files; note commit hashes in `archive.md`.

## `agent/` is git-tracked — it is the durable record, not a side note (owner, 2026-09-27)

`agent/` and `CLAUDE.md` are committed to git (see `decisions.md`'s 2026-09-27 "now TRACKED in git" entry) specifically so this whole knowledge base survives a move to a different laptop (a plain `git clone` brings it along) or a switch to a completely different AI agent/tool, not only a `/clear` inside one tool's own session. Because of this: **whenever a durable fact, rule, decision or lesson would be saved to an assistant's own private cross-session memory system, it must also be written into the matching file here in `agent/`** — `rules/owner-rules-and-workflow.md` for standing rules, `work/decisions.md` for decisions, `browser-testing-playbook.md` / `environment-and-safeguards.md` for testing/environment lessons, or a new file under `agent/` if nothing existing fits. The two records should stay mirrored; `agent/` alone must always be enough to resume with, even if whatever private memory system an assistant has is unavailable to the next one.
