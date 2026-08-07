// Board tickets — bug reports / feature requests filed from the admin console.
//
// The server (server/index.mjs) is the single authority: it assigns ids,
// timestamps and status, and enforces the length/count caps. This module is
// deliberately thin — pure builders/guards plus two fetch calls that THROW on
// any failure, because a thrown error IS the "server unreachable" signal the
// panel renders. There is no localStorage fallback for tickets: the text lives
// in the form until the server accepts it, or nowhere.
//
// Not part of FleetStore on purpose: that interface is locked (src/types.ts),
// and tickets invert its failure semantics — fleet edits swallow errors and
// retry, tickets must fail visibly.

export type TicketKind = 'bug' | 'feature';

export interface Ticket {
  id: string;
  kind: TicketKind;
  title: string;
  detail: string;
  status: 'open' | 'done';
  createdAt: string; // ISO string; rendered with .slice(0, 10), never parsed
}

export interface CreateBody {
  action: 'create';
  kind: TicketKind;
  title: string;
  detail: string;
}

export interface CloseBody {
  action: 'close';
  id: string;
}

// Mirror the server caps (TICKET_TITLE_MAX / TICKET_DETAIL_MAX in server/index.mjs).
export const TITLE_MAX = 120;
export const DETAIL_MAX = 2000;

/** Build a create request body, or null when the title is empty after trimming. */
export function buildCreate(kind: TicketKind, title: string, detail: string): CreateBody | null {
  const t = title.trim().slice(0, TITLE_MAX);
  if (!t) return null;
  return { action: 'create', kind, title: t, detail: detail.trim().slice(0, DETAIL_MAX) };
}

/**
 * Shape-guard a server response for rendering — NOT a second normalizer (the
 * server already normalized). Just enough coercion that a hand-edited
 * tickets.json can't crash the panel. Returns null for anything that isn't an
 * array; entries without a usable id + title are dropped.
 */
export function parseTickets(value: unknown): Ticket[] | null {
  if (!Array.isArray(value)) return null;
  const out: Ticket[] = [];
  for (const item of value) {
    if (item == null || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id) continue;
    if (typeof p.title !== 'string' || !p.title) continue;
    out.push({
      id: p.id,
      kind: p.kind === 'feature' ? 'feature' : 'bug',
      title: p.title,
      detail: typeof p.detail === 'string' ? p.detail : '',
      status: p.status === 'done' ? 'done' : 'open',
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
    });
  }
  return out;
}

async function request(init?: RequestInit): Promise<Ticket[]> {
  const res = await fetch('/api/tickets', init);
  if (!res.ok) throw new Error(`tickets request failed: ${res.status}`);
  const list = parseTickets(await res.json());
  if (list == null) throw new Error('tickets response was not a list');
  return list;
}

/** GET the full ticket list (newest first). Rejects when the server is unreachable. */
export function fetchTickets(): Promise<Ticket[]> {
  return request();
}

/** POST a create/close mutation; resolves with the full updated list. */
export function postTicket(body: CreateBody | CloseBody): Promise<Ticket[]> {
  return request({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
