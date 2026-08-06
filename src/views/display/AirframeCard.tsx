// One airframe card: accent bar, the helicopter art with the "upgraded system"
// lit in the accent colour (heli-fill clipped over the dimmed heli-line) — the
// whole airframe for a full-aircraft project — work order, registration, project
// description, big completion %, animated progress bar, and a footer with the
// date over the tech's initials, plus a pulsing status chip. All values come from
// the CardVM (see derive.ts).
import type { JSX } from 'preact';
import type { CardVM } from '../../types';

const BASE = import.meta.env.BASE_URL;
const HELI_LINE = `${BASE}assets/art/heli-line.png`;
const HELI_FILL = `${BASE}assets/art/heli-fill.png`;

export function AirframeCard({ vm }: { vm: CardVM }): JSX.Element {
  return (
    <div style={card}>
      <div style={accentBar} />

      <div style={topRow}>
        <div style={heliWrap}>
          <img src={HELI_LINE} alt="" style={heliLine} />
          <div style={{ ...heliClip, clipPath: vm.clip, WebkitClipPath: vm.clip }}>
            <img src={HELI_FILL} alt="" style={{ ...heliFill, filter: vm.heliFilter }} />
          </div>
        </div>

        <div style={info}>
          <div style={headBlock}>
            <div style={woLine}>{vm.workOrder}</div>
            <div style={name}>{vm.registration}</div>
          </div>
          <div style={desc}>{vm.description}</div>
          <div style={pctRow}>
            <span style={pctBig}>{vm.pctLabel}</span>
            <span style={completeLabel}>Complete</span>
          </div>
          <div style={track}>
            <div style={{ ...fill, width: vm.barPct }} />
          </div>
        </div>
      </div>

      <div style={footer}>
        <span style={dateBlock}>
          <span style={dateCell}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.3">
              <rect x="2" y="3.5" width="12" height="11" rx="1.6" />
              <line x1="2" y1="6.5" x2="14" y2="6.5" />
              <line x1="5.5" y1="1.5" x2="5.5" y2="4.5" />
              <line x1="10.5" y1="1.5" x2="10.5" y2="4.5" />
            </svg>
            {vm.dateLabel}
          </span>
          {vm.techLabel ? <span style={techLine}>{vm.techLabel}</span> : null}
        </span>
        <span style={{ ...statusCell, color: vm.statusColor }}>
          <span
            style={{ ...statusDot, background: vm.statusColor, boxShadow: `0 0 8px ${vm.statusColor}` }}
          />
          {vm.statusLabel}
        </span>
      </div>
    </div>
  );
}

const card: JSX.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  padding: '20px 22px 16px 26px',
  borderRadius: '14px',
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  boxShadow: 'var(--card-shadow)',
  overflow: 'hidden',
};

const accentBar: JSX.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: '16px',
  bottom: '16px',
  width: '4px',
  borderRadius: '0 4px 4px 0',
  background: 'var(--accent)',
  boxShadow: '0 0 14px var(--accent)',
};

const topRow: JSX.CSSProperties = { display: 'flex', alignItems: 'center', gap: '16px' };

const heliWrap: JSX.CSSProperties = {
  position: 'relative',
  flex: '0 0 45%',
  aspectRatio: '1112 / 376',
};
const heliLine: JSX.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  opacity: 0.5,
};
const heliClip: JSX.CSSProperties = { position: 'absolute', inset: 0 };
// `filter` is supplied per-card from vm.heliFilter (the global accent tint).
const heliFill: JSX.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'contain',
};

const info: JSX.CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '9px',
};
const headBlock: JSX.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '3px' };
const woLine: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
  letterSpacing: '.16em',
  color: 'var(--text-muted)',
};
const name: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  // Design value: `clamp(16px, 1.15vw, 21px)`, which pins to its 21px maximum at
  // the authored 1920 width. Substituted because `vw` resolves against the real
  // viewport and IGNORES the Stage's transform, so on a 960px TV the clamp
  // collapsed to its 16px floor and then got scaled again — a hidden second
  // shrink. 21px is the same size the clamp gives at the design width.
  fontSize: '21px',
  letterSpacing: '.04em',
  color: 'var(--text-primary)',
  lineHeight: 1.05,
};
// Free-prose project description, clamped to 3 lines so the card height stays fixed.
const desc: JSX.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: '3', // string: a number would risk Preact appending "px"
  overflow: 'hidden',
  fontFamily: 'var(--font-body)',
  fontSize: '12.5px',
  lineHeight: 1.45,
  color: 'var(--text-secondary)',
};
const pctRow: JSX.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' };
const pctBig: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  // Design value: `clamp(28px, 2.4vw, 38px)` — pinned to 38px at the authored
  // 1920 width. Substituted for the same reason as `name` above.
  fontSize: '38px',
  color: 'var(--accent)',
  lineHeight: 1,
  textShadow: '0 0 22px var(--accent)',
};
const completeLabel: JSX.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
  color: 'var(--text-secondary)',
};
const track: JSX.CSSProperties = {
  position: 'relative',
  height: '6px',
  borderRadius: '4px',
  background: 'rgba(120,150,190,.14)',
  overflow: 'hidden',
  marginTop: '1px',
};
const fill: JSX.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  borderRadius: '4px',
  background: 'linear-gradient(90deg, var(--accent), var(--accent-light))',
  boxShadow: '0 0 10px var(--accent)',
  transition: 'width .7s cubic-bezier(.4,0,.2,1)',
};

const footer: JSX.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '16px',
  paddingTop: '13px',
  borderTop: '1px solid var(--hairline-soft)',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  letterSpacing: '.04em',
};
// The date sits on its own line with the tech's initials stacked beneath it.
const dateBlock: JSX.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: 0,
};
const dateCell: JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: 'var(--text-secondary)',
};
// Same treatment as the work-order line up top; the 22px indent (14px calendar
// icon + the 8px dateCell gap) aligns it under the date text, not the icon.
const techLine: JSX.CSSProperties = {
  paddingLeft: '22px',
  fontSize: '10.5px',
  letterSpacing: '.16em',
  color: 'var(--text-muted)',
};
const statusCell: JSX.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px' };
const statusDot: JSX.CSSProperties = {
  width: '7px',
  height: '7px',
  borderRadius: '50%',
  animation: 'blink 2s ease-in-out infinite',
};
