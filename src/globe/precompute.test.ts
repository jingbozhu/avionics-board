// Golden tests for precompute(): the TILT_DEG sampling-frame rotation and the
// atmosphere alpha fade. These pin the tilt DIRECTION (pole leans RIGHT on
// screen) and magnitude — a sign flip in sinT or a tx/ty swap fails here while
// passing every render-core test (those use hand-built fixtures that bypass
// precompute()).
import { describe, it, expect } from 'vitest';
import { precompute, BUFFER, RADIUS, TILT_DEG, ATMO_MAX } from './precompute';

const pre = precompute(BUFFER, BUFFER, 2048, 1024);
const tau = (TILT_DEG * Math.PI) / 180;

/** Sphere-array index for buffer pixel (x, y), or -1 if (x, y) is off-sphere. */
function sphereIndexAt(x: number, y: number): number {
  const target = (y * pre.W + x) * 4;
  for (let j = 0; j < pre.sphere.count; j++) if (pre.sphere.out[j] === target) return j;
  return -1;
}

/** Atmo-array index for buffer pixel (x, y), or -1 if (x, y) is off-ring. */
function atmoIndexAt(x: number, y: number): number {
  const target = (y * pre.W + x) * 4;
  for (let j = 0; j < pre.atmo.count; j++) if (pre.atmo.out[j] === target) return j;
  return -1;
}

describe('precompute — TILT_DEG axial tilt (sampling-frame rotation)', () => {
  it('pixel straight above center: sinLat is cos-shrunk by the tilt', () => {
    // (380, 190): sx=0, sy=-190/304=-0.625 → ty=-0.625·cosτ → wy=0.625·cosτ
    const j = sphereIndexAt(380, 190);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(pre.sphere.sinLat[j]).toBeCloseTo(0.625 * Math.cos(tau), 4);
  });

  it('pixel RIGHT of center is northern hemisphere → the pole leans right', () => {
    // (532, 380): sx=0.5, sy=0 → ty=-0.5·sinτ → wy=+0.5·sinτ (> 0 = north).
    // A sign flip (pole leaning left) makes this negative and fails.
    const j = sphereIndexAt(532, 380);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(pre.sphere.sinLat[j]).toBeCloseTo(0.5 * Math.sin(tau), 4);
    expect(pre.sphere.sinLat[j]).toBeGreaterThan(0);
  });

  it('pixel LEFT of center is southern hemisphere (mirror)', () => {
    const j = sphereIndexAt(228, 380);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(pre.sphere.sinLat[j]).toBeCloseTo(-0.5 * Math.sin(tau), 4);
  });

  it('disk center still shows lat 0, lon EARTH_LON_VIEW (tilt fixes the center)', () => {
    const j = sphereIndexAt(380, 380);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(pre.sphere.sinLat[j]).toBeCloseTo(0, 5);
    // lon = -100° → baseU = -100/360 + 0.5
    expect(pre.sphere.baseU[j]).toBeCloseTo(-100 / 360 + 0.5, 4);
  });
});

describe('precompute — atmosphere alpha fade', () => {
  it('alpha is 255·t² across the ring (checked at d≈1.118)', () => {
    // (380, 40): sy=-340/304 → d=340/304; t=(1.24-d)/0.24
    const aj = atmoIndexAt(380, 40);
    expect(aj).toBeGreaterThanOrEqual(0);
    const d = 340 / RADIUS;
    const t = (ATMO_MAX - d) / (ATMO_MAX - 1);
    expect(pre.atmo.a[aj]).toBeCloseTo(255 * t * t, 2);
  });

  it('alpha reaches ~255 at the rim and ~0 at the outer edge (no black band)', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let j = 0; j < pre.atmo.count; j++) {
      if (pre.atmo.a[j] < min) min = pre.atmo.a[j];
      if (pre.atmo.a[j] > max) max = pre.atmo.a[j];
    }
    expect(max).toBeGreaterThan(254); // innermost ring pixel ≈ opaque
    expect(min).toBeLessThan(1); // outermost ring pixel ≈ transparent
  });
});
