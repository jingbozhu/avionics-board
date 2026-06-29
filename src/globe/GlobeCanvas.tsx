// The spinning Earth, behind everything (z-index 0). A fixed 760×760 CPU buffer
// is painted by CpuGlobeRenderer and upscaled ~3.4× + blurred via CSS, so only
// ~1/8 of the sphere shows in the bottom-right corner as a hazy distant globe.
//
// Texture load failure is swallowed: the canvas simply stays blank and the rest
// of the board keeps running.

import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { loadGlobeAssets } from './textures';
import { CpuGlobeRenderer } from './index';

const STYLE: JSX.CSSProperties = {
  position: 'absolute',
  right: '-94vh',
  bottom: '-146vh',
  width: '240vh',
  height: '240vh',
  opacity: 0.97,
  zIndex: 0,
  filter: 'blur(4px)',
};

export function GlobeCanvas(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = new CpuGlobeRenderer();
    let disposed = false;
    const base = import.meta.env.BASE_URL;

    loadGlobeAssets(`${base}assets/textures/earth-day-2k.jpg`, `${base}assets/textures/earth-night-2k.jpg`)
      .then((assets) => {
        if (disposed) return;
        renderer.init(canvas, assets);
      })
      .catch(() => {
        // Leave the canvas blank — the board keeps running without the globe.
      });

    return () => {
      disposed = true;
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} width={760} height={760} style={STYLE} />;
}
