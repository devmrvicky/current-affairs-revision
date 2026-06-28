import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, LogOut, Loader2, ShieldAlert, Trash2, RefreshCw, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useSyncStatusStore } from '../../store/syncStatusStore';
import { SUPABASE_ENABLED } from '../../services/supabaseClient';
import { triggerSync, deleteCloudData } from '../../services/syncService';

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.8 14.3-5l-6.6-5.4C29.6 35.3 26.9 36 24 36c-5.2 0-9.7-3.3-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.6 5.4C41.6 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  );
}

export function AccountSyncCard() {
  const { session, user, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, deleteAccount, authError, clearError } = useAuthStore();
  const { status, pendingCount, lastSyncedAt } = useSyncStatusStore();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteCloud, setConfirmDeleteCloud] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!SUPABASE_ENABLED) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-2">
          <Cloud size={18} style={{ color: 'var(--text-muted)' }} />
          <h2 className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>Account & Sync</h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Sync isn't configured for this build yet. Your progress stays on this device.
        </p>
      </div>
    );
  }

  async function handleEmailSubmit() {
    if (!email.trim() || !password) {
      toast.error('Enter an email and password');
      return;
    }
    setSubmitting(true);
    const { error } = mode === 'signin'
      ? await signInWithEmail(email.trim(), password)
      : await signUpWithEmail(email.trim(), password);
    setSubmitting(false);

    if (error) {
      toast.error(error);
    } else if (mode === 'signup') {
      toast.success('Check your email to confirm your account.');
    } else {
      toast.success('Signed in!');
    }
  }

  async function handleSyncNow() {
    setBusy(true);
    await triggerSync();
    setBusy(false);
    toast.success('Sync complete');
  }

  async function handleDeleteCloudData() {
    setBusy(true);
    const { error } = await deleteCloudData();
    setBusy(false);
    setConfirmDeleteCloud(false);
    if (error) toast.error(error);
    else toast.success('Cloud data deleted. This device keeps its local copy.');
  }

  async function handleDeleteAccount() {
    setBusy(true);
    const { error } = await deleteAccount();
    setBusy(false);
    setConfirmDeleteAccount(false);
    if (error) toast.error(error);
    else toast.success('Account deleted.');
  }

  // ─── Signed in ────────────────────────────────────────────────────────────
  if (session && user) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <Cloud size={18} className="text-brand-500" />
          <h2 className="font-display font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>Account & Sync</h2>
        </div>

        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
          <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
            <Mail size={15} className="text-brand-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user.email}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {status === 'syncing' ? 'Syncing…' :
               status === 'pending' ? `${pendingCount} change(s) pending` :
               status === 'offline' ? 'Offline — will sync when reconnected' :
               status === 'error' ? 'Sync issue — will retry' :
               lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` :
               'Synced'}
            </p>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={busy}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
            title="Sync now"
          >
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <button
          onClick={() => signOut()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 border-[var(--border)] hover:border-red-300 hover:text-red-500 transition-colors mb-5"
          style={{ color: 'var(--text-secondary)' }}
        >
          <LogOut size={14} /> Sign Out
        </button>

        {/* Data management */}
        <div className="pt-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={14} className="text-red-500" />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Data Management</p>
          </div>

          {!confirmDeleteCloud ? (
            <button
              onClick={() => setConfirmDeleteCloud(true)}
              className="w-full text-left text-sm py-2.5 px-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors flex items-center justify-between"
              style={{ color: 'var(--text-secondary)' }}
            >
              Delete cloud data <Trash2 size={14} className="text-red-400" />
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 mb-2">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Removes everything synced to the server. This device keeps its local copy.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDeleteCloud(false)} className="flex-1 btn-secondary text-xs py-2">Cancel</button>
                <button onClick={handleDeleteCloudData} disabled={busy} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors">
                  {busy ? <Loader2 size={13} className="animate-spin mx-auto" /> : 'Delete Cloud Data'}
                </button>
              </div>
            </div>
          )}

          {!confirmDeleteAccount ? (
            <button
              onClick={() => setConfirmDeleteAccount(true)}
              className="w-full text-left text-sm py-2.5 px-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors flex items-center justify-between"
              style={{ color: 'var(--text-secondary)' }}
            >
              Delete my account <Trash2 size={14} className="text-red-400" />
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Permanently deletes your account and all synced data. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDeleteAccount(false)} className="flex-1 btn-secondary text-xs py-2">Cancel</button>
                <button onClick={handleDeleteAccount} disabled={busy} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors">
                  {busy ? <Loader2 size={13} className="animate-spin mx-auto" /> : 'Delete Account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Signed out ───────────────────────────────────────────────────────────
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-2">
        <Cloud size={18} className="text-brand-500" />
        <h2 className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>Account & Sync</h2>
      </div>
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        Optional — the app works fully offline. Sign in only if you want your progress backed up and synced across devices.
      </p>

      <button
        onClick={() => signInWithGoogle()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 border-[var(--border)] hover:border-brand-300 transition-colors mb-3"
        style={{ color: 'var(--text-primary)' }}
      >
        <GoogleIcon /> Continue with Google
      </button>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or</span>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      </div>

      <div className="space-y-2">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm border-2 outline-none focus:border-brand-400 transition-colors"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleEmailSubmit(); }}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm border-2 outline-none focus:border-brand-400 transition-colors"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <AnimatePresence>
          {authError && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-red-500"
            >
              {authError}
            </motion.p>
          )}
        </AnimatePresence>
        <button onClick={handleEmailSubmit} disabled={submitting} className="w-full btn-primary text-sm py-2.5 flex items-center justify-center gap-2">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
        <button
          onClick={() => { setMode((m) => (m === 'signin' ? 'signup' : 'signin')); clearError(); }}
          className="w-full text-xs text-center text-brand-500 hover:underline py-1"
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
