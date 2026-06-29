// Admin gate. The board is read-only on the Display route; the Admin route is
// protected by a "squawk code" (an aviation transponder emergency code). A
// correct code unlocks the console for the rest of the browser SESSION only.
//
// The unlock flag lives in sessionStorage (NOT localStorage) on purpose: it must
// not persist across browser restarts and must not sync to the read-only TVs via
// the localStorage `storage` event. See docs/DESIGN_BRIEF.md "Admin console".

/** The transponder squawk that unlocks the admin console. */
export const SQUAWK = '7700';

const AUTH_KEY = 'fleet.admin';

/** True when the typed code matches the squawk (trimmed for stray whitespace). */
export function checkCode(input: string): boolean {
  return String(input).trim() === SQUAWK;
}

/** True when this session has been authenticated. */
export function isAuthed(): boolean {
  try {
    return sessionStorage.getItem(AUTH_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mark this session as authenticated. */
export function setAuthed(): void {
  try {
    sessionStorage.setItem(AUTH_KEY, '1');
  } catch {
    /* sessionStorage unavailable — stay locked */
  }
}

/** Drop the authentication flag (the "LOCK" action). */
export function clearAuthed(): void {
  try {
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}
