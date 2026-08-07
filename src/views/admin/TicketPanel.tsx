// Board tickets panel for the admin console: file a bug report / feature
// request about the board itself, see the open list, mark one done. Rendered
// below the fleet table (see Console.tsx). Tickets live on the server
// (server/tickets.json) — see ./tickets.ts for why they bypass FleetStore.
//
// No polling: the list loads on mount and refreshes from every mutation
// response, which covers the single-admin reality without timer/cleanup bug
// surface. A failed submit keeps the typed text — fields only clear on success.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  buildCreate,
  fetchTickets,
  postTicket,
  TITLE_MAX,
  DETAIL_MAX,
  type Ticket,
  type TicketKind,
} from './tickets';

type Note = { tone: 'ok' | 'err'; text: string };

// undefined = first load in flight, null = server unreachable.
type TicketsState = Ticket[] | null | undefined;

export function TicketPanel(): JSX.Element {
  const [kind, setKind] = useState<TicketKind>('bug');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [tickets, setTickets] = useState<TicketsState>(undefined);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true; // ignore a late response if the console was re-locked meanwhile
    fetchTickets().then(
      (list) => alive && setTickets(list),
      () => alive && setTickets(null),
    );
    return () => {
      alive = false;
    };
  }, []);

  function submit(e: Event): void {
    e.preventDefault();
    const body = buildCreate(kind, title, detail);
    if (!body) {
      setNote({ tone: 'err', text: 'TITLE REQUIRED' });
      return;
    }
    setBusy(true);
    postTicket(body).then(
      (list) => {
        setTickets(list);
        setTitle('');
        setDetail('');
        setNote({ tone: 'ok', text: 'TICKET FILED' });
        setBusy(false);
      },
      () => {
        setNote({ tone: 'err', text: 'SERVER UNREACHABLE · TICKET NOT SAVED' });
        setBusy(false);
      },
    );
  }

  function close(id: string): void {
    setBusy(true);
    postTicket({ action: 'close', id }).then(
      (list) => {
        setTickets(list);
        setNote({ tone: 'ok', text: 'TICKET CLOSED' });
        setBusy(false);
      },
      () => {
        setNote({ tone: 'err', text: 'SERVER UNREACHABLE · TICKET NOT CLOSED' });
        setBusy(false);
      },
    );
  }

  const open = Array.isArray(tickets) ? tickets.filter((t) => t.status === 'open') : [];

  return (
    <section style={panel}>
      <div style={pTitle}>BOARD TICKETS</div>
      <div style={pSub}>REPORT A BUG OR REQUEST A FEATURE FOR THIS BOARD</div>

      <form style={formRow} onSubmit={submit}>
        <select
          style={field}
          value={kind}
          disabled={busy}
          onChange={(e: JSX.TargetedEvent<HTMLSelectElement>) =>
            setKind(e.currentTarget.value === 'feature' ? 'feature' : 'bug')
          }
          aria-label="Ticket type"
        >
          <option value="bug">BUG</option>
          <option value="feature">FEATURE</option>
        </select>
        <input
          style={field}
          value={title}
          maxLength={TITLE_MAX}
          placeholder="WHAT'S WRONG / WHAT'S MISSING"
          onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setTitle(e.currentTarget.value)}
          aria-label="Ticket title"
        />
        <button type="submit" style={fileBtn} disabled={busy}>
          FILE TICKET
        </button>
      </form>
      <textarea
        style={{ ...field, ...detailField }}
        rows={2}
        value={detail}
        maxLength={DETAIL_MAX}
        placeholder="DETAIL (OPTIONAL)"
        onInput={(e: JSX.TargetedEvent<HTMLTextAreaElement>) => setDetail(e.currentTarget.value)}
        aria-label="Ticket detail"
      />

      {/* Fixed-height line (LockScreen denial idiom) so the layout never jumps. */}
      <div
        style={{
          ...statusLine,
          color: note?.tone === 'err' ? 'var(--danger)' : 'var(--text-secondary)',
          visibility: note ? 'visible' : 'hidden',
        }}
      >
        {note ? note.text : '·'}
      </div>

      <div style={listHead}>OPEN TICKETS</div>
      {tickets === undefined ? (
        <div style={emptyLine}>…</div>
      ) : tickets === null ? (
        <div style={{ ...emptyLine, color: 'var(--danger)' }}>TICKET SERVER UNREACHABLE</div>
      ) : open.length === 0 ? (
        <div style={emptyLine}>NO OPEN TICKETS</div>
      ) : (
        open.map((t) => (
          <div key={t.id} style={ticketRow}>
            <span
              style={{
                ...kindTag,
                color: t.kind === 'bug' ? 'var(--danger)' : 'var(--accent)',
              }}
            >
              {t.kind === 'bug' ? 'BUG' : 'FEAT'}
            </span>
            <div style={ticketMain}>
              <div style={ticketTitle}>{t.title}</div>
              {t.detail ? <div style={ticketDetail}>{t.detail}</div> : null}
            </div>
            <span style={ticketDate}>{t.createdAt.slice(0, 10)}</span>
            <button type="button" style={doneBtn} disabled={busy} onClick={() => close(t.id)}>
              DONE
            </button>
          </div>
        ))
      )}
    </section>
  );
}

// --- styles (inline; values from docs/DESIGN_BRIEF.md + styles/tokens.css) ----

const panel: JSX.CSSProperties = {
  marginTop: '18px',
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '14px',
  boxShadow: 'var(--card-shadow)',
  padding: '16px 18px',
};

const pTitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '16px',
  letterSpacing: '.14em',
  color: 'var(--text-primary)',
};

const pSub: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 400,
  fontSize: '10px',
  letterSpacing: '.18em',
  color: 'var(--text-muted)',
  marginTop: '4px',
  marginBottom: '14px',
};

const formRow: JSX.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '130px 1fr auto',
  gap: '10px',
  alignItems: 'center',
};

// Same values as Console's `field`.
const field: JSX.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  background: 'rgba(8, 14, 24, 0.5)',
  border: '1px solid var(--hairline-soft)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '13px',
  outline: 'none',
};

const detailField: JSX.CSSProperties = {
  marginTop: '10px',
  resize: 'vertical',
  lineHeight: 1.4,
  fontSize: '12px',
};

const fileBtn: JSX.CSSProperties = {
  padding: '9px 16px',
  background: 'rgba(255, 158, 61, 0.08)',
  border: '1px dashed rgba(255, 158, 61, 0.4)',
  borderRadius: '9px',
  color: 'var(--accent)',
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '12px',
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const statusLine: JSX.CSSProperties = {
  marginTop: '10px',
  fontFamily: 'var(--font-mono)',
  fontWeight: 500,
  fontSize: '11px',
  letterSpacing: '.16em',
};

const listHead: JSX.CSSProperties = {
  marginTop: '12px',
  paddingTop: '12px',
  borderTop: '1px solid var(--hairline-soft)',
  fontFamily: 'var(--font-mono)',
  fontWeight: 500,
  fontSize: '10px',
  letterSpacing: '.16em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
};

const emptyLine: JSX.CSSProperties = {
  padding: '10px 0 4px',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '.16em',
  color: 'var(--text-muted)',
};

const ticketRow: JSX.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '52px 1fr auto auto',
  gap: '12px',
  alignItems: 'center',
  padding: '9px 0',
  borderBottom: '1px solid var(--hairline-soft)',
};

const kindTag: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  fontSize: '10px',
  letterSpacing: '.14em',
};

const ticketMain: JSX.CSSProperties = {
  minWidth: 0,
};

const ticketTitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--text-primary)',
  overflowWrap: 'anywhere',
};

const ticketDetail: JSX.CSSProperties = {
  marginTop: '3px',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  lineHeight: 1.4,
  color: 'var(--text-secondary)',
  overflowWrap: 'anywhere',
};

const ticketDate: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '.1em',
  color: 'var(--text-muted)',
};

const doneBtn: JSX.CSSProperties = {
  padding: '7px 14px',
  background: 'rgba(120, 150, 190, 0.06)',
  border: '1px solid var(--hairline)',
  borderRadius: '9px',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '11px',
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};
