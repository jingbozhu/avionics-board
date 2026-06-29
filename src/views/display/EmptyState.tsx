// Shown when no airframes are on line. Fills the area below the header, centered.
import type { JSX } from 'preact';

export function EmptyState(): JSX.Element {
  return (
    <div style={wrap}>
      <div style={headline}>NO AIRFRAMES ON LINE</div>
      <div style={hint}>ADD PROJECTS VIA FLEET CONTROL · /#admin</div>
    </div>
  );
}

const wrap: JSX.CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
};
const headline: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontSize: '26px',
  letterSpacing: '.18em',
  color: '#5b6f8a',
};
const hint: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  letterSpacing: '.2em',
  color: '#3f5167',
};
