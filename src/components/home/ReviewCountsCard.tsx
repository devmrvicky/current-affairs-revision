import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { loadReviewItems } from '../../services/reviewCenterService';
import { reviewMetrics, REVIEW_CATEGORIES, type ReviewCategory } from '../../services/reviewItems';
import { useAsyncSection } from '../../hooks/useAsyncSection';
import { HomeCard, CardSkeleton, CardError, CardEmpty } from './HomeCard';

const load = async () => reviewMetrics(await loadReviewItems());
// The order learners think in: mistakes first, then doubts, practice, revision, and what they flagged.
const ORDER: ReviewCategory[] = ['wrong', 'doubtful', 'practice', 'revision', 'review'];
const LABEL: Record<ReviewCategory, string> = { wrong: 'Wrong questions', doubtful: 'Doubtful', practice: 'Further practice', revision: 'Revision', review: 'Marked for review' };

/** What is waiting in Review Center, counted from the learner's own saved questions and attempt history. */
export function ReviewCountsCard() {
  const navigate = useNavigate();
  const [state, reload] = useAsyncSection(load);
  return (
    <HomeCard title="Review Center" icon={<Sparkles size={16} className="text-indigo-500" aria-hidden />} testId="home-review-counts"
      action={<button type="button" onClick={() => navigate('/review-center')} className="min-h-11 px-1 text-xs font-medium text-brand-500 hover:text-brand-600">Open →</button>}>
      {state.status === 'loading' && <CardSkeleton rows={3} />}
      {state.status === 'error' && <CardError message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.total === 0 && (
        <CardEmpty text="Nothing to review yet. Wrong answers and the questions you mark will collect here." actionLabel="Start practising" onAction={() => navigate('/practice/configure')} />
      )}
      {state.status === 'ready' && state.data.total > 0 && (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {ORDER.map((id) => (
            <li key={id}>
              <button type="button" onClick={() => navigate('/review-center')} data-testid={`review-count-${id}`} className="w-full min-h-11 flex items-center justify-between gap-3 text-sm text-left"
                title={REVIEW_CATEGORIES.find((c) => c.id === id)?.description}>
                <span style={{ color: 'var(--text-secondary)' }}>{LABEL[id]}</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{state.data.byCategory[id]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
