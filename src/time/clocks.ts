// Wall-clock formatting for the board headers.
//
//  - The UTC clock prints zero-padded UTC fields followed by a literal "Z".
//    It does no offset arithmetic at all, so no timezone setting anywhere can
//    shift it — only a wrong absolute clock on the device itself can.
//  - The LOCAL clock is real America/Los_Angeles time and TRACKS DST, with the
//    label flipping PST/PDT to match.
//
// DELIBERATE REVERSAL (2026-08-06, owner's call): the prototype used a FIXED
// UTC-8 labeled "PST" with DST disabled, and this file, BUILD_SPEC.md,
// docs/DESIGN_BRIEF.md and README.md all previously mandated preserving that
// quirk verbatim. On the wall it simply read one hour behind for the ~8 months
// a year Pacific is on PDT, which operators reported as a bug. Do NOT "restore"
// the fixed offset as a preserved quirk.

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Pacific standard/daylight offsets, in minutes east of UTC. */
const PST_MINUTES = -480;
const PDT_MINUTES = -420;

/** "HH:MM:SS Z" built from the instant's UTC fields (zero-padded). */
export function formatUTC(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} Z`;
}

// One formatter for the life of the page: constructing an Intl.DateTimeFormat
// per tick, on three Fire TVs, is real work on that hardware. Built lazily and
// memoized — including the failure, so a build without the zone doesn't retry
// every second. `hour12: false` is kept rather than `hourCycle: 'h23'` because
// per spec `hour12` overrides and nulls `hourCycle`; the "24:00:00" that some
// older engines then produce for midnight is normalized below instead.
let formatter: Intl.DateTimeFormat | null = null;
let formatterReady = false;

function pacificFormatter(): Intl.DateTimeFormat | null {
  if (!formatterReady) {
    formatterReady = true;
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      formatter = null; // no ICU / unknown zone — callers fall back below
    }
  }
  return formatter;
}

interface Fields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * The instant's Pacific calendar fields, read from `formatToParts` BY TYPE —
 * never by index or by parsing the joined string, whose separators are
 * locale-dependent. Returns null if the formatter is unavailable.
 */
function pacificFields(d: Date): Fields | null {
  const fmt = pacificFormatter();
  if (!fmt) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt.formatToParts(d);
  } catch {
    return null;
  }
  const got: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') got[p.type] = Number(p.value);
  }
  const f = {
    year: got.year,
    month: got.month,
    day: got.day,
    hour: got.hour,
    minute: got.minute,
    second: got.second,
  };
  for (const v of Object.values(f)) if (!Number.isFinite(v)) return null;
  return f;
}

/**
 * Pacific's UTC offset at `d`, in minutes east of UTC: -480 (PST) or -420 (PDT).
 * Null when the zone is unavailable.
 *
 * Computed as (Pacific wall time read as if UTC) - (the real instant), which is
 * immune to the "24:00:00" midnight quirk for free: under h24 midnight renders
 * as hour 24 of the PREVIOUS date, and `Date.UTC(prev, 24, …)` is the very same
 * instant as `Date.UTC(day, 0, …)`.
 */
export function pacificOffsetMinutes(d: Date): number | null {
  const f = pacificFields(d);
  if (!f) return null;
  const asUTC = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  const instant = d.getTime() - d.getUTCMilliseconds();
  return Math.round((asUTC - instant) / 60000);
}

/**
 * Zone abbreviation for a UTC offset in minutes. Derived from the offset rather
 * than asked of `timeZoneName: 'short'` on purpose: a reduced-ICU build can hand
 * back "GMT-7" there, which is wider than the header's width budget allows.
 * Anything that isn't Pacific degrades to an honest "UTC-7" rather than a lie.
 */
export function zoneLabel(offsetMinutes: number): string {
  if (offsetMinutes === PST_MINUTES) return 'PST';
  if (offsetMinutes === PDT_MINUTES) return 'PDT';
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${pad2(m)}` : ''}`;
}

/**
 * "HH:MM:SS PDT" — real America/Los_Angeles time, DST included, with the label
 * following the actual offset. Falls back to the prototype's fixed UTC-8 "PST"
 * if the engine has no usable timezone data, so the board never blanks its clock.
 */
export function formatPacific(d: Date): string {
  const f = pacificFields(d);
  const offset = pacificOffsetMinutes(d);
  if (!f || offset === null) {
    const shifted = new Date(d.getTime() + PST_MINUTES * 60000);
    return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())} PST`;
  }
  // Normalize the h24 midnight some older engines render as hour 24.
  const hour = f.hour === 24 ? 0 : f.hour;
  return `${pad2(hour)}:${pad2(f.minute)}:${pad2(f.second)} ${zoneLabel(offset)}`;
}
