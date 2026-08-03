// Keep-awake for the TV wall (Fire TV / Silk — harmless everywhere else).
//
// Fire OS force-sleeps the TV after ~20 minutes unless the foreground app holds
// a screen wake lock; no GUI setting reaches that timer. Silk ignores the
// standard Wake Lock API (verified on the wall's Hisense Fire TVs, 2026-08, via
// /waketest.html), but Chromium automatically holds a screen wake lock for any
// *playing, visible* <video> — and MediaStream-backed videos are exempt from
// the "must cover 20% of the viewport" size rule (Blink video_wake_lock.cc).
//
// So: a hidden canvas animates at 5 fps into captureStream(), feeding a small
// corner <video> tucked BEHIND the app (first child of <body>, painted over by
// the opaque board). Chromium's wake-lock visibility check is a plain
// IntersectionObserver — geometry only, occlusion is not tracked — so the
// element counts as fully visible while the board hides it completely. The
// "small stream video" mode of this recipe survived the sleep timer on the
// wall TVs; the Wake Lock API and control modes did not.
//
// The Wake Lock API is still requested opportunistically as a free extra for
// browsers that do honor it (admin sessions on laptops/phones).

const TICK_MS = 200; // 5 fps — enough for captureStream to emit frames, cheap on the TVs
const BUF_W = 320;
const BUF_H = 180;
const VIEW_W = 96; // on-screen chip size, px; bump to 200×150 (the tested size)
const VIEW_H = 54; // if a Silk update ever tightens the visibility heuristics

let started = false;

export function startKeepAwake(): void {
  if (started || typeof document === 'undefined') return;
  started = true;

  // Ancient browser with no captureStream: nothing video-based we can do.
  if (!HTMLCanvasElement.prototype.captureStream) {
    requestWakeLock();
    return;
  }

  // Kept in the DOM but display:none, exactly like the proven test page —
  // captureStream captures draw calls regardless of the canvas being painted.
  const canvas = document.createElement('canvas');
  canvas.width = BUF_W;
  canvas.height = BUF_H;
  canvas.style.display = 'none';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const video = document.createElement('video');
  video.muted = true;
  video.autoplay = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  // Chromium holds the wake lock only while the element's viewport
  // intersection ratio is ≥75% — a plain IntersectionObserver check: geometry
  // only, occlusion not tracked. So the video may sit BEHIND the opaque app
  // root without losing the lock, but must never be display:none or pushed
  // off-viewport. It still paints --bg-base frames in case it's ever exposed.
  Object.assign(video.style, {
    position: 'fixed',
    left: '10px',
    bottom: '10px',
    width: `${VIEW_W}px`,
    height: `${VIEW_H}px`,
    pointerEvents: 'none',
    background: '#04060c',
  } satisfies Partial<CSSStyleDeclaration>);
  video.srcObject = canvas.captureStream(1000 / TICK_MS);

  document.body.append(canvas);
  // First child of <body>: the app mount (#app) comes later in DOM order, so
  // with z-index auto everywhere the board always paints over the video — it
  // can never block a card again.
  document.body.prepend(video);

  // captureStream only emits on draw calls and the wake lock wants a video
  // with fresh frames — so draw the cheapest thing that still yields distinct
  // frames: solid --bg-base with the blue channel alternating one bit per
  // tick. Doubles as camouflage if the video is ever exposed from behind the
  // board.
  let flip = false;
  const draw = () => {
    flip = !flip;
    ctx.fillStyle = flip ? '#04060d' : '#04060c'; // --bg-base ± one bit
    ctx.fillRect(0, 0, BUF_W, BUF_H);
  };

  let timer: number | undefined;
  const setRunning = (run: boolean) => {
    if (run && timer === undefined) timer = window.setInterval(draw, TICK_MS);
    else if (!run && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };

  const tryPlay = () => {
    void video.play().catch(() => {
      /* autoplay blocked — retried on visibility change / first input below */
    });
  };

  // A pause we didn't ask for is system-initiated (TV slept and woke, Silk
  // suspended the page…): resume once the page is visible again.
  video.addEventListener('pause', () => {
    if (!document.hidden) window.setTimeout(tryPlay, 1000);
  });
  document.addEventListener('visibilitychange', () => {
    setRunning(!document.hidden);
    if (!document.hidden) {
      tryPlay();
      requestWakeLock();
    }
  });
  // If autoplay was blocked on load, the first remote/mouse input unblocks it.
  const onFirstInput = () => tryPlay();
  window.addEventListener('pointerdown', onFirstInput, { once: true });
  window.addEventListener('keydown', onFirstInput, { once: true });

  setRunning(!document.hidden);
  tryPlay();
  requestWakeLock();
}

// --- Wake Lock API (best-effort; not honored by Silk on the wall TVs) -------

type WakeLockLike = {
  request(type: 'screen'): Promise<{
    addEventListener(type: 'release', cb: () => void): void;
  }>;
};

let holdingLock = false;

function requestWakeLock(): void {
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  if (!wakeLock || holdingLock) return;
  wakeLock
    .request('screen')
    .then((sentinel) => {
      holdingLock = true;
      // Released whenever the page is hidden; visibilitychange re-requests.
      sentinel.addEventListener('release', () => {
        holdingLock = false;
      });
    })
    .catch(() => {
      /* unsupported, denied, or page hidden — the video path carries us */
    });
}
