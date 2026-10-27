import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { TestRow } from './TestRow';
import { shouldShowTopicGroups, type LibraryChapter, type PracticeTestDefinition } from '../../services/testLibraryBuilder';
import type { TestAttemptStats } from '../../services/testAttemptStats';
import type { SessionMode } from '../../types/practiceSession';

interface ChapterTestGroupProps {
  chapter: LibraryChapter;
  stats: Map<string, TestAttemptStats>;
  mode: SessionMode;
  startingId: string | null;
  onStart: (test: PracticeTestDefinition, mode: SessionMode) => void;
  /** Open every topic group (used while searching/filtering so matches are visible). */
  forceOpen?: boolean;
}

/**
 * The tests of ONE chapter. Chapter-level and multi-topic tests are listed
 * first; topic-scoped tests are grouped under collapsible topic headers — but
 * only when there's more than one group to tell apart, so a chapter with a
 * single topic doesn't cost an extra click.
 */
export function ChapterTestGroup({ chapter, stats, mode, startingId, onStart, forceOpen = false }: ChapterTestGroupProps) {
  const [openTopics, setOpenTopics] = useState<Set<string>>(new Set());
  const grouped = shouldShowTopicGroups(chapter);

  const renderRow = (t: PracticeTestDefinition) => (
    <TestRow key={t.id} test={t} stats={stats.get(t.id)} mode={mode} busy={startingId === t.id} onStart={onStart} />
  );

  if (!grouped) {
    const all = [...chapter.chapterTests, ...chapter.topics.flatMap((g) => g.tests)];
    return <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{all.map(renderRow)}</div>;
  }

  function toggle(topicId: string) {
    setOpenTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  return (
    <div>
      {chapter.chapterTests.length > 0 && (
        <div>
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Chapter tests · {chapter.chapterTests.length}
          </p>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{chapter.chapterTests.map(renderRow)}</div>
        </div>
      )}
      {chapter.topics.map((group) => {
        const open = forceOpen || openTopics.has(group.topicId);
        const attempted = group.tests.filter((t) => stats.has(t.id)).length;
        return (
          <div key={group.topicId} style={{ borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => toggle(group.topicId)}
              aria-expanded={open}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <ChevronRight size={14} className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Topic</span>
              <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{group.title}</span>
              <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                {group.tests.length} test{group.tests.length === 1 ? '' : 's'} · {group.questionCount} Qs{attempted > 0 && ` · ${attempted} attempted`}
              </span>
            </button>
            {open && <div className="divide-y pl-3" style={{ borderColor: 'var(--border)' }}>{group.tests.map(renderRow)}</div>}
          </div>
        );
      })}
    </div>
  );
}
