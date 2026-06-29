// Admin route shell. Renders the squawk-code LockScreen until this session is
// authenticated, then the editable fleet Console. The unlock flag lives in
// sessionStorage (see src/auth.ts); local `authed` state just drives the swap so
// AuthN re-renders immediately without a route change.
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { isAuthed, clearAuthed } from '../../auth';
import { LockScreen } from './LockScreen';
import { Console } from './Console';

export function AdminView(): JSX.Element {
  const [authed, setAuthedState] = useState(isAuthed);

  if (!authed) {
    return <LockScreen onUnlock={() => setAuthedState(true)} />;
  }

  return (
    <Console
      onLock={() => {
        clearAuthed();
        setAuthedState(false);
      }}
    />
  );
}
