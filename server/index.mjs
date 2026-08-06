// Global Avionics Operations Board — LAN kiosk server.
//
// Zero dependencies on purpose: ONLY node:http + node:fs. This is the single
// process that runs on the Raspberry Pi host; the three display TVs and the
// admin browser all hit it over the LAN. It does two jobs:
//
//   1. Serve the built Preact SPA from dist/ (correct MIME + SPA fallback).
//   2. Own the live fleet state behind a tiny JSON API:
//        GET  /api/fleet   -> current airframe array
//        PUT  /api/fleet   -> replace the array (validated/clamped), persist, broadcast
//        GET  /api/stream  -> text/event-stream: snapshot on connect, push on change,
//                             ~25s heartbeat comment, cleanup on close
//
// State persists to server/fleet-data.json (gitignored). When that file is
// missing it is initialized from the inline 6-item seed below (identical to
// src/model/airframe.ts seed() so LAN mode and the localStorage fallback render
// the same content).
import { createServer } from 'node:http';
import { readFile, readFileSync, writeFileSync, existsSync } from 'node:fs';

// --- paths (no node:path / node:url — keep the import surface to http+fs) -----
const HERE = import.meta.dirname; // .../avionics-board/server
// Separator-agnostic dirname: import.meta.dirname uses backslashes on Windows.
const ROOT = HERE.slice(0, Math.max(HERE.lastIndexOf('/'), HERE.lastIndexOf('\\'))); // .../avionics-board
const DIST = ROOT + '/dist';
const DATA_FILE = HERE + '/fleet-data.json';

const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0'; // bind all interfaces so the LAN TVs can reach it
const HEARTBEAT_MS = 25000;
const MAX_BODY = 1_000_000; // 1 MB cap on PUT bodies

// --- domain rules (mirrors src/model/airframe.ts; inlined, zero deps) ---------
const SYSTEMS = ['1', '2', '3', '4', '5', '6', 'full'];
const FLAGS = ['on-track', 'at-risk', 'complete'];

// Pre-rename system names, so existing stored records survive. Drop once the DB lands.
const LEGACY_SYSTEM = { cockpit: '1', comms: '2', mission: '3', nav: '4', autopilot: '5', radar: '6' };

function seed() {
  return [
    { id: 'p1', workOrder: 'WO-4471', registration: 'N412HL', description: 'Replace VHF-1 transceiver and re-terminate the overhead comms harness; bench-test COM2 before reinstall.', system: '2', tech: 'JZ', pct: 82, eta: 'May 20, 2025', flag: 'on-track' },
    { id: 'p2', workOrder: 'WO-4482', registration: 'N135EC', description: 'Glass cockpit modernization — swap the round-dial panel for dual PFD/MFD units and update the pitot-static plumbing.', system: '1', tech: 'MR', pct: 47, eta: 'Jun 10, 2025', flag: 'on-track' },
    { id: 'p3', workOrder: 'WO-4490', registration: 'N139SR', description: 'Full SAR conversion: mission console, hoist provisions, searchlight, FLIR turret and complete cabin rewire.', system: 'full', tech: 'AL', pct: 95, eta: 'May 16, 2025', flag: 'at-risk' },
    { id: 'p4', workOrder: 'WO-4503', registration: 'N145AM', description: 'Navigation upgrade — new GPS/WAAS receiver and antenna, with a database subscription cutover.', system: '4', tech: 'DK', pct: 24, eta: 'Jun 30, 2025', flag: 'on-track' },
    { id: 'p5', workOrder: 'WO-4511', registration: 'N429BT', description: 'Four-axis autopilot install; rig the servos and fly the acceptance profile once the AFCS is signed off.', system: '5', tech: 'SP', pct: 64, eta: 'May 28, 2025', flag: 'on-track' },
    { id: 'p6', workOrder: 'WO-4519', registration: 'N76WX', description: 'Nose-mounted weather radar retrofit, radome refinish and antenna alignment. Closed out and returned to service.', system: '6', tech: 'TW', pct: 100, eta: 'May 1, 2025', flag: 'complete' },
  ];
}

function clampPct(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

// `name` / `category` are the pre-split field names, mapped forward so a fleet
// stored before the reshape still loads.
function normalizeAirframe(p, idx) {
  const raw = p.system == null ? '' : String(p.system);
  const system = SYSTEMS.includes(raw) ? raw : LEGACY_SYSTEM[raw] || '2';
  const flag = FLAGS.includes(p.flag) ? p.flag : 'on-track';
  const id = typeof p.id === 'string' && p.id ? p.id : `af-${Date.now().toString(36)}-${idx}`;
  const registration = p.registration == null ? p.name : p.registration;
  const description = p.description == null ? p.category : p.description;
  return {
    id,
    workOrder: p.workOrder == null ? '' : String(p.workOrder),
    registration: registration == null ? '—' : String(registration),
    description: description == null ? '' : String(description),
    system,
    // Name initials: letters only, upper-cased, max 4. Mirrors normalizeTech
    // in src/model/airframe.ts — these two MUST stay in lockstep.
    tech:
      p.tech == null ? '' : String(p.tech).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4),
    pct: clampPct(p.pct == null ? 0 : p.pct),
    eta: p.eta == null ? 'TBD' : String(p.eta),
    flag,
  };
}

// Coerce an untrusted value into a clean airframe array. Returns null for
// anything that is not an array at all (caller then 400s or falls back to seed);
// an empty array IS valid (a fleet can legitimately be emptied via the console).
function validateList(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (item && typeof item === 'object') out.push(normalizeAirframe(item, i));
  }
  return out;
}

// --- in-memory state + persistence -------------------------------------------
let fleet = loadFleet();

function loadFleet() {
  if (existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
      const list = validateList(parsed);
      if (list) return list; // [] is valid; only non-array / corrupt falls through
    } catch (err) {
      console.error('[avionics] fleet-data.json unreadable, reseeding:', err.message);
    }
  }
  const s = seed();
  persist(s); // materialize the seed on first run so the file exists
  return s;
}

function persist(list) {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(list, null, 2) + '\n');
  } catch (err) {
    console.error('[avionics] failed to persist fleet:', err.message);
  }
}

// --- SSE clients -------------------------------------------------------------
const clients = new Set();

function broadcast() {
  const payload = `data: ${JSON.stringify(fleet)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

// One shared heartbeat keeps idle SSE connections (and any proxy in between)
// from dropping. A comment line (`:`) is ignored by EventSource.
const heartbeat = setInterval(() => {
  for (const res of clients) {
    try {
      res.write(': ping\n\n');
    } catch {
      clients.delete(res);
    }
  }
}, HEARTBEAT_MS);
heartbeat.unref?.();

// --- HTTP helpers ------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeFor(path) {
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : '';
  return MIME[ext] || 'application/octet-stream';
}

// Cache policy. Without these the responses carry NO Cache-Control, ETag or
// Last-Modified at all, so a browser that cached index.html has no validator to
// revalidate against and can keep loading a stale hashed bundle indefinitely —
// on a 24/7 kiosk that means a TV pinned to a months-old build after a deploy.
//
// Vite content-hashes everything under /assets/, so those filenames change on
// every build and can be cached forever. index.html is the shell that NAMES the
// current hashes, so it must never be reused without asking us first.
const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_NEVER = 'no-store, must-revalidate';

/** Cache-Control for a dist-relative request path. */
function cacheFor(pathname) {
  return /^\/assets\//.test(pathname) ? CACHE_IMMUTABLE : CACHE_NEVER;
}

function send(res, status, type, body, method, cache) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const headers = { 'Content-Type': type, 'Content-Length': buf.length };
  // Default to never-cache: the only thing safe to keep is a hashed asset, and
  // that caller passes CACHE_IMMUTABLE explicitly.
  headers['Cache-Control'] = cache || CACHE_NEVER;
  res.writeHead(status, headers);
  if (method === 'HEAD') res.end();
  else res.end(buf);
}

function sendJson(res, status, obj, method) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj), method);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        const err = new Error('payload too large');
        err.code = 'TOO_LARGE';
        reject(err);
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// --- static file serving (SPA fallback) --------------------------------------
function serveStatic(req, res, pathname) {
  // Strip empty / '.' / '..' segments → no path traversal out of dist/.
  // Split on '\' too: Windows fs treats it as a separator, so an encoded %5C
  // must not smuggle a '..' segment past the filter.
  const segs = pathname.split(/[/\\]/).filter((s) => s && s !== '.' && s !== '..');
  const last = segs.length ? segs[segs.length - 1] : '';
  const wantsHtml = segs.length === 0 || !/\.[a-z0-9]+$/i.test(last);
  const filePath = segs.length ? DIST + '/' + segs.join('/') : DIST + '/index.html';

  readFile(filePath, (err, buf) => {
    if (!err) {
      send(res, 200, mimeFor(filePath), buf, req.method, cacheFor(pathname));
      return;
    }
    if (wantsHtml) {
      serveIndex(req, res); // SPA route → hand back the shell
      return;
    }
    send(res, 404, 'text/plain; charset=utf-8', 'Not Found\n', req.method);
  });
}

function serveIndex(req, res) {
  readFile(DIST + '/index.html', (err, html) => {
    if (err) {
      send(
        res,
        404,
        'text/plain; charset=utf-8',
        'dist/ has not been built yet. Run `npm run build`, then `npm run serve`.\n',
        req.method,
      );
      return;
    }
    send(res, 200, 'text/html; charset=utf-8', html, req.method);
  });
}

// --- API handlers ------------------------------------------------------------
function handlePut(req, res) {
  readBody(req)
    .then((text) => {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        sendJson(res, 400, { error: 'invalid JSON' }, req.method);
        return;
      }
      const list = validateList(parsed);
      if (list == null) {
        sendJson(res, 400, { error: 'expected a JSON array of airframes' }, req.method);
        return;
      }
      fleet = list;
      persist(fleet);
      broadcast();
      sendJson(res, 200, fleet, req.method);
    })
    .catch((err) => {
      const tooLarge = err && err.code === 'TOO_LARGE';
      sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? 'payload too large' : 'bad request' }, req.method);
    });
}

function handleStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (e.g. vite dev proxy)
  });
  req.socket?.setTimeout?.(0);
  res.socket?.setNoDelay?.(true);

  res.write('retry: 3000\n\n'); // tell EventSource to reconnect after 3s if dropped
  res.write(`data: ${JSON.stringify(fleet)}\n\n`); // snapshot on connect

  clients.add(res);
  req.on('close', () => {
    clients.delete(res);
  });
}

// --- router ------------------------------------------------------------------
const server = createServer((req, res) => {
  const method = req.method;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    send(res, 400, 'text/plain; charset=utf-8', 'Bad Request\n', method);
    return;
  }

  if (pathname === '/api/fleet') {
    if (method === 'GET' || method === 'HEAD') {
      sendJson(res, 200, fleet, method);
      return;
    }
    if (method === 'PUT' || method === 'POST') {
      handlePut(req, res);
      return;
    }
    res.setHeader('Allow', 'GET, PUT');
    send(res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed\n', method);
    return;
  }

  if (pathname === '/api/stream') {
    if (method === 'GET') {
      handleStream(req, res);
      return;
    }
    res.setHeader('Allow', 'GET');
    send(res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed\n', method);
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'not found' }, method);
    return;
  }

  if (method === 'GET' || method === 'HEAD') {
    serveStatic(req, res, pathname);
    return;
  }
  res.setHeader('Allow', 'GET, HEAD');
  send(res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed\n', method);
});

server.listen(PORT, HOST, () => {
  console.log(`[avionics] serving on http://${HOST}:${PORT}  (dist: ${DIST})`);
  console.log(`[avionics] fleet state: ${DATA_FILE} (${fleet.length} airframes)`);
});

// --- graceful shutdown -------------------------------------------------------
function shutdown(signal) {
  console.log(`[avionics] ${signal} received, shutting down`);
  clearInterval(heartbeat);
  for (const res of clients) {
    try {
      res.end();
    } catch {
      /* already gone */
    }
  }
  clients.clear();
  server.close(() => process.exit(0));
  // Don't hang forever if a socket is wedged.
  setTimeout(() => process.exit(0), 2000).unref?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
