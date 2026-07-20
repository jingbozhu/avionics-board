// IAI front door, laid out exactly like the board: a Header bar over centred
// content, with the geodesic field burning in the bottom-right corner where the
// Earth sits on the Display route.
//
// The gate card follows the Admin LockScreen's idiom — it is the same kind of
// object (a door), so it wears the same chrome. Styles are inline with values
// from tokens.css, matching every other view in this project (no CSS modules).

import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { formatUTC } from '../time/clocks';
import { FIELD_SEED } from './geodesic';
import { IaiField } from './IaiField';
import { goto } from '../routing';

export function IaiView(): JSX.Element {
  return (
    <>
      <IaiField />
      <div style={wrap}>
        <IaiHeader />
        <div style={body}>
          <Gate />
        </div>
      </div>
    </>
  );
}

// --- header (mirrors views/display/Header.tsx) -----------------------------

function IaiHeader(): JSX.Element {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header style={bar}>
      <div style={leftCluster}>
        <div style={logo}>
          <div style={logoOuter} />
          <div style={logoInner} />
        </div>
        <div>
          <div style={title}>IAS ARTIFICIAL INTELLIGENCE</div>
          <div style={subtitle}>Airborne Inference Console · Front Door</div>
        </div>
      </div>

      <div style={stats}>
        <Stat label="UNIT" value="IAI-01" ls=".08em" />
        <div style={divider} />
        <Stat label="UTC" value={formatUTC(now)} ls=".06em" />
        <div style={divider} />
        <Stat label="FIELD" value={String(FIELD_SEED)} ls=".08em" />
      </div>
    </header>
  );
}

function Stat({ label, value, ls }: { label: string; value: string; ls: string }): JSX.Element {
  return (
    <div>
      <div style={statLabel}>{label}</div>
      <div style={{ ...statValue, letterSpacing: ls }}>{value}</div>
    </div>
  );
}

// --- the gate (mirrors views/admin/LockScreen.tsx) -------------------------

function Gate(): JSX.Element {
  return (
    <div style={card}>
      <div style={diamond} aria-hidden="true" />
      <div style={gateTitle}>IAI-01</div>
      <div style={gateSubtitle}>INFERENCE CORE · ORTHODROMIC FIELD NOMINAL</div>

      <button type="button" style={enterBtn} onClick={() => goto('iai-console')}>
        ENTER CONSOLE
      </button>

      <div style={standby}>
        <span style={dot} />
        LINK STANDBY · FIELD UNRESOLVED
      </div>

      <button type="button" style={returnLink} onClick={() => goto('display')}>
        ← RETURN TO DISPLAY
      </button>
    </div>
  );
}

// --- styles ---------------------------------------------------------------

const wrap: JSX.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 5,
};

const body: JSX.CSSProperties = {
  flex: '1 1 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  // Sit left of centre so the card clears the field burning in the corner.
  paddingRight: '18vw',
};

const bar: JSX.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '22px 40px 16px',
  flex: '0 0 auto',
};

const leftCluster: JSX.CSSProperties = { display: 'flex', alignItems: 'center', gap: '18px' };

const logo: JSX.CSSProperties = { position: 'relative', width: '34px', height: '34px', flex: '0 0 auto' };
const logoOuter: JSX.CSSProperties = {
  position: 'absolute',
  inset: '3px',
  background: 'var(--logo-grad)',
  transform: 'rotate(45deg)',
  borderRadius: '5px',
  boxShadow: '0 0 18px rgba(255,150,60,.55)',
};
const logoInner: JSX.CSSProperties = {
  position: 'absolute',
  inset: '11px',
  background: '#0a1322',
  transform: 'rotate(45deg)',
  borderRadius: '2px',
};

const title: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '27px',
  letterSpacing: '.12em',
  color: 'var(--text-primary-2)',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};
const subtitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 300,
  fontSize: '13px',
  letterSpacing: '.04em',
  color: 'var(--text-subtle)',
  marginTop: '5px',
};

const stats: JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: '26px',
  fontFamily: 'var(--font-mono)',
};
const divider: JSX.CSSProperties = { width: '1px', background: 'var(--hairline)' };
const statLabel: JSX.CSSProperties = {
  fontSize: '11px',
  letterSpacing: '.22em',
  color: 'var(--text-muted)',
};
const statValue: JSX.CSSProperties = {
  fontSize: '22px',
  fontWeight: 600,
  color: 'var(--accent-value)',
  marginTop: '3px',
};

const card: JSX.CSSProperties = {
  width: '380px',
  maxWidth: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  padding: '40px 34px 30px',
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '16px',
  boxShadow: 'var(--card-shadow)',
};

const diamond: JSX.CSSProperties = {
  width: '20px',
  height: '20px',
  borderRadius: '5px',
  background: 'var(--logo-grad)',
  transform: 'rotate(45deg)',
  boxShadow: '0 0 22px -4px rgba(255, 158, 61, 0.7)',
  marginBottom: '22px',
};

const gateTitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '26px',
  letterSpacing: '.22em',
  color: 'var(--text-primary)',
};

const gateSubtitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 400,
  fontSize: '10px',
  letterSpacing: '.18em',
  color: 'var(--text-muted)',
  marginTop: '8px',
  marginBottom: '26px',
};

const enterBtn: JSX.CSSProperties = {
  width: '100%',
  padding: '13px',
  background: 'var(--btn-grad)',
  border: 'none',
  borderRadius: '10px',
  color: '#2a1604',
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '14px',
  letterSpacing: '.2em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const standby: JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '9px',
  marginTop: '16px',
  fontFamily: 'var(--font-mono)',
  fontWeight: 500,
  fontSize: '11px',
  letterSpacing: '.16em',
  color: 'var(--text-secondary)',
};

const dot: JSX.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: 'var(--status-green)',
  boxShadow: '0 0 10px rgba(95,210,138,.8)',
  animation: 'blink 2s infinite',
};

const returnLink: JSX.CSSProperties = {
  marginTop: '10px',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '.14em',
  cursor: 'pointer',
  padding: '4px',
};
