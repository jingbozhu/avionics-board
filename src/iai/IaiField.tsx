// The geodesic field, behind the IAI page (z-index 0). Sibling of GlobeCanvas in
// every respect: same fixed 760×760 buffer, same mount/init/dispose shape, same
// "failure is silent" rule — and the SAME placement CSS, so the field sits in the
// bottom-right corner exactly where the Earth sits on the board.

import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { BUFFER, GeodesicFieldRenderer } from './field';

// Verbatim from GlobeCanvas (DESIGN_BRIEF §"spinning Earth") — only ~1/8 of the
// sphere is on screen; blur + ~3.4× upscale give the hazy distant look.
const STYLE: JSX.CSSProperties = {
  position: 'absolute',
  right: '-94vh',
  bottom: '-146vh',
  width: '240vh',
  height: '240vh',
  opacity: 0.97,
  zIndex: 0,
  filter: 'blur(4px)',
  pointerEvents: 'none',
};

export function IaiField(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new GeodesicFieldRenderer();
    renderer.init(canvas, { staticOnly: reduced });

    // The buffer is fixed, so there is nothing to do on resize — the CSS vh units
    // rescale the painted sphere and the accumulation shell survives untouched.
    const onMove = (e: PointerEvent): void => renderer.setPointer(e.clientX, e.clientY);
    const onLeave = (): void => renderer.clearPointer();

    if (!reduced) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerleave', onLeave);
    }

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} width={BUFFER} height={BUFFER} style={STYLE} aria-hidden="true" />;
}
