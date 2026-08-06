import type { Airframe, SystemKey, StatusFlag } from '../types';

export const STORAGE_KEY = 'fleet.projects.v3';

export const SYSTEMS: SystemKey[] = ['1', '2', '3', '4', '5', '6', 'full'];
export const FLAGS: StatusFlag[] = ['on-track', 'at-risk', 'complete'];

/** Option text for the admin SYSTEM select ('full' would otherwise render as "FULL"). */
export const SYSTEM_LABELS: Record<SystemKey, string> = {
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  full: 'FULL AIRCRAFT',
};

/** Pre-rename system names, so existing stored records survive. Drop once the DB lands. */
const LEGACY_SYSTEM: Record<string, SystemKey> = {
  cockpit: '1',
  comms: '2',
  mission: '3',
  nav: '4',
  autopilot: '5',
  radar: '6',
};

/** Round + clamp a completion percentage into 0..100. */
export function clampPct(n: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

/**
 * Technicians are identified by their name INITIALS: letters only, upper-cased,
 * capped at 4 so the card footer stays on one line. `''` means unassigned, and
 * the card renders no TECH line at all.
 *
 * This replaces an employee-number rule (digits only, kept as a string so
 * leading zeros survived) — management asked for initials on 2026-08-06. Any
 * stored employee number normalizes to `''` on the next read, by design.
 */
export function normalizeTech(v: unknown): string {
  return v == null
    ? ''
    : String(v)
        .replace(/[^A-Za-z]/g, '')
        .toUpperCase()
        .slice(0, 4);
}

/**
 * Coerce any (possibly partial / untrusted) record into a valid Airframe.
 * `name` / `category` are the pre-split field names, mapped forward so a stored
 * fleet from before the reshape still loads.
 */
export function normalizeAirframe(
  p: Partial<Airframe> & { id: string; name?: string; category?: string },
): Airframe {
  const raw = String(p.system ?? '');
  const system = (SYSTEMS as string[]).includes(raw) ? (raw as SystemKey) : (LEGACY_SYSTEM[raw] ?? '2');
  const flag = (FLAGS as string[]).includes(p.flag as string) ? (p.flag as StatusFlag) : 'on-track';
  return {
    id: p.id,
    workOrder: p.workOrder ?? '',
    registration: p.registration ?? p.name ?? '—',
    description: p.description ?? p.category ?? '',
    system,
    tech: normalizeTech(p.tech),
    pct: clampPct(p.pct ?? 0),
    eta: p.eta ?? 'TBD',
    flag,
  };
}

/** Seed list — matches the design screenshots; safe demo content. */
export function seed(): Airframe[] {
  return [
    { id: 'p1', workOrder: 'WO-4471', registration: 'N412HL', description: 'Replace VHF-1 transceiver and re-terminate the overhead comms harness; bench-test COM2 before reinstall.', system: '2', tech: 'JZ', pct: 82, eta: 'May 20, 2025', flag: 'on-track' },
    { id: 'p2', workOrder: 'WO-4482', registration: 'N135EC', description: 'Glass cockpit modernization — swap the round-dial panel for dual PFD/MFD units and update the pitot-static plumbing.', system: '1', tech: 'MR', pct: 47, eta: 'Jun 10, 2025', flag: 'on-track' },
    { id: 'p3', workOrder: 'WO-4490', registration: 'N139SR', description: 'Full SAR conversion: mission console, hoist provisions, searchlight, FLIR turret and complete cabin rewire.', system: 'full', tech: 'AL', pct: 95, eta: 'May 16, 2025', flag: 'at-risk' },
    { id: 'p4', workOrder: 'WO-4503', registration: 'N145AM', description: 'Navigation upgrade — new GPS/WAAS receiver and antenna, with a database subscription cutover.', system: '4', tech: 'DK', pct: 24, eta: 'Jun 30, 2025', flag: 'on-track' },
    { id: 'p5', workOrder: 'WO-4511', registration: 'N429BT', description: 'Four-axis autopilot install; rig the servos and fly the acceptance profile once the AFCS is signed off.', system: '5', tech: 'SP', pct: 64, eta: 'May 28, 2025', flag: 'on-track' },
    { id: 'p6', workOrder: 'WO-4519', registration: 'N76WX', description: 'Nose-mounted weather radar retrofit, radome refinish and antenna alignment. Closed out and returned to service.', system: '6', tech: 'TW', pct: 100, eta: 'May 1, 2025', flag: 'complete' },
  ];
}

/** A fresh airframe for the admin "+ ADD" action. */
export function blankAirframe(id: string): Airframe {
  return { id, workOrder: '', registration: 'NEW AIRFRAME', description: '', system: '2', tech: '', pct: 0, eta: 'TBD', flag: 'on-track' };
}
