import { useState } from 'react';
import { AlertTriangle, ListChecks } from 'lucide-react';
import { ChapterTestGroup } from './ChapterTestGroup';
import { ModeSwitch } from './ModeSwitch';
import { useStartPracticeTest } from '../../hooks/useStartPracticeTest';
import type { PracticeTestLibraryData } from '../../hooks/usePracticeTestLibrary';
import type { SessionMode } from '../../types/practiceSession';

/**
 * The compact "T" control that sits beside a chapter's Practice control.
 * Purely presentational: the caller owns the open state so it can also decide
 * when to start loading the tests (they are not fetched until first opened).
 */
export function ChapterTestsButton({ chapterTitle, open, onToggle, className = '' }: { chapterTitle: string; open: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-pressed={open}
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} tests for ${chapterTitle}`}
      title="Tests"
      className={`w-8 h-8 flex-shrink-0 rounded-lg text-sm font-display font-bold flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        open ? 'bg-brand-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-white/10'
      } ${className}`}
      style={open ? undefined : { border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
    >
      T
    </button>
  );
}

interface ChapterTestsPanelProps {
  data: PracticeTestLibraryData;
  /** Chapter id and the chapter's own subject — together the chapter's identity in the library. */
  chapterId: string;
  chapterSubjectId: string;
  chapterTitle: string;
  /** Starting mode for tests launched from the panel. "T" means test mode, so that's the default. */
  defaultMode?: SessionMode;
}

/** The tests that belong to one chapter — each one a separate, selectable item with its own attempts and scores. Nothing here merges a chapter's files into one test. */
export function ChapterTestsPanel({ data, chapterId, chapterSubjectId, chapterTitle, defaultMode = 'test' }: ChapterTestsPanelProps) {
  const [mode, setMode] = useState<SessionMode>(defaultMode);
  const { start, startingId } = useStartPracticeTest();

  if (data.loading && !data.library) {
    return (
      <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading tests">
        {[1, 2].map((i) => <div key={i} className="h-12 rounded-xl shimmer" style={{ background: 'var(--border)' }} />)}
      </div>
    );
  }
  if (data.error) {
    return (
      <div className="p-4 text-center">
        <AlertTriangle size={18} className="mx-auto mb-1 text-red-500" />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Couldn't load tests.</p>
        <button type="button" onClick={data.reload} className="btn-ghost text-xs mt-1">Try again</button>
      </div>
    );
  }

  const chapter = data.library?.chapters.find((c) => c.kind === 'chapter' && c.chapterId === chapterId && c.chapterSubjectId === chapterSubjectId);
  if (!chapter) {
    return (
      <div className="p-4 text-center" role="status">
        <ListChecks size={18} className="mx-auto mb-1" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No separate tests for {chapterTitle} yet.</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Add test files to this chapter's folder and they appear here automatically.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {chapter.testCount} test{chapter.testCount === 1 ? '' : 's'} · {chapter.questionCount} questions
        </p>
        <ModeSwitch mode={mode} onChange={setMode} />
      </div>
      <ChapterTestGroup chapter={chapter} stats={data.stats} mode={mode} startingId={startingId} onStart={start} />
    </div>
  );
}
