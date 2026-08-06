# Deployment — Global Avionics Operations Board

Everything needed to put the board on the wall as a 24/7, fully-offline LAN
kiosk. Read this top to bottom once; the helper scripts automate most of it.

## Topology (1 server Pi + 3 display TVs)

```
                    ┌──────────────────────────────┐
                    │  SERVER Pi  (one box)         │
                    │  systemd: avionics-board      │
                    │  node server/index.mjs :8080  │
                    │  state: server/fleet-data.json│
                    └──────────────┬───────────────┘
                                   │  LAN (Ethernet/Wi-Fi), no internet needed
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
    ┌───────▼───────┐      ┌───────▼───────┐      ┌───────▼───────┐
    │ Display Pi 1  │      │ Display Pi 2  │      │ Display Pi 3  │
    │ Chromium kiosk│      │ Chromium kiosk│      │ Chromium kiosk│
    │ → :8080/      │      │ → :8080/      │      │ → :8080/      │
    └───────────────┘      └───────────────┘      └───────────────┘
```

- The **server Pi** is the single source of truth. It serves the built `dist/`
  and the `/api/*` fleet endpoints, bound to `0.0.0.0:8080` so the LAN can reach it.
- The **three display Pis/TVs** are read-only clients. Each just runs a Chromium
  kiosk pointed at `http://<server-pi-ip>:8080/`.
- Live edits happen on the admin route (`http://<server-pi-ip>:8080/#admin`,
  squawk `7700`). The server broadcasts every change over SSE (`/api/stream`),
  so all three TVs update within a second — no refresh needed.
- A display Pi and the server Pi **can be the same box** (open a local kiosk at
  `http://localhost:8080/`), but for three TVs a dedicated server is cleaner.

> **The wall as actually installed** is three **Hisense Fire TVs running the
> built-in Amazon Silk browser**, not Raspberry Pi + Chromium clients (see
> `src/kiosk/keepAwake.ts`). Sections B–D below — `kiosk-launch.sh`, the
> `avionics-kiosk` user unit, the `xset`/DPMS advice and the nightly reload timer
> — describe the Pi-client setup and **do not run on those TVs**. On Silk you
> just navigate to the board URL; the app holds its own screen wake lock
> (`startKeepAwake()`), which is why that hack exists. Keep the Pi-client path
> documented: it is still the fallback if a TV's browser is ever unusable.

## Fully offline

Nothing here phones home at runtime. Fonts are self-hosted (`@fontsource`,
bundled at build), Earth textures + heli art ship in `public/assets/`, and the
only network traffic is same-origin `/api/*` between the TVs and the server Pi.
The whole installation runs on an air-gapped LAN. (You only need internet once,
on the server Pi, to `npm ci` the build toolchain — or build elsewhere and copy
`dist/` + `server/` over.)

## A. Server Pi — install

From the project root on the server Pi:

```bash
bash deploy/install-server.sh
```

That builds `dist/`, installs and starts `avionics-board.service`, and prints
the LAN URL. Manual equivalent:

```bash
npm ci && npm run build
sudo cp deploy/avionics-board.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now avionics-board.service
journalctl -u avionics-board.service -f      # watch it
```

Override the port with `Environment=PORT=...` in the unit (default 8080).

> WHERE TO RUN THIS — caveat: do **not** install the server on `piserver`
> (the insider-tracker host). That box runs Postgres + the insider-tracker
> Docker stack, has OOM history and **no swap**; a co-located 24/7 server
> risks OOM-killing live production. `install-server.sh` refuses to run there
> unless `--force`. Use a dedicated server Pi, or add swap + uncomment
> `MemoryMax` in `avionics-board.service` first. See the README for the full note.

## B. Display Pi — Chromium kiosk

On each of the three display Pis (as the desktop login user):

```bash
mkdir -p ~/.config/systemd/user
cp deploy/avionics-kiosk.service ~/.config/systemd/user/
# edit BOARD_URL in that unit to the server Pi's address, e.g. http://192.168.1.50:8080/
loginctl enable-linger "$USER"        # let it start at boot without a login
systemctl --user daemon-reload
systemctl --user enable --now avionics-kiosk.service
```

Or run the launcher directly to test:

```bash
BOARD_URL=http://192.168.1.50:8080/ bash deploy/kiosk-launch.sh
```

The launcher picks `chromium-browser`/`chromium`, disables screen blanking
(see below), and opens fullscreen `--kiosk` with crash/restore bubbles off.

### Alternative: desktop autostart (instead of the user service)

If you'd rather use the desktop's own autostart (LXDE/labwc), drop a
`.desktop` file in `~/.config/autostart/`:

```ini
[Desktop Entry]
Type=Application
Name=Avionics Board Kiosk
Exec=/home/admin/avionics-board/deploy/kiosk-launch.sh
X-GNOME-Autostart-enabled=true
```

with `BOARD_URL` exported in the launcher or the session environment.

## C. Disable screen blanking / DPMS (keep the wall awake 24/7)

A wall board must never blank. `kiosk-launch.sh` already does the X11 part; the
right method depends on the display stack.

### X11 (Pi OS Bullseye, or Bookworm with Wayland disabled)

Handled automatically by the launcher:

```bash
xset s off          # no screensaver
xset s noblank      # never blank the output
xset -dpms          # no DPMS power-down
```

To make it permanent regardless of the launcher, add to
`/etc/lightdm/lightdm.conf` under `[Seat:*]`:

```
xserver-command=X -s 0 -dpms
```

and disable console blanking by adding `consoleblank=0` to
`/boot/firmware/cmdline.txt`.

### Wayland (Pi OS Bookworm default — labwc / wayfire)

`xset` is a no-op under Wayland. Disable blanking in the compositor instead:

- **labwc:** in `~/.config/labwc/rc.xml` (or via `wlr-randr`), and stop the idle
  manager — make sure `swayidle`/screen-blank services aren't running.
- **wayfire:** in `~/.config/wayfire.ini`, disable the `idle` plugin or set
  `dpms_timeout = -1`, e.g.:

  ```ini
  [idle]
  dpms_timeout = -1
  screensaver_timeout = -1
  ```

- Check/force outputs awake at runtime with `wlr-randr --output <name> --on`.

You can confirm which session you're in with `echo $XDG_SESSION_TYPE`
(`x11` vs `wayland`).

### Also worth doing

- Disable the display manager's own idle/lock, and any `xfce4-power-manager` /
  `gnome-screensaver` if present.
- TV-side: set the physical TV to "PC"/"Game" mode and turn off its own
  auto-power-off / ambient dimming.

## D. Optional nightly reload

`avionics-reload.{service,timer}` restart the kiosk browser nightly (04:00) to
shed any browser memory creep and pick up a fresh build. Optional — the app
pauses the globe rAF when hidden and persists nothing client-side. Install on
each display Pi:

```bash
cp deploy/avionics-reload.service deploy/avionics-reload.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now avionics-reload.timer
systemctl --user list-timers | grep avionics    # verify next run
```

To also rebuild + restart the SERVER nightly (only if you redeploy often),
add a root timer that runs `npm run build && systemctl restart
avionics-board.service` from the project dir — usually unnecessary.

## E. Updating a live install

Server Pi:

```bash
git pull            # or copy a fresh dist/ + server/ over
bash deploy/install-server.sh     # rebuilds + restarts (idempotent)
```

Display Pis pick up the new build on their next reload (nightly timer, or
`systemctl --user restart avionics-kiosk.service`).

## Troubleshooting

- **TV shows nothing / can't connect:** confirm the server is up
  (`systemctl status avionics-board`, `curl http://localhost:8080/api/fleet`)
  and that the display Pi can reach it (`curl http://<server-ip>:8080/api/fleet`).
  Check the firewall on the server Pi allows :8080 on the LAN.
- **Edits don't propagate:** the SSE stream is `/api/stream`; a corporate proxy
  or aggressive ad-blocker extension can buffer it. Run the kiosk profile clean
  (the launcher uses a dedicated `--user-data-dir`).
- **Screen still blanks:** you're probably on Wayland — `xset` did nothing; use
  section C "Wayland".
- **Board edges cut off / the LOCAL clock is clipped:** open
  `http://<server-ip>:8080/waketest.html` on the affected TV. It prints the
  reported **viewport**, `devicePixelRatio`, and the **board stage scale**, and
  draws three ruler frames at 0 / 2.5 / 5 % inset.
  - The display route is fluid down to a 1280×720 floor and is scaled as one unit
    below that, so a small reported viewport shrinks the board but never clips it
    (a scale under 1 there is normal, not a fault). If the clock is still cut off,
    the TV is **overscanning** — cropping the picture in hardware.
- **Clock is wrong on one TV:** the board ticks from the *TV's own* clock, not the
  server's. `LOCAL` is real Pacific time (label flips PST/PDT) and `UTC` does no
  offset arithmetic at all, so no timezone setting can shift them — only a wrong
  device clock can. Compare the board's `Z` field against `date -u` on the server
  Pi; if it differs, set **Settings → Date & Time → Automatic** on that TV.
  - Note the outermost ruler frame whose four sides are all visible, and load the
    board with that inset: `http://<server-ip>:8080/?overscan=5` (percent per
    edge, 0–10). The default is **0** (flush) — the current wall TVs showed the
    0% frame complete when measured on 2026-08-06, so they do not crop.
  - Better fix where the set allows it: switch the TV's picture mode to
    "PC"/"Game", or set Aspect/Zoom to "Just Scan" / "1:1" / "Full Pixel", which
    disables overscan outright — then run with `?overscan=0`.
- **Server OOM/killed:** you're likely co-located with other services. Move to a
  dedicated Pi or set `MemoryMax` + add swap.
