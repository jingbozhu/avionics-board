// Fleet store behind the FleetStore seam. Two interchangeable backends:
//
//   LAN mode (default for the kiosk deployment): the Pi server owns the state.
//     - read   : GET /api/fleet
//     - live    : EventSource('/api/stream') pushes every change to all TVs
//     - persist : debounced PUT /api/fleet with the full list
//
//   localStorage mode (single-machine fallback, used when the server is
//   unreachable): state lives in localStorage[STORAGE_KEY].
//     - live    : the `storage` event syncs OTHER tabs (memory only — the source
//                 tab updates via its own mutation, the storage event never re-persists)
//     - persist : debounced localStorage.setItem
//
// getSnapshot() returns a STABLE reference until something actually changes, so
// Preact's useSyncExternalStore does not loop ("getSnapshot should be cached").
import type { Airframe, FleetStore, SystemKey, StatusFlag } from '../types';
import {
  STORAGE_KEY,
  SYSTEMS,
  FLAGS,
  clampPct,
  normalizeTech,
  normalizeAirframe,
  seed,
  blankAirframe,
} from './airframe';

const PERSIST_DEBOUNCE_MS = 120;

type Mode = 'lan' | 'local';

let idSeq = 0;
function genId(): string {
  idSeq += 1;
  return `af-${Date.now().toString(36)}-${idSeq}`;
}

/** Best-effort JSON.parse that never throws. */
function safeParse(text: string | null | undefined): unknown {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Coerce an untrusted value into a clean Airframe[]. Returns null for anything
 * that is not a non-empty array of usable objects (caller then falls to seed()).
 */
function coerceList(value: unknown): Airframe[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: Airframe[] = [];
  for (const item of value) {
    if (item && typeof item === 'object') {
      const rec = item as Partial<Airframe> & { id?: unknown };
      const id = typeof rec.id === 'string' && rec.id ? rec.id : genId();
      out.push(normalizeAirframe({ ...rec, id }));
    }
  }
  return out.length ? out : null;
}

/** Read the localStorage list, falling back to the seed when missing/corrupt. */
function loadLocal(): Airframe[] {
  if (typeof localStorage !== 'undefined') {
    const parsed = coerceList(safeParse(localStorage.getItem(STORAGE_KEY)));
    if (parsed) return parsed;
  }
  return seed();
}

/** Apply a single field edit, validating enums and clamping the percentage. */
function applyField(a: Airframe, field: keyof Airframe, value: string | number): Airframe {
  switch (field) {
    case 'pct':
      return { ...a, pct: clampPct(Number(value)) };
    case 'system': {
      const s = String(value);
      return { ...a, system: (SYSTEMS as string[]).includes(s) ? (s as SystemKey) : a.system };
    }
    case 'flag': {
      const f = String(value);
      return { ...a, flag: (FLAGS as string[]).includes(f) ? (f as StatusFlag) : a.flag };
    }
    case 'tech':
      return { ...a, tech: normalizeTech(value) };
    case 'workOrder':
      return { ...a, workOrder: String(value) };
    case 'registration':
      return { ...a, registration: String(value) };
    case 'description':
      return { ...a, description: String(value) };
    case 'eta':
      return { ...a, eta: String(value) };
    case 'id':
    default:
      return a; // id is immutable
  }
}

export function createFleetStore(): FleetStore {
  // Synchronous initial snapshot so the first paint always has content. LAN mode
  // (if reachable) overrides this once GET /api/fleet resolves.
  let snapshot: readonly Airframe[] = loadLocal();
  let mode: Mode = 'local';

  const listeners = new Set<() => void>();
  let es: EventSource | null = null;
  let storageAttached = false;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  function notify(): void {
    listeners.forEach((l) => l());
  }

  /** Replace the snapshot with a fresh reference and notify (no persist). */
  function replace(next: Airframe[]): void {
    snapshot = next;
    notify();
  }

  // --- live: localStorage storage-event sync (memory only) -------------------
  function onStorage(e: StorageEvent): void {
    if (e.key !== STORAGE_KEY) return;
    const next = coerceList(safeParse(e.newValue));
    if (next) replace(next); // never re-persist from a storage echo
  }
  function attachStorage(): void {
    if (storageAttached || typeof window === 'undefined') return;
    window.addEventListener('storage', onStorage);
    storageAttached = true;
  }
  function detachStorage(): void {
    if (!storageAttached || typeof window === 'undefined') return;
    window.removeEventListener('storage', onStorage);
    storageAttached = false;
  }

  // --- live: server SSE stream -----------------------------------------------
  function openStream(): void {
    if (typeof EventSource === 'undefined') return;
    try {
      es = new EventSource('/api/stream');
      es.onmessage = (e: MessageEvent) => {
        const next = coerceList(safeParse(e.data));
        if (next) replace(next);
      };
      // EventSource auto-reconnects on error; nothing to do here.
      es.onerror = () => {};
    } catch {
      es = null;
    }
  }

  // --- persistence (debounced, coalesced) ------------------------------------
  function persist(list: readonly Airframe[]): void {
    if (mode === 'lan') {
      if (typeof fetch !== 'function') return;
      fetch('/api/fleet', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(list),
      }).catch(() => {
        /* server briefly unreachable — next edit retries */
      });
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {
        /* quota/availability — ignore */
      }
    }
  }
  function schedulePersist(): void {
    if (persistTimer != null) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist(snapshot);
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Local mutation: update memory + notify synchronously, then debounce persist. */
  function commit(next: Airframe[]): void {
    snapshot = next;
    notify();
    schedulePersist();
  }

  // --- init: try LAN, else localStorage --------------------------------------
  function connectLan(): void {
    if (typeof fetch !== 'function') {
      attachStorage();
      return;
    }
    fetch('/api/fleet')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((data) => {
        mode = 'lan';
        detachStorage();
        replace(coerceList(data) ?? seed());
        openStream();
      })
      .catch(() => {
        mode = 'local';
        attachStorage();
      });
  }

  connectLan();

  return {
    getSnapshot(): readonly Airframe[] {
      return snapshot;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add(): void {
      commit([...snapshot, blankAirframe(genId())]);
    },
    update(id: string, field: keyof Airframe, value: string | number): void {
      commit(snapshot.map((a) => (a.id === id ? applyField(a, field, value) : a)));
    },
    remove(id: string): void {
      commit(snapshot.filter((a) => a.id !== id));
    },
  };
}
