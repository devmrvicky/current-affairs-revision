import { useEffect, useMemo, useState } from 'react';
import { Layers, Repeat } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { universalAttemptsDB } from '../../services/db';
import { repeatedMistakesInSession, sectionBreakdown } from '../../services/practiceAnalysisExtras';
import { formatClock } from '../../services/sessionTiming';
import { getTopicDisplayName } from '../../data/registry/subjectRegistry';
import type { AttemptRow } from '../../services/reviewAnalytics';
import type { PracticeSession } from '../../types/practiceSession';
import type { UniversalQuestion } from '../../types/universalQuestion';

/** Section-wise performance (sectional tests) and repeated mistakes (any test), under the shared analysis. */
export function PracticeAnalysisExtras({ session, questionsById }: { session: PracticeSession; questionsById: Map<string, UniversalQuestion> }) {
  const [earlier, setEarlier] = useState<AttemptRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    void universalAttemptsDB.getAll().then((rows) => { if (alive) setEarlier(rows); }).catch(() => { if (alive) setEarlier([]); });
    return () => { alive = false; };
  }, []);

  const sections = useMemo(() => sectionBreakdown(session, questionsById), [session, questionsById]);
  const repeated = useMemo(() => (earlier ? repeatedMistakesInSession(session, questionsById, earlier) : []), [earlier, session, questionsById]);

  return (
    <div className="space-y-3" data-testid="practice-analysis-extras">
      {sections.length > 0 && (
        <CollapsibleSection title="Section-wise performance" subtitle={`${sections.length} sections, each with its own timer`} icon={<Layers size={18} />} defaultOpen>
          <ul className="space-y-2">
            {sections.map((s) => (
              <li key={s.id} className="card p-3 text-xs" data-testid="section-result">
                <div className="flex items-center justify-between gap-2"><strong className="text-sm" style={{ color: 'var(--text-primary)' }}>{s.label}</strong><span style={{ color: 'var(--text-secondary)' }}>{s.accuracy === null ? 'Nothing answered' : `${s.accuracy}% accuracy`}</span></div>
                <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>{s.correct} correct · {s.incorrect} wrong · {s.unattempted} skipped of {s.questions}</p>
                <p style={{ color: 'var(--text-muted)' }}>Time: {s.timeSpentSeconds === null ? 'not recorded' : formatClock(s.timeSpentSeconds)} of {formatClock(s.allottedSeconds)} allotted</p>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
      {repeated.length > 0 && (
        <CollapsibleSection title="Repeated mistakes" subtitle={`${repeated.length} question${repeated.length === 1 ? '' : 's'} you have now got wrong more than once`} icon={<Repeat size={18} />} defaultOpen>
          <ul className="space-y-2">
            {repeated.map((r) => (
              <li key={r.questionId} className="card p-3 text-xs" data-testid="repeated-mistake">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{r.question}</p>
                <p className="mt-1" style={{ color: 'var(--text-muted)' }}>Wrong again now — and {r.earlierWrong} time{r.earlierWrong === 1 ? '' : 's'} before{r.topicId ? ` · ${getTopicDisplayName(session.config.subjectIds[0] ?? '', r.topicId)}` : ''}</p>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}
