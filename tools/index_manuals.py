#!/usr/bin/env python3
"""Build / update the full-text index for the Manuals screen (#manuals).

Reads every PDF under the manuals folder (subfolders included), pulls the text
of each page plus the PDF's bookmark tree, and writes one SQLite database
(manuals.db, next to the PDFs) with an FTS5 full-text index. The board's Node
server opens that file read-only with Node's built-in SQLite — nothing else to
install on the server side.

    pip install pymupdf              # once, on whatever machine runs this
    python3 tools/index_manuals.py                 # default folder: ./manuals
    python3 tools/index_manuals.py /path/to/manuals
    python3 tools/index_manuals.py --rebuild       # drop everything, start over

Re-running is incremental: unchanged files (same size + mtime, or same SHA-1)
are skipped, changed files are re-indexed, deleted files are dropped. So when a
new revision arrives, copy the PDF over the old one and run this again.

Optional: manuals/manuals.json overrides the title / revision / date shown on
the board. Keys are the PDF's path relative to the manuals folder (forward
slashes) or just its file name:

    {
      "S-92/AMM-34.pdf": {"title": "S-92A AMM Ch 34 Navigation", "revision": "45", "date": "2026-06-15"}
    }

Without an entry the title comes from the PDF's own metadata (if sensible) or
the file name, and the revision from a "Rev 12" / "R12" style file name.

The index is portable: build it on a PC and copy manuals.db + the PDFs to the
Pi as one folder; paths inside are stored relative to the folder.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone

try:
    import pymupdf  # PyMuPDF >= 1.24
except ImportError:  # older installs only expose the legacy name
    try:
        import fitz as pymupdf  # type: ignore
    except ImportError:
        sys.exit("PyMuPDF is not installed. Run:  pip install pymupdf")

SCHEMA_VERSION = "1"
DB_NAME = "manuals.db"
META_NAME = "manuals.json"

# A page with less text than this is reported as "no text" — usually a scan
# that needs OCR (ocrmypdf) before it can be searched.
EMPTY_PAGE_CHARS = 20

# ATA-style reference printed in a page header/footer, e.g. 34-20-00 or 23-11-05.
# Three groups only: two-group patterns false-match too much prose.
ATA_RE = re.compile(r"(?<![\d-])(\d{2}-\d{2}-\d{2})(?![\d-])")
# Revision hint in a file name: "Rev 12", "rev-B", "_R45".
REV_RE = re.compile(r"(?:^|[\s._-])(?:rev(?:ision)?|r)[\s._-]*([0-9]{1,3}[a-z]?|[a-z])(?=[\s._-]|$)", re.I)

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS manuals (
  id         INTEGER PRIMARY KEY,
  path       TEXT NOT NULL UNIQUE,   -- relative to the manuals folder, '/' separators
  title      TEXT NOT NULL,
  revision   TEXT NOT NULL DEFAULT '',
  rev_date   TEXT NOT NULL DEFAULT '',
  pages      INTEGER NOT NULL,
  empty_pages INTEGER NOT NULL DEFAULT 0,
  bytes      INTEGER NOT NULL,
  mtime      REAL NOT NULL,
  sha1       TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  id        INTEGER PRIMARY KEY,
  manual_id INTEGER NOT NULL,
  page      INTEGER NOT NULL,          -- 1-based physical page, what #page=N wants
  label     TEXT NOT NULL DEFAULT '',  -- printed page label, when the PDF defines one
  ata       TEXT NOT NULL DEFAULT '',  -- ATA ref guessed from the header/footer
  section   TEXT NOT NULL DEFAULT '',  -- bookmark path, e.g. "34 Navigation › 34-20 Attitude"
  body      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pages_manual ON pages(manual_id, page);

-- External-content FTS5 index over pages; kept in sync by the triggers below.
-- 'porter' stems English (resistance ~ resist); unicode61 splits on '-' so a
-- quoted "622-5132-101" or "34-20-00" still matches as a phrase.
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  body, section, ata,
  content='pages', content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(rowid, body, section, ata) VALUES (new.id, new.body, new.section, new.ata);
END;
CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, body, section, ata)
  VALUES ('delete', old.id, old.body, old.section, old.ata);
END;
"""


# --- helpers -----------------------------------------------------------------

def rel_path(root: str, full: str) -> str:
    return os.path.relpath(full, root).replace(os.sep, "/")


def find_pdfs(root: str) -> list[str]:
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for name in sorted(filenames):
            if name.lower().endswith(".pdf") and not name.startswith("."):
                out.append(os.path.join(dirpath, name))
    return out


def sha1_of(path: str) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_text(s: str) -> str:
    # Collapse all whitespace (PDF line breaks, column gaps) to single spaces so
    # phrases match across line ends and snippets read cleanly.
    return re.sub(r"\s+", " ", s.replace("­", "")).strip()


def guess_ata(raw: str) -> str:
    """ATA ref from the page header/footer lines (first 4 / last 6 non-empty)."""
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    for ln in lines[-6:][::-1] + lines[:4]:
        m = ATA_RE.search(ln)
        if m:
            return m.group(1)
    return ""


def section_paths(toc: list, page_count: int) -> list[str]:
    """For each page (index 0 = page 1), the bookmark path in force there."""
    entries = [(lvl, title.strip(), pg) for lvl, title, pg, *_ in toc if pg and pg > 0 and title.strip()]
    entries.sort(key=lambda e: e[2])  # stable: keeps document order within a page
    out = []
    stack: list[str] = []
    i = 0
    for pno in range(1, page_count + 1):
        while i < len(entries) and entries[i][2] <= pno:
            lvl, title, _ = entries[i]
            stack = stack[: max(lvl - 1, 0)] + [title]
            i += 1
        out.append(" › ".join(stack[-3:]))  # deepest three levels is plenty on a tablet
    return out


def load_overrides(root: str) -> dict:
    path = os.path.join(root, META_NAME)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError) as err:
        print(f"! {META_NAME} unreadable, ignoring it: {err}")
        return {}


def describe(rel: str, doc, overrides: dict) -> tuple[str, str, str]:
    """(title, revision, rev_date) for a manual."""
    o = overrides.get(rel) or overrides.get(rel.rsplit("/", 1)[-1]) or {}
    stem = rel.rsplit("/", 1)[-1][:-4]

    title = str(o.get("title") or "").strip()
    if not title:
        meta_title = ((doc.metadata or {}).get("title") or "").strip()
        bad = (not meta_title or len(meta_title) < 4 or meta_title.lower().startswith("microsoft")
               or meta_title.lower().endswith((".doc", ".docx", ".pdf")) or meta_title.lower() == "untitled")
        title = stem.replace("_", " ").strip() if bad else meta_title

    revision = str(o.get("revision") or "").strip()
    if not revision:
        m = REV_RE.search(stem)
        revision = m.group(1).upper() if m else ""

    return title, revision, str(o.get("date") or "").strip()


# --- main --------------------------------------------------------------------

def open_db(path: str, rebuild: bool) -> sqlite3.Connection:
    if rebuild and os.path.exists(path):
        os.remove(path)
    db = sqlite3.connect(path)
    try:
        db.executescript(SCHEMA)
    except sqlite3.OperationalError as err:
        sys.exit(f"This Python's SQLite has no FTS5 support ({err}). Use a newer Python.")
    db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema', ?)", (SCHEMA_VERSION,))
    return db


def index_file(db: sqlite3.Connection, root: str, full: str, overrides: dict, row) -> tuple[str, int]:
    """Returns (action, pages) where action is 'new' | 'updated' | 'meta'."""
    rel = rel_path(root, full)
    st = os.stat(full)
    digest = sha1_of(full)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with pymupdf.open(full) as doc:
        title, revision, rev_date = describe(rel, doc, overrides)

        if row is not None and row["sha1"] == digest:
            # Same bytes (just touched/copied): refresh bookkeeping + labels only.
            db.execute(
                "UPDATE manuals SET title=?, revision=?, rev_date=?, bytes=?, mtime=? WHERE id=?",
                (title, revision, rev_date, st.st_size, st.st_mtime, row["id"]),
            )
            return "meta", row["pages"]

        sections = section_paths(doc.get_toc(simple=True), doc.page_count)
        pages = []
        empty = 0
        for i, page in enumerate(doc):
            raw = page.get_text("text")
            body = clean_text(raw)
            if len(body) < EMPTY_PAGE_CHARS:
                empty += 1
            try:
                label = page.get_label() or ""
            except Exception:  # malformed /PageLabels tree
                label = ""
            pages.append((i + 1, label, guess_ata(raw), sections[i], body))

    with db:  # one transaction per manual: a crash never leaves it half-indexed
        if row is None:
            cur = db.execute(
                "INSERT INTO manuals(path, title, revision, rev_date, pages, empty_pages, bytes, mtime, sha1, indexed_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (rel, title, revision, rev_date, len(pages), empty, st.st_size, st.st_mtime, digest, now),
            )
            manual_id = cur.lastrowid
            action = "new"
        else:
            manual_id = row["id"]  # keep the id stable so links/bookmarks survive a new revision
            db.execute("DELETE FROM pages WHERE manual_id=?", (manual_id,))
            db.execute(
                "UPDATE manuals SET title=?, revision=?, rev_date=?, pages=?, empty_pages=?, bytes=?, mtime=?, sha1=?, indexed_at=?"
                " WHERE id=?",
                (title, revision, rev_date, len(pages), empty, st.st_size, st.st_mtime, digest, now, manual_id),
            )
            action = "updated"
        db.executemany(
            "INSERT INTO pages(manual_id, page, label, ata, section, body) VALUES (?,?,?,?,?,?)",
            [(manual_id, *p) for p in pages],
        )

    if empty:
        print(f"    ! {empty} of {len(pages)} pages have no text (scanned?) — OCR them to make them searchable")
    return action, len(pages)


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Index manual PDFs for the board's #manuals search.")
    ap.add_argument("folder", nargs="?", default=os.path.join(os.path.dirname(here), "manuals"),
                    help="folder holding the PDFs (default: ./manuals next to tools/)")
    ap.add_argument("--rebuild", action="store_true", help="delete the index and rebuild from scratch")
    args = ap.parse_args()

    root = os.path.abspath(args.folder)
    if not os.path.isdir(root):
        sys.exit(f"No such folder: {root}")

    t0 = time.time()
    db = open_db(os.path.join(root, DB_NAME), args.rebuild)
    db.row_factory = sqlite3.Row
    overrides = load_overrides(root)

    known = {r["path"]: r for r in db.execute("SELECT id, path, bytes, mtime, sha1, pages FROM manuals")}
    pdfs = find_pdfs(root)
    seen = set()
    counts = {"new": 0, "updated": 0, "meta": 0, "skipped": 0, "removed": 0, "failed": 0}

    for n, full in enumerate(pdfs, 1):
        rel = rel_path(root, full)
        seen.add(rel)
        row = known.get(rel)
        st = os.stat(full)
        if row is not None and row["bytes"] == st.st_size and abs(row["mtime"] - st.st_mtime) < 1e-3:
            # Unchanged file — but still apply any manuals.json edits.
            with pymupdf.open(full) as doc:
                title, revision, rev_date = describe(rel, doc, overrides)
            db.execute("UPDATE manuals SET title=?, revision=?, rev_date=? WHERE id=?",
                       (title, revision, rev_date, row["id"]))
            counts["skipped"] += 1
            continue
        print(f"[{n}/{len(pdfs)}] {rel}")
        try:
            action, pages = index_file(db, root, full, overrides, row)
            counts[action] += 1
            print(f"    {action}: {pages} pages")
        except Exception as err:  # one bad PDF must not stop the other 43
            counts["failed"] += 1
            print(f"    ! failed: {err}")

    with db:
        for rel, row in known.items():
            if rel not in seen:
                db.execute("DELETE FROM pages WHERE manual_id=?", (row["id"],))
                db.execute("DELETE FROM manuals WHERE id=?", (row["id"],))
                counts["removed"] += 1
                print(f"removed (file gone): {rel}")
        db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES ('indexed_at', ?)",
                   (datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),))

    if counts["new"] or counts["updated"] or counts["removed"]:
        db.execute("INSERT INTO pages_fts(pages_fts) VALUES ('optimize')")  # merge segments → faster queries
        db.commit()

    total_m, total_p = db.execute("SELECT count(*), coalesce(sum(pages), 0) FROM manuals").fetchone()
    db.close()
    print(
        f"\nDone in {time.time() - t0:.1f}s — {total_m} manuals, {total_p} pages indexed. "
        + ", ".join(f"{k} {v}" for k, v in counts.items() if v)
    )


if __name__ == "__main__":
    main()
