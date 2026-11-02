// Manuals route (#manuals) — full-text search across every indexed manual, for
// the shop's touch tablets. Type a word, phrase, part number or ATA ref; get a
// ranked list of pages (manual · section · page · highlighted snippet); tap one
// to open that PDF at that page in the browser's own viewer (new tab, so the
// search stays put). With an empty box it shows the library to browse.
//
// The server does the parsing/ranking (server/manuals.mjs); the index is built
// offline by tools/index_manuals.py. The current query is mirrored into the
// hash (#manuals/<query>) with replaceState, so a reload or a shared link lands
// on the same results.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { goto } from '../../routing';
import {
  fetchLibrary,
  searchManuals,
  splitSnippet,
  queryFromHash,
  hashForQuery,
  pageText,
  count,
  type Library,
  type Hit,
  type SearchResult,
  type ManualInfo,
} from './manuals';
import css from './ManualsView.module.css';

const DEBOUNCE_MS = 350;
const MIN_LIVE_CHARS = 2; // search-as-you-type kicks in from 2 characters

interface Results extends SearchResult {
  query: string;
  manualId: number | null;
}

export function ManualsView(): JSX.Element {
  // undefined = loading, null = server unreachable
  const [lib, setLib] = useState<Library | null | undefined>(undefined);
  const [q, setQ] = useState(() => (typeof location !== 'undefined' ? queryFromHash(location.hash) : ''));
  const [manualId, setManualId] = useState<number | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const req = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchLibrary(ac.signal).then(
      (l) => setLib(l),
      () => !ac.signal.aborted && setLib(null),
    );
    return () => {
      ac.abort();
      req.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function run(query: string, mid: number | null, offset = 0): void {
    if (timer.current) clearTimeout(timer.current);
    req.current?.abort();
    const t = query.trim();
    if (offset === 0) history.replaceState(null, '', '#' + hashForQuery(t));
    if (!t) {
      setResults(null);
      setError('');
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    req.current = ac;
    setLoading(true);
    searchManuals(t, mid, offset, ac.signal).then(
      (r) => {
        if (ac.signal.aborted) return;
        setResults((prev) =>
          offset > 0 && prev ? { ...prev, hits: [...prev.hits, ...r.hits] } : { ...r, query: t, manualId: mid },
        );
        setError('');
        setLoading(false);
      },
      (err: Error) => {
        if (ac.signal.aborted) return;
        setError(err.message === 'Failed to fetch' ? 'SERVER UNREACHABLE' : err.message.toUpperCase());
        setLoading(false);
      },
    );
  }

  // Search as you type (debounced). A deep-linked query runs at once on load.
  useEffect(() => {
    if (lib === undefined || !lib?.available) return;
    if (first.current) {
      first.current = false;
      if (q.trim()) run(q, manualId);
      else input.current?.focus();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const t = q.trim();
    if (t.length > 0 && t.length < MIN_LIVE_CHARS) return;
    timer.current = setTimeout(() => run(q, manualId), t ? DEBOUNCE_MS : 0);
  }, [q, lib]);

  function submit(e: Event): void {
    e.preventDefault();
    input.current?.blur(); // drop the touch keyboard so the results are visible
    run(q, manualId);
  }

  function pickManual(id: number | null): void {
    setManualId(id);
    run(q, id);
  }

  function clear(): void {
    setQ('');
    setManualId(null);
    run('', null);
    input.current?.focus();
  }

  const byId = new Map<number, ManualInfo>((lib?.manuals ?? []).map((m) => [m.id, m]));
  const searching = q.trim().length > 0 && (results !== null || loading || error !== '');

  return (
    <div style={page}>
      <div style={inner}>
        <header style={header}>
          <div>
            <div style={hTitle}>MANUALS</div>
            <div style={hSub}>{librarySummary(lib)}</div>
          </div>
          <button type="button" style={ghostBtn} onClick={() => goto('display')}>
            BOARD
          </button>
        </header>

        <div style={searchCard}>
          <form style={searchRow} onSubmit={submit} role="search">
            <input
              ref={input}
              class={css.search}
              style={searchInput}
              type="search"
              value={q}
              placeholder="SEARCH ALL MANUALS — WORDS, PART NUMBERS, ATA REFS"
              aria-label="Search manuals"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellcheck={false}
              enterKeyHint="search"
              disabled={!lib?.available}
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setQ(e.currentTarget.value)}
            />
            {q ? (
              <button type="button" style={clearBtn} onClick={clear} aria-label="Clear search">
                ×
              </button>
            ) : null}
            <button type="submit" style={goBtn} disabled={!lib?.available}>
              SEARCH
            </button>
          </form>
          <div style={tips}>
            "EXACT PHRASE" · WORD* FOR PARTIAL · VHF OR UHF · PART NUMBERS + ATA REFS AS PRINTED
          </div>

          {results && results.perManual.length > 1 ? (
            <div class={css.chips} style={chipRow}>
              <Chip
                label="ALL"
                n={results.perManual.reduce((s, c) => s + c.n, 0)}
                on={manualId === null}
                onPick={() => pickManual(null)}
              />
              {results.perManual.map((c) => (
                <Chip
                  key={c.id}
                  label={byId.get(c.id)?.title ?? `MANUAL ${c.id}`}
                  n={c.n}
                  on={manualId === c.id}
                  onPick={() => pickManual(manualId === c.id ? null : c.id)}
                />
              ))}
            </div>
          ) : null}

          <div style={{ ...statusLine, color: error ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {statusText(lib, results, loading, error, byId)}
          </div>
        </div>

        {lib === undefined ? null : lib === null ? (
          <Notice title="MANUAL SERVER UNREACHABLE" text="Check the board server is running, then reload." />
        ) : !lib.available ? (
          <Notice title="SEARCH NOT SET UP YET" text={lib.reason} />
        ) : searching && results ? (
          <ResultList results={results} loading={loading} onMore={() => run(results.query, results.manualId, results.hits.length)} />
        ) : !searching ? (
          <LibraryGrid manuals={lib.manuals} />
        ) : null}

        <div style={footNote}>UNCONTROLLED COPIES · CONFIRM REVISION STATUS BEFORE USE</div>
      </div>
    </div>
  );
}

function librarySummary(lib: Library | null | undefined): string {
  if (lib === undefined) return 'LOADING LIBRARY…';
  if (lib === null || !lib.available) return 'LIBRARY OFFLINE';
  const when = lib.indexedAt ? ` · INDEXED ${lib.indexedAt.slice(0, 10)}` : '';
  return `${count(lib.manuals.length, 'MANUAL')} · ${count(lib.totalPages, 'PAGE')}${when}`;
}

function statusText(
  lib: Library | null | undefined,
  r: Results | null,
  loading: boolean,
  error: string,
  byId: Map<number, ManualInfo>,
): string {
  if (error) return error;
  if (loading && !r) return 'SEARCHING…';
  if (!r || !lib?.available) return 'TAP A MANUAL TO OPEN IT, OR SEARCH ACROSS ALL OF THEM';
  if (r.total === 0) return 'NO PAGES MATCH — TRY FEWER WORDS, OR END A WORD WITH *';
  const manuals = r.manualId !== null ? `IN ${(byId.get(r.manualId)?.title ?? 'ONE MANUAL').toUpperCase()}` : count(r.perManual.length, 'MANUAL');
  const base = `${count(r.total, 'PAGE')} · ${manuals} · ${r.ms} MS`;
  return r.broadened ? `NO EXACT MATCH — SHOWING WORDS THAT START WITH YOUR TERMS · ${base}` : base;
}

function Chip({ label, n, on, onPick }: { label: string; n: number; on: boolean; onPick: () => void }): JSX.Element {
  return (
    <button type="button" class={css.chip} style={on ? { ...chip, ...chipOn } : chip} onClick={onPick} aria-pressed={on}>
      <span style={chipLabel}>{label}</span>
      <span style={chipCount}>{n.toLocaleString('en-US')}</span>
    </button>
  );
}

function ResultList({ results, loading, onMore }: { results: Results; loading: boolean; onMore: () => void }): JSX.Element {
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
      {results.hits.map((h) => (
        <HitRow key={`${h.manualId}:${h.page}`} hit={h} />
      ))}
      {results.hits.length < results.total ? (
        <button type="button" style={moreBtn} onClick={onMore} disabled={loading}>
          {loading ? 'LOADING…' : `SHOW MORE · ${(results.total - results.hits.length).toLocaleString('en-US')} LEFT`}
        </button>
      ) : null}
    </div>
  );
}

function HitRow({ hit }: { hit: Hit }): JSX.Element {
  return (
    <a class={css.hit} style={hitRow} href={hit.url} target="_blank" rel="noopener">
      <div style={hitMain}>
        <div style={hitTop}>
          <span style={hitTitle}>{hit.title}</span>
          {hit.revision ? <span style={revTag}>REV {hit.revision}</span> : null}
        </div>
        {hit.section ? <div style={hitSection}>{hit.section}</div> : null}
        <div style={hitSnippet}>
          {splitSnippet(hit.snippet).map((s, i) =>
            s.hit ? (
              <mark key={i} style={mark}>
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </div>
      </div>
      <div style={hitSide}>
        <div style={pageLbl}>PAGE</div>
        <div style={pageNum}>{pageText(hit)}</div>
        {hit.ata ? <div style={ataTag}>{hit.ata}</div> : null}
      </div>
    </a>
  );
}

function LibraryGrid({ manuals }: { manuals: ManualInfo[] }): JSX.Element {
  if (!manuals.length) {
    return <Notice title="NO MANUALS INDEXED" text="Add PDFs to the manuals folder and re-run the indexer." />;
  }
  return (
    <div style={grid}>
      {manuals.map((m) => (
        <a key={m.id} class={css.tile} style={tile} href={m.url} target="_blank" rel="noopener">
          <div style={tileTitle}>{m.title}</div>
          <div style={tileMeta}>
            {[m.revision ? `REV ${m.revision}` : '', m.revDate, count(m.pages, 'PAGE')].filter(Boolean).join(' · ')}
          </div>
          {m.emptyPages > 0 ? (
            <div style={tileWarn}>{count(m.emptyPages, 'PAGE')} NOT SEARCHABLE (SCANNED)</div>
          ) : null}
        </a>
      ))}
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }): JSX.Element {
  return (
    <div style={noticeCard}>
      <div style={noticeTitle}>{title}</div>
      <div style={noticeText}>{text}</div>
    </div>
  );
}

// --- styles (inline; values from docs/DESIGN_BRIEF.md + styles/tokens.css) ----
// Sized for a 12" touch tablet: 52px+ touch targets, 15–20px reading text.

const page: JSX.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  height: '100%',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '26px clamp(14px, 3.5vw, 48px) 40px',
  boxSizing: 'border-box',
};

const inner: JSX.CSSProperties = { maxWidth: '1180px', margin: '0 auto' };

const header: JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: '20px',
  marginBottom: '18px',
};

const hTitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '27px',
  letterSpacing: '.12em',
  color: 'var(--text-primary)',
};

const hSub: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '.18em',
  color: 'var(--text-secondary)',
  marginTop: '6px',
};

const ghostBtn: JSX.CSSProperties = {
  minHeight: '44px',
  padding: '0 18px',
  background: 'rgba(120, 150, 190, 0.06)',
  border: '1px solid var(--hairline)',
  borderRadius: '9px',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '13px',
  letterSpacing: '.16em',
  cursor: 'pointer',
};

const card: JSX.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '14px',
  boxShadow: 'var(--card-shadow)',
};

// Sticky so the search box stays in reach while scrolling a long result list.
const searchCard: JSX.CSSProperties = {
  ...card,
  position: 'sticky',
  top: '-26px', // cancels the page's top padding so it pins flush
  zIndex: 2,
  padding: '16px 18px 12px',
  marginBottom: '14px',
  background: 'linear-gradient(180deg, rgba(18, 28, 45, 0.97), rgba(9, 15, 25, 0.96))',
};

const searchRow: JSX.CSSProperties = { display: 'flex', gap: '10px', alignItems: 'stretch' };

const searchInput: JSX.CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  height: '56px',
  padding: '0 16px',
  background: 'rgba(8, 14, 24, 0.6)',
  border: '1px solid var(--hairline)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '18px',
  outline: 'none',
  WebkitAppearance: 'none',
};

const clearBtn: JSX.CSSProperties = {
  width: '56px',
  flex: '0 0 auto',
  background: 'rgba(120, 150, 190, 0.06)',
  border: '1px solid var(--hairline)',
  borderRadius: '10px',
  color: 'var(--text-secondary)',
  fontSize: '26px',
  lineHeight: 1,
  cursor: 'pointer',
};

const goBtn: JSX.CSSProperties = {
  flex: '0 0 auto',
  padding: '0 24px',
  background: 'var(--btn-grad)',
  border: 'none',
  borderRadius: '10px',
  color: '#1a1206',
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '15px',
  letterSpacing: '.16em',
  cursor: 'pointer',
};

const tips: JSX.CSSProperties = {
  marginTop: '9px',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '.14em',
  color: 'var(--text-muted)',
};

const chipRow: JSX.CSSProperties = {
  display: 'flex',
  gap: '8px',
  overflowX: 'auto',
  marginTop: '12px',
  paddingBottom: '2px',
};

const chip: JSX.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  maxWidth: '320px',
  minHeight: '42px',
  padding: '0 14px',
  background: 'var(--pill-bg)',
  border: '1px solid var(--pill-border)',
  borderRadius: '999px',
  color: 'var(--pill-text)',
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '13px',
  letterSpacing: '.06em',
  cursor: 'pointer',
};

const chipOn: JSX.CSSProperties = {
  background: 'rgba(255, 158, 61, 0.14)',
  border: '1px solid rgba(255, 158, 61, 0.55)',
  color: 'var(--accent-light)',
};

const chipLabel: JSX.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const chipCount: JSX.CSSProperties = { fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: '12px', opacity: 0.85 };

const statusLine: JSX.CSSProperties = {
  marginTop: '10px',
  minHeight: '15px',
  fontFamily: 'var(--font-mono)',
  fontWeight: 500,
  fontSize: '11px',
  letterSpacing: '.14em',
};

const hitRow: JSX.CSSProperties = {
  ...card,
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '18px',
  alignItems: 'center',
  padding: '14px 18px',
  marginBottom: '10px',
  textDecoration: 'none',
  color: 'inherit',
  minHeight: '88px',
};

const hitMain: JSX.CSSProperties = { minWidth: 0 };

const hitTop: JSX.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' };

const hitTitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '16px',
  letterSpacing: '.06em',
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
};

const revTag: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '.12em',
  color: 'var(--text-muted)',
};

const hitSection: JSX.CSSProperties = {
  marginTop: '3px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--accent-value)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const hitSnippet: JSX.CSSProperties = {
  marginTop: '7px',
  fontFamily: 'var(--font-body)',
  fontSize: '15px',
  lineHeight: 1.45,
  color: 'var(--text-secondary)',
  overflowWrap: 'anywhere',
};

const mark: JSX.CSSProperties = {
  background: 'rgba(255, 158, 61, 0.2)',
  color: 'var(--accent-light)',
  borderRadius: '3px',
  padding: '0 2px',
};

const hitSide: JSX.CSSProperties = { textAlign: 'right', minWidth: '84px' };

const pageLbl: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '.18em',
  color: 'var(--text-muted)',
};

const pageNum: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '30px',
  lineHeight: 1.05,
  color: 'var(--accent)',
};

const ataTag: JSX.CSSProperties = {
  marginTop: '4px',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '.08em',
  color: 'var(--text-subtle)',
};

const moreBtn: JSX.CSSProperties = {
  width: '100%',
  minHeight: '52px',
  marginTop: '4px',
  background: 'rgba(255, 158, 61, 0.08)',
  border: '1px dashed rgba(255, 158, 61, 0.4)',
  borderRadius: '12px',
  color: 'var(--accent)',
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '14px',
  letterSpacing: '.16em',
  cursor: 'pointer',
};

const grid: JSX.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
  gap: '10px',
};

const tile: JSX.CSSProperties = {
  ...card,
  display: 'block',
  padding: '14px 16px',
  minHeight: '84px',
  textDecoration: 'none',
  color: 'inherit',
};

const tileTitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '15px',
  letterSpacing: '.05em',
  lineHeight: 1.25,
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
};

const tileMeta: JSX.CSSProperties = {
  marginTop: '6px',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '.1em',
  color: 'var(--text-muted)',
};

const tileWarn: JSX.CSSProperties = {
  marginTop: '4px',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '.1em',
  color: 'var(--danger)',
};

const noticeCard: JSX.CSSProperties = { ...card, padding: '22px 22px' };

const noticeTitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '16px',
  letterSpacing: '.14em',
  color: 'var(--accent)',
};

const noticeText: JSX.CSSProperties = {
  marginTop: '8px',
  fontFamily: 'var(--font-mono)',
  fontSize: '13px',
  lineHeight: 1.5,
  color: 'var(--text-secondary)',
  overflowWrap: 'anywhere',
};

const footNote: JSX.CSSProperties = {
  marginTop: '22px',
  textAlign: 'center',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '.2em',
  color: 'var(--text-muted)',
};
