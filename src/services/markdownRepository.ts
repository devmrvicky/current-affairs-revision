// markdownRepository.ts — generic, path-based markdown loader.
// Discovery of "which markdown belongs to which chapter" lives in
// chapterRepository.ts (folder = chapter, first .md in the folder = revision
// content). This module only knows how to enumerate and lazily load raw
// markdown files by their relative path — it has no opinion about pairing.

const markdownModules = import.meta.glob<string>(
  '../data/chapters/**/*.md',
  { eager: false, query: '?raw', import: 'default' }
);

/** Returns every markdown module path exactly as registered by the glob. */
export function getRawMarkdownGlobKeys(): string[] {
  return Object.keys(markdownModules);
}

const _cache = new Map<string, string | null>();

/** Load raw markdown content by its glob key / module path. */
export async function loadMarkdownByGlobKey(globKey: string): Promise<string | null> {
  if (_cache.has(globKey)) return _cache.get(globKey)!;

  const loader = markdownModules[globKey];
  if (!loader) {
    _cache.set(globKey, null);
    return null;
  }

  try {
    const content = await loader();
    _cache.set(globKey, content);
    return content;
  } catch (err) {
    console.error(`[MarkdownRepository] Failed to load ${globKey}:`, err);
    _cache.set(globKey, null);
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
