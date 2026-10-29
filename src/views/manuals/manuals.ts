// Manuals search — client half. The server (server/manuals.mjs) owns the index,
// the query parsing and the ranking; this module is the thin typed edge: shape
// guards for its JSON, the snippet-highlight splitter, the #manuals/<query> deep
// link, and two fetch calls that THROW on failure (a thrown error is the
// "server unreachable" signal the view renders, same idiom as tickets.ts).
//
// Deliberately no localStorage fallback: without the server there are no PDFs.

export interface ManualInfo {
  id: number;
  title: string;
  revision: string;
  revDate: string;
  pages: number;
  emptyPages: number; // pages with no extractable text (scans) — not searchable
  file: string;
  url: string; // e.g. /api/manuals/pdf/3/AMM.pdf?v=ab12cd34
}

export interface Library {
  available: boolean;
  reason: string; // why search is unavailable (no index yet, old Node, …)
  manuals: ManualInfo[];
  totalPages: number;
  indexedAt: string;
}

export interface Hit {
  manualId: number;
  title: string;
  revision: string;
  page: number; // 1-based physical page — what #page=N opens
  label: string; // printed page label when the PDF defines one
  ata: string;
  section: string;
  snippet: string; // \u0002…\u0003 wrap the matched words
  url: string; // PDF link already ending in #page=N
}

export interface SearchResult {
  broadened: boolean; // exact search found nothing; these are prefix matches
  total: number;
  perManual: { id: number; n: number }[];
  hits: Hit[];
  offset: number;
  ms: number;
}

export const PAGE_SIZE = 25;
const HL_OPEN = '\u0002';
const HL_CLOSE = '\u0003';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Shape-guard GET /api/manuals. Null when the body isn't an object at all. */
export function parseLibrary(value: unknown): Library | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const manuals: ManualInfo[] = [];
  if (Array.isArray(v.manuals)) {
    for (const item of v.manuals) {
      if (item == null || typeof item !== 'object') continue;
      const m = item as Record<string, unknown>;
      const id = num(m.id);
      const url = str(m.url);
      if (!id || !url) continue;
      manuals.push({
        id,
        title: str(m.title) || str(m.file) || `Manual ${id}`,
        revision: str(m.revision),
        revDate: str(m.revDate),
        pages: num(m.pages),
        emptyPages: num(m.emptyPages),
        file: str(m.file),
        url,
      });
    }
  }
  return {
    available: v.available === true,
    reason: str(v.reason),
    manuals,
    totalPages: num(v.totalPages),
    indexedAt: str(v.indexedAt),
  };
}

/** Shape-guard GET /api/manuals/search. Hits without a page or url are dropped. */
export function parseSearch(value: unknown): SearchResult | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.hits)) return null;
  const hits: Hit[] = [];
  for (const item of v.hits) {
    if (item == null || typeof item !== 'object') continue;
    const h = item as Record<string, unknown>;
    const page = num(h.page);
    const url = str(h.url);
    if (!page || !url) continue;
    hits.push({
      manualId: num(h.manualId),
      title: str(h.title),
      revision: str(h.revision),
      page,
      label: str(h.label),
      ata: str(h.ata),
      section: str(h.section),
      snippet: str(h.snippet),
      url,
    });
  }
  const perManual: { id: number; n: number }[] = [];
  if (Array.isArray(v.perManual)) {
    for (const c of v.perManual) {
      if (c && typeof c === 'object') {
        const id = num((c as Record<string, unknown>).id);
        const n = num((c as Record<string, unknown>).n);
        if (id && n) perManual.push({ id, n });
      }
    }
  }
  return {
    broadened: v.broadened === true,
    total: num(v.total),
    perManual,
    hits,
    offset: num(v.offset),
    ms: num(v.ms),
  };
}

export interface Seg {
  text: string;
  hit: boolean;
}

/** Split a server snippet into plain / highlighted runs (rendered as text, never HTML). */
export function splitSnippet(s: string): Seg[] {
  const out: Seg[] = [];
  let hit = false;
  let buf = '';
  for (const ch of s) {
    if (ch === HL_OPEN || ch === HL_CLOSE) {
      if (buf) out.push({ text: buf, hit });
      buf = '';
      hit = ch === HL_OPEN;
      continue;
    }
    buf += ch;
  }
  if (buf) out.push({ text: buf, hit });
  return out;
}

/** '#manuals/bonding%20resistance' -> 'bonding resistance'; anything else -> ''. */
export function queryFromHash(hash: string): string {
  const h = hash.replace(/^#/, '').replace(/^\//, '');
  if (!h.startsWith('manuals/')) return '';
  try {
    return decodeURIComponent(h.slice('manuals/'.length));
  } catch {
    return '';
  }
}

/** The hash that deep-links to a search: 'manuals' or 'manuals/<encoded query>'. */
export function hashForQuery(q: string): string {
  const t = q.trim();
  return t ? `manuals/${encodeURIComponent(t)}` : 'manuals';
}

/** Page column text: printed label when the PDF has one that differs, else the page number. */
export function pageText(hit: Pick<Hit, 'page' | 'label'>): string {
  return hit.label && hit.label !== String(hit.page) ? hit.label : String(hit.page);
}

/** 1 -> '1 PAGE', 1234 -> '1,234 PAGES'. */
export function count(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 'S'}`;
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body && typeof body === 'object' ? str((body as Record<string, unknown>).error) : '';
    throw new Error(msg || `request failed: ${res.status}`);
  }
  return body;
}

/** GET the library. Rejects when the server is unreachable. */
export async function fetchLibrary(signal?: AbortSignal): Promise<Library> {
  const lib = parseLibrary(await getJson('/api/manuals', signal));
  if (!lib) throw new Error('library response was not an object');
  return lib;
}

/** Search; `manualId` null = all manuals. Rejects on any failure (incl. abort). */
export async function searchManuals(
  q: string,
  manualId: number | null,
  offset: number,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const p = new URLSearchParams({ q, offset: String(offset), limit: String(PAGE_SIZE) });
  if (manualId != null) p.set('m', String(manualId));
  const r = parseSearch(await getJson(`/api/manuals/search?${p.toString()}`, signal));
  if (!r) throw new Error('search response was malformed');
  return r;
}
