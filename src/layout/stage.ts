// Minimum-board stage: the display route is laid out fluidly at scale 1 whenever
// the viewport is big enough for it, and is uniformly scaled DOWN only as far as
// the content actually requires. The wall TVs (Hisense Fire TV / Silk) report a
// CSS viewport well under 1920 — the header alone needs ~1218px and cannot shrink,
// so without this the LOCAL clock was clipped off the right edge.
//
// An earlier version fitted a FIXED 1920x1080 box, which solved the clipping by
// scaling to 0.5 on those TVs and made every glyph unreadable. 1920 is a ceiling,
// not the design width. See docs/DESIGN_BRIEF.md "Minimum-board stage".
import type { Size } from './fit';

/**
 * Smallest board the layout is allowed to be laid out at. Below this the board
 * scales down as one unit instead of reflowing or clipping.
 *
 * 1280 comes from the header's real intrinsic width: 1137.5px of content
 * (nowrap title + the three stat blocks, measured from the @fontsource hmtx
 * tables) plus 40px of `bar` padding per side = ~1218px, leaving ~62px slack.
 * RE-DERIVE IT if the header title string, its font size, or `bar`'s padding
 * changes — it is the one number standing between the board and a clipped clock.
 */
export const MIN_BOARD_W = 1280;
export const MIN_BOARD_H = 720;

/**
 * Board size past which a bigger panel scales the board UP rather than laying it
 * out ever-wider at scale 1, so a 4K wall shows a full-bleed board instead of
 * hairline text. Growth requires BOTH axes to exceed this (see `computeBoard`).
 */
export const MAX_BOARD_W = 2560;
export const MAX_BOARD_H = 1440;

/**
 * Overscan inset per edge, in percent, when `?overscan=` is not given.
 * Zero — the wall's Hisense Fire TVs were measured on 2026-08-06 with the
 * /waketest.html ruler and show the 0% frame complete, i.e. they do not crop.
 * Raise it per-TV with `?overscan=N` if a set is ever swapped for one that does.
 */
export const DEFAULT_OVERSCAN = 0;

/** Widest overscan we'll honor — past this the board would be pointlessly small. */
const MAX_OVERSCAN = 10;

/** How the board is rendered into an area: a design-pixel box plus a scale. */
export interface Board {
  /** Uniform scale applied to the box. Exactly 1 means "fluid, no transform". */
  scale: number;
  /** Box size in design px. INVARIANT: box.w * scale === area.w (same for h). */
  box: Size;
}

/**
 * Board box + scale that fills `area` without ever laying the content out below
 * `min` or clipping it:
 *
 *   s   = min( max(1, min(area.w/max.w, area.h/max.h)),
 *              min(area.w/min.w, area.h/min.h) )
 *   box = area / s
 *
 * Deriving the box from the scale (rather than picking a fixed box and fitting
 * it) is what makes `box * scale === area` hold in every case, so the board
 * always fills the screen. A fixed-box fit pillarboxes on a non-16:9 area — at
 * 1600x600 it would render 1067x600 and waste 533px; this returns s=0.833 with a
 * 1920x720 box and fills it.
 *
 * The outer `min` makes the floor always win over the ceiling: never clip, ever.
 * The inner `min` on the growth term means a panel must be bigger than `max` on
 * BOTH axes to scale up, so an ultrawide 5000x1000 is not mistaken for "huge".
 * A not-yet-measured area (zero/negative) yields scale 1 so the first paint is
 * never collapsed to nothing.
 */
export function computeBoard(area: Size, min: Size, max: Size): Board {
  if (!(area.w > 0) || !(area.h > 0)) return { scale: 1, box: { w: min.w, h: min.h } };
  if (!(min.w > 0) || !(min.h > 0)) return { scale: 1, box: { w: area.w, h: area.h } };

  // Hard bound: above this the box would be laid out narrower/shorter than `min`.
  const upper = Math.min(area.w / min.w, area.h / min.h);
  // Soft bound: only ever raises the scale, and only past `max` on both axes.
  const grow = max.w > 0 && max.h > 0 ? Math.min(area.w / max.w, area.h / max.h) : 0;

  const s = Math.min(Math.max(1, grow), upper);

  // Snap the fluid case so `box` is EXACTLY the area — no floating-point dust,
  // and no transform at all on the common 1920x1080 panel.
  if (Math.abs(s - 1) < 1e-9) return { scale: 1, box: { w: area.w, h: area.h } };

  return { scale: s, box: { w: area.w / s, h: area.h / s } };
}

/**
 * Overscan inset per edge, in percent, from a `location.search` string.
 * `?overscan=0` sits flush to the panel; `?overscan=5` pulls in 5% on every side
 * for a TV that crops and can't be talked out of it. Anything missing or
 * unparseable falls back to DEFAULT_OVERSCAN; the value is clamped to 0..10.
 */
export function parseOverscan(search: string): number {
  const raw = new URLSearchParams(search.replace(/^\?/, '').split('#')[0]).get('overscan');
  if (raw === null || raw.trim() === '') return DEFAULT_OVERSCAN;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_OVERSCAN;
  return n < 0 ? 0 : n > MAX_OVERSCAN ? MAX_OVERSCAN : n;
}
