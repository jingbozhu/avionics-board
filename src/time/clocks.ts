// Wall-clock formatting for the board headers.
//
// Two deliberate quirks preserved verbatim from the prototype (see
// docs/DESIGN_BRIEF.md "Time"):
//  - The UTC clock prints zero-padded UTC fields followed by a literal "Z".
//  - The LOCAL clock is a FIXED UTC-8 offset labeled "PST" with DAYLIGHT
//    SAVING DISABLED ON PURPOSE. It is implemented by shifting the instant
//    back 8 hours and reading the resulting UTC fields — NEVER via Intl /
//    "America/Los_Angeles" (which would silently apply DST).

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "HH:MM:SS Z" built from the instant's UTC fields (zero-padded). */
export function formatUTC(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} Z`;
}

/**
 * "HH:MM:SS PST" at a FIXED UTC-8 offset — no DST, no Intl.
 * Shift the instant back 8 hours, then read its UTC fields.
 */
export function formatPST(d: Date): string {
  const shifted = new Date(d.getTime() - 8 * 3600 * 1000);
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())} PST`;
}
