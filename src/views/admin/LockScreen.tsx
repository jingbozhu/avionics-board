// Squawk-code gate for the Admin route. The board is read-only everywhere else;
// entering the transponder code 7700 (see src/auth.ts) unlocks the console for the
// rest of the browser session. A wrong code shows "ACCESS DENIED · INVALID CODE".
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { checkCode, setAuthed } from '../../auth';
import { goto } from '../../routing';

/** `onUnlock` lets the parent (AdminView) swap in the console after a correct code. */
export function LockScreen({ onUnlock }: { onUnlock: () => void }): JSX.Element {
  const [code, setCode] = useState('');
  const [denied, setDenied] = useState(false);

  function submit(e: Event): void {
    e.preventDefault();
    if (checkCode(code)) {
      setAuthed();
      onUnlock();
    } else {
      setDenied(true);
      setCode('');
    }
  }

  return (
    <div style={wrap}>
      <form style={card} onSubmit={submit}>
        <div style={diamond} aria-hidden="true" />
        <div style={title}>RESTRICTED</div>
        <div style={subtitle}>FLEET CONTROL · AUTHORIZED PERSONNEL ONLY</div>

        <input
          type="password"
          inputMode="numeric"
          value={code}
          autoFocus
          placeholder="ENTER SQUAWK CODE"
          aria-label="Squawk code"
          onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
            setCode(e.currentTarget.value);
            if (denied) setDenied(false);
          }}
          style={input}
        />

        <button type="submit" style={authBtn}>
          AUTHENTICATE
        </button>

        <div style={{ ...denial, visibility: denied ? 'visible' : 'hidden' }}>
          ACCESS DENIED · INVALID CODE
        </div>

        <button type="button" style={returnLink} onClick={() => goto('display')}>
          ← RETURN TO DISPLAY
        </button>
      </form>
    </div>
  );
}

// --- styles (inline; values from docs/DESIGN_BRIEF.md + styles/tokens.css) ----

const wrap: JSX.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
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

const title: JSX.CSSProperties = {
  fontFamily: 'var(--font-cond)',
  fontWeight: 700,
  fontSize: '26px',
  letterSpacing: '.22em',
  color: 'var(--text-primary)',
};

const subtitle: JSX.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 400,
  fontSize: '10px',
  letterSpacing: '.18em',
  color: 'var(--text-muted)',
  marginTop: '8px',
  marginBottom: '26px',
};

const input: JSX.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '14px 16px',
  background: 'rgba(8, 14, 24, 0.6)',
  border: '1px solid var(--hairline)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '18px',
  letterSpacing: '.4em',
  textAlign: 'center',
  outline: 'none',
};

const authBtn: JSX.CSSProperties = {
  width: '100%',
  marginTop: '14px',
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

const denial: JSX.CSSProperties = {
  marginTop: '16px',
  fontFamily: 'var(--font-mono)',
  fontWeight: 500,
  fontSize: '11px',
  letterSpacing: '.16em',
  color: 'var(--danger)',
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
