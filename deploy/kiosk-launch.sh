#!/usr/bin/env bash
# kiosk-launch.sh — launch one display TV/Pi in fullscreen Chromium kiosk mode,
# pointed at the Avionics Board server, with all screen-blanking/DPMS disabled.
#
# Runs on each of the THREE display Pis (the read-only TVs). It does NOT run
# the Node server — that lives on the single server Pi. Set BOARD_URL to the
# server Pi's LAN address.
#
# Usage:
#   BOARD_URL=http://192.168.1.50:8080/ bash deploy/kiosk-launch.sh
# or export BOARD_URL in the autostart that calls this (see avionics-kiosk.service).
#
# Works under X11 (Pi OS Bullseye / labwc-off) using xset. For Wayland
# (Pi OS Bookworm default = labwc/wayfire) xset is a no-op — see the
# "Wayland" note in deploy/DEPLOY.md for the wlr-randr / wayfire equivalent.

set -euo pipefail

BOARD_URL="${BOARD_URL:-http://localhost:8080/}"

# Pick a Chromium binary (Pi OS = chromium-browser; Ubuntu/Debian = chromium).
CHROME=""
for c in chromium-browser chromium chromium-browser-stable google-chrome; do
  if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
done
[ -n "$CHROME" ] || { echo "No Chromium binary found (tried chromium-browser, chromium)…" >&2; exit 1; }

# --- Kill the screensaver / DPMS / blanking (X11). Keeps a 24/7 wall awake.
if command -v xset >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
  xset s off          # disable screensaver
  xset s noblank      # don't blank the video output
  xset -dpms          # disable Energy Star / DPMS power-down
fi
# Hide the mouse pointer when idle (optional, if installed).
command -v unclutter >/dev/null 2>&1 && unclutter -idle 0.5 -root &

# --- Chromium flags for an unattended kiosk.
# A per-display profile dir avoids "restore pages?" and cross-talk between TVs.
PROFILE_DIR="${KIOSK_PROFILE_DIR:-$HOME/.config/avionics-kiosk}"
mkdir -p "$PROFILE_DIR"

exec "$CHROME" \
  --kiosk "$BOARD_URL" \
  --user-data-dir="$PROFILE_DIR" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate,TranslateUI \
  --no-first-run \
  --fast --fast-start \
  --start-fullscreen \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0 \
  --hide-scrollbars \
  --incognito
