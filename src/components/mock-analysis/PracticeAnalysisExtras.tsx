import { useEffect, useMemo, useState } from 'react';
import { Repeat } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { DataTable, type Column } from '../results/DataTable';
import { QuestionMarkdownRenderer } from '../mock/QuestionMarkdownRenderer';
import { universalAttemptsDB } from '../../services/db';
import { repeatedMistakesInSession, type RepeatedMistake } from '../../services/practiceAnalysisExtras';
import { getTopicDisplayName } from '../../data/registry/subjectRegistry';
import type { AttemptRow } from '../../services/reviewAnalytics';
import type { PracticeSession } from '../../types/practiceSession';
import type { UniversalQuestion } from '../../types/universalQuestion';

/**
 * Repeated mistakes — questions wrong in this session that were also wrong before — as a table under the shared analysis.
 * (Section-wise results moved into the shared result tables, so Practice, Test and Mock all show them the same way.)
 */
export function PracticeAnalysisExtras({ session, questionsById }: { session: PracticeSession; questionsById: Map<string, UniversalQuestion> }) {
  const [earlier, setEarlier] = useState<AttemptRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    void universalAttemptsDB.getAll().then((rows) => { if (alive) setEarlier(rows); }).catch(() => { if (alive) setEarlier([]); });
    return () => { alive = false; };
  }, []);

  const repeated = useMemo(() => (earlier ? repeatedMistakesInSession(session, questionsById, earlier) : []), [earlier, session, questionsById]);
  const subjectId = session.config.subjectIds[0] ?? '';
  const columns: Column<RepeatedMistake>[] = [
    { key: 'question', header: 'Question', render: (r) => <span className="block min-w-[12rem] max-w-[22rem]" data-testid="repeated-mistake"><QuestionMarkdownRenderer content={r.question} /></span> },
    { key: 'topic', header: 'Topic', render: (r) => (r.topicId ? getTopicDisplayName(subjectId, r.topicId) : '—') },
    { key: 'before', header: 'Wrong before', align: 'right', render: (r) => `${r.earlierWrong} time${r.earlierWrong === 1 ? '' : 's'}` },
    { key: 'attempts', header: 'Earlier attempts', align: 'right', render: (r) => r.earlierAttempts },
    { key: 'last', header: 'Last wrong', render: (r) => (r.lastWrongAt ? new Date(r.lastWrongAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—') },
  ];

  return (
    <div className="space-y-3" data-testid="practice-analysis-extras">
      {repeated.length > 0 && (
        <CollapsibleSection title="Repeated mistakes" subtitle={`${repeated.length} question${repeated.length === 1 ? '' : 's'} you have now got wrong more than once`} icon={<Repeat size={18} />} defaultOpen>
          <DataTable caption="Repeated mistakes" columns={columns} rows={repeated} rowKey={(r) => r.questionId} testId="table-repeated-mistakes" />
        </CollapsibleSection>
      )}
    </div>
  );
}
