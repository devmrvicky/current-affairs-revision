// ─── Mock Question Content Repository ───────────────────────────────────────
// The one place that reads questions/*.md files for folder-based mocks.
// Nothing else in the app imports Markdown question content directly — the
// normalizer resolves `questionFile` through this repository once, at mock
// load time, and the resulting plain Markdown string is baked into that
// question's `question` field just like any inline-authored question. Every
// question-rendering component downstream (MockTestShellPage, the solutions
// review, etc.) already renders `question.question` — nothing needs to know
// or care whether that string came from inline JSON or a separate file.

// Eager + raw: these are small text files, and eager loading means a lookup
// is a synchronous Map read rather than every question needing its own
// pending-promise/loading state during a timed test.
const questionMarkdownModules = import.meta.glob<string>('../data/**/mocks/**/questions/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// baseDir -> relative "questions/xyz.md" -> content
const byBaseDirAndFile = new Map<string, Map<string, string>>();
for (const [globKey, content] of Object.entries(questionMarkdownModules)) {
  const marker = '/questions/';
  const idx = globKey.lastIndexOf(marker);
  if (idx < 0) continue;
  const baseDir = globKey.slice(0, idx + 1); // includes trailing slash
  const relativePath = `questions/${globKey.slice(idx + marker.length)}`;
  (byBaseDirAndFile.get(baseDir) ?? byBaseDirAndFile.set(baseDir, new Map()).get(baseDir)!).set(relativePath, content);
}

/**
 * Resolves a question's `questionFile` (e.g. "questions/q001.md") against
 * its mock's own folder. Returns null — never throws — when the file is
 * missing, so the caller (the normalizer) can report a precise, actionable
 * validation error instead of the whole mock silently breaking.
 */
export function resolveQuestionMarkdown(baseDir: string | undefined, questionFile: string): string | null {
  if (!baseDir) return null;
  return byBaseDirAndFile.get(baseDir)?.get(questionFile) ?? null;
}
