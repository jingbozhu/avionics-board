import type { Airframe, SystemKey, StatusFlag } from '../types';

export const STORAGE_KEY = 'fleet.projects.v2';

export const SYSTEMS: SystemKey[] = ['cockpit', 'comms', 'mission', 'nav', 'autopilot', 'radar'];
export const FLAGS: StatusFlag[] = ['on-track', 'at-risk', 'complete'];

/** Round + clamp a completion percentage into 0..100. */
export function clampPct(n: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

/** Coerce any (possibly partial / untrusted) record into a valid Airframe. */
export function normalizeAirframe(p: Partial<Airframe> & { id: string }): Airframe {
  const system = (SYSTEMS as string[]).includes(p.system as string) ? (p.system as SystemKey) : 'comms';
  const flag = (FLAGS as string[]).includes(p.flag as string) ? (p.flag as StatusFlag) : 'on-track';
  return {
    id: p.id,
    name: p.name ?? '—',
    category: p.category ?? 'AVIONICS UPGRADE',
    system,
    pct: clampPct(p.pct ?? 0),
    eta: p.eta ?? 'TBD',
    flag,
  };
}

/** Seed list — matches the design screenshots; safe demo content. */
export function seed(): Airframe[] {
  return [
    { id: 'p1', name: 'BELL 412 COMMS', category: 'COMMUNICATIONS UPGRADE', system: 'comms', pct: 82, eta: 'May 20, 2025', flag: 'on-track' },
    { id: 'p2', name: 'EC135 GLASS COCKPIT', category: 'COCKPIT MODERNIZATION', system: 'cockpit', pct: 47, eta: 'Jun 10, 2025', flag: 'on-track' },
    { id: 'p3', name: 'AW139 SAR SUITE', category: 'MISSION SYSTEMS', system: 'mission', pct: 95, eta: 'May 16, 2025', flag: 'at-risk' },
    { id: 'p4', name: 'H145 NAV UPGRADE', category: 'NAVIGATION UPGRADE', system: 'nav', pct: 24, eta: 'Jun 30, 2025', flag: 'on-track' },
    { id: 'p5', name: 'BELL 429 AUTOPILOT', category: 'AUTOPILOT SYSTEM', system: 'autopilot', pct: 64, eta: 'May 28, 2025', flag: 'on-track' },
    { id: 'p6', name: 'S-76 WX RADAR', category: 'WEATHER RADAR', system: 'radar', pct: 100, eta: 'May 1, 2025', flag: 'complete' },
  ];
}

/** A fresh airframe for the admin "+ ADD" action. */
export function blankAirframe(id: string): Airframe {
  return { id, name: 'NEW AIRFRAME', category: 'AVIONICS UPGRADE', system: 'comms', pct: 0, eta: 'TBD', flag: 'on-track' };
}
