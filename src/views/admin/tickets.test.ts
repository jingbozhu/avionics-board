import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildCreate,
  parseTickets,
  fetchTickets,
  postTicket,
  TITLE_MAX,
  DETAIL_MAX,
} from './tickets';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildCreate', () => {
  it('trims title and detail', () => {
    expect(buildCreate('bug', '  globe stutters  ', '  on TV 2  ')).toEqual({
      action: 'create',
      kind: 'bug',
      title: 'globe stutters',
      detail: 'on TV 2',
    });
  });

  it('returns null for an empty or whitespace-only title', () => {
    expect(buildCreate('bug', '', 'detail')).toBeNull();
    expect(buildCreate('feature', '   ', 'detail')).toBeNull();
  });

  it('defaults detail to the empty string', () => {
    expect(buildCreate('feature', 'add METAR strip', '')?.detail).toBe('');
  });

  it('caps title and detail at the server limits', () => {
    const body = buildCreate('bug', 'x'.repeat(TITLE_MAX + 50), 'y'.repeat(DETAIL_MAX + 50));
    expect(body?.title).toHaveLength(TITLE_MAX);
    expect(body?.detail).toHaveLength(DETAIL_MAX);
  });

  it('passes kind through untouched', () => {
    expect(buildCreate('feature', 't', '')?.kind).toBe('feature');
    expect(buildCreate('bug', 't', '')?.kind).toBe('bug');
  });
});

const GOOD = {
  id: 'tk-1',
  kind: 'bug',
  title: 'globe stutters',
  detail: 'on TV 2',
  status: 'open',
  createdAt: '2026-08-07T12:00:00.000Z',
};

describe('parseTickets', () => {
  it('returns null for anything that is not an array', () => {
    expect(parseTickets(null)).toBeNull();
    expect(parseTickets(undefined)).toBeNull();
    expect(parseTickets({})).toBeNull();
    expect(parseTickets('[]')).toBeNull();
    expect(parseTickets(7)).toBeNull();
  });

  it('round-trips a valid list untouched', () => {
    expect(parseTickets([GOOD])).toEqual([GOOD]);
  });

  it('drops entries without a usable id or title', () => {
    expect(
      parseTickets([null, 'junk', 42, { ...GOOD, id: '' }, { ...GOOD, title: 7 }, GOOD]),
    ).toEqual([GOOD]);
  });

  it('coerces unknown kind/status and missing detail/createdAt', () => {
    const [t] = parseTickets([{ id: 'tk-2', title: 'x', kind: 'junk', status: 'junk' }])!;
    expect(t).toEqual({
      id: 'tk-2',
      kind: 'bug',
      title: 'x',
      detail: '',
      status: 'open',
      createdAt: '',
    });
  });
});

function okFetch(payload: unknown) {
  return vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) } as Response),
  );
}

describe('fetchTickets / postTicket', () => {
  it('fetchTickets resolves with the parsed list', async () => {
    const f = okFetch([GOOD]);
    vi.stubGlobal('fetch', f);
    await expect(fetchTickets()).resolves.toEqual([GOOD]);
    expect(f).toHaveBeenCalledWith('/api/tickets', undefined);
  });

  it('postTicket sends JSON and resolves with the updated list', async () => {
    const f = okFetch([GOOD]);
    vi.stubGlobal('fetch', f);
    await expect(postTicket({ action: 'close', id: 'tk-1' })).resolves.toEqual([GOOD]);
    expect(f).toHaveBeenCalledWith('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', id: 'tk-1' }),
    });
  });

  it('rejects on a non-ok response (the visible-error contract)', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({}) } as Response),
    );
    await expect(fetchTickets()).rejects.toThrow('400');
  });

  it('rejects on a network failure', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));
    await expect(fetchTickets()).rejects.toThrow();
  });

  it('rejects on an ok-but-not-a-list body', async () => {
    vi.stubGlobal('fetch', okFetch({ error: 'weird' }));
    await expect(fetchTickets()).rejects.toThrow('not a list');
  });
});
