import { useEffect, useState, type FormEvent } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { getLockRecord, hasPassword, setupPassword, tryUnlock } from '../../services/author/authorLockService';
import { MIN_PASSWORD_LENGTH } from '../../services/author/authorCrypto';
import { useAuthorLockStore } from '../../store/authorLockStore';

/** Setup (first visit) or unlock. Shown whenever the studio is locked — which is every fresh start. */
export function AuthorLockGate() {
  const unlock = useAuthorLockStore((s) => s.unlock);
  const [mode, setMode] = useState<'loading' | 'setup' | 'unlock'>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [has, rec] = await Promise.all([hasPassword(), getLockRecord()]);
      if (!alive) return;
      setMode(has ? 'unlock' : 'setup');
      if (rec && rec.lockedUntil > Date.now()) setWaitUntil(rec.lockedUntil); // the delay survives a reload
    })();
    return () => { alive = false; };
  }, []);

  // Countdown display only; the real gate is the persisted timestamp checked in tryUnlock.
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [waitUntil]);

  const secondsLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'setup') {
        if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
        if (password !== confirm) return setError('The two passwords do not match.');
        const r = await setupPassword(password);
        if ('reason' in r) return setError(r.reason === 'already-set' ? 'A password is already set. Reload and unlock instead.' : `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
        unlock();
      } else {
        const r = await tryUnlock(password);
        if (!('reason' in r)) return unlock();
        const t = Date.now();
        setNow(t);
        if (r.reason === 'throttled') { setWaitUntil(t + r.retryAfterMs); setError('Too many attempts. Please wait.'); }
        else if (r.reason === 'wrong') { if (r.retryAfterMs > 0) setWaitUntil(t + r.retryAfterMs); setError(r.failedAttempts >= 3 ? 'Incorrect password. Further attempts are delayed.' : 'Incorrect password.'); }
        else setError('No password is set yet.');
        setPassword('');
      }
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'loading') return <div className="card h-48 shimmer max-w-md mx-auto mt-10" style={{ background: 'var(--border)' }} />;

  const locked = secondsLeft > 0;
  return (
    <div className="max-w-md mx-auto mt-6 sm:mt-12">
      <form onSubmit={submit} className="card p-5 sm:p-6 space-y-4" aria-labelledby="author-lock-title">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-brand-500/10"><Lock size={20} className="text-brand-500" /></span>
          <div>
            <h1 id="author-lock-title" className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Author Studio</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{mode === 'setup' ? 'Set a password to protect this workspace' : 'Locked — enter your password'}</p>
          </div>
        </div>

        <label className="block text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>{mode === 'setup' ? 'New password' : 'Password'}</span>
          <input type="password" autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy || locked} autoFocus
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </label>
        {mode === 'setup' && (
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Confirm password</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy}
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </label>
        )}

        <div role="alert" aria-live="assertive" className="text-sm min-h-5" style={{ color: '#dc2626' }}>
          {locked ? `Try again in ${secondsLeft}s.` : error}
        </div>

        <button type="submit" disabled={busy || locked || password.length === 0} className="btn-primary w-full py-2.5 text-sm">
          {busy ? 'Checking…' : mode === 'setup' ? 'Set password & open' : 'Unlock'}
        </button>

        <div className="flex gap-2 text-[11px] leading-snug p-3 rounded-xl" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
          <ShieldAlert size={14} className="shrink-0 mt-0.5" aria-hidden />
          <p>
            This is a privacy gate on this device, not server-side security and not encryption: question files are stored unencrypted in this browser,
            so anyone with access to your browser profile could still read them. Your password never leaves this device, and it cannot be recovered if forgotten.
          </p>
        </div>
      </form>
    </div>
  );
}
