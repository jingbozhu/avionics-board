// Pure airframe -> card view-model derivation. Keeps the view layer dumb: every
// label, color, percent string and clip-path is computed here from theme tokens.
import type { Airframe, CardVM } from '../types';
import { HILITE, STATUS } from '../theme/tokens';
import { clampPct } from './airframe';

/** Heli-fill tint: the global accent filter set on :root by App. Same for every card. */
const HELI_ACCENT = 'saturate(1.05) var(--heli-filter, )';

/** Two-digit zero-padded count for the header's AIRFRAMES stat ("06"). */
export function countPad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Build the per-card view-model.
 *  - pct is clamped to 0..100; pctLabel/barPct are "<pct>%".
 *  - clip is the heli-fill highlight inset for the system (unknown -> '2').
 *  - heliFilter is the accent tint for every system, 'full' included; only the
 *    clip differs, so a full-aircraft row lights the WHOLE airframe in the accent.
 *  - techLabel is "TECH <n>", or "" when no tech is assigned.
 *  - status label/color come from STATUS (complete is green, like on-track).
 *  - dateLabel is "Completed: <eta>" when complete, else "ETA: <eta>"; "TBD" when blank.
 */
export function toCardVM(a: Airframe): CardVM {
  const pct = clampPct(a.pct);
  const status = STATUS[a.flag] ?? STATUS['on-track'];
  const clip = HILITE[a.system] ?? HILITE['2'];
  const heliFilter = HELI_ACCENT;
  const dateLabel = (a.flag === 'complete' ? 'Completed: ' : 'ETA: ') + (a.eta || 'TBD');
  return {
    id: a.id,
    workOrder: a.workOrder,
    registration: a.registration,
    description: a.description,
    techLabel: a.tech ? `TECH ${a.tech}` : '',
    pct,
    pctLabel: `${pct}%`,
    barPct: `${pct}%`,
    clip,
    heliFilter,
    statusLabel: status.label,
    statusColor: status.color,
    dateLabel,
  };
}
