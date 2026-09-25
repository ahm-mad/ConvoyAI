#!/usr/bin/env bash
# Summarise the most recent `npm run dev` session (or pass a monitor log path).
# Run it after a freeze / forced reboot and paste the output to Claude.
cd "$(dirname "$0")/.." || exit 1
LOGDIR=.dev-logs
MON="${1:-$(ls -1t $LOGDIR/monitor-*.log 2>/dev/null | head -1)}"
[ -z "$MON" ] && { echo "no logs in $LOGDIR — was it started with 'npm run dev'?"; exit 1; }
SES="${MON/monitor-/session-}"

echo "=== FILES ==="; ls -la "$MON" "$SES" 2>&1 | awk '{print $5, $6, $7, $8, $9}'
ls $LOGDIR/*.heapsnapshot $LOGDIR/report.*.json 2>/dev/null | sed 's/^/  fatal-error artifact: /'

echo; echo "=== SESSION EVENTS (restarts / kills / errors) ==="
grep -E "dev-safe\]|RESTART|heap out of memory|FATAL|⨯|Error:" "$SES" | tail -25

echo; echo "=== PEAKS (next-server RSS high-water marks, and the route at that moment) ==="
grep " PEAK " "$MON" | tail -15

echo; echo "=== WORST ROUTES (max next-server RSS seen while that route was the latest activity) ==="
grep -E "next=[0-9]+MB .*route=\[(○|✓|GET)" "$MON" | sed -E 's/.* next=([0-9]+)MB .*route=\[(.*)\]/\1 \2/' \
  | awk '{mb=$1; $1=""; r=$0; sub(/ in [0-9.]+m?s.*/,"",r); sub(/ [0-9]{3} .*/,"",r); if (mb>m[r]) m[r]=mb} END{for (r in m) print m[r]"MB", r}' | sort -rn | head -12

echo; echo "=== MODULE COUNTS (bigger = heavier compile) ==="
grep "Compiled" "$SES" | sed -E 's/^[0-9:]+ +//' | sed -E 's/.*\(([0-9]+) modules\).*/\1 &/' | sort -rn | head -8 | cut -d' ' -f2- | cut -c1-80

echo; echo "=== LAST 12 MONITOR SAMPLES (what the machine looked like right before it stopped) ==="
grep -vE "^\s+|SNAPSHOT|PEAK|====" "$MON" | tail -12
echo "  …last sample time: $(grep -E '^[0-9]{4}-' "$MON" | tail -1 | cut -c1-19)   (if this is long before you rebooted, the whole machine froze / lost power)"

echo; echo "=== LAST SNAPSHOT (top processes when it looked bad) ==="
awk '/SNAPSHOT/{buf=""} {buf=buf"\n"$0} END{print buf}' "$MON" | grep -A12 SNAPSHOT | head -16

echo; echo "=== HOTTEST / TIGHTEST ==="
grep -oE "temp=[0-9]+C" "$MON" | sort -t= -k2 -n | tail -1 | sed 's/^/max /'
grep -oE "avail=[0-9]+MB" "$MON" | sort -t= -k2 -n | head -1 | sed 's/^/min /'
grep -oE "memstall=[0-9.]+%" "$MON" | sort -t= -k2 -n | tail -1 | sed 's/^/max /'

echo; echo "=== KERNEL OOM KILLS (this boot and previous boot) ==="
for b in 0 -1; do echo "-- boot $b"; journalctl -b $b -k --no-pager 2>/dev/null | grep -iE "out of memory|oom-kill|Killed process" | tail -4 | cut -c1-220; done
