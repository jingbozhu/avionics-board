// Shared contracts — locked in Phase A so logic/globe/view threads build against stable seams.

export type SystemKey = 'cockpit' | 'comms' | 'mission' | 'nav' | 'autopilot' | 'radar';
export type StatusFlag = 'on-track' | 'at-risk' | 'complete';
export type AccentKey = 'amber' | 'orange' | 'gold';

export interface Airframe {
  id: string;
  name: string;
  category: string;
  system: SystemKey;
  pct: number; // 0..100
  eta: string;
  flag: StatusFlag;
}

/**
 * External fleet store, behind one interface.
 * - LAN mode (default for this deployment): state lives on the Pi; reads come from the server,
 *   live updates arrive via SSE, mutations POST to the server.
 * - localStorage mode: single-machine fallback (storage-event sync across tabs).
 * getSnapshot() MUST return a STABLE reference between changes (cache it) or Preact's
 * useSyncExternalStore loops with "getSnapshot should be cached".
 */
export interface FleetStore {
  getSnapshot(): readonly Airframe[];
  subscribe(listener: () => void): () => void;
  add(): void;
  update(id: string, field: keyof Airframe, value: string | number): void;
  remove(id: string): void;
}

/** Globe renderer seam. CPU now; a WebGL/OffscreenCanvas impl can drop in behind this later. */
export interface GlobeAssets {
  dayImg: HTMLImageElement;
  nightImg: HTMLImageElement;
}
export interface GlobeRenderer {
  /** Build the per-pixel typed-array buffers for `canvas` (fixed 760×760 buffer) from decoded textures. */
  init(canvas: HTMLCanvasElement, assets: GlobeAssets): void;
  /** Paint one frame for the given high-res timestamp. Idempotent per timestamp (no delta accumulation). */
  frame(nowMs: number): void;
  dispose(): void;
}

/** Subsolar point used by the globe lighting. */
export interface SunParams {
  sunLon: number; // radians
  sd: number; // sin(declination)
  cd: number; // cos(declination)
}

export interface StatusView {
  label: string;
  color: string;
}

/** Per-card view-model derived from an Airframe (pure; see model/derive.ts). */
export interface CardVM {
  id: string;
  name: string;
  category: string;
  pct: number;
  pctLabel: string; // "82%"
  barPct: string; // "82%"
  clip: string; // clip-path inset() for the heli-fill highlight
  statusLabel: string;
  statusColor: string;
  dateLabel: string; // "ETA: …" or "Completed: …"
}
