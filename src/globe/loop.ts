// requestAnimationFrame driver for the globe.
//
// - Throttled to ≥50ms between frames (~20fps) so the Pi 5 CPU renderer stays
//   cheap.
// - Pauses while the tab is hidden (document.hidden / visibilitychange); resumes
//   on the suspended rAF firing again, rendering immediately.
// - Rotation comes from ABSOLUTE time `s = (now/1000)/earthPeriod`, never from
//   accumulated deltas, so a paused/throttled tab never drifts.
//
// The clock is injected so the throttle gate + pause/resume are deterministically
// testable in a plain Node environment (no DOM required).

export const EARTH_PERIOD = 300; // seconds per rotation
export const MIN_FRAME_MS = 50; // throttle gate (~20fps)

/** Absolute rotation in turns for a given timestamp (ms). Never delta-based. */
export function rotationTurns(nowMs: number): number {
  return nowMs / 1000 / EARTH_PERIOD;
}

/** Injectable environment seam for the loop (DOM in prod, fake in tests). */
export interface LoopClock {
  now(): number;
  requestFrame(cb: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  hidden(): boolean;
  subscribeVisibility(cb: () => void): () => void;
}

export interface LoopHandle {
  start(): void;
  stop(): void;
}

function defaultClock(): LoopClock {
  return {
    now: () => Date.now(),
    requestFrame: (cb) => requestAnimationFrame(cb),
    cancelFrame: (id) => cancelAnimationFrame(id),
    hidden: () => typeof document !== 'undefined' && document.hidden,
    subscribeVisibility: (cb) => {
      const handler = () => cb();
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
  };
}

/**
 * Create a throttled, visibility-aware rAF loop. `onFrame` is called with the
 * clock timestamp (ms) at most once per `MIN_FRAME_MS`.
 */
export function createLoop(onFrame: (nowMs: number) => void, clock: LoopClock = defaultClock()): LoopHandle {
  let running = false;
  let rafId = 0;
  let last = -Infinity;
  let unsub: (() => void) | null = null;

  const schedule = (): void => {
    rafId = clock.requestFrame(tick);
  };

  function tick(_ts: number): void {
    if (!running) return;
    // Keep the rAF chain alive. When the tab is hidden the browser suspends
    // these callbacks; the chain resumes (and re-renders) when it becomes
    // visible again.
    schedule();
    if (clock.hidden()) return;
    const n = clock.now();
    if (n - last < MIN_FRAME_MS) return; // throttle gate
    last = n;
    onFrame(n);
  }

  const onVisibility = (): void => {
    // On resume, render immediately rather than waiting out a stale throttle.
    if (!clock.hidden()) last = -Infinity;
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      last = -Infinity;
      unsub = clock.subscribeVisibility(onVisibility);
      schedule();
    },
    stop(): void {
      if (!running) return;
      running = false;
      clock.cancelFrame(rafId);
      if (unsub) {
        unsub();
        unsub = null;
      }
    },
  };
}
