import { useEffect } from 'react';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { useQuizStore } from '../store/quizStore';
import { useMockSessionStore } from '../store/mockSessionStore';
import type { SessionKind } from '../types/savedSession';

const HEARTBEAT_MS = 10_000;

function controls(kind: SessionKind) {
  if (kind === 'universal') { const s = usePracticeSessionStore.getState(); return { activate: s.activate, suspend: s.suspend, touch: s.touch }; }
  if (kind === 'legacy') { const s = useQuizStore.getState(); return { activate: s.activate, suspend: s.suspend, touch: s.touch }; }
  const s = useMockSessionStore.getState();
  return { activate: s.activate, suspend: s.suspend, touch: s.touch };
}

/**
 * Keeps a test's clock honest while its page is mounted.
 *   • mount          → the test is on screen: time spent away is folded into its clock.
 *   • while open     → a heartbeat keeps "last active" fresh (crash recovery uses it).
 *   • page hidden/closed or unmount → the clock stops (the session is suspended, not submitted).
 *   • page shown again (back/forward cache, tab restored) → clock resumes.
 * `present` should be true once the page has a real session to look after.
 * Pages should treat a session with `suspendedAt` set as "not ready yet" — the activate on
 * mount clears it within a frame — so an expiry check never sees time that was spent away.
 */
export function useSessionPresence(kind: SessionKind, present: boolean): void {
  useEffect(() => {
    if (!present) return;
    controls(kind).activate();
    const heartbeat = window.setInterval(() => controls(kind).touch(), HEARTBEAT_MS);
    const onHide = () => controls(kind).suspend();
    const onShow = () => controls(kind).activate();
    const onVisible = () => { if (document.visibilityState === 'visible') controls(kind).activate(); };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisible);
      controls(kind).suspend();
    };
  }, [kind, present]);
}
