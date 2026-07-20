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

  it('maps anything non-admin to display', () => {
    expect(parseHash('#display')).toBe('display');
    expect(parseHash('#settings')).toBe('display');
    expect(parseHash('#ADMIN')).toBe('display'); // case-sensitive, faithful to source
  });

  it('maps the IAI routes', () => {
    expect(parseHash('#iai')).toBe('iai');
    expect(parseHash('#/iai')).toBe('iai');
    expect(parseHash('#iai/console')).toBe('iai-console');
    expect(parseHash('#IAI')).toBe('display'); // case-sensitive, like #admin
    expect(parseHash('#iai/other')).toBe('display');
  });
});
