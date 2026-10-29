// Tests for the manuals search API. Zero deps: node:test + node:assert, run with
//   npm run test:server        (== node --test server/)
// Pure helpers are tested directly; the HTTP surface is tested against a tiny
// index built here with node:sqlite, using the same schema as
// tools/index_manuals.py (keep the two in step if the schema ever changes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMatch, tokenize, parseRange, parseIds, intParam, createManualsApi } from './manuals.mjs';

// --- pure helpers ---------------------------------------------------------------

test('buildMatch: plain words are ANDed and quoted', () => {
  assert.equal(buildMatch('bonding resistance'), '"bonding" AND "resistance"');
});

test('buildMatch: phrases, prefixes and OR groups', () => {
  assert.equal(buildMatch('"bonding jumper"'), '"bonding jumper"');
  assert.equal(buildMatch('resist*'), '"resist"*');
  assert.equal(buildMatch('"flux val"*'), '"flux val"*');
  // AND binds tighter than OR in FTS5, so the OR pair must be parenthesized.
  assert.equal(buildMatch('VHF OR HF coupler'), '("VHF" OR "HF") AND "coupler"');
  assert.equal(buildMatch('a OR b OR c'), '("a" OR "b" OR "c")');
});

test('buildMatch: part numbers / ATA refs stay literal, never FTS syntax', () => {
  assert.equal(buildMatch('34-20-00'), '"34-20-00"');
  assert.equal(buildMatch('M39029/58-360'), '"M39029/58-360"');
  assert.equal(buildMatch('NEAR(a b) col:x ^start'), '"NEAR(a" AND "b)" AND "col:x" AND "^start"');
  assert.equal(buildMatch('say "hi'), '"say" AND "hi"'); // unbalanced quote
});

test('buildMatch: nothing searchable -> null', () => {
  assert.equal(buildMatch(''), null);
  assert.equal(buildMatch('   '), null);
  assert.equal(buildMatch('&& -- ""'), null);
  assert.equal(buildMatch('OR'), null);
  assert.equal(buildMatch(undefined), null);
});

test('buildMatch: leading/trailing OR is ignored', () => {
  assert.equal(buildMatch('OR vhf'), '"vhf"');
  assert.equal(buildMatch('vhf OR'), '"vhf"');
});

test('buildMatch broaden: 3+ char terms become prefixes', () => {
  assert.equal(buildMatch('transcei at', { broaden: true }), '"transcei"* AND "at"');
});

test('tokenize caps very long input', () => {
  const words = tokenize('x'.repeat(10_000));
  assert.equal(words.length, 1);
  assert.equal(words[0].text.length, 200);
});

test('parseRange', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=0-5000', 1000), { start: 0, end: 999 });
  assert.equal(parseRange('bytes=1000-', 1000), 'unsatisfiable');
  assert.equal(parseRange('bytes=5-2', 1000), 'unsatisfiable');
  assert.equal(parseRange('bytes=0-1,5-6', 1000), null); // multi-range: serve whole file
  assert.equal(parseRange(undefined, 1000), null);
});

test('parseIds / intParam', () => {
  assert.deepEqual(parseIds('3,7,x,7,-1,0'), [3, 7]);
  assert.deepEqual(parseIds(null), []);
  assert.equal(intParam('50', 25, 1, 100), 50);
  assert.equal(intParam('500', 25, 1, 100), 100);
  assert.equal(intParam('abc', 25, 1, 100), 25);
});

// --- HTTP surface against a real (tiny) index -------------------------------------

const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE manuals (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  revision TEXT NOT NULL DEFAULT '', rev_date TEXT NOT NULL DEFAULT '', pages INTEGER NOT NULL,
  empty_pages INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL, mtime REAL NOT NULL,
  sha1 TEXT NOT NULL, indexed_at TEXT NOT NULL);
CREATE TABLE pages (id INTEGER PRIMARY KEY, manual_id INTEGER NOT NULL, page INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '', ata TEXT NOT NULL DEFAULT '', section TEXT NOT NULL DEFAULT '', body TEXT NOT NULL);
CREATE VIRTUAL TABLE pages_fts USING fts5(body, section, ata, content='pages', content_rowid='id', tokenize='porter unicode61');
CREATE TRIGGER pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(rowid, body, section, ata) VALUES (new.id, new.body, new.section, new.ata);
END;`;

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'manuals-'));
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(dir, 'manuals.db'));
  db.exec(SCHEMA);
  db.exec("INSERT INTO meta VALUES ('indexed_at', '2026-10-29T00:00:00Z')");
  const pdf = Buffer.from('%PDF-1.4\n' + 'x'.repeat(500) + '\n%%EOF\n');
  writeFileSync(join(dir, 'amm.pdf'), pdf);
  db.prepare('INSERT INTO manuals VALUES (1, ?, ?, ?, ?, 2, 0, ?, 0, ?, ?)').run(
    'amm.pdf', 'Test AMM', '45', '', pdf.length, 'a'.repeat(40), 'now');
  db.prepare('INSERT INTO manuals VALUES (2, ?, ?, ?, ?, 1, 0, 1, 0, ?, ?)').run(
    '../escape.pdf', 'Evil', '', '', 'b'.repeat(40), 'now');
  const ins = db.prepare('INSERT INTO pages (manual_id, page, ata, section, body) VALUES (?, ?, ?, ?, ?)');
  ins.run(1, 1, '23-10-00', '23 Comms › 23-10 VHF', 'Remove the VHF transceiver from the tray.');
  ins.run(1, 2, '23-10-00', '23 Comms › 23-10 VHF', 'The bonding resistance must not exceed 2.5 milliohms.');
  db.close();

  const api = createManualsApi({ dir });
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    api.handle(req, res, decodeURIComponent(url.pathname), url);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    api.close();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('library, search, broaden, PDF ranges, traversal guard', async () => {
  await withServer(async (base) => {
    const lib = await (await fetch(`${base}/api/manuals`)).json();
    assert.equal(lib.available, true);
    assert.equal(lib.manuals.length, 2);
    assert.equal(lib.totalPages, 3);

    const s = await (await fetch(`${base}/api/manuals/search?q=bonding%20resistance`)).json();
    assert.equal(s.total, 1);
    assert.equal(s.hits[0].page, 2);
    assert.equal(s.hits[0].ata, '23-10-00');
    assert.match(s.hits[0].snippet, /\u0002bonding\u0003 \u0002resistance\u0003/);
    assert.match(s.hits[0].url, /^\/api\/manuals\/pdf\/1\/amm\.pdf\?v=aaaaaaaa#page=2$/);

    // Porter stemming: "resistances" finds "resistance".
    assert.equal((await (await fetch(`${base}/api/manuals/search?q=resistances`)).json()).total, 1);

    // No exact hit -> automatic prefix retry.
    const b = await (await fetch(`${base}/api/manuals/search?q=transcei`)).json();
    assert.equal(b.broadened, true);
    assert.equal(b.total, 1);

    // Section text is searchable (and ranked).
    assert.equal((await (await fetch(`${base}/api/manuals/search?q=VHF`)).json()).total, 2);

    // Manual filter.
    assert.equal((await (await fetch(`${base}/api/manuals/search?q=VHF&m=2`)).json()).total, 0);

    // Empty query -> 400.
    assert.equal((await fetch(`${base}/api/manuals/search?q=%20`)).status, 400);

    // PDF: full, ranged, revalidated.
    const full = await fetch(`${base}/api/manuals/pdf/1/amm.pdf`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'application/pdf');
    const etag = full.headers.get('etag');
    await full.arrayBuffer();
    const part = await fetch(`${base}/api/manuals/pdf/1/amm.pdf`, { headers: { Range: 'bytes=0-7' } });
    assert.equal(part.status, 206);
    assert.equal(await part.text(), '%PDF-1.4');
    assert.equal((await fetch(`${base}/api/manuals/pdf/1/amm.pdf`, { headers: { 'If-None-Match': etag } })).status, 304);

    // A path that climbs out of the folder is refused even if it is in the index.
    assert.equal((await fetch(`${base}/api/manuals/pdf/2/escape.pdf`)).status, 404);
    assert.equal((await fetch(`${base}/api/manuals/pdf/99/x.pdf`)).status, 404);
  });
});

test('no index yet -> available:false with instructions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'manuals-empty-'));
  const api = createManualsApi({ dir });
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    api.handle(req, res, url.pathname, url);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const lib = await (await fetch(`http://127.0.0.1:${server.address().port}/api/manuals`)).json();
    assert.equal(lib.available, false);
    assert.match(lib.reason, /index_manuals\.py/);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
