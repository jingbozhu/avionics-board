import { describe, it, expect } from 'vitest';
import {
  CLEAR_K,
  DEFAULT_FIELD,
  FIELD_HUES,
  LIT_AXIS,
  LIT_FLOOR,
  TILT_DEG,
  basisFor,
  breathe,
  cross,
  litGain,
  makeGeodesic,
  minCenterDistance,
  mulberry32,
  pickHue,
  pointAt,
  rotateZ,
  type Vec3,
} from './geodesic';

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(7700);
    const b = mulberry32(7700);
    const seqA = Array.from({ length: 64 }, () => a());
    const seqB = Array.from({ length: 64 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(7700);
    const b = mulberry32(7701);
    expect(a()).not.toBe(b());
  });

  it('stays within [0, 1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 5000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('basisFor', () => {
  it('returns an orthonormal basis of the plane perpendicular to n', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const n: Vec3 = { x: rand() * 2 - 1, y: rand() * 2 - 1, z: rand() * 2 - 1 };
      const m = len(n) || 1;
      const unit: Vec3 = { x: n.x / m, y: n.y / m, z: n.z / m };
      const { u, v } = basisFor(unit);
      expect(len(u)).toBeCloseTo(1, 10);
      expect(len(v)).toBeCloseTo(1, 10);
      expect(dot(u, v)).toBeCloseTo(0, 10);
      expect(dot(u, unit)).toBeCloseTo(0, 10);
      expect(dot(v, unit)).toBeCloseTo(0, 10);
    }
  });

  it('does not degenerate when n is the +z axis', () => {
    const { u, v } = basisFor({ x: 0, y: 0, z: 1 });
    expect(len(u)).toBeCloseTo(1, 12);
    expect(len(v)).toBeCloseTo(1, 12);
  });
});

describe('the still-centre invariant', () => {
  // The load-bearing identity: for a great circle with unit normal n rendered
  // orthographically down +z, the projected ellipse's closest approach to the
  // centre is exactly |n.z|.
  it('minCenterDistance(n) equals the measured closest approach', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 120; i++) {
      const g = makeGeodesic(rand);
      let measured = Infinity;
      for (let k = 0; k < 4000; k++) {
        const p = pointAt(g, (k / 4000) * Math.PI * 2);
        measured = Math.min(measured, Math.hypot(p.x, p.y));
      }
      expect(measured).toBeCloseTo(minCenterDistance(g.n), 4);
    }
  });

  it('no generated arc ever enters the clear disc', () => {
    const rand = mulberry32(7700);
    for (let i = 0; i < 3000; i++) {
      const g = makeGeodesic(rand, DEFAULT_FIELD);
      expect(minCenterDistance(g.n)).toBeGreaterThanOrEqual(DEFAULT_FIELD.clearK - 1e-12);
    }
  });

  it('rotation about the view axis leaves n.z — and therefore the centre — invariant', () => {
    const rand = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const g = makeGeodesic(rand);
      const spun = rotateZ(g.n, rand() * Math.PI * 2);
      expect(spun.z).toBeCloseTo(g.n.z, 12);
      expect(len(spun)).toBeCloseTo(len(g.n), 12);
      expect(minCenterDistance(spun)).toBeCloseTo(minCenterDistance(g.n), 12);
    }
  });

  it('breathing keeps n_z strictly inside the permitted band', () => {
    const rand = mulberry32(11);
    for (let i = 0; i < 120; i++) {
      const g = makeGeodesic(rand);
      for (let t = 0; t < 240; t += 2) {
        const nz = breathe(g.n.z, DEFAULT_FIELD.clearK, t, i);
        expect(nz).toBeGreaterThanOrEqual(DEFAULT_FIELD.clearK - 1e-12);
        expect(nz).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });
});

describe('makeGeodesic', () => {
  it('produces unit normals', () => {
    const rand = mulberry32(5);
    for (let i = 0; i < 500; i++) {
      expect(len(makeGeodesic(rand).n)).toBeCloseTo(1, 10);
    }
  });

  it('places every sampled point on the unit sphere and in the circle plane', () => {
    const rand = mulberry32(8);
    const g = makeGeodesic(rand);
    for (let k = 0; k < 200; k++) {
      const p = pointAt(g, (k / 200) * Math.PI * 2);
      expect(len(p)).toBeCloseTo(1, 10);
      expect(dot(p, g.n)).toBeCloseTo(0, 10);
    }
  });

  it('is reproducible from a seed', () => {
    const a = makeGeodesic(mulberry32(7700));
    const b = makeGeodesic(mulberry32(7700));
    expect(a).toEqual(b);
  });

  it('keeps alpha below single-arc legibility', () => {
    const rand = mulberry32(21);
    for (let i = 0; i < 1000; i++) {
      const g = makeGeodesic(rand);
      expect(g.alpha).toBeGreaterThan(0);
      expect(g.alpha).toBeLessThan(0.27);
    }
  });
});

describe('cross', () => {
  it('is perpendicular to both inputs', () => {
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: -4, y: 5, z: 6 };
    const c = cross(a, b);
    expect(dot(c, a)).toBeCloseTo(0, 10);
    expect(dot(c, b)).toBeCloseTo(0, 10);
  });
});

describe('pickHue', () => {
  it('returns the first hue at r = 0 and a valid hue at the top of the range', () => {
    expect(pickHue(0)).toBe(FIELD_HUES[0].color);
    expect(FIELD_HUES.map((h) => h.color)).toContain(pickHue(0.9999999));
  });

  it('rations warm accents to roughly one arc in seven', () => {
    const warm = new Set(['#ff9e3d', '#eab23c', '#ff6f33']);
    const rand = mulberry32(7700);
    let hot = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) if (warm.has(pickHue(rand()))) hot++;
    const share = hot / N;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.19);
  });
});

describe('axial tilt (litGain)', () => {
  it('quotes the globe constant', () => {
    expect(TILT_DEG).toBe(25);
  });

  it('leans the lit axis 25° right of vertical', () => {
    // Screen space with y up: vertical is (0,1); leaning right adds +x.
    expect(LIT_AXIS.x).toBeCloseTo(Math.sin((25 * Math.PI) / 180), 12);
    expect(LIT_AXIS.y).toBeCloseTo(Math.cos((25 * Math.PI) / 180), 12);
    expect(Math.hypot(LIT_AXIS.x, LIT_AXIS.y)).toBeCloseTo(1, 12);
    const deg = (Math.atan2(LIT_AXIS.x, LIT_AXIS.y) * 180) / Math.PI;
    expect(deg).toBeCloseTo(25, 10);
  });

  it('peaks along the lit axis and bottoms out opposite it', () => {
    const peak = litGain(LIT_AXIS.x, LIT_AXIS.y);
    const trough = litGain(-LIT_AXIS.x, -LIT_AXIS.y);
    expect(peak).toBeGreaterThan(trough);
    expect(peak).toBeCloseTo(1.8, 10);
    // The floor genuinely engages: 1 + 0.8*(-1) = 0.2, below LIT_FLOOR.
    expect(trough).toBe(LIT_FLOOR);
  });

  it('never returns a non-positive gain for any direction', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const g = litGain(Math.cos(a), Math.sin(a));
      expect(g).toBeGreaterThanOrEqual(LIT_FLOOR);
      expect(g).toBeLessThanOrEqual(1.8);
    }
  });

  it('is symmetric about the lit axis', () => {
    // Two directions equidistant either side of the axis must light equally.
    const axis = Math.atan2(LIT_AXIS.y, LIT_AXIS.x);
    for (const d of [0.3, 0.9, 1.7]) {
      const a = litGain(Math.cos(axis + d), Math.sin(axis + d));
      const b = litGain(Math.cos(axis - d), Math.sin(axis - d));
      expect(a).toBeCloseTo(b, 12);
    }
  });
});

describe('CLEAR_K', () => {
  it('leaves a centre large enough to hold the lockup', () => {
    expect(CLEAR_K).toBeGreaterThan(0.3);
    expect(CLEAR_K).toBeLessThan(0.6);
  });
});
