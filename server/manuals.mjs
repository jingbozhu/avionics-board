// Manuals search — the server half of the #manuals screen.
//
// Still zero npm dependencies: the index is a SQLite file built offline by
// tools/index_manuals.py, and we read it with Node's BUILT-IN SQLite
// (`node:sqlite`, Node 22.13+ / 23.4+ without a flag). It is imported lazily,
// so on an older Node — or before any index exists — the fleet board runs
// exactly as before and /api/manuals just reports why search is unavailable.
//
//   GET /api/manuals                       -> library: {available, reason?, manuals[], totalPages, indexedAt}
//   GET /api/manuals/search?q=&m=&offset=  -> ranked page hits with highlighted snippets
//   GET /api/manuals/pdf/<id>/<name>.pdf   -> the PDF itself (Range-capable, so the
//                                             browser's viewer can jump to #page=N
//                                             without downloading the whole file)
//
// The PDFs and manuals.db live in MANUALS_DIR (default: <project>/manuals,
// gitignored). The DB is opened read-only and re-opened automatically when the
// indexer rewrites or replaces it, so re-indexing never needs a server restart.
import { statSync, createReadStream } from 'node:fs';

const DB_NAME = 'manuals.db';
const MAX_Q = 200; // characters of query text we look at
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_OFFSET = 5000;
const SNIPPET_TOKENS = 22;
// Snippet highlight markers: control chars that never occur in extracted text,
// so the client can split on them and render <mark> without touching HTML.
const HL_OPEN = '\u0002';
const HL_CLOSE = '\u0003';
// bm25 column weights: body, section (bookmark path), ata. A hit in the
// chapter/section title counts double — "VHF" ranks pages in the VHF section first.
const RANK = 'bm25(pages_fts, 1.0, 2.0, 2.0)';

// --- query parsing (pure; unit-tested in manuals.test.mjs) --------------------

const hasWord = (s) => /[\p{L}\p{N}]/u.test(s);

/**
 * Split raw search-box text into terms. Supports what a tech would actually type:
 *   bonding resistance        -> both words, any order (AND)
 *   "bonding jumper"          -> exact phrase
 *   resist*                   -> prefix
 *   VHF OR UHF                -> either
 * Everything else (hyphens, slashes, colons in part numbers / ATA refs) is
 * treated as literal text, never as FTS5 syntax.
 */
export function tokenize(q) {
  const s = String(q ?? '').slice(0, MAX_Q);
  const out = [];
  const re = /"([^"]*)"(\*)?|(\S+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) {
      const text = m[1].trim();
      if (hasWord(text)) out.push({ text, prefix: Boolean(m[2]) });
      continue;
    }
    let w = m[3];
    if (w === 'OR') {
      out.push({ or: true });
      continue;
    }
    let prefix = false;
    if (/\*+$/.test(w)) {
      prefix = true;
      w = w.replace(/\*+$/, '');
    }
    w = w.replace(/"/g, ''); // a stray unbalanced quote
    if (hasWord(w)) out.push({ text: w, prefix });
  }
  return out;
}

/**
 * Build a safe FTS5 MATCH expression, or null when there is nothing to search.
 * Every term is emitted as a quoted FTS5 string, so user text can never be
 * parsed as an operator. `broaden` turns every term of 3+ chars into a prefix
 * (used automatically when the exact search finds nothing).
 */
export function buildMatch(q, { broaden = false } = {}) {
  const groups = []; // each group is an OR-list of literals; groups are ANDed
  let joinNext = false;
  for (const t of tokenize(q)) {
    if (t.or) {
      if (groups.length) joinNext = true;
      continue;
    }
    const star = t.prefix || (broaden && t.text.length >= 3) ? '*' : '';
    const lit = `"${t.text.replace(/"/g, '""')}"${star}`;
    if (joinNext) groups[groups.length - 1].push(lit);
    else groups.push([lit]);
    joinNext = false;
  }
  if (!groups.length) return null;
  // FTS5 binds AND tighter than OR, so OR-groups need their own parentheses.
  return groups.map((g) => (g.length > 1 ? `(${g.join(' OR ')})` : g[0])).join(' AND ');
}

/** Clamp an integer query param. */
export function intParam(v, def, min, max) {
  const n = Number.parseInt(v ?? '', 10);
  if (!Number.isFinite(n)) return def;
  return n < min ? min : n > max ? max : n;
}

/** "3,7,x,7" -> [3, 7] (positive ints, de-duplicated, max 64). */
export function parseIds(v) {
  if (!v) return [];
  const out = [];
  for (const part of String(v).split(',')) {
    const n = Number.parseInt(part, 10);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= 64) break;
  }
  return out;
}

/** Parse a single-range `Range: bytes=a-b` header against a file size. */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    // suffix range: last N bytes
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(size - n, 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

// --- HTTP helpers (local copies; index.mjs keeps its own) ---------------------

function json(res, status, obj, method) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store, must-revalidate',
  });
  if (method === 'HEAD') res.end();
  else res.end(buf);
}

/** RFC 6266 filename for Content-Disposition: ASCII fallback + UTF-8 form. */
function dispositionName(path) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// --- the API ------------------------------------------------------------------

/**
 * @param {{ dir: string }} opts  dir = folder holding the PDFs + manuals.db
 */
export function createManualsApi({ dir }) {
  const dbFile = dir + '/' + DB_NAME;
  let sqlite = null; // the node:sqlite module, once loaded
  let sqliteError = '';
  const ready = import('node:sqlite').then(
    (mod) => {
      sqlite = mod;
    },
    () => {
      sqliteError =
        `This Node.js (${process.version}) has no built-in SQLite. ` +
        'Manual search needs Node 22.13+ (or 23.4+) — the board itself runs fine without it.';
    },
  );

  let db = null;
  let dbStamp = '';
  let stmts = null;

  /** Open (or re-open after the indexer replaced the file) the DB; null if none. */
  function getDb() {
    let st;
    try {
      st = statSync(dbFile);
    } catch {
      closeDb();
      return null;
    }
    const stamp = `${st.ino}:${st.mtimeMs}:${st.size}`;
    if (db && stamp === dbStamp) return db;
    closeDb();
    db = new sqlite.DatabaseSync(dbFile, { readOnly: true });
    db.exec('PRAGMA query_only = 1');
    dbStamp = stamp;
    stmts = prepare(db);
    return db;
  }

  function closeDb() {
    if (db) {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
    db = null;
    stmts = null;
    dbStamp = '';
  }

  function prepare(d) {
    // Manual filter: '[]' = all manuals, else a JSON array of ids (json_each keeps
    // this one prepared statement for any number of ids).
    const filter = `(? = '[]' OR p.manual_id IN (SELECT value FROM json_each(?)))`;
    return {
      library: d.prepare(
        'SELECT id, path, title, revision, rev_date AS revDate, pages, empty_pages AS emptyPages, sha1 FROM manuals ORDER BY title COLLATE NOCASE, path',
      ),
      indexedAt: d.prepare("SELECT value FROM meta WHERE key = 'indexed_at'"),
      perManual: d.prepare(
        `SELECT p.manual_id AS id, count(*) AS n FROM pages_fts JOIN pages p ON p.id = pages_fts.rowid
         WHERE pages_fts MATCH ? GROUP BY p.manual_id ORDER BY n DESC`,
      ),
      hits: d.prepare(
        `SELECT p.manual_id AS manualId, m.title AS title, m.revision AS revision, m.sha1 AS sha1, m.path AS path,
                p.page AS page, p.label AS label, p.ata AS ata, p.section AS section,
                snippet(pages_fts, 0, '${HL_OPEN}', '${HL_CLOSE}', '…', ${SNIPPET_TOKENS}) AS snippet
         FROM pages_fts JOIN pages p ON p.id = pages_fts.rowid JOIN manuals m ON m.id = p.manual_id
         WHERE pages_fts MATCH ? AND ${filter}
         ORDER BY ${RANK} LIMIT ? OFFSET ?`,
      ),
      manual: d.prepare('SELECT path, sha1, mtime FROM manuals WHERE id = ?'),
    };
  }

  /** Common gate: returns the open DB, or answers the request and returns null. */
  function requireDb(res, method) {
    if (!sqlite) {
      json(res, 200, { available: false, reason: sqliteError || 'starting up', manuals: [] }, method);
      return null;
    }
    let d;
    try {
      d = getDb();
    } catch (err) {
      json(res, 200, { available: false, reason: `Index unreadable: ${err.message}`, manuals: [] }, method);
      return null;
    }
    if (!d) {
      json(
        res,
        200,
        {
          available: false,
          reason: `No index yet. Put the PDFs in ${dir} and run: python3 tools/index_manuals.py`,
          manuals: [],
        },
        method,
      );
      return null;
    }
    return d;
  }

  function pdfUrl(id, path) {
    return `/api/manuals/pdf/${id}/${encodeURIComponent(path.slice(path.lastIndexOf('/') + 1))}`;
  }

  function handleLibrary(req, res) {
    if (!requireDb(res, req.method)) return;
    const manuals = stmts.library.all().map((m) => ({
      id: m.id,
      title: m.title,
      revision: m.revision,
      revDate: m.revDate,
      pages: m.pages,
      emptyPages: m.emptyPages,
      file: m.path,
      url: `${pdfUrl(m.id, m.path)}?v=${m.sha1.slice(0, 8)}`,
    }));
    const totalPages = manuals.reduce((s, m) => s + m.pages, 0);
    const indexedAt = stmts.indexedAt.get()?.value ?? '';
    json(res, 200, { available: true, manuals, totalPages, indexedAt }, req.method);
  }

  function runSearch(match, ids, limit, offset) {
    const counts = stmts.perManual.all(match);
    const idsJson = JSON.stringify(ids);
    const inFilter = (id) => ids.length === 0 || ids.includes(id);
    const total = counts.reduce((s, c) => s + (inFilter(c.id) ? c.n : 0), 0);
    const hits =
      total === 0
        ? []
        : stmts.hits.all(match, idsJson, idsJson, limit, offset).map((h) => ({
            manualId: h.manualId,
            title: h.title,
            revision: h.revision,
            page: h.page,
            label: h.label,
            ata: h.ata,
            section: h.section,
            snippet: h.snippet,
            url: `${pdfUrl(h.manualId, h.path)}?v=${h.sha1.slice(0, 8)}#page=${h.page}`,
          }));
    return { counts, total, hits };
  }

  function handleSearch(req, res, params) {
    if (!requireDb(res, req.method)) return;
    const q = String(params.get('q') ?? '');
    const match = buildMatch(q);
    if (!match) {
      json(res, 400, { error: 'type something to search for' }, req.method);
      return;
    }
    const ids = parseIds(params.get('m'));
    const limit = intParam(params.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = intParam(params.get('offset'), 0, 0, MAX_OFFSET);
    const t0 = performance.now();
    try {
      let used = match;
      let broadened = false;
      let r = runSearch(match, ids, limit, offset);
      // Nothing exact (and this is the first page)? Retry with every term as a
      // prefix, so "resist" finds "resistor", "P/N 622-51" finds 622-5132-101.
      if (r.counts.length === 0 && offset === 0) {
        const wide = buildMatch(q, { broaden: true });
        if (wide && wide !== match) {
          const r2 = runSearch(wide, ids, limit, offset);
          if (r2.counts.length) {
            r = r2;
            used = wide;
            broadened = true;
          }
        }
      }
      json(
        res,
        200,
        {
          q,
          match: used,
          broadened,
          total: r.total,
          perManual: r.counts,
          hits: r.hits,
          offset,
          limit,
          ms: Math.round((performance.now() - t0) * 10) / 10,
        },
        req.method,
      );
    } catch (err) {
      // buildMatch quotes everything, so this is a corrupt/foreign DB, not user input.
      console.error('[avionics] manuals search failed:', err.message);
      json(res, 500, { error: 'search failed — try re-running the indexer' }, req.method);
    }
  }

  function handlePdf(req, res, id) {
    if (!sqlite) {
      json(res, 503, { error: sqliteError || 'starting up' }, req.method);
      return;
    }
    let row;
    try {
      row = getDb() ? stmts.manual.get(id) : undefined;
    } catch {
      row = undefined;
    }
    // Paths come from our own index, but never trust a path to stay inside dir.
    if (!row || row.path.split('/').some((s) => s === '..' || s === '') || /^[\\/]|^[a-z]:/i.test(row.path)) {
      json(res, 404, { error: 'no such manual' }, req.method);
      return;
    }
    const file = dir + '/' + row.path;
    let st;
    try {
      st = statSync(file);
    } catch {
      json(res, 404, { error: 'PDF missing on disk — re-run the indexer' }, req.method);
      return;
    }
    const etag = `"${row.sha1}-${st.size}"`;
    const base = {
      'Content-Type': 'application/pdf',
      'Accept-Ranges': 'bytes',
      ETag: etag,
      'Last-Modified': st.mtime.toUTCString(),
      // Revalidate every time (cheap 304) so a new revision is never hidden by cache.
      'Cache-Control': 'no-cache',
      'Content-Disposition': dispositionName(row.path),
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, base);
      res.end();
      return;
    }
    const ifRange = req.headers['if-range'];
    const range = !ifRange || ifRange === etag ? parseRange(req.headers.range, st.size) : null;
    if (range === 'unsatisfiable') {
      res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` });
      res.end();
      return;
    }
    const start = range ? range.start : 0;
    const end = range ? range.end : st.size - 1;
    const headers = { ...base, 'Content-Length': st.size === 0 ? 0 : end - start + 1 };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD' || st.size === 0) {
      res.end();
      return;
    }
    const stream = createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }

  /** Route a /api/manuals* request. `url` is the parsed URL; `pathname` is decoded. */
  async function handle(req, res, pathname, url) {
    await ready;
    const method = req.method;
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      json(res, 405, { error: 'method not allowed' }, method);
      return;
    }
    if (pathname === '/api/manuals') return handleLibrary(req, res);
    if (pathname === '/api/manuals/search') return handleSearch(req, res, url.searchParams);
    const pdf = /^\/api\/manuals\/pdf\/(\d+)(?:\/|$)/.exec(pathname);
    if (pdf) return handlePdf(req, res, Number(pdf[1]));
    json(res, 404, { error: 'not found' }, method);
  }

  return { handle, close: closeDb };
}
