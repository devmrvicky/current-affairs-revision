import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, SUPABASE_ENABLED } from '../services/supabaseClient';

interface AuthStore {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  isInitializing: boolean; // true until the initial session restore completes
  authError: string | null;

  init: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Permanently deletes the account server-side (via edge function) and signs out locally. */
  deleteAccount: () => Promise<{ error: string | null }>;
  clearError: () => void;
}

async function fetchIsAdmin(userId: string): Promise<boolean> {
  if (!SUPABASE_ENABLED) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.role === 'admin';
}

let _initialized = false;

export const useAuthStore = create<AuthStore>((set, get) => ({
  session: null,
  user: null,
  isAdmin: false,
  isInitializing: true,
  authError: null,

  init: async () => {
    if (_initialized) return;
    _initialized = true;

    if (!SUPABASE_ENABLED) {
      set({ isInitializing: false });
      return;
    }

    // Restore whatever session is already persisted locally by the SDK.
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    set({
      session,
      user: session?.user ?? null,
      isAdmin: session ? await fetchIsAdmin(session.user.id) : false,
      isInitializing: false,
    });

    // React to sign-in / sign-out / token refresh for the rest of the app's life.
    supabase.auth.onAuthStateChange(async (event, newSession) => {
      set({ session: newSession, user: newSession?.user ?? null });

      if (event === 'SIGNED_IN' && newSession) {
        set({ isAdmin: await fetchIsAdmin(newSession.user.id) });
        // Dynamic import avoids a hard circular dependency between
        // authStore <-> syncService at module-load time.
        const { onSignedIn } = await import('../services/syncService');
        onSignedIn().catch((err) => console.error('[Auth] onSignedIn sync failed:', err));
      }

      if (event === 'SIGNED_OUT') {
        set({ isAdmin: false });
        const { onSignedOut } = await import('../services/syncService');
        onSignedOut();
      }
    });
  },

  signInWithGoogle: async () => {
    if (!SUPABASE_ENABLED) {
      set({ authError: 'Sync is not configured for this build.' });
      return;
    }
    set({ authError: null });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) set({ authError: error.message });
  },

  signInWithEmail: async (email, password) => {
    if (!SUPABASE_ENABLED) return { error: 'Sync is not configured for this build.' };
    set({ authError: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) set({ authError: error.message });
    return { error: error?.message ?? null };
  },

  signUpWithEmail: async (email, password) => {
    if (!SUPABASE_ENABLED) return { error: 'Sync is not configured for this build.' };
    set({ authError: null });
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) set({ authError: error.message });
    return { error: error?.message ?? null };
  },

  signOut: async () => {
    if (!SUPABASE_ENABLED) return;
    await supabase.auth.signOut();
    set({ session: null, user: null, isAdmin: false });
  },

  deleteAccount: async () => {
    if (!SUPABASE_ENABLED) return { error: 'Sync is not configured for this build.' };
    const { session } = get();
    if (!session) return { error: 'Not signed in.' };

    const { data, error } = await supabase.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error as string };

    await supabase.auth.signOut();
    set({ session: null, user: null, isAdmin: false });
    return { error: null };
  },

  clearError: () => set({ authError: null }),
}));
