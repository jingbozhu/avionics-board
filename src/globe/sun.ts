import type { SunParams } from '../types';

// Subsolar-point math for the globe lighting. Uses REAL UTC (DST-independent,
// geographically correct), unlike the deliberately DST-free PST wall clock.
// See docs/DESIGN_BRIEF.md "The spinning Earth".

const DEG = Math.PI / 180;

/** UTC day-of-year, Jan 1 = 1 (366 in a leap year). */
export function dayOfYearUTC(d: Date): number {
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - startOfYear) / 86400000) + 1;
}

/**
 * Subsolar point used by the globe lighting.
 *   sunLon = -(utcHoursFractional - 12) * 15°   (includes minutes + seconds)
 *   decl   = 23.44° * sin(2π * (dayOfYear - 81) / 365)   (literal /365)
 * Returns sunLon in radians plus sin/cos of the declination.
 */
export function sunParams(d: Date): SunParams {
  const utcHoursFractional =
    d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const sunLon = -(utcHoursFractional - 12) * 15 * DEG;
  const decl = 23.44 * Math.sin((2 * Math.PI * (dayOfYearUTC(d) - 81)) / 365) * DEG;
  return { sunLon, sd: Math.sin(decl), cd: Math.cos(decl) };
}
