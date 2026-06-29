import { describe, it, expect } from 'vitest';
import { toCardVM, countPad } from './derive';
import { HILITE, STATUS } from '../theme/tokens';
import type { Airframe, SystemKey } from '../types';

const base: Airframe = {
  id: 'p1',
  name: 'BELL 412 COMMS',
  category: 'COMMUNICATIONS UPGRADE',
  system: 'comms',
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
    expect(vm.clip).toBe(HILITE.comms);
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

  it('falls back to the comms clip for an unknown system', () => {
    const vm = toCardVM({ ...base, system: 'teleport' as SystemKey });
    expect(vm.clip).toBe(HILITE.comms);
  });

  it('uses the per-system clip for known systems', () => {
    expect(toCardVM({ ...base, system: 'radar' }).clip).toBe(HILITE.radar);
    expect(toCardVM({ ...base, system: 'cockpit' }).clip).toBe(HILITE.cockpit);
  });

  it('shows TBD when eta is blank', () => {
    expect(toCardVM({ ...base, eta: '' }).dateLabel).toBe('ETA: TBD');
  });
});
