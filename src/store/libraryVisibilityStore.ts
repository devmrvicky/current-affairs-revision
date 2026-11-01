import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Practice by Topic: which groups the main list shows ─────────────────────
// A "group" is one entry of the test library's top level: a chapter, or the "Mock papers" group.
// Hiding a group only removes it from the MAIN LISTING — its tests, questions and source files are
// never touched, and it stays reachable (and startable) from the Manage visibility view.
//
// Preferences are keyed by exam + subject + group, so the same chapter name under another subject or
// exam keeps its own setting. A group with no explicit preference follows that subject's policy for
// "new" groups — by default shown, so content added later never silently disappears.

export type NewGroupPolicy = 'show' | 'hide';

interface LibraryVisibilityState {
  /** `${examId}::${subjectId}::${groupKey}` → true (shown) / false (hidden). Absent = follow the policy. */
  prefs: Record<string, boolean>;
  /** `${examId}::${subjectId}` → what an unlisted group does. */
  newGroupPolicy: Record<string, NewGroupPolicy>;
  setVisible: (scope: string, groupKey: string, visible: boolean) => void;
  setMany: (scope: string, groupKeys: string[], visible: boolean) => void;
  setPolicy: (scope: string, policy: NewGroupPolicy) => void;
  /** Forget every explicit choice and the policy for one subject: everything shown again. */
  restoreAll: (scope: string) => void;
}

export const visibilityScope = (examId: string, subjectId: string) => `${examId}::${subjectId}`;
const prefKey = (scope: string, groupKey: string) => `${scope}::${groupKey}`;

export const useLibraryVisibilityStore = create<LibraryVisibilityState>()(
  persist(
    (set) => ({
      prefs: {},
      newGroupPolicy: {},
      setVisible: (scope, groupKey, visible) => set((s) => ({ prefs: { ...s.prefs, [prefKey(scope, groupKey)]: visible } })),
      setMany: (scope, groupKeys, visible) =>
        set((s) => {
          const prefs = { ...s.prefs };
          for (const k of groupKeys) prefs[prefKey(scope, k)] = visible;
          return { prefs };
        }),
      setPolicy: (scope, policy) => set((s) => ({ newGroupPolicy: { ...s.newGroupPolicy, [scope]: policy } })),
      restoreAll: (scope) =>
        set((s) => {
          const prefs = Object.fromEntries(Object.entries(s.prefs).filter(([k]) => !k.startsWith(`${scope}::`)));
          const newGroupPolicy = { ...s.newGroupPolicy };
          delete newGroupPolicy[scope];
          return { prefs, newGroupPolicy };
        }),
    }),
    { name: 'examverse-library-visibility', version: 1 }
  )
);

/** Pure lookup, so components can derive visibility from a state snapshot. */
export function isGroupVisible(state: Pick<LibraryVisibilityState, 'prefs' | 'newGroupPolicy'>, scope: string, groupKey: string): boolean {
  const explicit = state.prefs[prefKey(scope, groupKey)];
  if (explicit !== undefined) return explicit;
  return state.newGroupPolicy[scope] !== 'hide';
}
