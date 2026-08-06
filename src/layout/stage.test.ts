import { describe, it, expect } from 'vitest';
import {
  computeBoard,
  parseOverscan,
  MIN_BOARD_W,
  MIN_BOARD_H,
  MAX_BOARD_W,
  MAX_BOARD_H,
  DEFAULT_OVERSCAN,
} from './stage';

const MIN = { w: MIN_BOARD_W, h: MIN_BOARD_H };
const MAX = { w: MAX_BOARD_W, h: MAX_BOARD_H };
const NO_MAX = { w: Infinity, h: Infinity };

// A spread of real and awkward areas, reused by the invariant tests below.
const AREAS = [
  { w: 1920, h: 1080 },
  { w: 960, h: 540 },
  { w: 1280, h: 720 },
  { w: 1366, h: 768 },
  { w: 1600, h: 600 },
  { w: 800, h: 1200 },
  { w: 3840, h: 2160 },
  { w: 5000, h: 1000 },
];

describe('computeBoard', () => {
  it('is fluid and untransformed at 1920x1080 — no visual change on a real 1080p panel', () => {
    expect(computeBoard({ w: 1920, h: 1080 }, MIN, MAX)).toEqual({
      scale: 1,
      box: { w: 1920, h: 1080 },
    });
  });

  it('scales the 960x540 viewport Fire TV Silk reports to 0.75 in a 1280x720 box', () => {
    // Was 0.5 against a fixed 1920x1080 box, which made every glyph unreadable.
    expect(computeBoard({ w: 960, h: 540 }, MIN, MAX)).toEqual({
      scale: 0.75,
      box: { w: 1280, h: 720 },
    });
  });

  it('is exactly 1 at the floor itself', () => {
    expect(computeBoard(MIN, MIN, MAX)).toEqual({ scale: 1, box: { w: 1280, h: 720 } });
  });

  it('starts scaling one pixel under the floor', () => {
    const { scale, box } = computeBoard({ w: 1279, h: 720 }, MIN, MAX);
    expect(scale).toBeCloseTo(1279 / 1280, 12);
    expect(box.w).toBeCloseTo(1280, 9);
    expect(box.h).toBeCloseTo(720 * (1280 / 1279), 9);
  });

  it('fills a short, wide area instead of pillarboxing it', () => {
    // A fixed-box fit would render 1067x600 here and waste 533px of width.
    const { scale, box } = computeBoard({ w: 1600, h: 600 }, MIN, MAX);
    expect(scale).toBeCloseTo(600 / 720, 12);
    expect(box.w).toBeCloseTo(1920, 9);
    expect(box.h).toBeCloseTo(720, 9);
  });

  it('stays fluid between the floor and the ceiling', () => {
    expect(computeBoard({ w: 1366, h: 768 }, MIN, MAX)).toEqual({
      scale: 1,
      box: { w: 1366, h: 768 },
    });
    expect(computeBoard(MAX, MIN, MAX)).toEqual({ scale: 1, box: { w: 2560, h: 1440 } });
  });

  it('scales UP past the ceiling so a 4K wall is full-bleed', () => {
    expect(computeBoard({ w: 3840, h: 2160 }, MIN, MAX)).toEqual({
      scale: 1.5,
      box: { w: 2560, h: 1440 },
    });
  });

  it('needs BOTH axes past the ceiling — an ultrawide is not "huge"', () => {
    expect(computeBoard({ w: 5000, h: 1000 }, MIN, MAX).scale).toBe(1);
  });

  it('never grows when the ceiling is disabled', () => {
    expect(computeBoard({ w: 3840, h: 2160 }, MIN, NO_MAX)).toEqual({
      scale: 1,
      box: { w: 3840, h: 2160 },
    });
  });

  it('lets the floor win over a conflicting ceiling — never clip, ever', () => {
    // Degenerate config: ceiling below the floor. The area is under the floor, so
    // the board must still scale DOWN rather than take the ceiling's growth.
    const tight = { w: 640, h: 360 };
    expect(computeBoard(tight, MIN, { w: 320, h: 180 }).scale).toBe(0.5);
  });

  it('returns scale 1 for an unmeasured area or a degenerate floor', () => {
    expect(computeBoard({ w: 0, h: 0 }, MIN, MAX).scale).toBe(1);
    expect(computeBoard({ w: 1920, h: 0 }, MIN, MAX).scale).toBe(1);
    expect(computeBoard({ w: 1920, h: 1080 }, { w: 0, h: 0 }, MAX)).toEqual({
      scale: 1,
      box: { w: 1920, h: 1080 },
    });
  });

  // The three properties the whole design rests on.
  it('INVARIANT: the scaled box always fills the area exactly', () => {
    for (const area of AREAS) {
      const { scale, box } = computeBoard(area, MIN, MAX);
      expect(box.w * scale).toBeCloseTo(area.w, 9);
      expect(box.h * scale).toBeCloseTo(area.h, 9);
    }
  });

  it('INVARIANT: the box is never laid out below the floor', () => {
    for (const area of AREAS) {
      const { box } = computeBoard(area, MIN, MAX);
      expect(box.w).toBeGreaterThanOrEqual(MIN_BOARD_W - 1e-9);
      expect(box.h).toBeGreaterThanOrEqual(MIN_BOARD_H - 1e-9);
    }
  });

  it('INVARIANT: never enlarges unless the area clears the ceiling on both axes', () => {
    for (const area of AREAS) {
      if (area.w >= MAX_BOARD_W && area.h >= MAX_BOARD_H) continue;
      expect(computeBoard(area, MIN, MAX).scale).toBeLessThanOrEqual(1);
    }
  });
});

describe('parseOverscan', () => {
  it('defaults to flush — the wall TVs were measured and do not overscan', () => {
    expect(DEFAULT_OVERSCAN).toBe(0);
    expect(parseOverscan('')).toBe(0);
  });

  it('defaults when the param is absent or empty', () => {
    expect(parseOverscan('')).toBe(DEFAULT_OVERSCAN);
    expect(parseOverscan('?')).toBe(DEFAULT_OVERSCAN);
    expect(parseOverscan('?foo=1')).toBe(DEFAULT_OVERSCAN);
    expect(parseOverscan('?overscan=')).toBe(DEFAULT_OVERSCAN);
  });

  it('reads an explicit value, including a flush 0', () => {
    expect(parseOverscan('?overscan=0')).toBe(0);
    expect(parseOverscan('?overscan=5')).toBe(5);
    expect(parseOverscan('?overscan=3.5')).toBe(3.5);
  });

  it('works without the leading ? and alongside other params', () => {
    expect(parseOverscan('overscan=4')).toBe(4);
    expect(parseOverscan('?a=1&overscan=6&b=2')).toBe(6);
  });

  it('ignores a trailing hash route (/?overscan=5#admin)', () => {
    expect(parseOverscan('?overscan=5#admin')).toBe(5);
  });

  it('clamps out-of-range values instead of shrinking the board to nothing', () => {
    expect(parseOverscan('?overscan=99')).toBe(10);
    expect(parseOverscan('?overscan=-4')).toBe(0);
  });

  it('falls back on garbage', () => {
    expect(parseOverscan('?overscan=abc')).toBe(DEFAULT_OVERSCAN);
  });
});
