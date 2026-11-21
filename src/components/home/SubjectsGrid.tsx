import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { useExamStore } from '../../store/examStore';
import { useStatisticsStore } from '../../store/statsStore';
import { getExam, getSyllabusWithCounts } from '../../services/examService';
import { getSubjectPerformance } from '../../services/attemptLedgerService';
import { getChaptersForSubject } from '../../services/universalChapterRepository';
import { buildSubjectCards, type SubjectCardData } from '../../services/homeSnapshots';
import { useAsyncSection } from '../../hooks/useAsyncSection';
import { HomeCard, CardSkeleton, CardError, CardEmpty } from './HomeCard';

/**
 * Every subject of the selected exam in one card format — Maths, English, Reasoning, General Awareness, Current Affairs…
 * Current Affairs is simply one more subject here. Accuracy and attempted come from the stored attempt ledger.
 */
export function SubjectsGrid() {
  const navigate = useNavigate();
  const { selectedExamId } = useExamStore();
  const loader = useCallback(async () => {
    if (!getExam(selectedExamId)) return { hasExam: false, cards: [] as SubjectCardData[] };
    await useStatisticsStore.getState().load();
    const [rows, performance] = await Promise.all([getSyllabusWithCounts(selectedExamId), getSubjectPerformance()]);
    const stats = useStatisticsStore.getState().stats;
    const fallback = stats && stats.totalTests > 0 ? stats.averageAccuracy : null;
    return { hasExam: true, cards: buildSubjectCards(rows, performance, (id) => getChaptersForSubject(id).length, fallback) };
  }, [selectedExamId]);
  const [state, reload] = useAsyncSection(loader);

  return (
    <HomeCard title="Subjects" icon={<Layers size={16} className="text-brand-500" aria-hidden />} testId="home-subjects">
      {state.status === 'loading' && <CardSkeleton rows={4} />}
      {state.status === 'error' && <CardError message={state.message} onRetry={reload} />}
      {state.status === 'ready' && !state.data.hasExam && <CardEmpty text="Choose your exam to see its subjects." actionLabel="Choose exam" onAction={() => navigate('/exams')} />}
      {state.status === 'ready' && state.data.hasExam && state.data.cards.length === 0 && <CardEmpty text="This exam has no subjects yet." actionLabel="Switch exam" onAction={() => navigate('/exams')} />}
      {state.status === 'ready' && state.data.cards.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {state.data.cards.map((c) => (
            <li key={c.id} className="min-w-0">
              <button type="button" onClick={() => navigate(`/chapters/${c.id}`)} data-testid={`subject-${c.id}`}
                className="w-full text-left rounded-xl p-3 min-h-11 transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500" style={{ border: '1px solid var(--border)' }}>
                <p className="font-display font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {c.chapters} {c.chapters === 1 ? 'chapter' : 'chapters'}{c.questions > 0 ? ` · ${c.questions} questions` : ' · no questions yet'}
                </p>
                {c.accuracy === null ? (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Not started yet</p>
                ) : (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><div className="h-full rounded-full bg-brand-500" style={{ width: `${c.accuracy}%` }} /></div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Accuracy {c.accuracy}%{c.attempted !== null ? ` · ${c.attempted} attempted` : ''}</p>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
