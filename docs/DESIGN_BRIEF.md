# Ground-truth brief: Global Avionics Operations Board

Recreate (NOT port) a self-contained HTML prototype into an idiomatic stack. Source uses an
in-house `<x-dc>` runtime (React-shaped: `React.createRef`, `setState`, lifecycle, a
`renderVals()` view-model). DO NOT port the runtime. Copy the real logic.

## Product
24/7 wall-mounted TV kiosk for a helicopter avionics-integration shop. Target 1920x1080 16:9,
correct from ~1280x720 up. Runs on a Raspberry Pi 5 (CPU-only renderer by deliberate choice).
Root is `position:fixed; inset:0`; nothing scrolls on the Display route.

## Two routes in one page (hash routing)
- Display (default): the TV board.
- Admin (`#admin`): squawk-code gate (`7700`), then an editable airframe table.
Routing: read `location.hash`; `#admin` -> admin else display; listen to `hashchange`.
Auth: `sessionStorage['fleet.admin']==='1'` keeps it unlocked for the session.

## State
- Source of truth: `localStorage['fleet.projects.v2']` = JSON array of airframe objects;
  falls back to a 6-item seed when empty/missing.
- Multi-display sync: every edit persists to localStorage; a `storage` event listener reloads
  the list on every OTHER tab/display. (storage event does NOT fire in the writing tab, so the
  editing view must also update via its own local state.)
- Airframe object: { id, name, category, system:'comms|cockpit|mission|nav|autopilot|radar',
  pct:0..100, eta:string, flag:'on-track|at-risk|complete' }.
- Seed: BELL 412 COMMS/comms/82/on-track; EC135 GLASS COCKPIT/cockpit/47/on-track;
  AW139 SAR SUITE/mission/95/at-risk; H145 NAV UPGRADE/nav/24/on-track;
  BELL 429 AUTOPILOT/autopilot/64/on-track; S-76 WX RADAR/radar/100/complete.

## Time (deliberate quirks - preserve exactly)
- UTC clock: `HH:MM:SS Z`, ticks every 1s.
- LOCAL clock: fixed UTC-8 labeled `PST`, DAYLIGHT SAVING DISABLED ON PURPOSE. Implemented as
  `new Date(now - 8*3600*1000)` then read UTC fields. MUST NOT use Intl/America/Los_Angeles
  (that would apply DST). The class has a vestigial `TZ='America/Los_Angeles'` that tick() ignores.
- Globe sun uses REAL UTC (DST-independent, geographically correct).

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
  per `system` via clip-path inset to light only the upgraded part), name, category pill, big %,
  progress bar (width transition .7s), footer (calendar + ETA/Completed date, status dot+label).
- HILITE clip map (inset top right bottom left), tuned to 1112x376 heli art:
  cockpit inset(26% 68% 30% 15%); comms inset(38% 49% 22% 29%); mission inset(40% 41% 22% 37%);
  nav inset(13% 45% 66% 42%); autopilot inset(15% 47% 64% 40%); radar inset(44% 77% 30% 8%).
- STATUS: on-track {On Track,#5fd28a}; at-risk {At Risk,#ff9e3d}; complete {Complete,#5fd28a}.
  Status dots pulse (~2s blink). Date label: 'Completed: '+eta if complete else 'ETA: '+eta.
- Empty state: NO AIRFRAMES ON LINE + ADD PROJECTS VIA FLEET CONTROL / #admin.

## Admin console
- Lock screen: 380px card, diamond logo, RESTRICTED, password input (ENTER SQUAWK CODE,
  letter-spacing .4em centered), AUTHENTICATE (orange gradient), RETURN TO DISPLAY link.
  Wrong code -> ACCESS DENIED. Code 7700 -> sessionStorage['fleet.admin']='1'.
- Console: header (FLEET CONTROL, ADMIN CONSOLE - NN AIRFRAMES), OPEN DISPLAY + LOCK buttons.
  Table grid cols 1.7/1.5/1.1/1.9/1.1/1.1/44px: AIRFRAME-PROJECT(text), CATEGORY(text),
  SYSTEM(select), COMPLETION(range 0-100 + live %), ETA(text), STATUS(select), x remove.
  Footer: + ADD AIRFRAME. Every field writes through to localStorage immediately.

## Kiosk concerns
- Must survive running for days. rAF for globe (pauses when tab hidden), setInterval for clocks,
  persist nothing except the airframe list. Target ~20fps globe on Pi 5; everything else static
  between ticks.

## Assets (in project)
heli-line.png (1112x376), heli-fill.png (1112x376, must register pixel-for-pixel),
earth-day-8k.jpg / earth-night-8k.jpg (8192x4096), plus existing 2k variants.
