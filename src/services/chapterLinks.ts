import { subjectRegistry, getTopicDisplayName } from '../data/registry/subjectRegistry';

/**
 * readerStore keys everything by a flat `chapterId` string, and three shapes have existed over time:
 *  - `chapter::{subjectId}::{chapterId}` — the Universal Chapter Engine's key (universalChapterRepository.chapterReaderKey),
 *    used by every chapter reached through /chapters/:subjectId/:chapterId, including Current Affairs' topic-wise chapters.
 *  - `syllabus::{subjectId}::{chapterId}` — an earlier, retired shape kept so progress/favorites saved before still resolve.
 *  - a bare chapter name (e.g. "Budget") — Current Affairs' own reader at /chapter/:chapterName.
 * This resolves any of them to a route + display label without readerStore needing to know the difference.
 */
export function resolveChapterLink(chapterId: string): { route: string; label: string } {
  if (chapterId.startsWith('chapter::') || chapterId.startsWith('syllabus::')) {
    const [, subjectId, subChapterId] = chapterId.split('::');
    const subjectName = subjectRegistry.getSubject(subjectId)?.name ?? subjectId;
    const chapterName = getTopicDisplayName(subjectId, subChapterId);
    return { route: `/chapters/${subjectId}/${subChapterId}`, label: `${chapterName} · ${subjectName}` };
  }
  return { route: `/chapter/${encodeURIComponent(chapterId)}`, label: chapterId };
}
