// Fit-to-height: the board never scrolls. After each render/resize we measure the
// card grid's natural size and shrink it with `transform: scale(s)` so all six
// cards fit the available area on any screen from ~1280x720 up.
// See docs/DESIGN_BRIEF.md "Fit-to-height".
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

export interface Size {
  w: number;
  h: number;
}

/**
 * Scale factor that makes `grid` fit inside `area`, never enlarging past 1:
 *   s = min(1, area.h / grid.h, area.w / grid.w)
 * A not-yet-measured grid (zero/negative size) yields 1 (no scaling).
 */
export function computeScale(area: Size, grid: Size): number {
  if (!(grid.w > 0) || !(grid.h > 0)) return 1;
  return Math.min(1, area.h / grid.h, area.w / grid.w);
}

export interface FitToHeight {
  /** Attach to the available-space wrapper (the measured "area"). */
  areaRef: RefObject<HTMLDivElement>;
  /** Attach to the card grid. The hook OWNS this element's `transform`. */
  gridRef: RefObject<HTMLDivElement>;
  /** Current scale (also reflected onto the grid's transform). */
  scale: number;
}

/**
 * Measure + scale the grid to fit its area. Recomputes on mount, on window
 * resize, when the airframe `count` changes, and once `document.fonts.ready`
 * resolves (web fonts shift metrics). The transform is RESET before measuring so
 * we read the grid's natural (unscaled) size each time.
 *
 * The hook drives `gridRef.current.style.transform` directly — consumers should
 * NOT also set a transform on that element.
 */
export function useFitToHeight(count: number): FitToHeight {
  const areaRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const measure = () => {
      const area = areaRef.current;
      const grid = gridRef.current;
      if (!area || !grid) return;
      // Reset before measuring so offset* reports the natural, unscaled size.
      grid.style.transform = 'none';
      const s = computeScale(
        { w: area.clientWidth, h: area.clientHeight },
        { w: grid.offsetWidth, h: grid.offsetHeight },
      );
      grid.style.transform = `scale(${s})`;
      setScale(s);
    };

    measure();
    window.addEventListener('resize', measure);

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
  }, [count]);

  return { areaRef, gridRef, scale };
}
