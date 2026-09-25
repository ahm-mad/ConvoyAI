#!/usr/bin/env bash
# Black-box recorder for `npm run dev` (started by scripts/dev-safe.sh).
# Read-only: it only observes. One line every INTERVAL seconds, fsync'd, so the last
# samples survive a forced power-off.
#
# usage: dev-monitor.sh <monitor-log> <next-session-log> <parent-pid>
#
# Line format (greppable):
#   <time> next=<MB> chrome=<MB> avail=<MB> swap=<MB> memstall=<%> cpustall=<%> temp=<C> route=<last route line>
# Extra event lines:
#   PEAK      next-server hit a new high-water mark (+250 MB steps)
#   SNAPSHOT  top processes by RSS / CPU when memory, RAM or temperature look bad
MON_LOG="$1"; SESSION_LOG="$2"; PARENT="$3"
INTERVAL="${DEV_MONITOR_INTERVAL:-2}"
NEXT_WARN_MB="${DEV_NEXT_WARN_MB:-2500}"

temp_c() {
  local m=0 t f
  for f in /sys/class/thermal/thermal_zone*/temp; do
    [ -r "$f" ] || continue; t=$(cat "$f" 2>/dev/null) || continue
    [ "$t" -gt "$m" ] 2>/dev/null && m=$t
  done; echo $((m / 1000))
}
rss_mb() { ps -eo rss,args --no-headers | awk -v re="$1" '$0 ~ re && $0 !~ /awk/ {s+=$1} END{printf "%d", s/1024}'; }
last_route() {
  # last "Compiling /x" / "Compiled /x" / "GET /x" line from the dev-server log
  grep -E "^[0-9:]+ +(○ Compiling|✓ Compiled|GET /)" "$SESSION_LOG" 2>/dev/null | tail -1 | sed -E 's/^[0-9:]+ +//' | cut -c1-60
}

echo "==== monitor started $(date '+%F %T') pid $$ (watching dev-safe pid $PARENT, every ${INTERVAL}s) ====" >> "$MON_LOG"
peak=0; last_snap=0
while kill -0 "$PARENT" 2>/dev/null; do
  now=$(date +%s); ts=$(date '+%F %T')
  avail=$(awk '/MemAvailable/{printf "%d",$2/1024}' /proc/meminfo)
  swapu=$(awk '/SwapTotal/{t=$2} /SwapFree/{f=$2} END{printf "%d",(t-f)/1024}' /proc/meminfo)
  memstall=$(awk '/^some/{split($2,a,"=");print a[2]}' /proc/pressure/memory 2>/dev/null)
  cpustall=$(awk '/^some/{split($2,a,"=");print a[2]}' /proc/pressure/cpu 2>/dev/null)
  temp=$(temp_c)
  next=$(rss_mb 'next-server|next/dist/bin/next|next/dist/server')
  chrome=$(rss_mb '/chrome')
  route=$(last_route)
  echo "$ts next=${next}MB chrome=${chrome}MB avail=${avail}MB swap=${swapu}MB memstall=${memstall}% cpustall=${cpustall}% temp=${temp}C route=[${route}]" >> "$MON_LOG"

  if [ "$next" -ge $((peak + 250)) ]; then
    peak=$next
    echo "$ts PEAK next=${next}MB route=[${route}]" >> "$MON_LOG"
    echo "$peak" > "$(dirname "$MON_LOG")/.peak"
  fi
  if { [ "$next" -gt "$NEXT_WARN_MB" ] || [ "$avail" -lt 3000 ] || [ "$temp" -ge 85 ]; } && [ $((now - last_snap)) -ge 20 ]; then
    last_snap=$now
    {
      echo "  --- $ts SNAPSHOT (next=${next}MB avail=${avail}MB temp=${temp}C route=[${route}]) top by RSS:"
      ps -eo pid,rss,pcpu,etimes,args --sort=-rss --no-headers | head -6 | cut -c1-170 | sed 's/^/    /'
      echo "  --- top by CPU:"
      ps -eo pid,rss,pcpu,etimes,args --sort=-pcpu --no-headers | head -4 | cut -c1-170 | sed 's/^/    /'
    } >> "$MON_LOG"
  fi
  sync "$MON_LOG" 2>/dev/null
  sleep "$INTERVAL"
done
echo "==== monitor stopped $(date '+%F %T') ====" >> "$MON_LOG"
