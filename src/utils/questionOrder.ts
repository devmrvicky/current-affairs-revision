import type { QuestionOrderMode } from '../types/questionOrder';

export interface QuestionOrderMeta {
  difficulty?: string;
}

function difficultyRank(value?: string): number {
  const normalized = (value ?? '').trim().toLowerCase();
  if (['hard', 'difficult', 'कठिन', 'मुश्किल', 'कठोर'].includes(normalized)) return 3;
  if (['easy', 'आसान', 'सरल', 'सहज'].includes(normalized)) return 1;
  if (['medium', 'moderate', 'मध्यम', 'औसत'].includes(normalized)) return 2;
  return 2; // Missing/unknown labels remain in the middle, without being misrepresented as easy or hard.
}

/**
 * Returns a new session order. Only IDs in `reorderableIds` move; earlier
 * questions and locked sectional-test questions remain in their exact slots.
 * `order[newIndex] = questionId` is the resulting test sequence.
 */
export function buildQuestionOrder(
  currentIds: readonly string[],
  originalIds: readonly string[],
  metadata: ReadonlyMap<string, QuestionOrderMeta>,
  mode: QuestionOrderMode,
  reorderableIds: readonly string[],
  random: () => number = Math.random,
): string[] {
  const result = [...currentIds];
  const movable = new Set(reorderableIds);
  const slots = currentIds.map((id, index) => movable.has(id) ? index : -1).filter((index) => index >= 0);
  if (slots.length < 2 || mode === 'original' && originalIds.length === 0) return result;

  const currentMovable = slots.map((index) => currentIds[index]);
  let ordered: string[];

  if (mode === 'original') {
    const remaining = new Set(currentMovable);
    ordered = originalIds.filter((id) => remaining.delete(id));
    for (const id of currentMovable) if (remaining.delete(id)) ordered.push(id);
  } else if (mode === 'shuffle') {
    ordered = [...currentMovable];
    for (let i = ordered.length - 1; i > 0; i--) {
      const j = Math.max(0, Math.min(i, Math.floor(random() * (i + 1))));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
    // Avoid a no-op shuffle (possible by chance), so turning Shuffle ON always
    // produces a visibly different upcoming sequence when two or more remain.
    if (ordered.every((id, index) => id === currentMovable[index])) {
      ordered.push(ordered.shift()!);
    }
  } else {
    const direction = mode === 'hard-to-easy' ? -1 : 1;
    ordered = [...currentMovable].sort((a, b) => {
      const rank = (difficultyRank(metadata.get(a)?.difficulty) - difficultyRank(metadata.get(b)?.difficulty)) * direction;
      return rank || currentMovable.indexOf(a) - currentMovable.indexOf(b);
    });
  }

  slots.forEach((slot, index) => { result[slot] = ordered[index] ?? currentIds[slot]; });
  return result;
}

export function isQuestionOrderPermutation(currentIds: readonly string[], nextIds: readonly string[]): boolean {
  if (currentIds.length !== nextIds.length) return false;
  const current = new Set(currentIds);
  return current.size === currentIds.length && nextIds.every((id) => current.has(id)) && new Set(nextIds).size === nextIds.length;
}
