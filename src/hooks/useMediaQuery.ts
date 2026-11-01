import { useSyncExternalStore } from 'react';

/** Tracks a CSS media query. Tailwind's `lg` is `(min-width: 1024px)`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
