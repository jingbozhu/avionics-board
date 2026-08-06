# BUILD_SPEC — Global Avionics Operations Board

Authoritative build contract. Read **`docs/DESIGN_BRIEF.md`** (exact behaviors, globe math, tokens)
and **`src/types.ts`** (locked interfaces) before writing code.

## What this is
A faithful recreation of a hi-fi HTML prototype as a **Preact + Vite + TypeScript** SPA, served by a
tiny dependency-free Node server, to run as a **24/7 offline LAN kiosk**. Deployment: one Raspberry Pi
serves the app; **three browser TVs** load `http://<pi-ip>:8080/` as read-only displays. An admin route
(`#admin`, squawk `7700`) edits the fleet; edits broadcast live to all TVs.

## Hard rules
- **Recreate, don't port** the prototype's `<x-dc>` runtime. Copy the *logic/math/tokens*, not the runtime.
- **Pixel/behavior faithful.** Preserve every magic constant verbatim (globe weights, clip-paths, colors,
  letter-spacing, timings). A "cleanup" that changes a value is a bug.
- **Fully offline at runtime.** No CDN. Fonts are self-hosted (`@fontsource`, already imported in
  `main.tsx`); textures + heli art are bundled in `public/assets/`. Do not add network calls except the
  same-origin `/api/*` server endpoints.
- **Pi-friendly.** CPU globe only (no WebGL). One reused `ImageData`. No `devicePixelRatio` scaling of the
  canvas buffer (it's a fixed 760×760 painted into a huge blurred element).
- **No new deps** beyond what's in `package.json` (preact, @fontsource/*; dev: vite, vitest, typescript,
  jsdom). No CSS-in-JS, no router lib, no zod. Component styles: inline styles or CSS Modules, values from
  the brief.
- Each thread writes ONLY its listed files. Do not edit `package.json`, `tsconfig.json`, `vite.config.ts`,
  `src/types.ts`, `src/theme/tokens.ts`, `src/model/airframe.ts`, or another thread's files.

## Already provided (Phase A — do not modify)
- `src/types.ts` — `Airframe`, `SystemKey`, `StatusFlag`, `AccentKey`, `FleetStore`, `GlobeRenderer`,
  `GlobeAssets`, `SunParams`, `StatusView`, `CardVM`.
- `src/theme/tokens.ts` — `ACCENTS`, `DEFAULT_ACCENT`, `HILITE`, `STATUS`.
- `src/model/airframe.ts` — `STORAGE_KEY`, `SYSTEMS`, `FLAGS`, `clampPct`, `normalizeAirframe`, `seed`,
  `blankAirframe`.
- `src/styles/tokens.css`, `src/styles/global.css`, `src/main.tsx`, `index.html`.
- `public/assets/textures/earth-day-2k.jpg`, `earth-night-2k.jpg` (2048×1024, complete).
- `public/assets/art/heli-line.png`, `heli-fill.png` (1112×376, registered pixel-for-pixel).

## File ownership (disjoint — enables parallel work)
- **B1 time+sun** → `src/time/clocks.ts`(+`.test.ts`), `src/globe/sun.ts`(+`.test.ts`)
- **C globe** → `src/globe/precompute.ts`, `src/globe/render-core.ts`(+`.test.ts`), `src/globe/loop.ts`(+`.test.ts`),
  `src/globe/textures.ts`, `src/globe/index.ts`, `src/globe/GlobeCanvas.tsx`  (consumes B1 `sun.ts`)
- **B2 model/store/derive/layout/route/auth** → `src/model/store.ts`(+`.test.ts`), `src/model/useFleet.ts`,
  `src/model/derive.ts`(+`.test.ts`), `src/layout/fit.ts`(+`.test.ts`), `src/routing.ts`(+`.test.ts`),
  `src/auth.ts`(+`.test.ts`)
- **D display** → `src/app/App.tsx`, `src/views/display/DisplayView.tsx`, `Header.tsx`, `CardGrid.tsx`,
  `AirframeCard.tsx`, `EmptyState.tsx`
- **E admin** → `src/views/admin/AdminView.tsx`, `LockScreen.tsx`, `Console.tsx`
- **F2 server+deploy** → `server/index.mjs`, `deploy/*`, `README.md`, `CLAUDE.md`

## Module contracts

### B1 — time + sun (pure)
`time/clocks.ts`:
- `formatUTC(d: Date): string` → `"HH:MM:SS Z"` (zero-padded, UTC fields).
- `formatPacific(d: Date): string` → real **`America/Los_Angeles`, DST tracked**, label `PST`/`PDT`.
  One memoized `Intl.DateTimeFormat` (`hour12:false`), read via `formatToParts` **by type**; derive the
  offset as `Date.UTC(fields) - instant` and the label from that offset (not `timeZoneName`); normalize
  the h24 `24:00:00` midnight; fall back to the old fixed −8h `PST` if the zone is unavailable.
  Helpers: `pacificOffsetMinutes(d): number|null`, `zoneLabel(offsetMinutes): string`.
  *Reverses the prototype's no-DST quirk on purpose (2026-08-06) — see DESIGN_BRIEF "Time".*
- Tests: **hardcoded** goldens (never Intl-vs-Intl); summer→PDT / winter→PST; both DST transitions;
  midnight/zero-pad; date-boundary wrap.

`globe/sun.ts`:
- `sunParams(d: Date): SunParams` — `sunLon = -(utcHoursFractional - 12)*15°` (include minutes+seconds);
  `decl = 23.44° * sin(2π*(dayOfYear-81)/365)` (UTC day-of-year, literal `/365`); return `{sunLon, sd, cd}`.
- Tests: golden values at known UTC instants; fractional-hour motion; year-boundary day-of-year.

### C — globe (CPU renderer). Full algorithm in DESIGN_BRIEF §"spinning Earth".
- `textures.ts`: `loadGlobeAssets(dayUrl, nightUrl): Promise<GlobeAssets>` — load the two `<img>` (already
  2048×1024; **no downscaling**). On error reject; caller renders a static fallback (must not crash board).
- `precompute.ts`: build typed-array buffers for the fixed **760×760** buffer (sphere radius `0.40*760`,
  atmosphere to `d≤1.24`), `EARTH_LON_VIEW=-100`, axial tilt `TILT_DEG=25` (sampling frame rotated
  about the view axis; pole leans right). Pure given canvas size + decoded texture pixel arrays.
- `render-core.ts`: pure per-pixel loop writing a `Uint8ClampedArray`. Preserve **exactly**:
  `cosTerm=cosLon*cos(θ)−sinLon*sin(θ)`, `diffuse=sinLat*sd+clat*cd*cosTerm`,
  `dayAmt=smoothstep(-0.13,0.13,diffuse)`, `dayWeight=(0.42+0.64*max(0,diffuse))*limb*dayAmt`,
  `nightWeight=limb*(1-dayAmt)*1.18`, `limb=0.54+0.46*nz`, inner-rim ambient `(40,94,182)*d²`,
  atmosphere glow chroma `(40,94,182)` with alpha `255*t²` (fades to transparent), clamp 255.
  **Texture column wrap MUST be `((u%1)+1)%1`** (bare `u%1` goes negative → black seam).
  Tests: wrap function; a few pixels at a known timestamp vs hand-computed values.
- `loop.ts`: rAF driver throttled to ≥50ms (~20fps); pauses on `document.hidden`/`visibilitychange`;
  rotation from absolute time `s=(now/1000)/earthPeriod` (`earthPeriod=300`), never delta-accumulated.
  Inject the clock for tests. Test: throttle gate + pause/resume.
- `index.ts`: `class CpuGlobeRenderer implements GlobeRenderer` — owns one reused `ImageData`, calls
  precompute in `init`, paints in `frame`, `dispose` cancels rAF.
- `GlobeCanvas.tsx`: Preact component, fixed canvas `width=760 height=760`, CSS
  `position:absolute; right:-94vh; bottom:-146vh; width:240vh; height:240vh; opacity:.97; z-index:0;
  filter:blur(4px)`. On mount: load assets → `init` → drive `loop`; on unmount `dispose`. Texture load
  failure → leave canvas blank (board keeps running).

### B2 — model/store/derive/layout/route/auth
- `model/store.ts`: `createFleetStore(): FleetStore` (LAN-first, localStorage fallback).
  - Init: `GET /api/fleet` → cache as snapshot. If fetch fails, fall back to `localStorage[STORAGE_KEY]`
    then `seed()`. Cache the parsed array; `getSnapshot()` returns the **same reference** until a change.
  - Live: open `EventSource('/api/stream')`; on message replace snapshot (new ref) + notify. In
    localStorage mode, listen to `window 'storage'` for `STORAGE_KEY` (update memory only, never re-persist).
  - Mutations (`add/update/remove`): update cached copy + notify synchronously (snappy), then **debounced
    (~120ms)** push: `PUT /api/fleet` with the full list (LAN) or `localStorage.setItem` (fallback).
  - Guard `JSON.parse`, null/empty → fall back to seed; never crash.
  - Tests (jsdom or mocked fetch/EventSource): stable snapshot ref; mutation notifies; corrupt payload
    falls back; debounce coalesces.
- `model/useFleet.ts`: `useFleet(store): readonly Airframe[]` via Preact `useSyncExternalStore`
  (`preact/compat` or `preact/hooks` shim). One shared store singleton exported here too.
- `model/derive.ts`: `toCardVM(a: Airframe): CardVM` using `HILITE`/`STATUS`/`clampPct`; `dateLabel` =
  `(flag==='complete' ? 'Completed: ' : 'ETA: ') + (eta||'TBD')`; `pctLabel`/`barPct` = `clampPct+'%'`.
  `countPad(n)` → 2-digit zero-pad. `heliFilter` = the accent tint, the same for every system
  (`'full'` included — only the clip differs); `techLabel` = `'TECH '+tech` or `''`.
  Tests: complete→green + "Completed:", clamp, unknown system→'2' clip, 'full'→`inset(0)` + accent tint.
- `layout/fit.ts`: `computeScale(area:{w,h}, grid:{w,h}): number` = `min(1, area.h/grid.h, area.w/grid.w)`.
  Plus a `useFitToHeight` hook: **reset transform before measuring**, recompute on resize, airframe-count
  change, and `document.fonts.ready`. Test the pure `computeScale`.
- `layout/stage.ts` + `layout/Stage.tsx`: the display route's minimum-board stage. Floor
  `MIN_BOARD_W/H` = 1280/720 (the header's real ~1218px need + slack — **re-derive if the title,
  its size, or `bar` padding changes**); ceiling `MAX_BOARD_W/H` = 2560/1440.
  `computeBoard(area, min, max): {scale, box}` = `s = min(max(1, min(area.w/max.w, area.h/max.h)),
  min(area.w/min.w, area.h/min.h))`, `box = area / s`. Deriving the box from the scale keeps
  `box * scale === area`, so the board always fills the screen instead of pillarboxing a non-16:9 area;
  the outer `min` makes the floor beat the ceiling (never clip); the inner `min` on growth needs BOTH
  axes past the ceiling. `parseOverscan(search)` reads `?overscan=N` percent per edge (clamped 0..10,
  default 0 — the wall TVs were measured and don't crop). `Stage` owns the box's `width`/`height`/
  `transform` (`transformOrigin: 0 0`, no centering translate, `none` at scale 1); overscan rides as
  absolute vh/vw insets (NOT padding — `clientWidth` includes padding). Test both pure functions.
- `routing.ts`: `parseHash(hash:string): 'admin'|'display'`; `useRoute()` (listens to `hashchange`);
  `goto(route)`. Test parseHash.
- `auth.ts`: `SQUAWK='7700'`; `checkCode(input):boolean`; `isAuthed()/setAuthed()/clearAuthed()` via
  `sessionStorage['fleet.admin']==='1'` (NOT localStorage). Test checkCode + session flag.

### D — display view (consumes B1, B2, C, theme)
- `app/App.tsx`: read route via `useRoute()`. `display` → `DisplayView`. `admin` → `AdminView` (from E).
  Always mount `GlobeCanvas` behind everything (outside the stage, so it backs both routes and its
  `vh` sizing tracks the real viewport). Set accent CSS vars on `:root` from `DEFAULT_ACCENT`.
- `DisplayView`: `<Stage>` wrapping `Header` + `CardGrid`/`EmptyState`. The Stage supplies the flex
  column; the display route lays out fluidly at scale 1 and only shrinks as one unit below the board
  floor, so it never reflows for a small viewport and never clips. Admin is unstaged.
- Background layers (from DESIGN_BRIEF / original markup): page gradient, faint grid (masked), star dots,
  warm lower glow. Root `position:fixed; inset:0; overflow:hidden`.
- `Header`: logo diamond; title `IAS ARTIFICIAL INTELLIGENCE PLATFORM` (Saira Condensed 700, 27px, .12em);
  subtitle; three mono stat blocks `AIRFRAMES`(countPad) / `UTC`(formatUTC, 1s tick) / `LOCAL`(formatPacific).
- `CardGrid`: 3-col grid (`repeat(3,minmax(0,1fr))`, gap 18px, max-width 1780px), fit-to-height wrapper.
- `AirframeCard`: accent bar; heli art (`heli-line.png` @opacity .5 + `heli-fill.png` clipped by
  `vm.clip`, filter from `vm.heliFilter`); `vm.workOrder` line above `vm.registration`;
  `vm.description` as 3-line-clamped prose; big % (accent, text-shadow); progress bar
  (width `vm.barPct`, transition `.7s cubic-bezier(.4,0,.2,1)`); footer (calendar + `vm.dateLabel`,
  with `vm.techLabel` on its own line beneath it when set, indented 22px to align under the date;
  status dot+label `vm.statusColor`, pulsing).
  Use exact tokens/sizes from the brief.
- `EmptyState`: `NO AIRFRAMES ON LINE` + `ADD PROJECTS VIA FLEET CONTROL · /#admin`.

### E — admin view (consumes B2 store, model)
- `LockScreen`: 380px card, diamond, `RESTRICTED`, squawk input (`letter-spacing:.4em`, centered,
  inputmode numeric), `AUTHENTICATE`, `← RETURN TO DISPLAY`; wrong → `ACCESS DENIED · INVALID CODE`;
  `checkCode` → `setAuthed()`.
- `Console`: header (`FLEET CONTROL`, `ADMIN CONSOLE · NN AIRFRAMES`), `OPEN DISPLAY`/`LOCK` buttons; table
  grid cols `1.1fr 1.1fr 2fr .9fr .8fr 1.5fr 1.05fr 1.05fr 44px` — workOrder, registration,
  description(textarea), system(select, `SYSTEM_LABELS`), tech(text, initials, `maxLength=4`), completion
  (range 0–100 + live %), eta, status(select), × remove; footer `+ ADD AIRFRAME`. Every edit calls the
  store (which persists + broadcasts). Footer note: `CHANGES BROADCAST LIVE TO ALL TV DISPLAYS`.
- `AdminView`: if `!isAuthed()` → `LockScreen`, else `Console`.

### F2 — LAN server + deploy
- `server/index.mjs`: Node, **`node:http` + `node:fs` only, zero deps**. Serves built `dist/` at `/` and:
  - `GET /api/fleet` → current array (JSON). State persisted to `server/fleet-data.json`; if missing,
    initialize from the 6-item seed (inline the seed values from DESIGN_BRIEF).
  - `PUT /api/fleet` → body = full array; validate/clamp; write file; broadcast to SSE clients.
  - `GET /api/stream` → `text/event-stream`; send current state on connect, push on each update;
    clean up on close; heartbeat comment every ~25s.
  - Correct MIME types; SPA fallback to `index.html`; `PORT` env (default 8080); bind `0.0.0.0` (LAN).
- `deploy/`: `avionics-board.service` (systemd, `Restart=always`, runs `npm run serve`), an
  install/launch script, a Chromium-kiosk unit/notes for the display Pis, DPMS/screen-blank-off notes,
  optional nightly reload. Document that the **server Pi is the host**; flag the host's known
  RAM/OOM/no-swap caveat (don't auto-install).
- `README.md` (build/run/deploy, offline notes, texture attribution: solarsystemscope.com CC BY 4.0) and
  project `CLAUDE.md`.

## Verification (Vitest only + manual visual)
- All pure logic has Vitest unit tests (sun/time golden incl. DST-tracking + both transitions, `u`-wrap,
  clamp, derive, fit `computeScale`, stage `computeBoard` invariants, routing, auth,
  store snapshot/debounce/fallback).
- Build green: `npm run typecheck` + `npm run build`. Manual visual check via `npm run dev` (a human
  compares to the prototype). No Playwright.
