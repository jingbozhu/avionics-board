// CPU globe per-pixel render core. Pure: writes RGBA bytes into a reused
// Uint8ClampedArray (the ImageData.data) from the precomputed buffers + the
// decoded day/night textures + the current sun + rotation `s`.
//
// The angle-addition trick keeps this trig-free per pixel: cos/sin(θ) are
// computed ONCE per frame (θ = phi − sunLon), and the per-pixel longitude term
// is recovered from the precomputed cos/sin(lonBase):
//   cosTerm = cosLon·cos(θ) − sinLon·sin(θ) = cos(currentLon − sunLon)
//
// Locked formulas (do NOT alter):
//   cosTerm   = cosLon*cos(θ) − sinLon*sin(θ)
//   diffuse   = sinLat*sd + clat*cd*cosTerm
//   dayAmt    = smoothstep(-0.13, 0.13, diffuse)
//   dayWeight = (0.42 + 0.64*max(0,diffuse)) * limb * dayAmt
//   nightWgt  = limb * (1 - dayAmt) * 1.18
//   limb      = 0.54 + 0.46*nz                    (baked in precompute)
//   ambient   = (40,94,182) * d²                  (baked in precompute)
//   atmo glow = chroma (40,94,182), alpha 255·t²  (baked in precompute) —
//               alpha-faded so the ring merges into the page background
//   color     = day*dayWeight + night*nightWgt + ambient  (clamp 255)

import type { SunParams } from '../types';
import type { Precomputed } from './precompute';

/**
 * Texture column wrap. MUST be `((u % 1) + 1) % 1` — a bare `u % 1` returns a
 * NEGATIVE value for negative `u`, which indexes before the row start and paints
 * a black seam down the globe.
 */
export function wrapU(u: number): number {
  return ((u % 1) + 1) % 1;
}

/** GLSL-style smoothstep. */
export function smoothstep(e0: number, e1: number, x: number): number {
  let t = (x - e0) / (e1 - e0);
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return t * t * (3 - 2 * t);
}

/**
 * Paint the static blue atmosphere ring. These pixels never change between
 * frames, so this is called once at init against the reused ImageData and then
 * left untouched (putImageData re-emits them every frame for free).
 *
 * The glow is constant chroma (40, 94, 182) with alpha fading 255→0 across the
 * ring, so it composites over — and merges into — any page background instead
 * of baking an "over black" assumption into opaque pixels.
 */
export function paintAtmosphere(pre: Precomputed, out: Uint8ClampedArray): void {
  const a = pre.atmo;
  for (let j = 0; j < a.count; j++) {
    const o = a.out[j];
    out[o] = 40;
    out[o + 1] = 94;
    out[o + 2] = 182;
    out[o + 3] = a.a[j];
  }
}

/**
 * Render one frame of the sphere into `out` (RGBA, the reused ImageData.data).
 * `s` is the absolute rotation in turns (`(now/1000)/earthPeriod`); the texture
 * scrolls by `s` and the terminator is positioned by `sun`.
 */
export function renderCore(
  pre: Precomputed,
  day: Uint8ClampedArray,
  night: Uint8ClampedArray,
  out: Uint8ClampedArray,
  sun: SunParams,
  s: number,
): void {
  const sp = pre.sphere;
  const texW = pre.texW;
  const phi = s * Math.PI * 2;
  const theta = phi - sun.sunLon;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const sd = sun.sd;
  const cd = sun.cd;

  for (let j = 0; j < sp.count; j++) {
    const cosTerm = sp.cosLon[j] * ct - sp.sinLon[j] * st;
    const diffuse = sp.sinLat[j] * sd + sp.clat[j] * cd * cosTerm;
    const dayAmt = smoothstep(-0.13, 0.13, diffuse);
    const limb = sp.limb[j];
    const dayWeight = (0.42 + 0.64 * Math.max(0, diffuse)) * limb * dayAmt;
    const nightWeight = limb * (1 - dayAmt) * 1.18;

    const u = wrapU(sp.baseU[j] + s);
    let col = (u * texW) | 0;
    if (col >= texW) col = texW - 1;
    const t4 = (sp.texRow[j] + col) * 4;

    const o = sp.out[j];
    // Uint8ClampedArray rounds + clamps to [0,255] on assignment.
    out[o] = day[t4] * dayWeight + night[t4] * nightWeight + sp.ambR[j];
    out[o + 1] = day[t4 + 1] * dayWeight + night[t4 + 1] * nightWeight + sp.ambG[j];
    out[o + 2] = day[t4 + 2] * dayWeight + night[t4 + 2] * nightWeight + sp.ambB[j];
    out[o + 3] = 255;
  }
}
