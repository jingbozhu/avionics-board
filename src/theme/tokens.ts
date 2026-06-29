// Theme constants copied verbatim from the design. Do not "clean up" these values.
import type { AccentKey, SystemKey, StatusFlag, StatusView } from '../types';

export interface Accent {
  c: string;
  light: string;
  filter: string; // CSS filter re-tinting heli-fill.png for non-amber accents
}

export const ACCENTS: Record<AccentKey, Accent> = {
  amber: { c: '#ff9e3d', light: '#ffc874', filter: '' },
  orange: { c: '#ff6f33', light: '#ff9b5e', filter: 'hue-rotate(-16deg) saturate(1.2)' },
  gold: { c: '#eab23c', light: '#ffd86a', filter: 'hue-rotate(14deg) saturate(.82) brightness(1.08)' },
};

export const DEFAULT_ACCENT: AccentKey = 'amber';

// clip-path inset(top right bottom left) selecting which part of the airframe lights up.
// Tuned to the supplied 1112×376 heli art — re-tune if the art changes.
export const HILITE: Record<SystemKey, string> = {
  cockpit: 'inset(26% 68% 30% 15%)',
  comms: 'inset(38% 49% 22% 29%)',
  mission: 'inset(40% 41% 22% 37%)',
  nav: 'inset(13% 45% 66% 42%)',
  autopilot: 'inset(15% 47% 64% 40%)',
  radar: 'inset(44% 77% 30% 8%)',
};

// Note: 'complete' is ALSO green (same as 'on-track'); only 'at-risk' is amber.
export const STATUS: Record<StatusFlag, StatusView> = {
  'on-track': { label: 'On Track', color: '#5fd28a' },
  'at-risk': { label: 'At Risk', color: '#ff9e3d' },
  'complete': { label: 'Complete', color: '#5fd28a' },
};
