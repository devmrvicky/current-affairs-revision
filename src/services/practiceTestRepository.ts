// ─── Practice Test Repository ────────────────────────────────────────────────
// Aggregates fixed, nameable "tests" — as opposed to the free-form
// topic+difficulty+count pool the Quick Practice section builds on the fly —
// from all content sources into one normalized shape (product-refactor §54-59),
// and arranges them as Subject → Chapter → Topic → Test.
//
// It does this by grouping the ALREADY-loaded universal question pool by each
// question's `source` field, which questionRepository sets uniquely per
// file/chapter-test. No separate loading, no separate engine: every test this
// returns starts via the same practiceSessionStore + /session used everywhere
// else. The grouping rules themselves live in testLibraryBuilder.ts (pure, so
// they can be checked in isolation); this module only supplies the pool and the
// chapter/topic display names, and caches the result per pool version so that
// opening a chapter's "T" panel or revisiting the library never re-derives it.

import { getQuestionsByExam, getQuestionPoolVersion } from './questionRepository';
import { getChapter } from './universalChapterRepository';
import { getTopicDisplayName } from '../data/registry/subjectRegistry';
import {
  buildLibrary,
  buildPracticeTests,
  type LibraryLookups,
  type PracticeTestDefinition,
  type TestLibrary,
} from './testLibraryBuilder';

export type { PracticeTestSource, PracticeTestDefinition, TestScope, TestLibrary, LibraryChapter, LibraryTopicGroup } from './testLibraryBuilder';

const lookups: LibraryLookups = {
  chapter: (chapterSubjectId, chapterId) => {
    const chapter = getChapter(chapterSubjectId, chapterId);
    return chapter ? { title: chapter.title, categoryTitle: chapter.categoryTitle } : undefined;
  },
  topicTitle: (subjectId, topicId) => getTopicDisplayName(subjectId, topicId),
};

/** Current Affairs questions belong to the 'current-affairs' exam only, whatever exam the learner has selected. */
export function libraryExamId(selectedExamId: string, subjectId: string): string {
  return subjectId === 'current-affairs' ? 'current-affairs' : selectedExamId;
}

interface CacheEntry { version: number; library: Promise<TestLibrary> }
const libraryCache = new Map<string, CacheEntry>();

/** The full test hierarchy for one exam + subject. Cached until the question pool is cleared. */
export function getPracticeTestLibrary(examId: string, subjectId: string): Promise<TestLibrary> {
  const effectiveExamId = libraryExamId(examId, subjectId);
  const key = `${effectiveExamId}::${subjectId}`;
  const version = getQuestionPoolVersion();
  const hit = libraryCache.get(key);
  if (hit && hit.version === version) return hit.library;

  const library = getQuestionsByExam(effectiveExamId)
    .then((pool) => buildLibrary(effectiveExamId, subjectId, buildPracticeTests(effectiveExamId, subjectId, pool, lookups), lookups))
    .catch((err) => {
      libraryCache.delete(key); // never cache a failure
      throw err;
    });
  libraryCache.set(key, { version, library });
  return library;
}

/** Flat list of tests — kept for callers that don't need the hierarchy. */
export async function getPracticeTests(examId: string, subjectId: string): Promise<PracticeTestDefinition[]> {
  return (await getPracticeTestLibrary(examId, subjectId)).tests;
}

/** Resolves one test by its stable id — what "Retake" uses so it relaunches the intended test, not a re-rolled pool. */
export async function getPracticeTestById(examId: string, subjectId: string, testId: string): Promise<PracticeTestDefinition | undefined> {
  return (await getPracticeTestLibrary(examId, subjectId)).tests.find((t) => t.id === testId);
}

/** Every test that belongs to one chapter (chapter-level, multi-topic and topic tests), grouped the same way the library groups them. */
export async function getChapterTestGroup(examId: string, subjectId: string, chapterId: string) {
  const library = await getPracticeTestLibrary(examId, subjectId);
  return library.chapters.find((c) => c.kind === 'chapter' && c.chapterId === chapterId);
}

export function describeTestSource(source: PracticeTestDefinition['source']): string {
  if (source === 'exam-mock') return 'Exam Mock';
  if (source === 'mock-source') return 'Mock Questions';
  if (source === 'chapter') return 'Chapter Test';
  return 'Practice Set';
}

export function describeTestScope(scope: PracticeTestDefinition['scope']): string {
  if (scope === 'topic') return 'Topic test';
  if (scope === 'multi-topic') return 'Multi-topic';
  if (scope === 'paper') return 'Mock paper';
  return 'Chapter test';
}
