import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RETURN_FALLBACK, isSafeReturnRoute } from '../services/returnRoute';
import type { SessionKind } from '../types/savedSession';

interface SavedOrigin {
  returnRoute?: string;
  returnHistoryIdx?: number;
}

/**
 * The Close button's behaviour: leave the test (its clock stops via useSessionPresence, its progress
 * stays saved — nothing is submitted, completed or deleted) and go ONE STEP BACK to the screen it was
 * entered from.
 *
 * Where that is, in order of trust: the origin handed over in navigation state when the test was
 * opened or resumed (Home passes itself) → the origin saved on the session → a sensible list page for
 * the kind of test. Every candidate is validated first. When the previous history entry really is the
 * origin (same route, and exactly one step behind the test) we step back through history, so the
 * browser Back stack stays honest and the origin's scroll position is restored; otherwise — a fresh
 * load, a refresh that lost history, a retake that replaced an entry — we replace the test entry with
 * the validated route rather than guess.
 */
export function useExitTest(kind: SessionKind, saved: SavedOrigin | undefined): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const savedRoute = saved?.returnRoute;
  const savedIdx = saved?.returnHistoryIdx;

  return useCallback(() => {
    const state = (location.state as { returnTo?: unknown; returnIdx?: unknown } | null) ?? {};
    const fromState = isSafeReturnRoute(state.returnTo);
    const savedIsSafe = isSafeReturnRoute(savedRoute);
    const route = fromState ? (state.returnTo as string) : savedIsSafe ? savedRoute : RETURN_FALLBACK[kind];
    const originIdx = fromState ? (typeof state.returnIdx === 'number' ? state.returnIdx : undefined) : savedIdx;
    const knownOrigin = fromState || savedIsSafe;
    const currentIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;

    if (knownOrigin && originIdx !== undefined && originIdx >= 0 && currentIdx === originIdx + 1) navigate(-1);
    else navigate(route, { replace: true });
  }, [kind, savedRoute, savedIdx, location.state, navigate]);
}
