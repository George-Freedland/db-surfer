#!/bin/bash
# Stops DBSurfer's dev servers by killing exactly the processes listening on
# its two ports (4400 = API, 5175 = UI) — nothing else is touched.
set -uo pipefail

RUN_DIR="$HOME/.dbsurfer/run"
PID_FILE="$RUN_DIR/dev.pid"

killed=0
for port in 4400 5175; do
  pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null && killed=1
  fi
done

rm -f "$PID_FILE"

if [ "$killed" = "1" ]; then
  osascript -e 'display notification "Stopped the local server and UI." with title "DBSurfer"'
else
  osascript -e 'display notification "DBSurfer wasn'"'"'t running." with title "DBSurfer"'
fi
