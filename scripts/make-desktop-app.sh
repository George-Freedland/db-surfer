#!/bin/bash
# Builds "DBSurfer.app" and "Stop DBSurfer.app" on your Desktop — double-click
# launchers so you never have to open a terminal to use DBSurfer.
#
# Re-run this any time you move the repo (the launcher's path is baked in
# at generation time).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP="$HOME/Desktop"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

chmod +x "$REPO_DIR/scripts/dbsurfer-start.sh" "$REPO_DIR/scripts/dbsurfer-stop.sh"

echo "do shell script \"$REPO_DIR/scripts/dbsurfer-start.sh\"" > "$WORK_DIR/DBSurfer.applescript"
echo "do shell script \"$REPO_DIR/scripts/dbsurfer-stop.sh\"" > "$WORK_DIR/StopDBSurfer.applescript"

rm -rf "$DESKTOP/DBSurfer.app" "$DESKTOP/Stop DBSurfer.app"
osacompile -o "$DESKTOP/DBSurfer.app" "$WORK_DIR/DBSurfer.applescript"
osacompile -o "$DESKTOP/Stop DBSurfer.app" "$WORK_DIR/StopDBSurfer.applescript"

# Custom icon
ICONSET="$WORK_DIR/DBSurfer.iconset"
mkdir "$ICONSET"
for sz in 16 32 128 256 512; do
  sips -z "$sz" "$sz" "$REPO_DIR/scripts/icon.png" --out "$ICONSET/icon_${sz}x${sz}.png" >/dev/null
done
sips -z 32 32 "$REPO_DIR/scripts/icon.png" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 64 64 "$REPO_DIR/scripts/icon.png" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 256 256 "$REPO_DIR/scripts/icon.png" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 512 512 "$REPO_DIR/scripts/icon.png" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 1024 1024 "$REPO_DIR/scripts/icon.png" --out "$ICONSET/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET" -o "$WORK_DIR/DBSurfer.icns"

for app in "DBSurfer.app" "Stop DBSurfer.app"; do
  cp "$WORK_DIR/DBSurfer.icns" "$DESKTOP/$app/Contents/Resources/applet.icns"
  /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string DBSurfer" "$DESKTOP/$app/Contents/Info.plist" 2>/dev/null || true
  codesign --force --deep -s - "$DESKTOP/$app" 2>/dev/null || true
  touch "$DESKTOP/$app"
done

killall Finder >/dev/null 2>&1 || true

echo "Created:"
echo "  $DESKTOP/DBSurfer.app       (starts the server + opens the UI)"
echo "  $DESKTOP/Stop DBSurfer.app  (stops the server)"
