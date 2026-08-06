// The minimum-board stage. Renders its children in a box that is normally just
// the area itself at scale 1 — fluid, no transform, byte-identical to no stage at
// all — and only when the area drops below MIN_BOARD_W x MIN_BOARD_H lays the box
// out at that floor and scales it down as one unit, so the board shrinks
// uniformly rather than clipping. Optionally inset by `?overscan=N` percent per
// edge for TVs that crop. See stage.ts for the pure math; this file owns the box
// size and the transform.
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import {
  computeBoard,
  parseOverscan,
  MIN_BOARD_W,
  MIN_BOARD_H,
  MAX_BOARD_W,
  MAX_BOARD_H,
} from './stage';

const MIN = { w: MIN_BOARD_W, h: MIN_BOARD_H };
const MAX = { w: MAX_BOARD_W, h: MAX_BOARD_H };

export function Stage({ children }: { children: ComponentChildren }): JSX.Element {
  const areaRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const area = areaRef.current;
      const box = boxRef.current;
      if (!area || !box) return;
      // Read the area once, then write all three properties together: the box is
      // absolutely positioned so it can never feed back into the area's size.
      const aw = area.clientWidth;
      const ah = area.clientHeight;
      if (!(aw > 0) || !(ah > 0)) return; // keep the static 100%/100% fallback
      const { scale, box: b } = computeBoard({ w: aw, h: ah }, MIN, MAX);
      box.style.width = `${b.w}px`;
      box.style.height = `${b.h}px`;
      // Emit no transform in the fluid case so the board doesn't get a
      // compositing layer (and its text a resampling pass) for a no-op scale.
      box.style.transform = scale === 1 ? 'none' : `scale(${scale})`;
    };

    measure();
    window.addEventListener('resize', measure);

    // Web fonts shift metrics; re-measure once they land (same as useFitToHeight).
    let cancelled = false;
    const fonts = document.fonts;
    if (fonts && typeof fonts.ready?.then === 'function') {
      fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Read once at mount: the kiosk never changes its URL in place.
  const pct = parseOverscan(typeof location !== 'undefined' ? location.search : '');

  return (
    <div
      ref={areaRef}
      style={{ ...area, top: `${pct}vh`, right: `${pct}vw`, bottom: `${pct}vh`, left: `${pct}vw` }}
    >
      <div ref={boxRef} style={box}>
        {children}
      </div>
    </div>
  );
}

// Overscan rides as absolute insets rather than padding: clientWidth INCLUDES
// padding, and we need it to report the usable area directly.
const area: JSX.CSSProperties = {
  position: 'absolute',
  zIndex: 5,
  overflow: 'hidden',
};

// The statics are the fluid, unscaled board: if the layout effect never runs the
// route degrades to a plain full-area column rather than collapsing to nothing.
// Origin is the top-left corner and there is no centering translate — the scaled
// box always fills the area exactly, so centering would be a no-op that also
// risks landing the element on a half-pixel boundary and blurring the text.
// NOTE: do not set `width`/`height`/`transform` anywhere else — Stage owns them.
const box: JSX.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
  transformOrigin: '0 0',
  transform: 'none',
  display: 'flex',
  flexDirection: 'column',
};
