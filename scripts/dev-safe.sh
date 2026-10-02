#!/usr/bin/env bash
# `npm run dev` entry point. Runs `next dev` (webpack) with guard rails + logs so a memory
# runaway can't freeze the laptop, and so we can diagnose it afterwards.
#
#  - hard memory cap (systemd cgroup, no swap): a runaway kills ONLY the dev server
#  - V8 heap limit + diagnostic report on fatal error
#  - every dev-server line timestamped into .dev-logs/session-<ts>.log
#  - scripts/dev-monitor.sh black-box recorder into .dev-logs/monitor-<ts>.log (fsync'd)
#  - wipes a `.next` that was left by `next build` (production build state must not be reused by dev)
#
# Deliberately does NOT auto-restart if the dev server dies or is killed (owner decision,
# 2026-10-03): an earlier version looped and restarted on any unexpected exit, which meant
# killing the inner `next dev`/`next-server` process (by PID, as any external tool must) looked
# like a "crash" and silently brought the server back — including, once, well after the session
# that started it had ended. If the dev server exits now, this script just logs it and stops; run
# `npm run dev` again when you actually want it back.
#
# Tunables (env): DEV_MEM_CAP (default 5G) · DEV_HEAP_MB (2560)
#                 DEV_HEAP_SNAPSHOT=1  (write a .heapsnapshot when nearing the heap limit — big, opt-in)
# After a hang/kill:  npm run dev:report
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
LOGDIR="$ROOT/.dev-logs"; mkdir -p "$LOGDIR"
TS=$(date +%Y%m%d-%H%M%S)
SESSION_LOG="$LOGDIR/session-$TS.log"
MON_LOG="$LOGDIR/monitor-$TS.log"
CAP="${DEV_MEM_CAP:-5G}"
HEAP="${DEV_HEAP_MB:-2560}"

log() { printf '%s [dev-safe] %s\n' "$(date +%T)" "$*" | tee -a "$SESSION_LOG"; }

# keep only the 15 newest session/monitor logs
for pfx in session monitor; do ls -1t "$LOGDIR/$pfx-"*.log 2>/dev/null | tail -n +16 | xargs -r rm -f; done

log "session $TS · node $(node -v) · cap=$CAP heap=${HEAP}MB · logs in .dev-logs/"

if pgrep -f "[n]ext-server" >/dev/null; then
  log "ERROR: another next-server is already running — stop it first (pkill -f next-server)"; exit 1
fi
if [ -f .next/BUILD_ID ]; then
  log "found .next/BUILD_ID (left by 'next build') → wiping .next so dev starts from a clean cache"
  rm -rf .next
fi

NODE_OPTS="--max-old-space-size=$HEAP --report-on-fatalerror --report-directory=$LOGDIR"
[ "${DEV_HEAP_SNAPSHOT:-0}" = "1" ] && NODE_OPTS="$NODE_OPTS --heapsnapshot-near-heap-limit=1 --diagnostic-dir=$LOGDIR" && log "heap snapshot near limit: ON"
export NODE_OPTIONS="$NODE_OPTS ${NODE_OPTIONS:-}"

if systemd-run --user --scope -q -p MemoryMax=64G -- true 2>/dev/null; then
  RUNNER=(systemd-run --user --scope -q -p "MemoryMax=$CAP" -p MemorySwapMax=0 --)
else
  RUNNER=(); log "WARNING: systemd-run unavailable — running WITHOUT a memory cap"
fi

"$ROOT/scripts/dev-monitor.sh" "$MON_LOG" "$SESSION_LOG" $$ &
MON_PID=$!
trap 'kill $MON_PID 2>/dev/null' EXIT

"${RUNNER[@]}" npm run dev:raw 2>&1 | while IFS= read -r line; do printf '%s %s\n' "$(date +%T)" "$line"; done | tee -a "$SESSION_LOG"
peak=$(cat "$LOGDIR/.peak" 2>/dev/null || echo '?')
route=$(grep -E "^[0-9:]+ +(○ Compiling|✓ Compiled|GET /)" "$SESSION_LOG" | tail -1 | sed -E 's/^[0-9:]+ +//' | cut -c1-60)
log "dev server exited (peak next=${peak}MB, last route=[$route]) — not restarting. Run 'npm run dev' again when you want it back; npm run dev:report if this was unexpected."
log "dev-safe stopped."
