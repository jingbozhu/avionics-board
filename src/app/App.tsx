// Root of the board. Renders the fixed full-viewport stage with its layered
// backdrop (gradient · grid · stars · warm glow) and the spinning Earth behind
// everything, then the active route on top: the read-only Display board, or the
// squawk-gated Admin console.
import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { useRoute } from '../routing';
import { startKeepAwake } from '../kiosk/keepAwake';
import { GlobeCanvas } from '../globe/GlobeCanvas';
import { DisplayView } from '../views/display/DisplayView';
import { AdminView } from '../views/admin/AdminView';
import { ACCENTS, DEFAULT_ACCENT } from '../theme/tokens';

export function App(): JSX.Element {
  const route = useRoute();

  // Drive the accent from the selected theme (default amber). tokens.css already
  // defaults to amber; this makes the accent swappable in one place.
  useEffect(() => {
    const acc = ACCENTS[DEFAULT_ACCENT];
    const r = document.documentElement.style;
    r.setProperty('--accent', acc.c);
    r.setProperty('--accent-light', acc.light);
    r.setProperty('--heli-filter', acc.filter);
  }, []);

  // Hold a screen wake lock so the Fire TV wall never force-sleeps mid-shift.
  useEffect(() => {
    startKeepAwake();
  }, []);

  return (
    <div style={root}>
      <div style={gridOverlay} aria-hidden="true" />
      <div style={stars} aria-hidden="true" />
      <div style={glow} aria-hidden="true" />
      <GlobeCanvas />
      {route === 'admin' ? <AdminView /> : <DisplayView />}
    </div>
  );
}

const root: JSX.CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  background: 'var(--page-grad)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
};

const gridOverlay: JSX.CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'linear-gradient(rgba(96,128,170,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(96,128,170,.045) 1px, transparent 1px)',
  backgroundSize: '64px 64px',
  WebkitMaskImage: 'radial-gradient(120% 92% at 50% 26%, #000 36%, transparent 84%)',
  maskImage: 'radial-gradient(120% 92% at 50% 26%, #000 36%, transparent 84%)',
  pointerEvents: 'none',
};

const stars: JSX.CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'radial-gradient(1.5px 1.5px at 12% 22%, rgba(255,255,255,.7), transparent 60%), radial-gradient(1px 1px at 78% 16%, rgba(255,255,255,.5), transparent 60%), radial-gradient(1px 1px at 45% 12%, rgba(255,255,255,.35), transparent 60%), radial-gradient(1px 1px at 88% 30%, rgba(255,255,255,.5), transparent 60%), radial-gradient(1px 1px at 30% 30%, rgba(255,255,255,.3), transparent 60%), radial-gradient(1px 1px at 8% 40%, rgba(255,255,255,.35), transparent 60%)',
  pointerEvents: 'none',
};

const glow: JSX.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: '-26%',
  transform: 'translateX(-50%)',
  width: '140%',
  height: '60%',
  background: 'radial-gradient(closest-side, rgba(255,150,60,.12), transparent 74%)',
  pointerEvents: 'none',
};
