// ─── Closed (archived) tests: a read-only look at what was answered ──────────
// ✕ on a test archives it with the full session exactly as it was. This turns that record back into the same question rows the result
// tables use, so the Review Center can show "your answer vs the correct answer" — VIEW ONLY. A closed test is not resumed or re-submitted.

import { archivedSessionsDB } from './db';
import { resolveQuestionsByIds } from './questionRepository';
import { analyzePracticeSession } from './practiceAnalysisService';
import { analyzeLegacySession, practiceResultContext } from './resultContext';
import { buildResultTables, marksFor, type QuestionRow } from './resultTables';
import { getTopicDisplayName, subjectRegistry } from '../data/registry/subjectRegistry';
import type { ArchivedSessionRecord } from '../types/savedSession';
import type { MockSession } from '../types/mockSession';
import type { PracticeSession } from '../types/practiceSession';
import type { QuizSession } from '../types';
import type { UniversalQuestion } from '../types/universalQuestion';

export const listArchivedSessions = (): Promise<ArchivedSessionRecord[]> => archivedSessionsDB.getAll();

const textOf = (q: UniversalQuestion, optionId: string | null) => (optionId === null ? null : q.options.find((o) => o.id === optionId)?.text ?? optionId);

function mockRows(session: MockSession, byId: Map<string, UniversalQuestion>): QuestionRow[] {
  let no = 0;
  return session.sections.flatMap((section) => section.questionIds.map((id): QuestionRow | null => {
    const q = byId.get(id);
    const st = session.states[id];
    no += 1;
    if (!q) return null; // the question is no longer available: it is left out rather than shown wrongly
    const selected = st?.selectedAnswer ?? null;
    const status = selected === null ? 'skipped' : selected === q.correctAnswer ? 'correct' : 'wrong';
    return {
      id, no, sectionTitle: section.title, subject: subjectRegistry.getSubject(q.subjectId)?.name ?? q.subjectId, topic: getTopicDisplayName(q.subjectId, q.topicId),
      difficulty: q.difficulty ?? null, status, marked: !!st?.isMarkedForReview, yourAnswer: textOf(q, selected), correctAnswer: textOf(q, q.correctAnswer) ?? q.correctAnswer,
      timeSeconds: st?.timeSpentSeconds > 0 ? st.timeSpentSeconds : null,
      marks: marksFor(status, { marksPerCorrect: section.marksPerQuestion, negativeMarks: section.negativeMarks }), question: q.question, explanation: q.explanation, baseDir: q.sourceMockBaseDir,
    };
  })).filter((r): r is QuestionRow => r !== null);
}

/** Every question of the closed test as a row — answered, skipped or never reached. */
export async function archivedQuestionRows(record: ArchivedSessionRecord): Promise<QuestionRow[]> {
  if (record.kind === 'legacy') {
    const { analysis, context } = analyzeLegacySession(record.payload as QuizSession);
    return buildResultTables(analysis, context).questions;
  }
  if (record.kind === 'mock') {
    const mock = record.payload as MockSession;
    const ids = mock.sections.flatMap((s) => s.questionIds);
    return mockRows(mock, new Map((await resolveQuestionsByIds(ids)).map((q) => [q.id, q])));
  }
  const session = record.payload as PracticeSession;
  const byId = new Map((await resolveQuestionsByIds(session.questionIds)).map((q) => [q.id, q]));
  return buildResultTables(analyzePracticeSession(session, byId), practiceResultContext(session, byId, [])).questions;
}
