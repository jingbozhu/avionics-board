// Orthodromic Reverie — the pure math behind the IAI front door's geodesic field.
// See docs/IAI_PHILOSOPHY.md for the aesthetic contract this implements.
//
// Spiritual sibling of src/globe/*: same orthographic sphere, same inherited
// chroma, same Pi discipline — but it renders TOPOLOGY (great circles) instead of
// terrain. No textures, no sun, no per-pixel loop.
//
// Everything here is pure and deterministic given a seed, so it is unit-testable
// without a DOM. The canvas work lives in field.ts.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A great circle (orthodrome) on the unit sphere, with its render attributes. */
export interface Geodesic {
  n: Vec3; // unit normal — the circle is the set of unit p with p·n = 0
  u: Vec3; // orthonormal basis of the circle's plane
  v: Vec3;
  t0: number; // arc start parameter (radians)
  span: number; // arc angular extent (radians)
  color: string;
  alpha: number;
  width: number;
}

// ---------------------------------------------------------------------------
// Seeded randomness (Art Blocks pattern: same seed ⇒ same stream, forever)
// ---------------------------------------------------------------------------

/**
 * mulberry32 — small, fast, well-distributed 32-bit PRNG. Returns a function
 * yielding floats in [0, 1). The board's squawk code is the canonical seed.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Squawk 7700 — the board's own emergency code, reused as the dream's seed. */
export const FIELD_SEED = 7700;

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

/**
 * For a great circle with unit normal `n` drawn in orthographic projection down
 * the +z view axis, the closest its projected ellipse ever comes to the centre
 * of the disc is exactly |n.z|.
 *
 * Proof: screen distance² of a point p on the circle is 1 − p_z². Minimising it
 * means maximising |p_z| subject to p·n = 0 and |p| = 1; that maximum is the
 * length of ẑ projected into the plane ⊥ n, i.e. √(1 − n_z²). Substituting gives
 * a minimum screen distance of √(1 − (1 − n_z²)) = |n_z|.
 *
 * This identity is the entire reason the composition has a still centre: sample
 * normals only from the cap n_z ≥ k and no arc can ever enter the disc of radius
 * k·R. The centre is not masked or faded — it is geometrically unreachable.
 */
export function minCenterDistance(n: Vec3): number {
  return Math.abs(n.z);
}

/** Radius (in sphere radii) of the disc that stays clear when normals obey n_z ≥ k. */
export const CLEAR_K = 0.44;

/**
 * Axial tilt, quoted from the globe (DESIGN_BRIEF: TILT_DEG=25, pole leans right).
 *
 * The globe applies its tilt as a rotation of the sampling frame about the VIEW
 * axis; you only see the lean because the Earth texture breaks rotational
 * symmetry. This field is rotationally symmetric about its own axis, so the same
 * rotation would be invisible on it. Instead the tilt is expressed as the axis of
 * an azimuthal brightness gradient — arcs whose inner tangent leans toward
 * LIT_AXIS burn brighter — which reads as a lit limb leaning 25° right, the same
 * way the globe's terminator does, without pretending to be a terminator.
 */
export const TILT_DEG = 25;
const TILT_RAD = (TILT_DEG * Math.PI) / 180;

/** Unit screen-space direction (y up) of the lit axis: 25° right of vertical. */
export const LIT_AXIS = { x: Math.sin(TILT_RAD), y: Math.cos(TILT_RAD) };

/**
 * How hard the lit axis modulates arc brightness. Above 1.0 the unlit side would
 * go negative, so LIT_FLOOR does real work here — the lean is strong enough to
 * survive the 4px blur and ~3.4× upscale the canvas is viewed through.
 */
export const LIT_GAIN = 0.8;

/** Floor so the unlit side stays present rather than vanishing. */
export const LIT_FLOOR = 0.34;

/**
 * Brightness multiplier for an arc whose inner-tangent screen direction is
 * (dx, dy), y up. Peaks along LIT_AXIS, never drops below LIT_FLOOR.
 */
export function litGain(dx: number, dy: number): number {
  const c = dx * LIT_AXIS.x + dy * LIT_AXIS.y; // both unit ⇒ cos of the angle between
  return Math.max(LIT_FLOOR, 1 + LIT_GAIN * c);
}

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function normalize(v: Vec3): Vec3 {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

/**
 * An orthonormal basis (u, v) for the plane through the origin with normal `n`.
 * Picks the seed axis least aligned with `n` so the cross product never degenerates.
 */
export function basisFor(n: Vec3): { u: Vec3; v: Vec3 } {
  const seed: Vec3 = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(n, seed));
  const v = cross(n, u); // already unit: |n| = |u| = 1 and n ⊥ u
  return { u, v };
}

/**
 * Rotate `v` about the +z view axis by `ang`. Used for the field's slow turn.
 * Chosen deliberately over a tilted precession axis: rotation about ẑ leaves n.z
 * invariant, so minCenterDistance() — and therefore the still centre — survives
 * every frame exactly, at zero maintenance cost.
 */
export function rotateZ(v: Vec3, ang: number): Vec3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

// ---------------------------------------------------------------------------
// Inherited chroma — every hue below is lifted from the board, none invented.
// Warm accents read as SIGNAL and are rationed to ~1 arc in 7.
// ---------------------------------------------------------------------------

export interface ArcHue {
  color: string;
  weight: number;
}

export const FIELD_HUES: readonly ArcHue[] = [
  { color: 'rgb(40, 94, 182)', weight: 0.46 }, // globe inner-rim ambient, verbatim
  { color: '#8aa0bd', weight: 0.28 }, // --text-secondary
  { color: '#5fd28a', weight: 0.12 }, // STATUS on-track / complete
  { color: '#ff9e3d', weight: 0.09 }, // ACCENTS.amber
  { color: '#eab23c', weight: 0.035 }, // ACCENTS.gold
  { color: '#ff6f33', weight: 0.015 }, // ACCENTS.orange
];

/** Pick a hue by weight from a uniform [0,1) draw. */
export function pickHue(r: number, hues: readonly ArcHue[] = FIELD_HUES): string {
  const total = hues.reduce((s, h) => s + h.weight, 0);
  let acc = 0;
  const target = r * total;
  for (const h of hues) {
    acc += h.weight;
    if (target < acc) return h.color;
  }
  return hues[hues.length - 1].color;
}

// ---------------------------------------------------------------------------
// Geodesic generation
// ---------------------------------------------------------------------------

export interface FieldConfig {
  /** Minimum |n.z|; the clear disc is this fraction of the sphere radius. */
  clearK: number;
  /** Shaping exponent on the n_z draw — concentrates arcs into caustic bands. */
  bandBias: number;
  /** Arc angular extent range, radians. */
  minSpan: number;
  maxSpan: number;
}

export const DEFAULT_FIELD: FieldConfig = {
  clearK: CLEAR_K,
  bandBias: 1.7,
  minSpan: 0.45,
  maxSpan: 1.75,
};

/**
 * Draw one geodesic from the PRNG stream.
 *
 * `nz` is sampled in [clearK, 1] with a power bias so arcs pile into a few
 * concentric caustic bands rather than spreading evenly — that pile-up IS the
 * moiré shell. Azimuth is uniform. The resulting normal is guaranteed to satisfy
 * the clear-centre invariant by construction.
 */
export function makeGeodesic(rand: () => number, cfg: FieldConfig = DEFAULT_FIELD): Geodesic {
  const nz = cfg.clearK + (1 - cfg.clearK) * Math.pow(rand(), cfg.bandBias);
  const az = rand() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - nz * nz));
  const n: Vec3 = { x: r * Math.cos(az), y: r * Math.sin(az), z: nz };
  const { u, v } = basisFor(n);

  return {
    n,
    u,
    v,
    t0: rand() * Math.PI * 2,
    span: cfg.minSpan + rand() * (cfg.maxSpan - cfg.minSpan),
    color: pickHue(rand()),
    // Deliberately below single-arc legibility: the subject is the interference
    // of many, so density is earned by count, never declared by opacity.
    alpha: 0.1 + rand() * 0.16,
    width: rand() < 0.14 ? 1.4 : 0.75,
  };
}

/** A point on the geodesic at parameter `t`, on the unit sphere. */
export function pointAt(g: Geodesic, t: number): Vec3 {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return {
    x: g.u.x * c + g.v.x * s,
    y: g.u.y * c + g.v.y * s,
    z: g.u.z * c + g.v.z * s,
  };
}

/**
 * Per-arc breathing: each geodesic's n_z drifts on its own slow sinusoid, always
 * strictly inside [clearK, 1]. Gives the shell life without ever threatening the
 * invariant. `phase` is absolute time in seconds; `id` decorrelates the arcs.
 */
export function breathe(nz: number, clearK: number, phase: number, id: number): number {
  const span = 1 - clearK;
  const centre = (nz - clearK) / span; // 0..1 position within the permitted band
  const wob = 0.06 * Math.sin(phase * 0.21 + id * 2.399963); // golden-angle decorrelation
  const next = Math.min(1, Math.max(0, centre + wob));
  return clearK + next * span;
}
