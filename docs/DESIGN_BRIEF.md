# Ground-truth brief: Global Avionics Operations Board

Recreate (NOT port) a self-contained HTML prototype into an idiomatic stack. Source uses an
in-house `<x-dc>` runtime (React-shaped: `React.createRef`, `setState`, lifecycle, a
`renderVals()` view-model). DO NOT port the runtime. Copy the real logic.

## Product
24/7 wall-mounted TV kiosk for a helicopter avionics-integration shop. Runs on a Raspberry Pi 5
(CPU-only renderer by deliberate choice). Root is `position:fixed; inset:0`; nothing scrolls
on the Display route.

## Minimum-board stage (Display route)
`Stage` (`src/layout/Stage.tsx`) lays the Display route out **fluidly at scale 1** — no transform
at all, identical to no stage — and scales it down as ONE unit only when the viewport falls under
the board's floor of **1280x720**. A bigger panel stays fluid up to a ceiling of 2560x1440, past
which it scales UP so a 4K wall is full-bleed rather than hairline.
```
s   = min( max(1, min(area.w/2560, area.h/1440)), min(area.w/1280, area.h/720) )
box = area / s
```
Deriving the box from the scale (not fitting a fixed box) keeps `box * scale === area`, so the
board always fills the screen — a fixed-box fit pillarboxes a non-16:9 area (at 1600x600 it would
render 1067x600 and waste 533px; this gives s=0.833 in a 1920x720 box).
- Why: the wall's Fire TV/Silk sets report a CSS viewport well under 1920. The Header alone
  needs ~1218px (1137.5px of nowrap title + three stat blocks, plus 40px `bar` padding per side)
  and cannot shrink, so the LOCAL clock used to be clipped clean off the right edge by the root's
  `overflow:hidden`.
- **Why 1280 and not 1920:** an earlier version fitted a *fixed* 1920x1080 box. That solved the
  clipping, but on a 960px-wide TV it meant `s = 0.5` and every glyph was unreadable — a 36%
  scale penalty paid to reserve width nothing used. 1920 is a ceiling, not the design width.
  On those TVs the floor gives `s = 0.75` instead.
  **`MIN_BOARD_W` must be re-derived if the header title string, its font size, or `bar`'s
  padding changes** — it is the one number keeping the clock on screen.
- The two `vw`-based font clamps in `AirframeCard` were replaced with the fixed px they evaluate
  to at 1920 (`21px`, `38px`): `vw` resolves against the real viewport and ignores an ancestor
  transform, so inside the stage they collapsed to their floors and shrank a second time.
- Overscan: the stage can be inset by `?overscan=N` percent per edge (clamped 0..10) for TVs
  that crop. **Default 0** — the wall's Hisense Fire TVs were measured with the
  `/waketest.html` ruler on 2026-08-06 and show the 0% frame complete, so the board sits flush.
  `/waketest.html` prints the reported viewport and draws 0/2.5/5% ruler frames so the right N
  can be read off any future panel.
- The Admin route is deliberately NOT staged — it is edited from a laptop/phone.

## Two routes in one page (hash routing)
- Display (default): the TV board.
- Admin (`#admin`): squawk-code gate (`7700`), then an editable airframe table.
Routing: read `location.hash`; `#admin` -> admin else display; listen to `hashchange`.
Auth: `sessionStorage['fleet.admin']==='1'` keeps it unlocked for the session.

## State
- Source of truth: `localStorage['fleet.projects.v3']` = JSON array of airframe objects;
  falls back to a 6-item seed when empty/missing.
- Multi-display sync: every edit persists to localStorage; a `storage` event listener reloads
  the list on every OTHER tab/display. (storage event does NOT fire in the writing tab, so the
  editing view must also update via its own local state.)
- Airframe object: { id, workOrder, registration, description, system:'1|2|3|4|5|6|full',
  tech:string (name initials, A-Z only, upper-cased, max 4), pct:0..100, eta:string,
  flag:'on-track|at-risk|complete' }.
  Reshaped ahead of a real database: the original single `name` split into `workOrder` +
  `registration`, `category` became the free-prose `description`, the six named systems became
  numbers, and `tech` (the assigned technician) is new. It started as an employee number
  and became **name initials** on 2026-08-06 at management's request; any stored employee
  number normalizes to `''` (unassigned) on the next read, by design. `normalizeAirframe` maps the old
  `name`/`category`/`cockpit…radar` values forward so stored fleets still load.
- `system` picks which part of the heli art lights: '1'..'6' are the six tuned regions,
  'full' lights the WHOLE airframe (a whole-aircraft project). Unknown → '2'.
  The tint is the accent for every system — only the clip differs.
- Seed: WO-4471/N412HL/sys 2/82/on-track; WO-4482/N135EC/sys 1/47/on-track;
  WO-4490/N139SR/sys full/95/at-risk; WO-4503/N145AM/sys 4/24/on-track;
  WO-4511/N429BT/sys 5/64/on-track; WO-4519/N76WX/sys 6/100/complete.

## Time
- UTC clock: `HH:MM:SS Z`, ticks every 1s. Built from `getUTCHours/Minutes/Seconds` with no offset
  arithmetic, so no timezone setting can shift it — only a wrong device clock can.
- LOCAL clock: real `America/Los_Angeles`, DST included, label flips `PST`/`PDT` with the offset.
  The label is derived from the computed offset, NOT from `timeZoneName:'short'` (a reduced-ICU build
  returns `GMT-7` there, which is wider than the header's width budget). Falls back to a fixed UTC-8
  `PST` only if the engine has no usable tz data.
- **DELIBERATE REVERSAL (2026-08-06).** The prototype used a fixed UTC-8 labeled `PST` with DST
  disabled, and this brief previously mandated preserving it verbatim. On the wall it simply read one
  hour behind for the ~8 months a year Pacific is on PDT. The owner called it: the clock is now
  correct. Do NOT restore the fixed offset as a "preserved quirk".
- Globe sun uses REAL UTC (DST-independent, geographically correct) and is unaffected.

## The spinning Earth (CPU canvas, no WebGL - intentional for the Pi)
- Canvas internal buffer 760x760; CSS `position:absolute; right:-94vh; bottom:-146vh;
  width:240vh; height:240vh; opacity:.97; z-index:0; filter:blur(4px)`. Only ~1/8 of the sphere
  is visible (off-screen bottom-right). Blur + upscale 760->~2600px gives the hazy distant look.
- Textures: equirectangular day + night (city lights), 8192x4096 supplied; downscaled to
  2048x1024 into an offscreen canvas, read via getImageData. (Project also already contains 2k
  variants earth-day-2k.jpg / earth-night-2k.jpg.)
- Precompute once per visible sphere pixel into typed arrays: screen->sphere normal (nx, wy=sinLat,
  nz), cosLat, lonBase = EARTH_LON_VIEW(-100 deg) + atan2(nx,nz), cos/sin(lonBase),
  baseU = lonBase/2pi + 0.5, texture row from lat, limb = 0.54 + 0.46*nz, inner-rim blue ambient.
  Axial tilt TILT_DEG=25: the screen->sphere sampling frame is rotated about the view axis so the
  north pole leans 25 deg right on screen (d² is rotation-invariant, so ring/limb/ambient unchanged).
  Atmosphere ring for d in (1, 1.24]: constant chroma (40,94,182) with ALPHA = 255*t^2 — the glow
  fades to transparent (not to opaque black) so it merges into any page background.
- Per frame (rAF, throttled to ~50ms ~ 20fps):
  s = (t/1000)/earthPeriod turns; phi = s*2pi.
  Sun: sunLon = -(UTC_hours - 12)*15 deg; decl = 23.44deg*sin(2pi*(doy-81)/365); sd,cd.
  Angle-addition trick (NO per-pixel trig): with theta = phi - sunLon,
  cosTerm = cosLon*cos(theta) - sinLon*sin(theta) = cos(currentLon - sunLon).
  diffuse = sinLat*sd + cosLat*cd*cosTerm.
  dayAmt = smoothstep(-0.13,0.13,diffuse).
  dayWeight = (0.42 + 0.64*max(0,diffuse))*limb*dayAmt; nightWeight = limb*(1-dayAmt)*1.18.
  Texture column scrolls: u = baseU + s (wrapped). color = day*dayWeight + night*nightWeight + ambient (clamp 255).
- Constants: earthPeriod=300 (s/rotation), EARTH_LON_VIEW=-100 (frames the Americas).
- Memory discipline: typed arrays allocated once; one reused ImageData; putImageData each frame.
- README: on capable HW you may raise buffer/fps or port the SAME formula to a WebGL fragment shader.

## Fit-to-height
After render/resize, measure grid and apply `transform: scale(s)` where
s = min(1, areaH/gridH, areaW/gridW) so all 6 cards always fit, no scrollbar. Recompute on resize
and when airframe count changes.

## Visuals / tokens (hi-fi, pixel-for-pixel; full values in README)
- Fonts (Google): Saira (300/400/500/600), Saira Condensed (500/600/700), IBM Plex Mono (400/500/600).
- Page bg radial gradient; base #04060c; amber accent #ff9e3d / light #ffc874 / value text #ffb454.
- 3 accent presets amber|orange|gold (only amber default); heli-fill re-tinted per accent via CSS filter.
- Card grid: 3 cols repeat(3,minmax(0,1fr)), gap 18px, max-width 1780px; 3x2 = 6 cards.
- AirframeCard: accent bar (4px), heli art (heli-line.png base @opacity .5 + heli-fill.png clipped
  per `system` via clip-path inset to light only the upgraded part), work-order line (mono 10.5px,
  .16em, muted) above the registration, project description (free prose, body 12.5px, clamped to
  3 lines), big %, progress bar (width transition .7s), footer (calendar + ETA/Completed date,
  then `TECH <initials>` on its own line beneath it when assigned — mono 10.5px, .16em, muted, indented
  22px so it aligns under the date text; status dot+label on the right, vertically centred).
- HILITE clip map (inset top right bottom left), tuned to 1112x376 heli art:
  1 inset(26% 68% 30% 15%); 2 inset(38% 49% 22% 29%); 3 inset(40% 41% 22% 37%);
  4 inset(13% 45% 66% 42%); 5 inset(15% 47% 64% 40%); 6 inset(44% 77% 30% 8%);
  full inset(0) — the whole airframe.
  Every card uses the same heli-fill tint (saturate(1.05) + the per-accent filter); 'full' rows are
  NOT re-coloured. A yellow-tinted 'full' variant existed once and was dropped: it landed the art on
  ~#edd000 (hue 53°), ~22° off the amber accent, so a full-aircraft card read as a different colour.
- STATUS: on-track {On Track,#5fd28a}; at-risk {At Risk,#ff9e3d}; complete {Complete,#5fd28a}.
  Status dots pulse (~2s blink). Date label: 'Completed: '+eta if complete else 'ETA: '+eta.
- Empty state: NO AIRFRAMES ON LINE + ADD PROJECTS VIA FLEET CONTROL / #admin.

## Admin console
- Lock screen: 380px card, diamond logo, RESTRICTED, password input (ENTER SQUAWK CODE,
  letter-spacing .4em centered), AUTHENTICATE (orange gradient), RETURN TO DISPLAY link.
  Wrong code -> ACCESS DENIED. Code 7700 -> sessionStorage['fleet.admin']='1'.
- Console: header (FLEET CONTROL, ADMIN CONSOLE - NN AIRFRAMES), OPEN DISPLAY + LOCK buttons.
  Table grid cols 1.1/1.1/2/.9/.8/1.5/1.05/1.05/44px: WORK ORDER(text), REGISTRATION(text),
  PROJECT DESCRIPTION(textarea), SYSTEM(select 1-6 + FULL AIRCRAFT), TECH(numeric text),
  COMPLETION(range 0-100 + live %), ETA(text), STATUS(select), x remove.
  Footer: + ADD AIRFRAME. Every field writes through to localStorage immediately.

## Kiosk concerns
- Must survive running for days. rAF for globe (pauses when tab hidden), setInterval for clocks,
  persist nothing except the airframe list. Target ~20fps globe on Pi 5; everything else static
  between ticks.

## Assets (in project)
heli-line.png (1112x376), heli-fill.png (1112x376, must register pixel-for-pixel),
earth-day-8k.jpg / earth-night-8k.jpg (8192x4096), plus existing 2k variants.
