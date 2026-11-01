// ─── Return routes (pure) ────────────────────────────────────────────────────
// A test remembers the screen it was entered from so Close can go back there.
// The route travels in React Router navigation state and is also saved on the
// session (so it survives a refresh or a resume). Anything read back is
// validated before it is used: only same-app absolute paths, and never a test
// screen itself (that would bounce the learner straight back into the test).

const TEST_SCREEN = /^\/(session$|quiz$|mock-tests\/[^/]+\/session$)/;

export function isSafeReturnRoute(route: unknown): route is string {
  if (typeof route !== 'string') return false;
  if (route.length === 0 || route.length > 300) return false;
  if (!route.startsWith('/') || route.startsWith('//')) return false; // same-origin absolute path only
  if (route.includes('\\') || [...route].some((ch) => ch.charCodeAt(0) < 32)) return false; // no backslashes (browsers treat them as slashes) or control characters
  const pathname = route.split(/[?#]/)[0];
  return !TEST_SCREEN.test(pathname);
}

/** First valid candidate wins; otherwise the engine-appropriate fallback. */
export function resolveReturnRoute(candidates: unknown[], fallback: string): string {
  for (const c of candidates) if (isSafeReturnRoute(c)) return c;
  return fallback;
}

/** `path + search` of the current location — what a test records as "where I came from". */
export function currentRoute(loc: { pathname: string; search?: string }): string {
  return `${loc.pathname}${loc.search ?? ''}`;
}

export const RETURN_FALLBACK = {
  universal: '/practice/configure',
  legacy: '/chapter-wise-current-affairs',
  mock: '/mock-tests',
} as const;

/** Where a test was entered from: the route, and that screen's position in the browser history stack. */
export interface ReturnOrigin {
  route: string;
  /** react-router's history index of the origin screen — lets Close step back through history only when the previous entry really is the origin. */
  idx: number;
}

/** Reads the screen the learner is on right now. Called at the moment a test is started, before navigating into it. */
export function captureOrigin(): ReturnOrigin {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  return { route: `${window.location.pathname}${window.location.search}`, idx };
}
