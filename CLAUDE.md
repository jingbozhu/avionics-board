# CLAUDE.md — avionics-board

Guidance for Claude Code working inside this project. Read
[`BUILD_SPEC.md`](BUILD_SPEC.md) (the build contract) and
[`docs/DESIGN_BRIEF.md`](docs/DESIGN_BRIEF.md) (exact behaviors, globe math,
tokens) before changing anything. This file governs project-local conventions;
the host-level `/home/admin/CLAUDE.md` still applies.

## What this is

A faithful recreation of a hi-fi HTML prototype as a **Preact + Vite +
TypeScript** SPA, served by a tiny dependency-free Node server, to run as a
**24/7 offline LAN kiosk**: one server Pi serves the app; three browser TVs load
`http://<pi-ip>:8080/` as read-only displays. An admin route (`#admin`, squawk
`7700`) edits the fleet; edits broadcast live to all TVs over SSE.

## Hard rules (these override default behavior)

- **Recreate, don't port** the prototype's `<x-dc>` runtime. Copy the
  logic/math/tokens, not the runtime.
- **Pixel/behavior faithful.** Preserve every magic constant **verbatim** —
  globe weights, `earthPeriod=300`, `EARTH_LON_VIEW=−100`, clip-paths, colors,
  letter-spacing, timings, the `((u%1)+1)%1` texture wrap. Changing a value to
  "clean it up" is a bug.
- **Fully offline at runtime.** No CDN, no analytics, no external calls. Fonts
  are self-hosted (`@fontsource`, imported in `src/main.tsx`); Earth textures +
  heli art live in `public/assets/`. The only network traffic is same-origin
  `/api/*`.
- **Pi-friendly.** CPU globe only (no WebGL). One reused `ImageData`, fixed
  760×760 buffer, no `devicePixelRatio` scaling, rAF throttled to ~20 fps and
  paused when the tab is hidden.
- **No new dependencies** beyond `package.json` (preact, @fontsource/*; dev:
  vite, vitest, typescript, jsdom). No CSS-in-JS, no router lib, no zod. Do not
  run `npm install`. Component styles: inline styles or CSS Modules using values
  from the design brief / `src/styles/tokens.css`.
- **Import discipline:** Preact hooks from `preact/hooks`; `useSyncExternalStore`
  from `preact/compat`.

## File ownership (parallel threads — disjoint)

Each thread writes ONLY its own files. Never edit `package.json`,
`tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/types.ts`,
`src/theme/tokens.ts`, `src/model/airframe.ts`, `src/styles/*`,
`public/assets/*`, or another thread's files. See `BUILD_SPEC.md` §"File
ownership" for the full map (B1 time+sun, C globe, B2 model/store/route/auth,
D display, E admin, F2 server+deploy).

## Architecture seams

- `src/types.ts` — locked contracts: `Airframe`, `FleetStore`, `GlobeRenderer`,
  `GlobeAssets`, `SunParams`, `CardVM`, etc. Build against these.
- `src/model/airframe.ts` — `STORAGE_KEY`, `SYSTEMS`, `FLAGS`, `clampPct`,
  `normalizeAirframe`, `seed`, `blankAirframe`.
- `src/theme/tokens.ts` / `src/styles/tokens.css` — accents, HILITE clip map,
  STATUS colors. Verbatim from the design.
- `FleetStore` is the one seam between the views and state: LAN mode (server +
  SSE) with a localStorage fallback. `getSnapshot()` MUST return a stable
  reference between changes or `useSyncExternalStore` loops.
- `GlobeRenderer` is the seam for the CPU globe; a WebGL impl could drop in
  behind it later without changing views.

## Commands

```bash
npm ci               # install (already installed in this workspace)
npm run dev          # Vite dev server (HMR); /api/* proxied to :8080
npm run serve        # node server/index.mjs — the LAN server, :8080
npm run build        # production build → dist/
npm run typecheck    # tsc --noEmit
npm run test         # vitest run (pure-logic unit tests)
```

Verification before claiming done: `npm run typecheck` + `npm run build` green,
and `npm run test` green. Pure logic must have Vitest tests (sun/time golden
incl. DST-tracking + both transitions, `u`-wrap, clamp, derive, fit
`computeScale`, stage `computeBoard` invariants, routing, auth, store
snapshot/debounce/fallback). No Playwright; manual visual check via
`npm run dev`.

## Deployment

`deploy/` holds the systemd server unit, the Chromium kiosk units/launcher, and
[`deploy/DEPLOY.md`](deploy/DEPLOY.md) (topology, DPMS/screen-blank-off, nightly
reload). `bash deploy/install-server.sh` builds + installs + starts the server.

## Host caveat — do not auto-install here

This project lives on `piserver`, which **already runs the insider-tracker
production Docker stack + PostgreSQL, with OOM history and no swap**. Do **not**
install the 24/7 server or a Chromium kiosk on this host — it could OOM-kill
live production. Deploy to a **dedicated display Pi**, or add swap + a
`MemoryMax` budget first. `deploy/install-server.sh` refuses to run on this host
without `--force`.

## Texture attribution

Earth textures: Solar System Scope (solarsystemscope.com),
licensed CC BY 4.0. Keep the attribution in `README.md`.
