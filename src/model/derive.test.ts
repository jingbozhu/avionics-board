import { describe, it, expect } from 'vitest';
import { toCardVM, countPad } from './derive';
import { HILITE, STATUS } from '../theme/tokens';
import { normalizeAirframe } from './airframe';
import type { Airframe, SystemKey } from '../types';

const base: Airframe = {
  id: 'p1',
  workOrder: 'WO-4471',
  registration: 'N412HL',
  description: 'Replace VHF-1 transceiver.',
  system: '2',
  tech: 'JZ',
  pct: 82,
  eta: 'May 20, 2025',
  flag: 'on-track',
};

describe('countPad', () => {
  it('zero-pads to two digits', () => {
    expect(countPad(0)).toBe('00');
    expect(countPad(6)).toBe('06');
  });

  it('leaves >= 10 unchanged', () => {
    expect(countPad(12)).toBe('12');
    expect(countPad(100)).toBe('100');
  });
});

describe('toCardVM', () => {
  it('on-track uses "ETA: " and the green status', () => {
    const vm = toCardVM(base);
    expect(vm.dateLabel).toBe('ETA: May 20, 2025');
    expect(vm.statusLabel).toBe('On Track');
    expect(vm.statusColor).toBe('#5fd28a');
    expect(vm.pctLabel).toBe('82%');
    expect(vm.barPct).toBe('82%');
    expect(vm.clip).toBe(HILITE['2']);
  });

  it('complete is green AND uses the "Completed: " prefix', () => {
    const vm = toCardVM({ ...base, flag: 'complete', eta: 'May 1, 2025' });
    expect(vm.dateLabel).toBe('Completed: May 1, 2025');
    expect(vm.statusLabel).toBe('Complete');
    expect(vm.statusColor).toBe('#5fd28a'); // green, same as on-track
    expect(vm.statusColor).toBe(STATUS.complete.color);
  });

  it('at-risk is amber', () => {
    const vm = toCardVM({ ...base, flag: 'at-risk' });
    expect(vm.statusColor).toBe('#ff9e3d');
    expect(vm.dateLabel.startsWith('ETA: ')).toBe(true);
  });

  it('clamps the percentage and the labels', () => {
    expect(toCardVM({ ...base, pct: 150 }).pct).toBe(100);
    expect(toCardVM({ ...base, pct: 150 }).pctLabel).toBe('100%');
    expect(toCardVM({ ...base, pct: -20 }).pct).toBe(0);
    expect(toCardVM({ ...base, pct: -20 }).barPct).toBe('0%');
  });

  it('falls back to the "2" clip for an unknown system', () => {
    const vm = toCardVM({ ...base, system: 'teleport' as SystemKey });
    expect(vm.clip).toBe(HILITE['2']);
  });

  it('uses the per-system clip for known systems', () => {
    expect(toCardVM({ ...base, system: '6' }).clip).toBe(HILITE['6']);
    expect(toCardVM({ ...base, system: '1' }).clip).toBe(HILITE['1']);
  });

  it('a numbered system lights one region with the accent tint', () => {
    const vm = toCardVM({ ...base, system: '3' });
    expect(vm.clip).toBe('inset(40% 41% 22% 37%)');
    expect(vm.heliFilter).toBe('saturate(1.05) var(--heli-filter, )');
  });

  it('"full" lights the WHOLE airframe in the same accent tint', () => {
    const vm = toCardVM({ ...base, system: 'full' });
    expect(vm.clip).toBe('inset(0)');
    // Only the clip differs from a numbered system — the tint must match.
    expect(vm.heliFilter).toBe('saturate(1.05) var(--heli-filter, )');
    expect(vm.heliFilter).toBe(toCardVM({ ...base, system: '3' }).heliFilter);
  });

  it('labels the tech, and stays blank when unassigned', () => {
    expect(toCardVM(base).techLabel).toBe('TECH JZ');
    expect(toCardVM({ ...base, tech: '' }).techLabel).toBe('');
  });

  it('carries the split work order / registration / description through', () => {
    const vm = toCardVM(base);
    expect(vm.workOrder).toBe('WO-4471');
    expect(vm.registration).toBe('N412HL');
    expect(vm.description).toBe('Replace VHF-1 transceiver.');
  });

  it('shows TBD when eta is blank', () => {
    expect(toCardVM({ ...base, eta: '' }).dateLabel).toBe('ETA: TBD');
  });
});

describe('normalizeAirframe — pre-split records', () => {
  it('maps name -> registration, category -> description, and the old system names', () => {
    // 'cockpit' no longer typechecks — that IS the case under test (a record from disk).
    const a = normalizeAirframe({ id: 'old', name: 'X', category: 'Y', system: 'cockpit' as SystemKey });
    expect(a.registration).toBe('X');
    expect(a.description).toBe('Y');
    expect(a.system).toBe('1');
    expect(a.workOrder).toBe('');
    expect(a.tech).toBe('');
  });

  it('keeps letters only in tech, upper-cased and capped at 4', () => {
    expect(normalizeAirframe({ id: 'x', tech: 'j.z.' }).tech).toBe('JZ');
    expect(normalizeAirframe({ id: 'x', tech: 'Jane Zhu' }).tech).toBe('JANE');
    expect(normalizeAirframe({ id: 'x', tech: '44a17' }).tech).toBe('A');
    // Employee numbers are no longer a valid tech; they normalize to unassigned.
    expect(normalizeAirframe({ id: 'x', tech: '0042' }).tech).toBe('');
  });

  it('falls back to system "2" for anything unrecognized', () => {
    expect(normalizeAirframe({ id: 'x', system: 'teleport' as SystemKey }).system).toBe('2');
  });
});
