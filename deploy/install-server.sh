#!/usr/bin/env bash
# install-server.sh — set up the Global Avionics Operations Board LAN server.
#
# Builds the SPA, installs the systemd unit that runs the Node server
# (`npm run serve` on :8080, bound to the LAN), and starts it.
#
# Run this on the DEDICATED SERVER Pi, from the project root:
#   bash deploy/install-server.sh
#
# Idempotent: re-run after `git pull` to rebuild and restart.
#
# !! Refuses to run on the insider-tracker host (`piserver`) unless you pass
#    --force, because that box runs Postgres + the insider-tracker Docker
#    stack, has OOM history and no swap. See README.md "Where to run this".

set -euo pipefail

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# Resolve the project root from this script's location (deploy/ -> ..).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="avionics-board.service"
RUN_USER="${SUDO_USER:-$(id -un)}"

echo "==> Project:  $PROJECT_DIR"
echo "==> Run user: $RUN_USER"

# --- Safety gate: do not co-locate with the insider-tracker production host.
HOSTNAME_NOW="$(hostname)"
if [ "$FORCE" -ne 1 ]; then
  if [ "$HOSTNAME_NOW" = "piserver" ] || docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^insider-tracker'; then
    cat >&2 <<'EOF'
REFUSING TO INSTALL: this looks like the insider-tracker production host.
That box runs Postgres + the insider-tracker Docker stack, has OOM history
and no swap. Adding a 24/7 server here risks OOM-killing live services.

Prefer a dedicated server Pi. If you really mean it, add swap + uncomment
MemoryMax in deploy/avionics-board.service first, then re-run with --force.
EOF
    exit 1
  fi
fi

# --- Toolchain check.
command -v node >/dev/null || { echo "node not found" >&2; exit 1; }
command -v npm  >/dev/null || { echo "npm not found"  >&2; exit 1; }
echo "==> node $(node -v), npm $(npm -v)"

# --- Build the SPA (fully offline runtime; no CDN).
cd "$PROJECT_DIR"
echo "==> Installing deps (npm ci)…"
npm ci
echo "==> Building dist/ (npm run build)…"
npm run build

# --- Install the systemd unit, patched for this project dir + user.
NPM_BIN="$(command -v npm)"
TMP_UNIT="$(mktemp)"
sed \
  -e "s#^User=.*#User=$RUN_USER#" \
  -e "s#^Group=.*#Group=$RUN_USER#" \
  -e "s#^WorkingDirectory=.*#WorkingDirectory=$PROJECT_DIR#" \
  -e "s#^ExecStart=.*#ExecStart=$NPM_BIN run serve#" \
  "$SCRIPT_DIR/$SERVICE_NAME" > "$TMP_UNIT"

echo "==> Installing /etc/systemd/system/$SERVICE_NAME (needs sudo)…"
sudo cp "$TMP_UNIT" "/etc/systemd/system/$SERVICE_NAME"
rm -f "$TMP_UNIT"
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"

echo
echo "==> Done. Server status:"
sudo systemctl --no-pager --full status "$SERVICE_NAME" | head -n 12 || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "==> Board is live at:  http://${IP:-<this-pi-ip>}:8080/"
echo "    Admin console:     http://${IP:-<this-pi-ip>}:8080/#admin   (squawk 7700)"
echo "    Point each display TV/Pi kiosk browser at that URL."
echo "    Logs: journalctl -u $SERVICE_NAME -f"
