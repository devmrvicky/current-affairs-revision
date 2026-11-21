/**
 * The chapter a pool question belongs to, read from its source — `chapter:{subject}/{chapterId}/{file}` for canonical chapter tests
 * (the same shape testLibraryBuilder files tests under). Undefined for questions that are not chapter tests (daily files, mocks…),
 * which simply have no chapter filter value.
 *
 * Saved/attempted questions record this going forward; older records have no chapter, and get it at load time from the question pool
 * whenever the question still exists there — so nothing old breaks and nothing is rewritten.
 */
export function chapterIdOfSource(source: string | undefined): string | undefined {
  if (!source?.startsWith('chapter:')) return undefined;
  const parts = source.slice('chapter:'.length).split('/');
  return parts.length >= 3 && parts[1] ? parts[1] : undefined;
}
