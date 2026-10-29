import { describe, it, expect } from 'vitest';
import {
  parseLibrary,
  parseSearch,
  splitSnippet,
  queryFromHash,
  hashForQuery,
  pageText,
  count,
} from './manuals';

describe('splitSnippet', () => {
  it('splits highlight markers into hit / plain runs', () => {
    expect(splitSnippet('…the \u0002bonding\u0003 \u0002resistance\u0003 must…')).toEqual([
      { text: '…the ', hit: false },
      { text: 'bonding', hit: true },
      { text: ' ', hit: false },
      { text: 'resistance', hit: true },
      { text: ' must…', hit: false },
    ]);
  });

  it('handles no markers, empty input and markup-looking text as plain text', () => {
    expect(splitSnippet('plain')).toEqual([{ text: 'plain', hit: false }]);
    expect(splitSnippet('')).toEqual([]);
    expect(splitSnippet('<b>x</b>')).toEqual([{ text: '<b>x</b>', hit: false }]);
  });
});

describe('deep-link hash', () => {
  it('round-trips a query through the hash', () => {
    const h = hashForQuery('  "bonding jumper" 34-20 ');
    expect(h).toBe('manuals/%22bonding%20jumper%22%2034-20');
    expect(queryFromHash('#' + h)).toBe('"bonding jumper" 34-20');
  });

  it('empty query -> bare #manuals; non-manuals hashes -> no query', () => {
    expect(hashForQuery('   ')).toBe('manuals');
    expect(queryFromHash('#manuals')).toBe('');
    expect(queryFromHash('#admin')).toBe('');
    expect(queryFromHash('#manuals/%E0%A4%A')).toBe(''); // malformed escape
  });
});

describe('parseLibrary', () => {
  it('keeps well-formed manuals and drops junk', () => {
    const lib = parseLibrary({
      available: true,
      totalPages: 23,
      indexedAt: '2026-10-29T00:00:00Z',
      manuals: [
        { id: 2, title: 'S-92A AMM Ch 23', revision: '45', pages: 13, file: 'S-92/a.pdf', url: '/api/manuals/pdf/2/a.pdf' },
        { id: 0, url: '/x' },
        { id: 5 },
        null,
        { id: 3, file: 'b.pdf', url: '/api/manuals/pdf/3/b.pdf', pages: 10 },
      ],
    });
    expect(lib?.available).toBe(true);
    expect(lib?.manuals.map((m) => m.id)).toEqual([2, 3]);
    expect(lib?.manuals[1].title).toBe('b.pdf'); // falls back to the file name
  });

  it('unavailable index carries the reason', () => {
    const lib = parseLibrary({ available: false, reason: 'No index yet', manuals: [] });
    expect(lib).toMatchObject({ available: false, reason: 'No index yet', manuals: [] });
    expect(parseLibrary([])).toBeNull();
    expect(parseLibrary('x')).toBeNull();
  });
});

describe('parseSearch', () => {
  it('guards hits and counts', () => {
    const r = parseSearch({
      broadened: true,
      total: 2,
      ms: 1.4,
      perManual: [{ id: 1, n: 2 }, { id: 'x', n: 3 }],
      hits: [
        { manualId: 1, title: 'T', page: 4, snippet: 's', url: '/api/manuals/pdf/1/t.pdf#page=4' },
        { manualId: 1, page: 0, url: '/x' },
        { manualId: 1, page: 5 },
      ],
    });
    expect(r?.broadened).toBe(true);
    expect(r?.hits).toHaveLength(1);
    expect(r?.hits[0]).toMatchObject({ page: 4, label: '', ata: '' });
    expect(r?.perManual).toEqual([{ id: 1, n: 2 }]);
    expect(parseSearch({ total: 1 })).toBeNull();
  });
});

describe('display helpers', () => {
  it('pageText prefers a printed label that differs from the page number', () => {
    expect(pageText({ page: 12, label: '' })).toBe('12');
    expect(pageText({ page: 12, label: '12' })).toBe('12');
    expect(pageText({ page: 12, label: 'iv' })).toBe('iv');
  });

  it('count pluralises and groups thousands', () => {
    expect(count(1, 'PAGE')).toBe('1 PAGE');
    expect(count(31204, 'PAGE')).toBe('31,204 PAGES');
    expect(count(0, 'MANUAL')).toBe('0 MANUALS');
  });
});
