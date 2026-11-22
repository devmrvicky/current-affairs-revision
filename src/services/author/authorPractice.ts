import type { AuthorFile, AuthorPracticeLink, AuthorPracticeTarget, AuthorSubjectId } from '../../types/authorStudio';
import { getBreadcrumb, getFolder, setFilePracticeLink } from './authorDb';
import { parseTestFile, examIdsForSubject } from '../questionBank/testFile';
import { questionBankRepository } from '../questionBank/repository';

function displayTitle(fileName: string): string {
  return fileName.replace(/\.json$/i, '').replace(/[-_]/g, ' ').trim() || 'My Practice Test';
}

/**
 * Publishes the local Author JSON into the existing same-device Practice/Mock
 * repository. The Author JSON remains the source of truth and the local test is
 * only a projection. Existing IDs and attempt records are not rewritten.
 */
export async function publishAuthorFileToPractice(
  file: AuthorFile,
  content: string,
  target?: AuthorPracticeTarget,
): Promise<{ file: AuthorFile; link: AuthorPracticeLink; questionCount: number }> {
  if (file.folderId === null) throw new Error('Choose one of the four subject folders before adding this file to Practice.');
  const folder = await getFolder(file.folderId);
  if (!folder || folder.deletedAt) throw new Error('The destination folder no longer exists. Refresh the Question Bank and try again.');
  const breadcrumb = await getBreadcrumb(file.folderId);
  const subjectRoot = breadcrumb.find((item) => item.systemSubjectId);
  const subjectId = (target?.subjectId ?? file.practiceLink?.subjectId ?? subjectRoot?.systemSubjectId) as AuthorSubjectId | undefined;
  if (!subjectId || !['mathematics', 'english', 'reasoning', 'general-awareness'].includes(subjectId)) {
    throw new Error('This folder is not inside Mathematics, English, Reasoning or General Awareness. Choose a subject folder first.');
  }

  const localPath = breadcrumb.filter((item) => !item.systemSubjectId).map((item) => item.name);
  const chapterTitle = target?.chapterTitle ?? file.practiceLink?.chapterTitle ?? (localPath.join(' / ') || subjectRoot?.name || 'My Questions');
  const chapterId = target?.chapterId ?? file.practiceLink?.chapterId ?? `author-folder-${folder.id}`;
  const title = target?.title ?? file.practiceLink?.title ?? displayTitle(file.name);
  const testId = file.practiceLink?.testId ?? `author-${file.id}`;
  const examIds = file.practiceLink?.examIds?.length ? file.practiceLink.examIds : examIdsForSubject(subjectId);

  const parsed = parseTestFile(content, file.name, {
    id: testId,
    title,
    subjectId,
    chapterId,
    chapterTitle,
    examIds,
  });
  if (!parsed.ok || !parsed.meta) {
    throw new Error(parsed.errors[0]?.message ?? 'The file could not be converted into a Practice test.');
  }

  const existingLocal = await questionBankRepository.getTestById(`local:${testId}`);
  if (existingLocal) await questionBankRepository.replaceLocalTest(testId, parsed);
  else await questionBankRepository.importLocalTest(parsed);

  const link: AuthorPracticeLink = { testId, subjectId, chapterId, chapterTitle, title, examIds, syncedAt: Date.now() };
  const nextFile = await setFilePracticeLink(file.id, link);
  return { file: nextFile, link, questionCount: parsed.questionCount };
}
