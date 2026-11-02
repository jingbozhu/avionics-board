// Hash routing for the single-page board. Three routes share one page:
//   - 'display' (default):  the read-only TV board.
//   - 'admin'   (#admin):   the squawk-gated fleet console.
//   - 'manuals' (#manuals): manual search for the shop tablets. A search can be
//     deep-linked as #manuals/<url-encoded query> (see views/manuals/manuals.ts).
// We read `location.hash` and re-render on `hashchange`. No router library
// (see BUILD_SPEC hard rules).
import { useEffect, useState } from 'preact/hooks';

export type Route = 'admin' | 'display' | 'manuals';

/** Map a raw `location.hash` string to a route. Unknown hashes -> display. */
export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '').replace(/^\//, '');
  if (h === 'admin') return 'admin';
  if (h === 'manuals' || h.startsWith('manuals/')) return 'manuals';
  return 'display';
}

/** Read the current route now (safe outside the browser too). */
function currentRoute(): Route {
  return typeof location !== 'undefined' ? parseHash(location.hash) : 'display';
}

/** Navigate by setting the hash; '' clears it back to the display route. */
export function goto(route: Route): void {
  if (typeof location === 'undefined') return;
  location.hash = route === 'display' ? '' : route;
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
