// IAI console — SHELL ONLY.
//
// The front door is the deliverable; this is the room behind it, built so the
// entry affordance is not a dead end. It deliberately claims nothing it cannot
// do: there is no model, no inference, no link. Wire a real backend in here.

import type { JSX } from 'preact';
import { goto } from '../routing';
import { IaiField } from './IaiField';

export function IaiConsole(): JSX.Element {
  return (
    <>
      <IaiField />
      <div style={stage}>
        <header style={bar}>
          <div>
            <div style={label}>IAS ARTIFICIAL INTELLIGENCE</div>
            <div style={heading}>IAI-01 CONSOLE</div>
          </div>
          <button type="button" style={backLink} onClick={() => goto('iai')}>
            ← FRONT DOOR
          </button>
        </header>

        <div style={rule} />

        <div style={body}>
          <div style={panel}>
            <div style={panelLabel}>SESSION</div>
            <div style={panelValue}>NOT ESTABLISHED</div>
            <p style={note}>
              No inference backend is attached to this build. The console shell is present so the
              front door resolves to a real destination; wire a transport here when one exists.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

const stage: JSX.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: '30px 40px',
  zIndex: 5,
};

const bar: JSX.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  flex: '0 0 auto',
};

const backLink: JSX.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '.14em',
  cursor: 'pointer',
  padding: '4px',
};

const label: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '.28em',
  color: 'var(--text-muted)',
};

const heading: JSX.CSSProperties = {
  marginTop: '7px',
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '27px',
  letterSpacing: '.12em',
  color: 'var(--text-primary-2)',
  lineHeight: 1,
};

const rule: JSX.CSSProperties = {
  height: '1px',
  margin: '20px 0 0',
  background: 'var(--hairline)',
  flex: '0 0 auto',
};

const body: JSX.CSSProperties = {
  flex: '1 1 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const panel: JSX.CSSProperties = {
  width: '460px',
  padding: '28px 30px',
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '4px',
  boxShadow: 'var(--card-shadow)',
};

const panelLabel: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '.22em',
  color: 'var(--text-muted)',
};

const panelValue: JSX.CSSProperties = {
  marginTop: '6px',
  fontFamily: 'var(--font-mono)',
  fontSize: '20px',
  fontWeight: 600,
  letterSpacing: '.1em',
  color: 'var(--accent-value)',
};

const note: JSX.CSSProperties = {
  margin: '18px 0 0',
  fontFamily: 'var(--font-body)',
  fontWeight: 300,
  fontSize: '13px',
  lineHeight: 1.65,
  letterSpacing: '.02em',
  color: 'var(--text-subtle)',
};
