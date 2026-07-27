#!/bin/bash
# Starts DBSurfer's dev servers if they aren't already running, then opens
# the UI in the default browser. Safe to double-click (via the DBSurfer.app
# launcher) repeatedly — it won't spawn duplicate servers.
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$HOME/.dbsurfer/run"
LOG_FILE="$RUN_DIR/dev.log"
PID_FILE="$RUN_DIR/dev.pid"
API_URL="http://localhost:4400/api/connections"
UI_URL="http://localhost:5175"

mkdir -p "$RUN_DIR"

# GUI apps on macOS don't load ~/.zshrc, so node/npm (often installed via nvm)
# may not be on PATH. Add the common install locations before anything else.
for dir in "$HOME"/.nvm/versions/node/*/bin /opt/homebrew/bin /usr/local/bin; do
  [ -d "$dir" ] && PATH="$dir:$PATH"
done
export PATH

is_up() {
  curl -fsS -m 2 "$API_URL" >/dev/null 2>&1
}

if ! is_up; then
  cd "$REPO_DIR" || exit 1
  nohup npm run dev </dev/null >"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  for _ in $(seq 1 30); do
    is_up && break
    sleep 1
  done

  if ! is_up; then
    osascript -e 'display alert "DBSurfer failed to start" message "Check ~/.dbsurfer/run/dev.log for details." as critical'
    exit 1
  fi
fi

open "$UI_URL"
