// ─── Question Bank → the question pool ───────────────────────────────────────
// The one additive provider the pool (questionRepository.loadAllQuestions) reads. Local and remote tests become ordinary
// UniversalQuestions with collision-proof ids, filed under their subject → chapter exactly like a bundled chapter test, so they appear in
// Practice by Topic and run in the existing Practice / Test / Mock engines with no special cases.
// With nothing in the bank this returns [] and the pool is byte-identical to what it was.

import { getAllActiveBankQuestions, getBankQuestionByKey, getBankTests } from './bankDb';
import { examIdsForSubject } from './testFile';
import type { BankOrigin, BankQuestionData, BankQuestionRecord, BankTestRecord } from './types';
import type { UniversalQuestion } from '../../types/universalQuestion';

export const BANK_ID_PREFIX = 'qb:';

/** `qb:local:avg-1:q17` — can never equal a bundled id (those never start with `qb:`), nor a question of another test or origin. */
export const bankQuestionId = (origin: BankOrigin, testId: string, questionId: string) => `${BANK_ID_PREFIX}${origin}:${testId}:${questionId}`;

export function parseBankQuestionId(id: string): { origin: BankOrigin; testId: string; questionId: string } | null {
  if (!id.startsWith(BANK_ID_PREFIX)) return null;
  const [, origin, testId, ...rest] = id.split(':');
  if ((origin !== 'local' && origin !== 'remote') || !testId || rest.length === 0) return null;
  return { origin, testId, questionId: rest.join(':') };
}

const ORIGIN_LABEL: Record<BankOrigin, string> = { local: 'Local', remote: 'Published' };

/** The test title as Practice by Topic shows it. The origin tag also keeps a bank test from ever sharing a name with a bundled one. */
export const bankDisplayTitle = (t: Pick<BankTestRecord, 'title' | 'origin'>) => `${t.title} (${ORIGIN_LABEL[t.origin]})`;

/** Same chapter source shape the library builder already understands: `chapter:{subject}/{chapter}/{title}`. */
export function bankSource(t: Pick<BankTestRecord, 'subjectId' | 'chapterId' | 'title' | 'origin'>, disambiguator?: string): string {
  const name = bankDisplayTitle(t).replace(/\//g, '-');
  return `chapter:${t.subjectId}/${t.chapterId}/${disambiguator ? `${name} [${disambiguator}]` : name}`;
}

export function toUniversalQuestion(rec: BankQuestionRecord, test: Pick<BankTestRecord, 'examIds' | 'subjectId' | 'chapterId' | 'title' | 'origin'> & Partial<Pick<BankTestRecord, 'chapterTitle'>>, source?: string): UniversalQuestion {
  const d: BankQuestionData = rec.data;
  return {
    id: bankQuestionId(rec.origin, rec.testId, rec.questionId),
    examIds: test.examIds.length > 0 ? test.examIds : examIdsForSubject(test.subjectId),
    subjectId: test.subjectId,
    topicId: d.topicId ?? test.chapterId, // a chapter question's topic defaults to its chapter, as for bundled chapter files
    subtopicId: d.subtopicId,
    questionType: d.questionType,
    question: d.question,
    options: d.options,
    correctAnswer: d.correctAnswer,
    explanation: d.explanation,
    difficulty: d.difficulty ?? 'medium',
    language: d.language,
    source,
    // Author Studio stores a stable synthetic chapter id for local folder-backed
    // tests. Preserve the human folder path so Practice never displays that id
    // (for example "Author Folder <uuid>") as a chapter name.
    sourceChapterTitle: test.chapterId.startsWith('author-folder-') ? test.chapterTitle : undefined,
    tags: d.tags,
    updatedAt: new Date(rec.updatedAt).toISOString(),
  };
}

/** Every active question of every bank test, as pool questions. */
export async function loadBankPoolQuestions(): Promise<UniversalQuestion[]> {
  const [tests, rows] = await Promise.all([getBankTests(), getAllActiveBankQuestions()]);
  if (tests.length === 0) return [];

  // Two bank tests that would land on the same chapter + title get their id appended so they stay two tests.
  const seen = new Map<string, number>();
  for (const t of tests) { const k = bankSource(t); seen.set(k, (seen.get(k) ?? 0) + 1); }
  const sourceOf = new Map(tests.map((t) => [t.key, bankSource(t, (seen.get(bankSource(t)) ?? 0) > 1 ? t.id : undefined)]));
  const testByKey = new Map(tests.map((t) => [t.key, t]));

  return rows
    .filter((r) => testByKey.has(r.testKey))
    .sort((a, b) => a.testKey.localeCompare(b.testKey) || (a.order ?? 0) - (b.order ?? 0))
    .map((r) => toUniversalQuestion(r, testByKey.get(r.testKey)!, sourceOf.get(r.testKey)));
}

/**
 * Questions that were removed from a test by a replace/update/delete, looked up by their pool id. Attempts, bookmarks and review items
 * recorded against them keep working — they resolve to the frozen snapshot, never to a different question.
 */
export async function resolveRetiredBankQuestions(ids: readonly string[]): Promise<UniversalQuestion[]> {
  const out: UniversalQuestion[] = [];
  for (const id of ids) {
    const parsed = parseBankQuestionId(id);
    if (!parsed) continue;
    const rec = await getBankQuestionByKey(`${parsed.origin}:${parsed.testId}::${parsed.questionId}`);
    if (!rec) continue;
    // A retired question belongs to no test and has no `source`, so it is never listed or drawn into practice — only resolved by id.
    out.push(toUniversalQuestion(rec, { examIds: [], subjectId: rec.subjectId, chapterId: rec.chapterId, title: '', origin: rec.origin }));
  }
  return out;
}
