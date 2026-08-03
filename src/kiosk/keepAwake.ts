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
// always-visible corner <video> drawn in the board's palette so it reads as a
// faint breathing status LED. The "small stream video" mode of this exact
// recipe survived the sleep timer on the wall TVs; the Wake Lock API and
// control modes did not.
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
  // Must stay genuinely visible: Chromium only holds the wake lock while the
  // element is ≥75% within the viewport. Top of the stack so nothing occludes
  // it; pointer-events off so it can never eat a click (admin included).
  Object.assign(video.style, {
    position: 'fixed',
    right: '10px',
    bottom: '10px',
    width: `${VIEW_W}px`,
    height: `${VIEW_H}px`,
    zIndex: '9999',
    pointerEvents: 'none',
    background: '#04060c',
  } satisfies Partial<CSSStyleDeclaration>);
  video.srcObject = canvas.captureStream(1000 / TICK_MS);

  document.body.append(canvas, video);

  const t0 = Date.now();
  const draw = () => {
    const t = (Date.now() - t0) / 1000;
    ctx.fillStyle = '#04060c'; // --bg-base
    ctx.fillRect(0, 0, BUF_W, BUF_H);
    // Dim breathing dot in the board's muted blue-grey — reads as a status LED.
    const pulse = 0.16 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.1));
    ctx.fillStyle = `rgba(127, 160, 200, ${pulse.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(BUF_W - 40, BUF_H / 2, 10, 0, Math.PI * 2);
    ctx.fill();
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
