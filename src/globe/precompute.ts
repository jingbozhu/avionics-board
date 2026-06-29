// CPU globe precompute — build the per-pixel typed-array buffers for the fixed
// 760×760 canvas buffer. Pure: given the canvas size and the decoded texture
// dimensions, it produces every constant that does NOT change between frames
// (sphere geometry, longitude basis, texture rows, limb darkening, the blue
// atmosphere/ambient glow). render-core.ts then only does the cheap per-frame
// lighting + texture scroll on top of these.
//
// Magic constants (preserve verbatim):
//   sphere radius        = 0.40 * 760
//   atmosphere ring max  = d ≤ 1.24
//   EARTH_LON_VIEW       = -100 (degrees, frames the Americas)
//   limb                 = 0.54 + 0.46 * nz
//   ambient / glow base  = (40, 94, 182) * t²

export const BUFFER = 760;
export const RADIUS = 0.40 * 760; // 304
export const ATMO_MAX = 1.24;
export const EARTH_LON_VIEW = -100; // degrees

/** Per-frame-invariant buffers for the spinning Earth. */
export interface Precomputed {
  W: number;
  H: number;
  texW: number;
  texH: number;
  sphere: {
    count: number;
    /** RGBA byte offset into the ImageData for this sphere pixel (= pixelIndex*4). */
    out: Int32Array;
    sinLat: Float32Array;
    clat: Float32Array;
    cosLon: Float32Array;
    sinLon: Float32Array;
    limb: Float32Array;
    baseU: Float32Array;
    /** Texture row start as a pixel index (= row * texW). */
    texRow: Int32Array;
    ambR: Float32Array;
    ambG: Float32Array;
    ambB: Float32Array;
  };
  atmo: {
    count: number;
    out: Int32Array;
    r: Float32Array;
    g: Float32Array;
    b: Float32Array;
  };
}

/**
 * Build the precomputed buffers for a `W`×`H` buffer against a `texW`×`texH`
 * equirectangular texture. Pure / deterministic — no DOM, no globals.
 */
export function precompute(W: number, H: number, texW: number, texH: number): Precomputed {
  const cx = W / 2;
  const cy = H / 2;
  const R = 0.40 * W; // 0.40 * 760 = 304
  const lonView = (EARTH_LON_VIEW * Math.PI) / 180;
  const TWO_PI = Math.PI * 2;
  const ATMO2 = ATMO_MAX * ATMO_MAX;

  // Pass 1: count sphere (d ≤ 1) and atmosphere-ring (1 < d ≤ 1.24) pixels so we
  // can allocate exactly once.
  let sCount = 0;
  let aCount = 0;
  for (let y = 0; y < H; y++) {
    const sy = (y - cy) / R;
    for (let x = 0; x < W; x++) {
      const sx = (x - cx) / R;
      const d2 = sx * sx + sy * sy;
      if (d2 <= 1) sCount++;
      else if (d2 <= ATMO2) aCount++;
    }
  }

  const sphere = {
    count: sCount,
    out: new Int32Array(sCount),
    sinLat: new Float32Array(sCount),
    clat: new Float32Array(sCount),
    cosLon: new Float32Array(sCount),
    sinLon: new Float32Array(sCount),
    limb: new Float32Array(sCount),
    baseU: new Float32Array(sCount),
    texRow: new Int32Array(sCount),
    ambR: new Float32Array(sCount),
    ambG: new Float32Array(sCount),
    ambB: new Float32Array(sCount),
  };
  const atmo = {
    count: aCount,
    out: new Int32Array(aCount),
    r: new Float32Array(aCount),
    g: new Float32Array(aCount),
    b: new Float32Array(aCount),
  };

  // Pass 2: fill.
  let si = 0;
  let ai = 0;
  for (let y = 0; y < H; y++) {
    const sy = (y - cy) / R;
    for (let x = 0; x < W; x++) {
      const sx = (x - cx) / R;
      const d2 = sx * sx + sy * sy;
      const i = y * W + x;
      if (d2 <= 1) {
        const nz = Math.sqrt(1 - d2); // toward the viewer
        const wy = -sy; // screen y is down → flip so +y is north; wy = sin(lat)
        const clat = Math.sqrt(1 - wy * wy); // cos(lat) = sqrt(nx²+nz²)
        const lon = lonView + Math.atan2(sx, nz);
        sphere.out[si] = i * 4;
        sphere.sinLat[si] = wy;
        sphere.clat[si] = clat;
        sphere.cosLon[si] = Math.cos(lon);
        sphere.sinLon[si] = Math.sin(lon);
        sphere.limb[si] = 0.54 + 0.46 * nz;
        sphere.baseU[si] = lon / TWO_PI + 0.5;
        const lat = Math.asin(wy < -1 ? -1 : wy > 1 ? 1 : wy);
        let row = Math.floor((0.5 - lat / Math.PI) * texH);
        if (row < 0) row = 0;
        else if (row >= texH) row = texH - 1;
        sphere.texRow[si] = row * texW;
        // inner-rim blue ambient: t = d  →  t² = d2
        sphere.ambR[si] = 40 * d2;
        sphere.ambG[si] = 94 * d2;
        sphere.ambB[si] = 182 * d2;
        si++;
      } else if (d2 <= ATMO2) {
        const d = Math.sqrt(d2);
        let t = (ATMO_MAX - d) / (ATMO_MAX - 1); // 1 at the rim → 0 at d=1.24
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const t2 = t * t;
        atmo.out[ai] = i * 4;
        atmo.r[ai] = 40 * t2;
        atmo.g[ai] = 94 * t2;
        atmo.b[ai] = 182 * t2;
        ai++;
      }
    }
  }

  return { W, H, texW, texH, sphere, atmo };
}
