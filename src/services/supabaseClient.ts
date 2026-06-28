import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** True once VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are actually configured. */
export const SUPABASE_ENABLED = !!url && !!anonKey;

// Supabase is an optional layer: the app must keep working 100% from local
// IndexedDB if it's not configured (or the user never signs in). We still
// create a client either way so callers don't need to null-check everywhere —
// network calls just fail fast if SUPABASE_ENABLED is false, which every
// call site checks before using it.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
