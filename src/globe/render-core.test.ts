import { describe, it, expect } from 'vitest';
import type { SunParams } from '../types';
import type { Precomputed } from './precompute';
import { wrapU, smoothstep, renderCore, paintAtmosphere } from './render-core';

describe('wrapU (the anti-seam column wrap)', () => {
  it('is the identity on [0,1)', () => {
    expect(wrapU(0)).toBe(0);
    expect(wrapU(0.25)).toBeCloseTo(0.25, 12);
    expect(wrapU(0.999)).toBeCloseTo(0.999, 12);
  });

  it('wraps values ≥ 1 back into [0,1)', () => {
    expect(wrapU(1)).toBeCloseTo(0, 12);
    expect(wrapU(1.5)).toBeCloseTo(0.5, 12);
    expect(wrapU(2.5)).toBeCloseTo(0.5, 12);
  });

  it('keeps NEGATIVE u positive (where a bare u%1 would go negative → black seam)', () => {
    // The bug we are guarding against:
    expect(-0.2 % 1).toBeLessThan(0);
    // The fix:
    expect(wrapU(-0.2)).toBeCloseTo(0.8, 12);
    expect(wrapU(-1.25)).toBeCloseTo(0.75, 12);
    expect(wrapU(-1)).toBeCloseTo(0, 12);
  });
});

describe('smoothstep', () => {
  it('clamps below/above the edges', () => {
    expect(smoothstep(-0.13, 0.13, -1)).toBe(0);
    expect(smoothstep(-0.13, 0.13, 1)).toBe(1);
  });

  it('is 0.5 at the midpoint', () => {
    expect(smoothstep(-0.13, 0.13, 0)).toBeCloseTo(0.5, 12);
  });
});

// --- a hand-built Precomputed with two sphere pixels ----------------------
// pixel 0 → ImageData bytes 0..3, pixel 1 → bytes 4..7
function makePre(): Precomputed {
  return {
    W: 2,
    H: 1,
    texW: 2,
    texH: 1,
    sphere: {
      count: 2,
      out: Int32Array.from([0, 4]),
      sinLat: Float32Array.from([0, 0]),
      clat: Float32Array.from([1, 1]),
      cosLon: Float32Array.from([1, 1]),
      sinLon: Float32Array.from([0, 0]),
      limb: Float32Array.from([1, 1]),
      baseU: Float32Array.from([0.25, 0.95]),
      texRow: Int32Array.from([0, 0]),
      ambR: Float32Array.from([0, 0]),
      ambG: Float32Array.from([0, 0]),
      ambB: Float32Array.from([0, 0]),
    },
    atmo: { count: 0, out: new Int32Array(0), r: new Float32Array(0), g: new Float32Array(0), b: new Float32Array(0) },
  };
}

// 2-column textures: col0, col1 (RGBA each)
const DAY = Uint8ClampedArray.from([10, 20, 30, 255, 110, 120, 130, 255]);
const NIGHT = Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255]);

describe('renderCore — per-pixel lighting + texture scroll', () => {
  it('lights the day side (sub-solar, s=0) — hand-computed', () => {
    const pre = makePre();
    const out = new Uint8ClampedArray(8);
    // sun directly on the equator at lon 0: sd=0, cd=1, sunLon=0
    const sun: SunParams = { sunLon: 0, sd: 0, cd: 1 };
    renderCore(pre, DAY, NIGHT, out, sun, 0);

    // pixel 0: theta=0 → cosTerm=1, diffuse=1, dayAmt=1, dayWeight=1.06, night=0
    // u=wrap(0.25)=0.25 → col=floor(0.5)=0 → day col0 (10,20,30)
    //   10*1.06=10.6→11 ; 20*1.06=21.2→21 ; 30*1.06=31.8→32
    expect(Array.from(out.slice(0, 4))).toEqual([11, 21, 32, 255]);
  });

  it('lights the night side and wraps the texture column past 1.0', () => {
    const pre = makePre();
    const out = new Uint8ClampedArray(8);
    const sun: SunParams = { sunLon: 0, sd: 0, cd: 1 };
    // s=0.6 → phi=1.2π, theta=1.2π → ct=cos(1.2π)≈-0.809017
    renderCore(pre, DAY, NIGHT, out, sun, 0.6);

    // pixel 1: cosTerm=ct≈-0.809 → diffuse≈-0.809 → dayAmt=0 → dayWeight=0
    //   nightWeight = 1*(1-0)*1.18 = 1.18
    // u = wrap(0.95+0.6)=wrap(1.55)=0.55 → col=floor(1.1)=1 → night col1 (4,5,6)
    //   4*1.18=4.72→5 ; 5*1.18=5.9→6 ; 6*1.18=7.08→7
    expect(Array.from(out.slice(4, 8))).toEqual([5, 6, 7, 255]);
  });

  it('adds the precomputed blue ambient on top of the surface', () => {
    const pre = makePre();
    pre.sphere.ambR[0] = 40;
    pre.sphere.ambG[0] = 94;
    pre.sphere.ambB[0] = 182;
    const out = new Uint8ClampedArray(8);
    const sun: SunParams = { sunLon: 0, sd: 0, cd: 1 };
    renderCore(pre, DAY, NIGHT, out, sun, 0);
    // surface (11,21,32) + ambient (40,94,182), clamped
    expect(Array.from(out.slice(0, 4))).toEqual([51, 115, 214, 255]);
  });
});

describe('paintAtmosphere', () => {
  it('writes the static ring color with full alpha', () => {
    const pre: Precomputed = {
      W: 1,
      H: 1,
      texW: 1,
      texH: 1,
      sphere: {
        count: 0,
        out: new Int32Array(0),
        sinLat: new Float32Array(0),
        clat: new Float32Array(0),
        cosLon: new Float32Array(0),
        sinLon: new Float32Array(0),
        limb: new Float32Array(0),
        baseU: new Float32Array(0),
        texRow: new Int32Array(0),
        ambR: new Float32Array(0),
        ambG: new Float32Array(0),
        ambB: new Float32Array(0),
      },
      atmo: {
        count: 1,
        out: Int32Array.from([0]),
        r: Float32Array.from([20]),
        g: Float32Array.from([47]),
        b: Float32Array.from([91]),
      },
    };
    const out = new Uint8ClampedArray(4);
    paintAtmosphere(pre, out);
    expect(Array.from(out)).toEqual([20, 47, 91, 255]);
  });
});
