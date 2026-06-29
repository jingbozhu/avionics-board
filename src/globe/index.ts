// CPU globe renderer. Implements the GlobeRenderer seam: owns ONE reused
// ImageData, builds the precompute buffers in init(), paints the sphere each
// frame, and owns the rAF loop (dispose cancels it).
//
// Pi discipline: fixed 760×760 buffer, no devicePixelRatio, one ImageData,
// typed arrays allocated once in precompute.

import type { GlobeAssets, GlobeRenderer } from '../types';
import { precompute, type Precomputed, BUFFER } from './precompute';
import { renderCore, paintAtmosphere } from './render-core';
import { createLoop, rotationTurns, type LoopHandle } from './loop';
import { sunParams } from './sun';

interface DecodedTexture {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

/** Decode an <img> to raw RGBA pixels via an offscreen 2D canvas (no scaling). */
function decode(img: HTMLImageElement): DecodedTexture {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  if (!cx) throw new Error('2D context unavailable for texture decode');
  cx.drawImage(img, 0, 0);
  return { data: cx.getImageData(0, 0, w, h).data, w, h };
}

export class CpuGlobeRenderer implements GlobeRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private pre: Precomputed | null = null;
  private day: Uint8ClampedArray | null = null;
  private night: Uint8ClampedArray | null = null;
  private loop: LoopHandle | null = null;

  init(canvas: HTMLCanvasElement, assets: GlobeAssets): void {
    // Fixed internal buffer; CSS upscales + blurs it elsewhere.
    canvas.width = BUFFER;
    canvas.height = BUFFER;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for globe canvas');
    this.ctx = ctx;

    const day = decode(assets.dayImg);
    const night = decode(assets.nightImg);
    this.day = day.data;
    this.night = night.data;

    this.pre = precompute(BUFFER, BUFFER, day.w, day.h);

    this.img = ctx.createImageData(BUFFER, BUFFER);
    // The atmosphere ring is static — paint it once into the reused ImageData.
    paintAtmosphere(this.pre, this.img.data);

    this.loop = createLoop((n) => this.frame(n));
    this.loop.start();
  }

  frame(nowMs: number): void {
    if (!this.pre || !this.img || !this.ctx || !this.day || !this.night) return;
    const s = rotationTurns(nowMs);
    const sun = sunParams(new Date(nowMs));
    renderCore(this.pre, this.day, this.night, this.img.data, sun, s);
    this.ctx.putImageData(this.img, 0, 0);
  }

  dispose(): void {
    this.loop?.stop();
    this.loop = null;
    this.ctx = null;
    this.img = null;
    this.pre = null;
    this.day = null;
    this.night = null;
  }
}
