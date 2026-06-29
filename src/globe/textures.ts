// Globe texture loading. The two equirectangular textures (day + night/city
// lights) are already 2048×1024 in public/assets — load them as-is, NO
// downscaling. On failure the promise rejects and the caller (GlobeCanvas)
// leaves the canvas blank so the board keeps running.

import type { GlobeAssets } from '../types';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load globe texture: ${url}`));
    img.src = url;
  });
}

/** Load the day + night textures into a GlobeAssets pair. */
export function loadGlobeAssets(dayUrl: string, nightUrl: string): Promise<GlobeAssets> {
  return Promise.all([loadImage(dayUrl), loadImage(nightUrl)]).then(([dayImg, nightImg]) => ({
    dayImg,
    nightImg,
  }));
}
