import { useCallback, useEffect, useState } from 'react';

export type SectionState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

/**
 * Loads one section's data and reports `loading` / `error` / `ready`, so every card on a screen can show its own
 * skeleton, error-with-retry or content without one slow or failing section holding up the others.
 * `loader` must be stable (a module-level function or a useCallback); a new loader reloads, keeping the old data on screen meanwhile.
 */
export function useAsyncSection<T>(loader: () => Promise<T>): [SectionState<T>, () => void] {
  const [state, setState] = useState<SectionState<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loader().then(
      (data) => { if (!cancelled) setState({ status: 'ready', data }); },
      (err: unknown) => {
        console.error('Home section failed to load', err);
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
      },
    );
    return () => { cancelled = true; };
  }, [loader, nonce]);

  const reload = useCallback(() => { setState({ status: 'loading' }); setNonce((n) => n + 1); }, []);
  return [state, reload];
}
