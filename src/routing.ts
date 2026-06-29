// Hash routing for the single-page board. Two routes share one page:
//   - 'display' (default): the read-only TV board.
//   - 'admin'   (#admin):  the squawk-gated fleet console.
// We read `location.hash`; `#admin` -> admin, everything else -> display; and we
// re-render on `hashchange`. No router library (see BUILD_SPEC hard rules).
import { useEffect, useState } from 'preact/hooks';

export type Route = 'admin' | 'display';

/** Map a raw `location.hash` string to a route. `#admin` -> admin, else display. */
export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '').replace(/^\//, '');
  return h === 'admin' ? 'admin' : 'display';
}

/** Read the current route now (safe outside the browser too). */
function currentRoute(): Route {
  return typeof location !== 'undefined' ? parseHash(location.hash) : 'display';
}

/** Navigate by setting the hash; '' clears it back to the display route. */
export function goto(route: Route): void {
  if (typeof location === 'undefined') return;
  location.hash = route === 'admin' ? 'admin' : '';
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
