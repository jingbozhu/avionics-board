# Global Avionics Operations Board

A 24/7, wall-mounted TV dashboard for a helicopter avionics-integration shop.
It shows the fleet of in-progress airframes — each with a system highlight,
completion %, ETA and status — over a slow, CPU-rendered spinning Earth with
real day/night terminator lighting.

Built as a **Preact + Vite + TypeScript** SPA served by a tiny, dependency-free
Node server, designed to run **fully offline on a LAN**: one Raspberry Pi serves
the app and three browser TVs display it.

![board](docs/DESIGN_BRIEF.md)

## How it runs (1 server + 3 TVs)

```
SERVER Pi  ──(LAN, no internet)──┬── Display TV 1  (Chromium kiosk → :8080/)
node :8080                       ├── Display TV 2  (Chromium kiosk → :8080/)
serves dist/ + /api/*            └── Display TV 3  (Chromium kiosk → :8080/)
```

- The **server Pi** runs `npm run serve` (the Node server in `server/`), which
  serves the built `dist/` and the `/api/*` fleet endpoints on
  `http://0.0.0.0:8080/`.
- Each **TV** is a read-only Chromium kiosk pointed at
  `http://<server-pi-ip>:8080/`.
- The fleet is edited on the **admin route** `…/#admin` (squawk code `7700`).
  Edits are written on the server and **broadcast live to every TV** over
  Server-Sent Events (`/api/stream`) — no refresh needed.

See [`deploy/DEPLOY.md`](deploy/DEPLOY.md) for the full topology, the Chromium
kiosk units, and screen-blanking/DPMS setup.

## Quick start (development)

```bash
npm ci            # install (preact, @fontsource/*, vite, vitest, typescript, jsdom)
npm run dev       # Vite dev server; /api/* is proxied to the Node server on :8080
```

In a second terminal, run the LAN server so `/api/*` works in dev:

```bash
npm run serve     # node server/index.mjs  (PORT=8080 default)
```

Open `http://localhost:5173/` for the board, `…/#admin` for the console.

## Build & run (production)

```bash
npm ci && npm run build      # → dist/ (relative asset URLs, base:'./')
npm run serve                # node server/index.mjs serves dist/ + /api/* on :8080
```

Then point any browser on the LAN at `http://<this-host-ip>:8080/`.

For an unattended install (systemd unit + kiosk), use the helpers in `deploy/`:

```bash
bash deploy/install-server.sh   # build + install + start avionics-board.service
```

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server (HMR), `/api/*` proxied to `:8080` |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the built `dist/` via Vite |
| `npm run serve` | Run the dependency-free Node LAN server (`server/index.mjs`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest unit tests (sun/time, globe wrap, derive, fit, routing, auth, store, manuals) |
| `npm run test:server` | Node built-in test runner for the server (manual search query parsing, API, PDF ranges) |

## Fully offline by design

Nothing contacts the internet at runtime:

- **Fonts** are self-hosted via `@fontsource` (Saira, Saira Condensed, IBM Plex
  Mono), bundled at build time — no Google Fonts CDN.
- **Earth textures** and the **heli artwork** ship in `public/assets/` and are
  bundled into `dist/`.
- The only network traffic is **same-origin `/api/*`** between the TVs and the
  server Pi. No analytics, no CDN, no external calls.

The whole installation works on an air-gapped LAN. Internet is needed only once,
to `npm ci` the build toolchain on the build machine (you can build elsewhere
and copy `dist/` + `server/` to the Pi).

## What's deliberately quirky (preserve these)

- **The LOCAL clock tracks real Pacific time including DST** — the label flips
  `PST`/`PDT`. This *reverses* a prototype quirk (a fixed UTC−8 always labeled
  `PST`) that the docs used to mandate preserving: it read an hour behind for
  ~8 months a year, so it was fixed on 2026-08-06. Don't restore it. The UTC
  clock and the globe's sun use real UTC and are geographically correct.
- **The globe is a CPU canvas renderer (no WebGL) by deliberate choice** for the
  Pi 5: a fixed 760×760 buffer, one reused `ImageData`, throttled to ~20 fps,
  paused when the tab is hidden. Magic constants (globe weights, `earthPeriod=300`,
  `EARTH_LON_VIEW=−100`, `TILT_DEG=25` axial tilt, clip-paths, colors, timings)
  are copied verbatim from the design and must not be "cleaned up". (Two
  owner-approved deviations from the original prototype: the 25° axial tilt, and
  the atmosphere ring now alpha-fades to transparent — constant chroma
  `(40,94,182)`, alpha `255·t²` — instead of RGB-fading to opaque black, so the
  glow merges into any page background.)
- **Minimum-board stage** lays the display route out fluidly at scale 1 and
  shrinks it as one unit only when the viewport drops below a 1280×720 floor, so
  the board never reflows for a small screen and never clips — a 960-px-wide Fire
  TV gets a uniform 0.75, a 1080p monitor gets no transform at all, and a 4K wall
  scales up past 2560×1440. The board sits flush by default (the wall's TVs were
  measured and don't crop); add `?overscan=N` (percent per edge, 0–10) for a TV
  that does. `/waketest.html` reports the viewport and draws ruler frames so you
  can read the right value off the panel.
- **Fit-to-height** scales the 3×2 card grid so all six cards always fit with no
  scrollbar, recomputing on resize, airframe-count change, and `document.fonts.ready`.

Full design values live in [`docs/DESIGN_BRIEF.md`](docs/DESIGN_BRIEF.md),
`src/theme/tokens.ts`, and `src/styles/tokens.css`.

## State & sync

- Source of truth is the server's `server/fleet-data.json` (initialized from a
  6-item seed if absent). The browser store reads `GET /api/fleet`, subscribes to
  `GET /api/stream` (SSE) for live updates, and pushes edits with `PUT /api/fleet`.
- If the server is unreachable, the client falls back to
  `localStorage['fleet.projects.v3']` and syncs across tabs via the `storage`
  event — single-machine mode.
- Board tickets (bug reports / feature requests filed from the admin console)
  live at `GET/POST /api/tickets`, persisted to `server/tickets.json`. They have
  no localStorage fallback on purpose: a failed submit is shown to the user and
  the form keeps its text.

## Project layout

```
src/        Preact SPA (time, globe, model/store, layout, routing, views)
server/     Zero-dependency Node LAN server (node:http + node:fs only)
public/     Bundled offline assets (Earth textures, heli art)
deploy/     systemd units + kiosk launcher + deployment notes
docs/       DESIGN_BRIEF.md (ground-truth behaviors/tokens/globe math)
BUILD_SPEC.md   The build contract
```

## Manuals search (`#manuals`) — for the shop tablets

Full-text search across every manual PDF, so nobody has to open chapters one by
one. Type words, a phrase, a part number or an ATA ref; get a ranked list of
pages (manual · bookmark section · page · highlighted snippet); tap one and the
PDF opens **at that page** in the browser's own viewer (new tab, search stays put).
With an empty box it shows the library to browse.

```
http://<server-pi-ip>:8080/#manuals                      search screen (bookmark this on the tablets)
http://<server-pi-ip>:8080/#manuals/bonding%20resistance deep link straight to a search
```

**Set up (once), then re-run whenever a manual changes:**

```bash
mkdir -p manuals && cp /path/to/*.pdf manuals/   # subfolders are fine; manuals/ is gitignored
pip install pymupdf                              # the indexer's only dependency
python3 tools/index_manuals.py                   # → manuals/manuals.db (incremental on re-runs)
```

No server restart needed — the server picks up a new `manuals.db` on the next
search. New revision of a manual? Copy it over the old file and re-run the
indexer; only changed files are re-read. Optional `manuals/manuals.json` sets
the title / revision / date shown per file (see the top of
`tools/index_manuals.py`). The indexer warns about pages with no text (scans) —
run those PDFs through `ocrmypdf` first.

**Search syntax:** `bonding resistance` (all words) · `"bonding jumper"` (phrase)
· `resist*` (prefix) · `VHF OR UHF` · part numbers / ATA refs as printed
(`622-5132-101`, `34-20-00`). English word forms match (`resistance` ~ `resist`),
and when nothing matches exactly it retries with every word as a prefix.

**How it fits the rules above:** still no npm dependencies and still fully
offline. The index is SQLite FTS5, read by Node's **built-in** `node:sqlite`, so
the server needs **Node 22.13+** for this screen (on older Node the board runs
as before and `#manuals` explains why search is off). The indexer is an offline
build step like `npm run build`, so it can run on a PC: copy the whole
`manuals/` folder (PDFs + `manuals.db`) to the Pi afterwards — paths inside are
relative. Point `MANUALS_DIR` at a different folder if the PDFs live elsewhere.
Rough size: ~200 MB of index for ~40k text pages; queries take tens of ms.

API (same-origin, read-only — also usable by other tools later):
`GET /api/manuals` (library) · `GET /api/manuals/search?q=&m=<manualId>&offset=`
· `GET /api/manuals/pdf/<id>/<file>.pdf` (Range-capable). Server tests:
`npm run test:server`.

## Where to run this — important caveat

> **Do NOT auto-install the server/kiosk on `piserver` (this host).** This
> Raspberry Pi already runs the **insider-tracker** production Docker stack +
> PostgreSQL, has a **history of OOM kills**, and **no swap configured**. Adding
> a 24/7 Node server and/or a Chromium kiosk here risks the OOM killer taking
> down live services.
>
> Prefer a **dedicated display Pi** for this board. If you must co-locate,
> **add swap and set a RAM budget first** (uncomment `MemoryMax` in
> `deploy/avionics-board.service`). The installer `deploy/install-server.sh`
> refuses to run on this host unless you pass `--force`.

## Texture attribution

Earth day/night textures are from **Solar System Scope**
(<https://www.solarsystemscope.com/textures/>), licensed
**[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**. The supplied
`earth-day-2k.jpg` / `earth-night-2k.jpg` are downscaled equirectangular maps.
Attribution is retained per the license.

## Performance notes (scaling up)

The renderer is CPU-only and tuned for the Pi 5. On more capable hardware you
can raise the canvas buffer size / frame rate, or port the **same lighting
formula** (`diffuse = sinLat·sd + cosLat·cd·cosTerm`, day/night weights) to a
WebGL fragment shader behind the existing `GlobeRenderer` seam without changing
any visible behavior.
