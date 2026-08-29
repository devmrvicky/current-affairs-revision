// ─── Practice Test Repository ────────────────────────────────────────────────
// Aggregates fixed, nameable "tests" — as opposed to the free-form
// topic+difficulty+count pool the Quick Practice section builds on the fly —
// from all three content sources into one normalized shape (product-refactor
// §54-59). It does this by grouping the ALREADY-loaded universal question
// pool by each question's `source` field, which questionRepository already
// sets uniquely per file/chapter-test. No separate loading, no separate
// engine: every card this returns starts via the exact same
// practiceSessionStore + /session used everywhere else.

import { getQuestionsByExam } from './questionRepository';
import type { UniversalQuestion, Difficulty } from '../types/universalQuestion';

export type PracticeTestSource = 'exam-mock' | 'legacy-chapter' | 'miscellaneous' | 'mock-source';

export interface PracticeTestDefinition {
  id: string;
  examId: string;
  subjectId: string;
  topicIds: string[];
  title: string;
  questionIds: string[];
  source: PracticeTestSource;
  questionCount: number;
  difficulty: Difficulty | 'mixed';
  /** Fixed Mock (question set + marking is authoritative, generic Practice Settings can't shrink/reshuffle it) vs Configurable Practice Set — product-refactor §100. */
  isFixedMock: boolean;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function humanize(id: string): string {
  const spaced = id.replace(/([a-zA-Z])(\d)/g, '$1 $2'); // "mock01" -> "mock 01"
  return spaced.split(/[-_\s]+/).map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

function inferSource(rawSource: string): { kind: PracticeTestSource; title: string } | null {
  if (rawSource.startsWith('mock:')) {
    return { kind: 'exam-mock', title: humanize(rawSource.slice(5)) };
  }
  // Single-source-of-truth Mock JSON (mockSourceRegistry.ts) — every question
  // tagged `mock-source:{mockId}` becomes ONE subject-wise practice set per
  // mock per subject here, e.g. "Ssc Chsl Pyq 2019 07 02 Shift3 — Mathematics
  // Mock Questions". This is generic grouping-by-source, not a mock-specific
  // special case — any new source prefix gets the same treatment for free
  // (product spec §14/§29/§68/§123).
  if (rawSource.startsWith('mock-source:')) {
    return { kind: 'mock-source', title: humanize(rawSource.slice(12)) };
  }
  if (rawSource.startsWith('miscellaneous:')) {
    return { kind: 'miscellaneous', title: humanize(rawSource.slice(14)) };
  }
  if (rawSource.includes('/')) {
    // Chapter-wise Current Affairs: source is "{chapterName}/{testLabel}"
    const [chapterName, testLabel] = rawSource.split('/');
    return { kind: 'legacy-chapter', title: `${chapterName} — ${testLabel}` };
  }
  return null; // e.g. a bare daily-quiz filename — not a discrete "test" unit worth listing here, it already has its own Daily Quiz entry point
}

const SOURCE_ORDER: Record<PracticeTestSource, number> = { 'exam-mock': 0, 'mock-source': 1, 'legacy-chapter': 2, miscellaneous: 3 };

export async function getPracticeTests(examId: string, subjectId: string): Promise<PracticeTestDefinition[]> {
  const pool = (await getQuestionsByExam(examId)).filter((q) => q.subjectId === subjectId);
  const bySource = new Map<string, UniversalQuestion[]>();
  for (const q of pool) {
    if (!q.source) continue;
    const arr = bySource.get(q.source) ?? [];
    arr.push(q);
    bySource.set(q.source, arr);
  }

  const defs: PracticeTestDefinition[] = [];
  for (const [rawSource, qs] of bySource) {
    const inferred = inferSource(rawSource);
    if (!inferred) continue;

    const topicIds = Array.from(new Set(qs.map((q) => q.topicId).filter((t): t is string => Boolean(t))));
    const difficulties = new Set(qs.map((q) => q.difficulty));
    defs.push({
      id: `${examId}-${subjectId}-${normalize(rawSource)}`,
      examId,
      subjectId,
      topicIds,
      title: inferred.title,
      questionIds: qs.map((q) => q.id),
      source: inferred.kind,
      questionCount: qs.length,
      difficulty: difficulties.size === 1 ? (Array.from(difficulties)[0] as Difficulty) : 'mixed',
      isFixedMock: inferred.kind === 'exam-mock',
    });
  }

  // Featured mocks first, then chapter tests, then miscellaneous practice sets (product-refactor §97)
  defs.sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.title.localeCompare(b.title));
  return defs;
}

export function describeTestSource(source: PracticeTestSource): string {
  if (source === 'exam-mock') return 'Exam Mock';
  if (source === 'mock-source') return 'Mock Questions';
  if (source === 'legacy-chapter') return 'Chapter Test';
  return 'Practice Set';
}
