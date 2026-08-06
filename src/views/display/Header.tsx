// Top bar: brand cluster on the left (diamond logo + title + subtitle) and three
// monospace stat blocks on the right — AIRFRAMES (count), UTC and LOCAL clocks.
// The clocks tick once a second; LOCAL is real Pacific time and tracks DST, so
// its label flips PST/PDT. See clocks.ts.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { formatUTC, formatPacific } from '../../time/clocks';
import { countPad } from '../../model/derive';

export function Header({ count }: { count: number }): JSX.Element {
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
          <div style={title}>IAS ARTIFICIAL INTELLIGENCE PLATFORM</div>
          <div style={subtitle}>Avionics Operation Horizon</div>
        </div>
      </div>

      <div style={stats}>
        <Stat label="AIRFRAMES" value={countPad(count)} ls=".08em" />
        <div style={divider} />
        <Stat label="UTC" value={formatUTC(now)} ls=".06em" />
        <div style={divider} />
        <Stat label="LOCAL" value={formatPacific(now)} ls=".05em" />
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
