import { describe, it, expect } from 'vitest';
import { formatUTC, formatPacific, pacificOffsetMinutes, zoneLabel } from './clocks';

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

describe('zoneLabel', () => {
  it('names the two Pacific offsets', () => {
    expect(zoneLabel(-480)).toBe('PST');
    expect(zoneLabel(-420)).toBe('PDT');
  });

  it('degrades to an honest UTC offset rather than a wrong abbreviation', () => {
    expect(zoneLabel(0)).toBe('UTC+0');
    expect(zoneLabel(-300)).toBe('UTC-5');
    expect(zoneLabel(330)).toBe('UTC+5:30');
  });
});

describe('pacificOffsetMinutes', () => {
  it('is UTC-7 in summer and UTC-8 in winter', () => {
    expect(pacificOffsetMinutes(new Date(Date.UTC(2025, 6, 1, 20, 0, 0)))).toBe(-420);
    expect(pacificOffsetMinutes(new Date(Date.UTC(2025, 0, 1, 20, 0, 0)))).toBe(-480);
  });
});

// Goldens are hardcoded, NOT compared against a second Intl call — comparing
// Intl to Intl would pass no matter what this module did.
describe('formatPacific', () => {
  it('TRACKS DST: a summer instant is PDT, UTC-7', () => {
    // The exact case that read an hour behind under the old fixed UTC-8.
    expect(formatPacific(new Date(Date.UTC(2025, 6, 1, 20, 0, 0)))).toBe('13:00:00 PDT');
  });

  it('is PST, UTC-8, in winter', () => {
    expect(formatPacific(new Date(Date.UTC(2025, 0, 1, 20, 0, 0)))).toBe('12:00:00 PST');
  });

  it('summer and winter differ by exactly one hour at the same UTC time', () => {
    const summer = formatPacific(new Date(Date.UTC(2025, 6, 1, 20, 0, 0)));
    const winter = formatPacific(new Date(Date.UTC(2025, 0, 1, 20, 0, 0)));
    expect(Number(summer.slice(0, 2)) - Number(winter.slice(0, 2))).toBe(1);
    expect(summer.slice(9)).not.toBe(winter.slice(9));
  });

  it('handles spring forward (the skipped 02:00 hour)', () => {
    expect(formatPacific(new Date(Date.UTC(2025, 2, 9, 9, 59, 59)))).toBe('01:59:59 PST');
    expect(formatPacific(new Date(Date.UTC(2025, 2, 9, 10, 0, 0)))).toBe('03:00:00 PDT');
  });

  it('handles fall back (the repeated 01:00 hour)', () => {
    expect(formatPacific(new Date(Date.UTC(2025, 10, 2, 8, 59, 59)))).toBe('01:59:59 PDT');
    expect(formatPacific(new Date(Date.UTC(2025, 10, 2, 9, 0, 0)))).toBe('01:00:00 PST');
  });

  it('renders midnight as 00, never 24 (guards the h24 engine quirk)', () => {
    expect(formatPacific(new Date(Date.UTC(2025, 6, 2, 7, 0, 0)))).toBe('00:00:00 PDT');
    expect(formatPacific(new Date(Date.UTC(2025, 0, 2, 8, 0, 0)))).toBe('00:00:00 PST');
  });

  it('zero-pads every field', () => {
    expect(formatPacific(new Date(Date.UTC(2025, 0, 1, 16, 3, 4)))).toBe('08:03:04 PST');
  });

  it('wraps backward across the date boundary', () => {
    // UTC Jan 1 04:00 is still Dec 31 20:00 in Pacific.
    expect(formatPacific(new Date(Date.UTC(2025, 0, 1, 4, 0, 0)))).toBe('20:00:00 PST');
  });
});
