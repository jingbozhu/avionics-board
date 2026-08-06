// Editable fleet table for the Admin route. Every field writes straight through
// the shared FleetStore, which persists (LAN PUT or localStorage) and broadcasts
// the change live to all read-only TV displays. No local copy of the list lives
// here — the store is the single source of truth (see src/model/store.ts).
import type { JSX } from 'preact';
import { fleetStore, useFleet } from '../../model/useFleet';
import { goto } from '../../routing';
import { SYSTEMS, SYSTEM_LABELS, FLAGS } from '../../model/airframe';
import { STATUS } from '../../theme/tokens';
import { countPad } from '../../model/derive';
import type { Airframe } from '../../types';

// Column tracks — must stay in lockstep with the control order in Row() below.
const COLS = '1.1fr 1.1fr 2fr .9fr .8fr 1.5fr 1.05fr 1.05fr 44px';
const HEAD = [
  'WORK ORDER',
  'REGISTRATION',
  'PROJECT DESCRIPTION',
  'SYSTEM',
  'TECH',
  'COMPLETION',
  'ETA',
  'STATUS',
  '',
];

/** `onLock` re-locks the console (clear auth + show the lock screen) without leaving #admin. */
export function Console({ onLock }: { onLock: () => void }): JSX.Element {
  const fleet = useFleet();

  return (
    <div style={page}>
      <div style={inner}>
        <header style={header}>
          <div>
            <div style={hTitle}>FLEET CONTROL</div>
            <div style={hSub}>ADMIN CONSOLE · {countPad(fleet.length)} AIRFRAMES</div>
          </div>
          <div style={actions}>
            <button type="button" style={ghostBtn} onClick={() => goto('display')}>
              OPEN DISPLAY
            </button>
            <button type="button" style={ghostBtn} onClick={onLock}>
              LOCK
            </button>
          </div>
        </header>

        <div style={tableCard}>
          <div style={{ ...row, ...headRow }}>
            {HEAD.map((label, i) => (
              <div key={i} style={headCell}>
                {label}
              </div>
            ))}
          </div>

          {fleet.map((a) => (
            <Row key={a.id} a={a} />
          ))}

          <button type="button" style={addBtn} onClick={() => fleetStore.add()}>
            + ADD AIRFRAME
          </button>
        </div>

        <div style={note}>CHANGES BROADCAST LIVE TO ALL TV DISPLAYS</div>
      </div>
    </div>
  );
}

/** One editable airframe row. Each control commits immediately to the store. */
function Row({ a }: { a: Airframe }): JSX.Element {
  const set =
    (field: keyof Airframe) =>
    (e: JSX.TargetedEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      fleetStore.update(a.id, field, e.currentTarget.value);

  return (
    <div style={row}>
      <input style={field} value={a.workOrder} onInput={set('workOrder')} aria-label="Work order" />
      <input
        style={field}
        value={a.registration}
        onInput={set('registration')}
        aria-label="Registration"
      />
      <textarea
        style={{ ...field, ...descField }}
        rows={2}
        value={a.description}
        onInput={set('description')}
        aria-label="Project description"
      />

      <select style={field} value={a.system} onChange={set('system')} aria-label="System">
        {SYSTEMS.map((s) => (
          <option key={s} value={s}>
            {SYSTEM_LABELS[s]}
          </option>
        ))}
      </select>

      <input
        style={field}
        value={a.tech}
        onInput={set('tech')}
        inputMode="numeric"
        aria-label="Tech"
      />

      <div style={completion}>
        <input
          type="range"
          min={0}
          max={100}
          value={a.pct}
          onInput={set('pct')}
          aria-label="Completion"
          style={range}
        />
        <span style={pctLabel}>{a.pct}%</span>
      </div>

      <input style={field} value={a.eta} onInput={set('eta')} aria-label="ETA" />

      <select style={field} value={a.flag} onChange={set('flag')} aria-label="Status">
        {FLAGS.map((f) => (
          <option key={f} value={f}>
            {STATUS[f].label}
          </option>
        ))}
      </select>

      <button
        type="button"
        style={removeBtn}
        onClick={() => fleetStore.remove(a.id)}
        aria-label="Remove airframe"
        title="Remove"
      >
        ×
      </button>
    </div>
  );
}

// --- styles (inline; values from docs/DESIGN_BRIEF.md + styles/tokens.css) ----

const page: JSX.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  height: '100%',
  overflowY: 'auto',
  padding: '30px clamp(18px, 4vw, 56px)',
  boxSizing: 'border-box',
};

const inner: JSX.CSSProperties = {
  maxWidth: '1420px',
  margin: '0 auto',
};

const header: JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: '20px',
  marginBottom: '22px',
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
  fontWeight: 400,
  fontSize: '11px',
  letterSpacing: '.18em',
  color: 'var(--text-secondary)',
  marginTop: '6px',
};

const actions: JSX.CSSProperties = {
  display: 'flex',
  gap: '10px',
};

const ghostBtn: JSX.CSSProperties = {
  padding: '9px 16px',
  background: 'rgba(120, 150, 190, 0.06)',
  border: '1px solid var(--hairline)',
  borderRadius: '9px',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '12px',
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const tableCard: JSX.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '14px',
  boxShadow: 'var(--card-shadow)',
  padding: '16px 18px',
};

const row: JSX.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: COLS,
  gap: '10px',
  alignItems: 'center',
  padding: '7px 0',
};

const headRow: JSX.CSSProperties = {
  padding: '4px 0 12px',
  borderBottom: '1px solid var(--hairline-soft)',
  marginBottom: '6px',
};

const headCell: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 500,
  fontSize: '10px',
  letterSpacing: '.16em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  paddingLeft: '2px',
};

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

// The description is a free-writing zone — let it wrap and grow instead of scrolling sideways.
const descField: JSX.CSSProperties = {
  resize: 'vertical',
  lineHeight: 1.4,
  fontSize: '12px',
};

const completion: JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const range: JSX.CSSProperties = {
  flex: 1,
  minWidth: 0,
  accentColor: 'var(--accent)',
  cursor: 'pointer',
};

const pctLabel: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  fontSize: '12px',
  color: 'var(--accent-value)',
  minWidth: '38px',
  textAlign: 'right',
};

const removeBtn: JSX.CSSProperties = {
  width: '44px',
  height: '36px',
  background: 'transparent',
  border: '1px solid var(--hairline-soft)',
  borderRadius: '8px',
  color: 'var(--danger)',
  fontSize: '18px',
  lineHeight: 1,
  cursor: 'pointer',
};

const addBtn: JSX.CSSProperties = {
  width: '100%',
  marginTop: '12px',
  padding: '11px',
  background: 'rgba(255, 158, 61, 0.08)',
  border: '1px dashed rgba(255, 158, 61, 0.4)',
  borderRadius: '9px',
  color: 'var(--accent)',
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '13px',
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const note: JSX.CSSProperties = {
  marginTop: '16px',
  textAlign: 'center',
  fontFamily: 'var(--font-mono)',
  fontWeight: 400,
  fontSize: '10px',
  letterSpacing: '.2em',
  color: 'var(--text-muted)',
};
