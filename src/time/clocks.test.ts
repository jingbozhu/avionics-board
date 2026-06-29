import { describe, it, expect } from 'vitest';
import { formatUTC, formatPST } from './clocks';

describe('formatUTC', () => {
  it('formats UTC fields as "HH:MM:SS Z"', () => {
    expect(formatUTC(new Date(Date.UTC(2025, 0, 1, 14, 5, 9)))).toBe('14:05:09 Z');
  });

  it('zero-pads midnight', () => {
    expect(formatUTC(new Date(Date.UTC(2025, 0, 1, 0, 0, 0)))).toBe('00:00:00 Z');
  });

  it('reads UTC (not local) fields', () => {
    expect(formatUTC(new Date(Date.UTC(2025, 6, 1, 23, 59, 59)))).toBe('23:59:59 Z');
  });
});

describe('formatPST', () => {
  it('is a fixed UTC-8 shift labeled PST', () => {
    expect(formatPST(new Date(Date.UTC(2025, 0, 1, 14, 5, 9)))).toBe('06:05:09 PST');
  });

  it('zero-pads after the shift', () => {
    // UTC 08:03:04 -> 00:03:04 PST
    expect(formatPST(new Date(Date.UTC(2025, 0, 1, 8, 3, 4)))).toBe('00:03:04 PST');
  });

  it('wraps backward across the date boundary (UTC 04:00 -> 20:00 prev day)', () => {
    expect(formatPST(new Date(Date.UTC(2025, 0, 1, 4, 0, 0)))).toBe('20:00:00 PST');
  });

  // The whole point of the fixed offset: it must NOT track DST the way
  // America/Los_Angeles does. On a summer date LA is PDT (UTC-7) while our
  // fixed PST stays UTC-8, so the two MUST diverge by exactly one hour.
  it('diverges from America/Los_Angeles on a DST date (proves no DST)', () => {
    const summer = new Date(Date.UTC(2025, 6, 1, 20, 0, 0)); // Jul 1, PDT in LA
    const intlLA = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(summer);

    expect(intlLA).toBe('13:00:00'); // PDT, UTC-7
    expect(formatPST(summer)).toBe('12:00:00 PST'); // fixed UTC-8, no DST
    expect(formatPST(summer).slice(0, 8)).not.toBe(intlLA);
  });

  it('agrees with America/Los_Angeles in winter (control: divergence is DST, not a constant offset bug)', () => {
    const winter = new Date(Date.UTC(2025, 0, 1, 20, 0, 0)); // Jan 1, PST in LA
    const intlLA = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(winter);

    expect(formatPST(winter).slice(0, 8)).toBe(intlLA); // both UTC-8
  });
});
