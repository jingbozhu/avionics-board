// Hash routing for the single-page board. Four routes share one page:
//   - 'display'     (default):      the read-only TV board.
//   - 'admin'       (#admin):       the squawk-gated fleet console.
//   - 'iai'         (#iai):         the IAI front door (geodesic field + entry).
//   - 'iai-console' (#iai/console): the IAI console behind that door.
// We read `location.hash`; unknown hashes fall through to display; and we
// re-render on `hashchange`. No router library (see BUILD_SPEC hard rules).
import { useEffect, useState } from 'preact/hooks';

export type Route = 'admin' | 'display' | 'iai' | 'iai-console';

const HASHES: Record<string, Route> = {
  admin: 'admin',
  iai: 'iai',
  'iai/console': 'iai-console',
};

/** Map a raw `location.hash` string to a route. Unknown hashes -> display. */
export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '').replace(/^\//, '');
  return HASHES[h] ?? 'display';
}

/** Read the current route now (safe outside the browser too). */
function currentRoute(): Route {
  return typeof location !== 'undefined' ? parseHash(location.hash) : 'display';
}

/** Navigate by setting the hash; '' clears it back to the display route. */
export function goto(route: Route): void {
  if (typeof location === 'undefined') return;
  const entry = Object.entries(HASHES).find(([, r]) => r === route);
  location.hash = entry ? entry[0] : '';
}

/** Live route, re-rendered on every `hashchange`. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}
