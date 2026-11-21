import { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { CollapsibleSection } from '../mock-analysis/CollapsibleSection';
import { ResultTables } from './ResultTables';
import { QuestionWiseTable } from './QuestionWiseTable';
import { analyzeLegacySession } from '../../services/resultContext';
import { buildResultTables } from '../../services/resultTables';
import type { QuizSession } from '../../types';

/** The shared result tables for a finished test on the older quiz engine (same tables as Practice, Test and Mock). */
export function LegacyResultTables({ session }: { session: QuizSession }) {
  const { analysis, context } = useMemo(() => analyzeLegacySession(session), [session]);
  return <ResultTables analysis={analysis} context={context} />;
}

/** Just the question-wise table — for the review-answers screen, which already lists each answer in full below it. */
export function LegacyQuestionTable({ session }: { session: QuizSession }) {
  const rows = useMemo(() => {
    const { analysis, context } = analyzeLegacySession(session);
    return buildResultTables(analysis, context).questions;
  }, [session]);
  return (
    <CollapsibleSection title="Question-wise" subtitle={`${rows.length} questions — sort and filter`} icon={<Gauge size={18} />} defaultOpen>
      <QuestionWiseTable rows={rows} showSection={false} />
    </CollapsibleSection>
  );
}
