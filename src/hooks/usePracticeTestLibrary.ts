import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPracticeTestLibrary } from '../services/practiceTestRepository';
import { getAllTestAttemptStats, type TestAttemptStats } from '../services/attemptLedgerService';
import type { TestLibrary, ActivityLookup } from '../services/testLibraryBuilder';

export interface PracticeTestLibraryData {
  library: TestLibrary | null;
  stats: Map<string, TestAttemptStats>;
  /** Activity view for the filter/sort layer. */
  activity: ActivityLookup;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const EMPTY_STATS = new Map<string, TestAttemptStats>();

/**
 * Loads the test hierarchy for one subject plus the learner's attempt stats for
 * it — one cached library build and one ledger read, however many test cards
 * render. Pass `null` (or enabled=false) to defer loading until it is needed.
 */
export function usePracticeTestLibrary(examId: string, subjectId: string | null, enabled = true): PracticeTestLibraryData {
  const [library, setLibrary] = useState<TestLibrary | null>(null);
  const [stats, setStats] = useState<Map<string, TestAttemptStats>>(EMPTY_STATS);
  const [loading, setLoading] = useState(Boolean(subjectId) && enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!subjectId || !enabled) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    getPracticeTestLibrary(examId, subjectId)
      .then(async (lib) => {
        const s = await getAllTestAttemptStats(lib.examId);
        if (cancelled) return;
        setLibrary(lib);
        setStats(s);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load practice tests', err);
        setError(err instanceof Error ? err.message : 'Could not load tests');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [examId, subjectId, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const activity = useCallback<ActivityLookup>(
    (testId) => {
      const s = stats.get(testId);
      return s ? { attempts: s.timesAttempted, lastAttemptedAt: s.lastAttemptedAt, bestPercent: s.bestAccuracy } : undefined;
    },
    [stats]
  );

  return useMemo(() => ({ library, stats, activity, loading, error, reload }), [library, stats, activity, loading, error, reload]);
}
