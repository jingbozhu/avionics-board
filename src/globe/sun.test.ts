import { describe, it, expect } from 'vitest';
import { sunParams, dayOfYearUTC } from './sun';

const DEG = Math.PI / 180;

describe('dayOfYearUTC', () => {
  it('Jan 1 is day 1', () => {
    expect(dayOfYearUTC(new Date(Date.UTC(2025, 0, 1, 0, 0, 0)))).toBe(1);
  });

  it('handles a leap year (Dec 31, 2024 = day 366)', () => {
    expect(dayOfYearUTC(new Date(Date.UTC(2024, 11, 31, 23, 59, 59)))).toBe(366);
  });

  it('handles a non-leap year (Dec 31, 2025 = day 365)', () => {
    expect(dayOfYearUTC(new Date(Date.UTC(2025, 11, 31, 0, 0, 0)))).toBe(365);
  });

  it('resets across the year boundary (1s apart)', () => {
    expect(dayOfYearUTC(new Date(Date.UTC(2024, 11, 31, 23, 59, 59)))).toBe(366);
    expect(dayOfYearUTC(new Date(Date.UTC(2025, 0, 1, 0, 0, 0)))).toBe(1);
  });
});

describe('sunParams', () => {
  it('golden: 2025-01-01 12:00:00 UTC', () => {
    const p = sunParams(new Date(Date.UTC(2025, 0, 1, 12, 0, 0)));
    expect(p.sunLon).toBeCloseTo(0, 12); // noon UTC -> subsolar at 0° lon
    expect(p.sd).toBeCloseTo(-0.3907604269728582, 12);
    expect(p.cd).toBeCloseTo(0.9204924164337203, 12);
  });

  it('golden: day-of-year 81 has zero declination and a clean sunLon', () => {
    // 2025-03-22 is UTC day-of-year 81 -> decl = 23.44 * sin(0) = 0.
    const p = sunParams(new Date(Date.UTC(2025, 2, 22, 6, 0, 0)));
    expect(p.sd).toBeCloseTo(0, 12);
    expect(p.cd).toBeCloseTo(1, 12);
    expect(p.sunLon).toBeCloseTo(90 * DEG, 12); // -(6 - 12)*15 = 90°
  });

  it('golden: 2025-06-21 00:00:00 UTC -> sunLon = 180° = π', () => {
    const p = sunParams(new Date(Date.UTC(2025, 5, 21, 0, 0, 0)));
    expect(p.sunLon).toBeCloseTo(Math.PI, 12);
    expect(p.sd).toBeCloseTo(0.3977850316046382, 12);
    expect(p.cd).toBeCloseTo(0.9174786475070126, 12);
  });

  it('sunLon includes minutes/seconds (fractional-hour motion)', () => {
    const base = sunParams(new Date(Date.UTC(2025, 0, 1, 12, 0, 0)));
    const later = sunParams(new Date(Date.UTC(2025, 0, 1, 12, 30, 0)));
    // +30 min -> -0.5h -> sunLon shifts by -0.5 * 15 = -7.5°
    expect(later.sunLon - base.sunLon).toBeCloseTo(-7.5 * DEG, 12);
    // declination is unchanged within the same UTC day
    expect(later.sd).toBeCloseTo(base.sd, 12);
    expect(later.cd).toBeCloseTo(base.cd, 12);
  });

  it('year-boundary day-of-year drives declination', () => {
    // doy 366 (2024) and doy 1 (2025) are exactly one (doy-81)/365 period
    // apart -> identical declination; the test proves the year reset is used.
    const dec31 = sunParams(new Date(Date.UTC(2024, 11, 31, 0, 0, 0)));
    const jan1 = sunParams(new Date(Date.UTC(2025, 0, 1, 0, 0, 0)));
    expect(dec31.sd).toBeCloseTo(jan1.sd, 12);
    expect(dec31.cd).toBeCloseTo(jan1.cd, 12);
    expect(jan1.sd).toBeCloseTo(-0.3907604269728582, 12);
  });
});
