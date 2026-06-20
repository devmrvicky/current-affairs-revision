// markdownRepository.ts — auto-discovers chapter markdown content via import.meta.glob
// Pairs with chapterRepository.ts: Budget/Budget.json + Budget/Budget.md → one chapter "Budget"
// `**` recurses into per-chapter subfolders; legacy flat files still match too.

const markdownModules = import.meta.glob<string>(
  '../data/chapters/**/*.md',
  { eager: false, query: '?raw', import: 'default' }
);

function pathToChapterName(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.md$/i, '');
}

let _markdownChapterNames: Set<string> | null = null;

/** Returns the set of chapter names that have markdown content available. */
export function getChaptersWithMarkdown(): Set<string> {
  if (_markdownChapterNames) return _markdownChapterNames;
  _markdownChapterNames = new Set(Object.keys(markdownModules).map(pathToChapterName));
  return _markdownChapterNames;
}

const _cache = new Map<string, string | null>();

/** Load raw markdown content for a chapter by its name (without extension). */
export async function loadChapterMarkdown(chapterName: string): Promise<string | null> {
  if (_cache.has(chapterName)) return _cache.get(chapterName)!;

  const entry = Object.entries(markdownModules).find(
    ([path]) => pathToChapterName(path) === chapterName
  );

  if (!entry) {
    _cache.set(chapterName, null);
    return null;
  }

  try {
    const content = await entry[1]();
    _cache.set(chapterName, content);
    return content;
  } catch (err) {
    console.error(`[MarkdownRepository] Failed to load ${chapterName}.md:`, err);
    _cache.set(chapterName, null);
    return null;
  }
}

/** Extract plain text from markdown (strips formatting) for search indexing. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')      // code blocks
    .replace(/`([^`]+)`/g, '$1')          // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')      // images
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')// links
    .replace(/[#>*_~-]/g, ' ')            // markdown symbols
    .replace(/\|/g, ' ')                  // table pipes
    .replace(/\s+/g, ' ')
    .trim();
}
