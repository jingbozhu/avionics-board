import { describe, it, expect } from 'vitest';
import { parseHash } from './routing';

describe('parseHash', () => {
  it('maps #admin to admin', () => {
    expect(parseHash('#admin')).toBe('admin');
  });

  it('tolerates a slashy admin hash (#/admin)', () => {
    expect(parseHash('#/admin')).toBe('admin');
  });

  it('maps the empty hash to display', () => {
    expect(parseHash('')).toBe('display');
    expect(parseHash('#')).toBe('display');
  });

  it('maps anything else to display', () => {
    expect(parseHash('#display')).toBe('display');
    expect(parseHash('#settings')).toBe('display');
    expect(parseHash('#ADMIN')).toBe('display'); // case-sensitive, faithful to source
    expect(parseHash('#manualsx')).toBe('display');
  });

  it('maps #manuals and its deep links to manuals', () => {
    expect(parseHash('#manuals')).toBe('manuals');
    expect(parseHash('#/manuals')).toBe('manuals');
    expect(parseHash('#manuals/bonding%20resistance')).toBe('manuals');
  });
});
