// Orthodromic Reverie — the canvas renderer for the IAI front door.
//
// Pi discipline, inherited from src/globe/*:
//  - CPU Canvas 2D only, no WebGL.
//  - No devicePixelRatio scaling; the buffer is capped logical pixels.
//  - Reuses the globe's throttled, visibility-aware rAF driver (createLoop).
//  - O(ARCS_PER_FRAME) work per frame — the shell is an ACCUMULATION, never a
//    redraw. Hundreds of arcs are on screen; only a handful are drawn per frame.
//
// The decay erases ALPHA (destination-out) rather than painting black over the
// buffer, so the field thins toward transparency and the page gradient shows
// through — the same "fade to transparent, not to opaque black" rule the globe's
// atmosphere ring obeys.

import { createLoop, type LoopHandle } from '../globe/loop';
import {
  DEFAULT_FIELD,
  FIELD_SEED,
  breathe,
  basisFor,
  litGain,
  makeGeodesic,
  mulberry32,
  pointAt,
  rotateZ,
  type Geodesic,
} from './geodesic';

/** Seconds per full turn of the field. The globe's earthPeriod is 300; the dream turns slower. */
export const FIELD_PERIOD = 900;

/**
 * Geodesics committed to the buffer each frame. With DECAY_ALPHA below this
 * leaves roughly 1600 arcs alive on screen at any moment — the shell's density
 * is earned by COUNT, never by raising per-arc opacity (see the philosophy).
 */
export const ARCS_PER_FRAME = 9;

/** Per-frame alpha decay. ~0.022 at 20fps ⇒ an arc is spent after roughly nine seconds. */
export const DECAY_ALPHA = 0.022;

/** Points sampled along each arc. */
const ARC_SAMPLES = 21;

/** Alpha multiplier for the far hemisphere — this is what makes the shell read as a shell. */
const BACK_ALPHA = 0.32;

/**
 * Fixed square buffer, quoted from the globe (DESIGN_BRIEF: 760×760, sphere
 * radius 0.40·buffer). The canvas is upscaled ~3.4× and blurred by CSS into the
 * bottom-right corner exactly as the Earth is, so the field reads as the same
 * distant body seen from the same seat. No devicePixelRatio scaling.
 */
export const BUFFER = 760;
const RADIUS_FRAC = 0.4;

/** Pointer easing. Slow enough that influence is felt but cause is never caught in the act. */
const POINTER_EASE = 0.022;
const PARALLAX_PX = 14;
const BIAS_STRENGTH = 0.45;

/** Cosine taper across the arc so both ends dissolve rather than stopping. */
function taper(i: number, n: number): number {
  const t = n <= 1 ? 0.5 : i / (n - 1);
  return 0.18 + 0.82 * Math.sin(Math.PI * t);
}

export class GeodesicFieldRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private loop: LoopHandle | null = null;
  private rand: () => number = mulberry32(FIELD_SEED);
  private spawned = 0;

  // Pointer: raw target in [-1, 1] normalised viewport coords, plus its eased follower.
  private targetX = 0;
  private targetY = 0;
  private easedX = 0;
  private easedY = 0;

  private staticOnly = false;

  init(canvas: HTMLCanvasElement, opts: { staticOnly?: boolean } = {}): void {
    this.staticOnly = opts.staticOnly ?? false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // No 2D context — leave the canvas blank; the page still works.
    this.ctx = ctx;
    // Fixed buffer, like the globe — never resized, so the accumulation shell is
    // never cleared by a window resize.
    canvas.width = BUFFER;
    canvas.height = BUFFER;

    if (this.staticOnly) {
      // prefers-reduced-motion: paint one dense, settled shell and stop.
      // Same additive blend as the animated path, so the chroma reads identically.
      this.rand = mulberry32(FIELD_SEED);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 1600; i++) this.drawGeodesic(makeGeodesic(this.rand, DEFAULT_FIELD), 0, i);
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    this.loop = createLoop((n) => this.frame(n));
    this.loop.start();
  }

  /** Pointer position in CSS pixels. Biases the field; never followed. */
  setPointer(x: number, y: number): void {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.targetX = (x / w) * 2 - 1;
    this.targetY = (y / h) * 2 - 1;
  }

  clearPointer(): void {
    this.targetX = 0;
    this.targetY = 0;
  }

  frame(nowMs: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.easedX += (this.targetX - this.easedX) * POINTER_EASE;
    this.easedY += (this.targetY - this.easedY) * POINTER_EASE;

    // Phosphor falloff: multiply existing alpha by (1 − DECAY_ALPHA).
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${DECAY_ALPHA})`;
    ctx.fillRect(0, 0, BUFFER, BUFFER);
    ctx.globalCompositeOperation = 'lighter';

    const seconds = nowMs / 1000;
    const spin = (seconds / FIELD_PERIOD) * Math.PI * 2;

    for (let i = 0; i < ARCS_PER_FRAME; i++) {
      this.drawGeodesic(makeGeodesic(this.rand, DEFAULT_FIELD), spin, this.spawned++, seconds);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  /** Project and stroke one geodesic into the accumulation buffer. */
  private drawGeodesic(g: Geodesic, spin: number, id: number, seconds = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Breathe n_z inside its permitted band, then rebuild the basis. Rotation is
    // about the view axis only, so n.z — and the clear centre — is invariant.
    const nz = breathe(g.n.z, DEFAULT_FIELD.clearK, seconds, id);
    const scale = Math.sqrt(Math.max(0, 1 - nz * nz)) / Math.max(1e-6, Math.hypot(g.n.x, g.n.y));
    const spun = rotateZ({ x: g.n.x * scale, y: g.n.y * scale, z: nz }, spin);
    const { u, v } = basisFor(spun);
    const arc: Geodesic = { ...g, n: spun, u, v };

    const R = BUFFER * RADIUS_FRAC;
    const cx = BUFFER / 2 + this.easedX * PARALLAX_PX;
    const cy = BUFFER / 2 + this.easedY * PARALLAX_PX;

    // The arc's inner tangent lies opposite the normal's azimuth (screen y up).
    const az = Math.hypot(spun.x, spun.y) || 1;
    const dirX = -spun.x / az;
    const dirY = -spun.y / az;

    // Axial tilt: arcs leaning toward the lit axis (25° right of vertical) burn
    // brighter, so the shell reads as a lit limb leaning the way the Earth does.
    const lit = litGain(dirX, dirY);

    // Field-strength bias — the pointer's only channel of influence.
    const pMag = Math.hypot(this.easedX, this.easedY);
    const bias =
      pMag < 1e-4
        ? 1
        : 1 + BIAS_STRENGTH * ((dirX * this.easedX + dirY * -this.easedY) / pMag) * Math.min(1, pMag);

    ctx.strokeStyle = arc.color;
    ctx.lineWidth = arc.width;
    ctx.lineCap = 'round';

    let px = 0;
    let py = 0;
    let pFront = false;
    for (let i = 0; i < ARC_SAMPLES; i++) {
      const t = arc.t0 + (i / (ARC_SAMPLES - 1)) * arc.span;
      const p = pointAt(arc, t);
      const x = cx + R * p.x;
      const y = cy - R * p.y; // canvas y grows downward; sphere y grows up
      const front = p.z > 0;

      if (i > 0) {
        const a =
          arc.alpha * taper(i, ARC_SAMPLES) * lit * bias * (front && pFront ? 1 : BACK_ALPHA);
        if (a > 0.004) {
          ctx.globalAlpha = Math.min(1, a);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
      px = x;
      py = y;
      pFront = front;
    }
    ctx.globalAlpha = 1;
  }

  /** Arcs committed since start — surfaced as an instrument readout. */
  get arcsResolved(): number {
    return this.spawned;
  }

  dispose(): void {
    this.loop?.stop();
    this.loop = null;
    this.ctx = null;
  }
}
