import { useMemo, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import type { QuestionAnalysis } from '../../types/mockAnalysis';

type SolutionFilter = 'all' | 'correct' | 'incorrect' | 'unattempted' | 'marked';

export function SolutionsReview({ solutions }: { solutions: QuestionAnalysis[] }) {
  const [filter, setFilter] = useState<SolutionFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const subjects = useMemo(() => Array.from(new Set(solutions.map((s) => s.subjectId))), [solutions]);

  const filtered = solutions.filter((s) => {
    if (subjectFilter !== 'all' && s.subjectId !== subjectFilter) return false;
    switch (filter) {
      case 'correct': return s.status === 'correct';
      case 'incorrect': return s.status === 'incorrect';
      case 'unattempted': return s.status === 'unattempted';
      case 'marked': return s.isMarkedForReview;
      default: return true;
    }
  });

  function jumpTo(questionId: string) {
    itemRefs.current[questionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['all', 'correct', 'incorrect', 'unattempted', 'marked'] as SolutionFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize"
            style={filter === f ? { background: 'var(--brand-500, #6366f1)', color: '#fff' } : { background: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {f}
          </button>
        ))}
        {subjects.length > 1 && (
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <option value="all">All subjects</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Question palette — jump directly to any question, colored by status */}
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
        {filtered.map((s, i) => {
          const bg = s.status === 'correct' ? '#22c55e' : s.status === 'incorrect' ? '#ef4444' : 'var(--border)';
          const color = s.status === 'unattempted' ? 'var(--text-secondary)' : '#fff';
          return (
            <button
              key={s.questionId}
              onClick={() => jumpTo(s.questionId)}
              className="relative w-8 h-8 rounded-lg text-xs font-semibold flex items-center justify-center"
              style={{ background: bg, color }}
              aria-label={`Jump to question ${i + 1}, ${s.status}`}
            >
              {i + 1}
              {s.isMarkedForReview && <Flag size={8} className="absolute -top-1 -right-1 text-amber-500" fill="currentColor" />}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>No questions match this filter.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s, i) => {
            const selectedOption = s.options.find((o) => o.id === s.selectedAnswer);
            const correctOption = s.options.find((o) => o.id === s.correctAnswer);
            return (
              <div
                key={s.questionId}
                ref={(el) => { itemRefs.current[s.questionId] = el; }}
                className="rounded-xl p-4 border"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Question {i + 1}</p>
                  <span
                    className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    style={{
                      background: s.status === 'correct' ? 'rgba(34,197,94,0.12)' : s.status === 'incorrect' ? 'rgba(239,68,68,0.12)' : 'var(--border)',
                      color: s.status === 'correct' ? '#22c55e' : s.status === 'incorrect' ? '#ef4444' : 'var(--text-muted)',
                    }}
                  >
                    {s.status}
                  </span>
                </div>
                <p className="text-sm font-medium mb-3 whitespace-pre-line" style={{ color: 'var(--text-primary)' }}>{s.question}</p>
                <div className="space-y-1 mb-2">
                  {s.options.map((opt) => {
                    const isSelected = opt.id === s.selectedAnswer;
                    const isCorrect = opt.id === s.correctAnswer;
                    return (
                      <div
                        key={opt.id}
                        className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2"
                        style={{
                          background: isCorrect ? 'rgba(34,197,94,0.1)' : isSelected ? 'rgba(239,68,68,0.1)' : 'transparent',
                          color: isCorrect ? '#22c55e' : isSelected ? '#ef4444' : 'var(--text-secondary)',
                        }}
                      >
                        <span className="font-semibold">{opt.id}.</span> {opt.text}
                      </div>
                    );
                  })}
                </div>
                {!selectedOption && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not attempted — correct answer: {correctOption?.id}</p>}
                {s.explanation && <p className="text-xs mt-2 p-2.5 rounded-lg" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{s.explanation}</p>}
                <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Time spent: {s.timeSpentSeconds}s{s.isMarkedForReview ? ' · Marked for review' : ''}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
