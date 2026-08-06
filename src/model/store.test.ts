// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFleetStore } from './store';
import { STORAGE_KEY, seed } from './airframe';
import type { Airframe } from '../types';

/** Flush pending microtasks (the GET /api/fleet promise chain). */
async function flushMicro(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

/** Minimal EventSource stand-in we can drive from tests. */
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close(): void {
    this.closed = true;
  }
}

const SERVER_LIST: Airframe[] = [
  { id: 's1', workOrder: 'WO-1', registration: 'SERVER ONE', description: 'X', system: '4', tech: 'AB', pct: 10, eta: 'a', flag: 'on-track' },
  { id: 's2', workOrder: 'WO-2', registration: 'SERVER TWO', description: 'Y', system: '6', tech: '', pct: 100, eta: 'b', flag: 'complete' },
];

function okFetch(list: unknown) {
  return vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(list) } as Response),
  );
}

beforeEach(() => {
  localStorage.clear();
  MockEventSource.instances = [];
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createFleetStore — localStorage mode (no server)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', undefined); // no LAN -> straight to localStorage
  });

  it('seeds when localStorage is empty and returns a STABLE snapshot ref', () => {
    const store = createFleetStore();
    const a = store.getSnapshot();
    const b = store.getSnapshot();
    expect(a).toBe(b); // cached reference (critical for useSyncExternalStore)
    expect(a).toHaveLength(seed().length);
    expect(a).toEqual(seed());
  });

  it('falls back to seed on a corrupt localStorage payload', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{');
    const store = createFleetStore();
    expect(store.getSnapshot()).toEqual(seed());
  });

  it('loads a valid localStorage payload', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SERVER_LIST));
    const store = createFleetStore();
    expect(store.getSnapshot()).toEqual(SERVER_LIST);
  });

  it('a mutation notifies, produces a NEW ref, and updates synchronously', () => {
    const store = createFleetStore();
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    store.add();
    expect(listener).toHaveBeenCalledTimes(1);
    const after = store.getSnapshot();
    expect(after).not.toBe(before); // new reference
    expect(after).toHaveLength(before.length + 1);
  });

  it('update edits the right field; remove drops the row', () => {
    const store = createFleetStore();
    const id = store.getSnapshot()[0].id;

    store.update(id, 'pct', 150); // clamps
    expect(store.getSnapshot()[0].pct).toBe(100);

    store.update(id, 'registration', 'RENAMED');
    expect(store.getSnapshot()[0].registration).toBe('RENAMED');

    store.update(id, 'workOrder', 'WO-9');
    expect(store.getSnapshot()[0].workOrder).toBe('WO-9');

    store.update(id, 'description', 'a longer free-written note');
    expect(store.getSnapshot()[0].description).toBe('a longer free-written note');

    store.update(id, 'tech', 'j.z.'); // letters only, upper-cased
    expect(store.getSnapshot()[0].tech).toBe('JZ');

    store.update(id, 'system', 'full');
    expect(store.getSnapshot()[0].system).toBe('full');

    const len = store.getSnapshot().length;
    store.remove(id);
    expect(store.getSnapshot()).toHaveLength(len - 1);
    expect(store.getSnapshot().some((a) => a.id === id)).toBe(false);
  });

  it('debounces persistence and coalesces rapid edits into one write', () => {
    const store = createFleetStore();
    const id = store.getSnapshot()[0].id;
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');

    vi.useFakeTimers();
    store.update(id, 'pct', 10);
    store.update(id, 'pct', 20);
    store.update(id, 'pct', 30);
    expect(setSpy).not.toHaveBeenCalled(); // still debouncing

    vi.advanceTimersByTime(120);
    expect(setSpy).toHaveBeenCalledTimes(1); // coalesced into one write
    const written = JSON.parse(setSpy.mock.calls[0][1] as string) as Airframe[];
    expect(written[0].pct).toBe(30); // last value wins
  });

  it('a storage event updates memory only and never re-persists', () => {
    const store = createFleetStore();
    const before = store.getSnapshot();
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');

    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(SERVER_LIST) }),
    );

    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot()).toEqual(SERVER_LIST);
    expect(setSpy).not.toHaveBeenCalled(); // echo must not write back
  });

  it('ignores storage events for unrelated keys', () => {
    const store = createFleetStore();
    const before = store.getSnapshot();
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'something.else', newValue: '[]' }),
    );
    expect(store.getSnapshot()).toBe(before);
  });
});

describe('createFleetStore — LAN mode (server reachable)', () => {
  it('GET populates from the server and opens the SSE stream', async () => {
    vi.stubGlobal('fetch', okFetch(SERVER_LIST));
    vi.stubGlobal('EventSource', MockEventSource);

    const store = createFleetStore();
    await flushMicro();

    expect(store.getSnapshot()).toEqual(SERVER_LIST);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/stream');

    // snapshot is still a stable reference between reads
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('an SSE message replaces the snapshot with a NEW ref and notifies', async () => {
    vi.stubGlobal('fetch', okFetch(SERVER_LIST));
    vi.stubGlobal('EventSource', MockEventSource);

    const store = createFleetStore();
    await flushMicro();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();

    const pushed: Airframe[] = [
      { id: 'z1', workOrder: 'WO-Z', registration: 'PUSHED', description: 'C', system: '2', tech: '', pct: 5, eta: 'x', flag: 'at-risk' },
    ];
    MockEventSource.instances[0].emit(pushed);

    expect(listener).toHaveBeenCalled();
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot()).toEqual(pushed);
  });

  it('a corrupt SSE payload is ignored (snapshot unchanged)', async () => {
    vi.stubGlobal('fetch', okFetch(SERVER_LIST));
    vi.stubGlobal('EventSource', MockEventSource);

    const store = createFleetStore();
    await flushMicro();
    const before = store.getSnapshot();

    MockEventSource.instances[0].onmessage?.({ data: 'definitely-not-json' });
    expect(store.getSnapshot()).toBe(before);
  });

  it('mutations PUT the full list to the server, debounced into one request', async () => {
    const fetchMock = okFetch(SERVER_LIST);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', MockEventSource);

    vi.useFakeTimers();
    const store = createFleetStore();
    await flushMicro(); // resolve GET, switch to LAN mode, open stream
    expect(fetchMock).toHaveBeenCalledTimes(1); // GET only so far

    const id = store.getSnapshot()[0].id;
    store.update(id, 'pct', 42);
    store.update(id, 'pct', 43);
    expect(fetchMock).toHaveBeenCalledTimes(1); // PUT still debouncing

    vi.advanceTimersByTime(120);
    expect(fetchMock).toHaveBeenCalledTimes(2); // exactly one PUT

    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit | undefined];
    expect(url).toBe('/api/fleet');
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(init?.body as string) as Airframe[];
    expect(body[0].pct).toBe(43);
  });

  it('falls back to localStorage seed when the server returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)),
    );
    const store = createFleetStore();
    await flushMicro();
    expect(store.getSnapshot()).toEqual(seed());
  });
});
