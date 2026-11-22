import { CheckCircle2, ListFilter, RotateCcw } from 'lucide-react';
import type { Difficulty, QuestionType } from '../../types/universalQuestion';

export type PaletteDifficultyOrder = 'original' | 'hard-to-easy' | 'easy-to-hard';

export interface QuestionPaletteFilterState {
  solvedOnly: boolean;
  difficultyOrder: PaletteDifficultyOrder;
  questionType: QuestionType | 'all';
}

export interface QuestionPaletteItemMeta {
  index: number;
  answered: boolean;
  difficulty?: Difficulty;
  questionType: QuestionType;
}

export const DEFAULT_QUESTION_PALETTE_FILTERS: QuestionPaletteFilterState = {
  solvedOnly: false,
  difficultyOrder: 'original',
  questionType: 'all',
};

const QUESTION_TYPE_ORDER: QuestionType[] = ['mcq', 'true_false', 'fill_blank'];
const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'MCQ',
  true_false: 'True / False',
  fill_blank: 'Fill in the blanks',
};

export function questionTypeLabel(type: QuestionType): string {
  return QUESTION_TYPE_LABEL[type];
}

export function availablePaletteQuestionTypes(items: readonly QuestionPaletteItemMeta[]): QuestionType[] {
  const found = new Set(items.map((item) => item.questionType));
  return QUESTION_TYPE_ORDER.filter((type) => found.has(type));
}

/**
 * Filters only the question-number palette. It deliberately does not mutate or
 * shorten the active session, so scores, timers, section boundaries and the
 * original question numbering remain unchanged.
 */
export function filterPaletteQuestionIndices(
  items: readonly QuestionPaletteItemMeta[],
  filters: QuestionPaletteFilterState,
): number[] {
  const selected = items.filter((item) => {
    if (filters.solvedOnly && !item.answered) return false;
    if (filters.questionType !== 'all' && item.questionType !== filters.questionType) return false;
    return true;
  });

  if (filters.difficultyOrder === 'original') return selected.map((item) => item.index);

  const rank: Record<Difficulty, number> = filters.difficultyOrder === 'hard-to-easy'
    ? { hard: 0, medium: 1, easy: 2 }
    : { easy: 0, medium: 1, hard: 2 };

  return selected
    .map((item, stableOrder) => ({ item, stableOrder }))
    .sort((a, b) => {
      const aRank = a.item.difficulty ? rank[a.item.difficulty] : 3;
      const bRank = b.item.difficulty ? rank[b.item.difficulty] : 3;
      return aRank - bRank || a.stableOrder - b.stableOrder;
    })
    .map(({ item }) => item.index);
}

interface QuestionPaletteFiltersProps {
  value: QuestionPaletteFilterState;
  onChange: (next: QuestionPaletteFilterState) => void;
  availableTypes: QuestionType[];
  hasDifficulty: boolean;
  visibleCount: number;
  totalCount: number;
}

export function QuestionPaletteFilters({ value, onChange, availableTypes, hasDifficulty, visibleCount, totalCount }: QuestionPaletteFiltersProps) {
  const isFiltered = value.solvedOnly || value.difficultyOrder !== 'original' || value.questionType !== 'all';
  const set = (patch: Partial<QuestionPaletteFilterState>) => onChange({ ...value, ...patch });
  const chipBase = 'min-h-8 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

  return (
    <section className="mb-4 rounded-xl border p-3 space-y-2.5" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }} aria-label="Filter question palette">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          <ListFilter size={13} /> Filter questions
        </div>
        <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>Showing {visibleCount}/{totalCount}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={value.solvedOnly}
          onClick={() => set({ solvedOnly: !value.solvedOnly })}
          className={chipBase}
          style={value.solvedOnly
            ? { borderColor: '#16a34a', background: 'rgba(22,163,74,0.12)', color: '#16a34a' }
            : { borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-secondary)' }}
        >
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> Solved</span>
        </button>
        <button type="button" aria-pressed={value.difficultyOrder === 'hard-to-easy'} disabled={!hasDifficulty}
          onClick={() => set({ difficultyOrder: value.difficultyOrder === 'hard-to-easy' ? 'original' : 'hard-to-easy' })}
          className={`${chipBase} disabled:opacity-35 disabled:cursor-not-allowed`}
          style={value.difficultyOrder === 'hard-to-easy'
            ? { borderColor: '#ef4444', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }
            : { borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-secondary)' }}
          title={!hasDifficulty ? 'Difficulty is not recorded for this set' : 'Sort hard questions first'}
        >Hard → Easy</button>
        <button type="button" aria-pressed={value.difficultyOrder === 'easy-to-hard'} disabled={!hasDifficulty}
          onClick={() => set({ difficultyOrder: value.difficultyOrder === 'easy-to-hard' ? 'original' : 'easy-to-hard' })}
          className={`${chipBase} disabled:opacity-35 disabled:cursor-not-allowed`}
          style={value.difficultyOrder === 'easy-to-hard'
            ? { borderColor: '#0d9488', background: 'rgba(13,148,136,0.1)', color: '#0d9488' }
            : { borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-secondary)' }}
          title={!hasDifficulty ? 'Difficulty is not recorded for this set' : 'Sort easy questions first'}
        >Easy → Hard</button>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="question-palette-type" className="text-[11px] font-medium whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Question type</label>
        <select
          id="question-palette-type"
          aria-label="Question type"
          className="min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-primary)' }}
          value={value.questionType}
          onChange={(event) => set({ questionType: event.target.value as QuestionType | 'all' })}
        >
          <option value="all">All types</option>
          {availableTypes.map((type) => <option key={type} value={type}>{QUESTION_TYPE_LABEL[type]}</option>)}
        </select>
        {isFiltered && (
          <button type="button" onClick={() => onChange(DEFAULT_QUESTION_PALETTE_FILTERS)} className="p-2 rounded-lg border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--card)' }} aria-label="Clear question filters" title="Clear filters">
            <RotateCcw size={13} />
          </button>
        )}
      </div>
    </section>
  );
}
