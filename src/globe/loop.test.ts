import { describe, it, expect } from 'vitest';
import { createLoop, rotationTurns, EARTH_PERIOD, MIN_FRAME_MS, type LoopClock } from './loop';

// A fully synthetic clock so the throttle gate and pause/resume are
// deterministic in plain Node (no DOM, no real rAF).
function makeEnv() {
  let t = 1000;
  let hidden = false;
  let pending: FrameRequestCallback | null = null;
  let nextId = 1;
  const visListeners: Array<() => void> = [];

  const clock: LoopClock = {
    now: () => t,
    requestFrame: (cb) => {
      pending = cb;
      return nextId++;
    },
    cancelFrame: () => {
      pending = null;
    },
    hidden: () => hidden,
    subscribeVisibility: (cb) => {
      visListeners.push(cb);
      return () => {
        const i = visListeners.indexOf(cb);
        if (i >= 0) visListeners.splice(i, 1);
      };
    },
  };

  return {
    clock,
    advance: (dt: number) => {
      t += dt;
    },
    setHidden: (h: boolean) => {
      hidden = h;
    },
    fireVisibility: () => visListeners.slice().forEach((f) => f()),
    /** Invoke the currently-scheduled rAF callback (one tick). */
    fire: () => {
      const cb = pending;
      pending = null;
      if (cb) cb(t);
    },
    hasPending: () => pending !== null,
    visCount: () => visListeners.length,
  };
}

describe('rotationTurns', () => {
  it('is absolute time / earthPeriod (never delta-accumulated)', () => {
    expect(EARTH_PERIOD).toBe(300);
    expect(rotationTurns(0)).toBe(0);
    expect(rotationTurns(300_000)).toBe(1); // 300s → exactly one turn
    expect(rotationTurns(150_000)).toBe(0.5);
  });
});

describe('createLoop throttle gate (≥50ms)', () => {
  it(`emits a frame at most once per ${MIN_FRAME_MS}ms`, () => {
    const env = makeEnv();
    const calls: number[] = [];
    const loop = createLoop((n) => calls.push(n), env.clock);

    loop.start();
    env.fire(); // t=1000, first frame always allowed
    expect(calls).toEqual([1000]);

    env.advance(20); // t=1020, Δ20 < 50
    env.fire();
    expect(calls).toEqual([1000]);

    env.advance(20); // t=1040, Δ40 < 50
    env.fire();
    expect(calls).toEqual([1000]);

    env.advance(20); // t=1060, Δ60 since last frame (1000) ≥ 50
    env.fire();
    expect(calls).toEqual([1000, 1060]);

    loop.stop();
  });

  it('keeps the rAF chain alive across ticks', () => {
    const env = makeEnv();
    const loop = createLoop(() => {}, env.clock);
    loop.start();
    expect(env.hasPending()).toBe(true);
    env.fire();
    expect(env.hasPending()).toBe(true); // rescheduled itself
    loop.stop();
    expect(env.hasPending()).toBe(false); // cancelled on stop
  });
});

describe('createLoop pause/resume on visibility', () => {
  it('does not emit frames while hidden, then resumes when visible', () => {
    const env = makeEnv();
    const calls: number[] = [];
    const loop = createLoop((n) => calls.push(n), env.clock);

    loop.start();
    env.fire(); // frame at 1000
    expect(calls).toEqual([1000]);

    env.setHidden(true);
    env.advance(500); // plenty > 50ms
    env.fire();
    env.advance(500);
    env.fire();
    expect(calls).toEqual([1000]); // still paused

    env.setHidden(false);
    env.fireVisibility(); // resume → throttle reset
    env.advance(10); // even < 50ms since the reset
    env.fire();
    expect(calls.length).toBe(2);
    expect(calls[1]).toBeGreaterThan(1000);

    loop.stop();
  });

  it('unsubscribes from visibility on stop', () => {
    const env = makeEnv();
    const loop = createLoop(() => {}, env.clock);
    loop.start();
    expect(env.visCount()).toBe(1);
    loop.stop();
    expect(env.visCount()).toBe(0);
  });
});
