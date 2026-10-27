import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, PlayCircle, History, ChevronDown, Eye } from 'lucide-react';
import type { PracticeTestDefinition } from '../../services/testLibraryBuilder';
import type { TestAttemptStats } from '../../services/testAttemptStats';
import type { SessionMode } from '../../types/practiceSession';
import { describeTestScope } from '../../services/practiceTestRepository';
import { formatAttemptDate, formatDuration, percentColor } from './format';

interface TestRowProps {
  test: PracticeTestDefinition;
  stats: TestAttemptStats | undefined;
  /** Mode the primary button starts in (fixed exam mocks are always timed tests). */
  mode: SessionMode;
  busy: boolean;
  onStart: (test: PracticeTestDefinition, mode: SessionMode) => void;
}

const HISTORY_PREVIEW = 5;

/**
 * One fixed test: name, size, attempts, best / latest, last attempted, Start or
 * Retake, and an expandable per-attempt history. Shows only what the ledger
 * actually holds — a test with no attempts says so instead of showing zeros.
 */
export const TestRow = memo(function TestRow({ test, stats, mode, busy, onStart }: TestRowProps) {
  const navigate = useNavigate();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const effectiveMode: SessionMode = test.isFixedMock ? 'test' : mode;
  const attempted = !!stats;
  const verb = attempted ? 'Retake' : 'Start';
  const modeLabel = effectiveMode === 'test' ? 'Test' : 'Practice';
  const attempts = stats?.attempts ?? [];
  const shown = showAll ? attempts : attempts.slice(0, HISTORY_PREVIEW);

  return (
    <div className="px-3 py-2.5" data-testid="test-row" data-test-id={test.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-semibold text-sm leading-snug break-words" style={{ color: 'var(--text-primary)' }}>{test.title}</p>
          <p className="text-xs mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5" style={{ color: 'var(--text-muted)' }}>
            <span>{test.questionCount} Questions</span>
            <span aria-hidden>·</span>
            <span className="capitalize">{test.difficulty === 'mixed' ? 'Mixed' : test.difficulty}</span>
            {test.isFixedMock && <><span aria-hidden>·</span><span>Timed</span></>}
            {test.scope === 'topic' && test.topicTitle && (
              <span className="px-1.5 py-px rounded-full text-[10px]" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{test.topicTitle}</span>
            )}
            {test.scope === 'multi-topic' && (
              <span className="px-1.5 py-px rounded-full text-[10px]" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{test.topicCount} topics</span>
            )}
            {test.scope === 'paper' && (
              <span className="px-1.5 py-px rounded-full text-[10px]" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{describeTestScope(test.scope)}</span>
            )}
            {test.skippedQuestionCount > 0 && (
              <span title={`${test.skippedQuestionCount} incomplete question${test.skippedQuestionCount === 1 ? '' : 's'} in the source file (no options or answer key) are left out of this test`} className="text-[10px]">
                (+{test.skippedQuestionCount} incomplete skipped)
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onStart(test, effectiveMode)}
          disabled={busy}
          aria-label={`${verb} ${modeLabel}: ${test.title}`}
          className="btn-primary flex-shrink-0 flex items-center gap-1.5 text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          {attempted ? <RotateCcw size={13} /> : <PlayCircle size={13} />}
          <span>{verb} {modeLabel}</span>
        </button>
      </div>

      {attempted && stats ? (
        <div className="mt-1.5 text-xs space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Attempts: <strong style={{ color: 'var(--text-primary)' }}>{stats.timesAttempted}</strong></span>
            <span>Best: <strong style={{ color: percentColor(stats.bestAccuracy) }}>{stats.bestCorrect}/{stats.bestTotal}</strong></span>
            <span>Latest: <strong style={{ color: 'var(--text-primary)' }}>{stats.latestCorrect}/{stats.latestTotal}</strong></span>
          </p>
          <p style={{ color: 'var(--text-muted)' }}>Last attempted: {formatAttemptDate(stats.lastAttemptedAt)}</p>
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            aria-expanded={historyOpen}
            className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <History size={12} /> View History <ChevronDown size={12} className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-xs inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400" aria-hidden /> Not attempted yet
        </p>
      )}

      {historyOpen && stats && (
        <ol className="mt-2 rounded-xl overflow-hidden text-xs" style={{ border: '1px solid var(--border)' }} aria-label={`Attempt history for ${test.title}`}>
          {shown.map((a, i) => {
            const number = attempts.length - i;
            return (
              <li key={a.sessionId} className="flex items-center justify-between gap-2 px-3 py-2" style={{ borderTop: i === 0 ? undefined : '1px solid var(--border)' }}>
                <div className="min-w-0">
                  <p style={{ color: 'var(--text-primary)' }}>
                    <span className="font-semibold">#{number}</span>{' '}
                    <span style={{ color: percentColor(a.percent) }} className="font-semibold">{a.correct}/{a.total}</span>{' '}
                    <span style={{ color: 'var(--text-muted)' }}>({a.percent}%)</span>
                    {a.marks !== undefined && a.maxMarks !== undefined && <span style={{ color: 'var(--text-muted)' }}> · {a.marks}/{a.maxMarks} marks</span>}
                  </p>
                  <p style={{ color: 'var(--text-muted)' }}>
                    {formatAttemptDate(a.completedAt)}
                    {a.mode && <> · {a.mode === 'test' ? 'Test' : 'Practice'}</>}
                    {a.timeSeconds > 0 && <> · {formatDuration(a.timeSeconds)}</>}
                  </p>
                </div>
                {a.canReview ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/session/result/${encodeURIComponent(a.sessionId)}`)}
                    className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <Eye size={12} /> Review
                  </button>
                ) : (
                  <span className="flex-shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }} title="Recorded before detailed attempt review existed — the score is kept, the answers weren't.">Score only</span>
                )}
              </li>
            );
          })}
          {attempts.length > HISTORY_PREVIEW && (
            <li style={{ borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full py-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {showAll ? 'Show fewer' : `Show all ${attempts.length} attempts`}
              </button>
            </li>
          )}
        </ol>
      )}
    </div>
  );
});
