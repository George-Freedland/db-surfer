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

# GUI apps on macOS don't load ~/.zshrc, so node/npm may not be on PATH.
# Prefer nvm's default alias (same node your shell uses — important so native
# modules built by `npm install` match the runtime), then common locations.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 # activates the default alias
fi
if ! command -v npm >/dev/null 2>&1; then
  for dir in /opt/homebrew/bin /usr/local/bin; do
    [ -d "$dir" ] && PATH="$dir:$PATH"
  done
  export PATH
fi

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
