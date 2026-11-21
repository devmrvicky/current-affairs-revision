// Which bank tests a learner is in the middle of. Sync must never swap a test's questions out from under a running attempt.

import { usePracticeSessionStore } from '../../store/practiceSessionStore';
import { useMockSessionStore } from '../../store/mockSessionStore';
import { sessionRegistry } from '../sessionRegistry';
import { BANK_ID_PREFIX } from './poolProvider';

function bankIdsOf(session: unknown): string[] {
  const s = session as { questionIds?: unknown; sections?: { questionIds?: unknown }[] } | null | undefined;
  const ids: unknown[] = [...(Array.isArray(s?.questionIds) ? s!.questionIds : []), ...(s?.sections ?? []).flatMap((x) => (Array.isArray(x.questionIds) ? x.questionIds : []))];
  return ids.filter((id): id is string => typeof id === 'string' && id.startsWith(BANK_ID_PREFIX));
}

/** Pool-id prefix of a bank test's questions, e.g. `qb:remote:avg-1:`. */
export const bankTestPrefix = (testKey: string) => `${BANK_ID_PREFIX}${testKey}:`;

/** True when an unfinished session (on screen or parked under Resume Tests) uses any question of this test. */
export async function isBankTestInUse(testKey: string): Promise<boolean> {
  const prefix = bankTestPrefix(testKey);
  const live = [usePracticeSessionStore.getState().session, useMockSessionStore.getState().session].filter(Boolean);
  const parked = (await sessionRegistry.list().catch(() => [])).map((r) => r.payload);
  return [...live, ...parked].some((s) => { const x = s as { isCompleted?: boolean; status?: string }; return !x.isCompleted && x.status !== 'completed' && bankIdsOf(s).some((id) => id.startsWith(prefix)); });
}
