// ─── Mock Asset Repository ──────────────────────────────────────────────────
// Images are first-class content for reasoning questions (Venn diagrams,
// mirror images, figure series...). Content authors reference them from
// question Markdown as `asset:filename.png`, never as a relative browser URL
// (the Markdown is loaded as plain text and rendered by ReactMarkdown, so a
// relative path has no folder context to resolve against on its own). This
// module is the one place that knows how to turn `asset:filename.png` +
// "which mock this question belongs to" into an actual bundled URL.

// Eagerly resolves every asset under any mock folder to its final bundled
// URL. `eager: true` here is cheap — Vite just records the built URL for
// each file, it doesn't inline the binary — so there's no lazy-loading
// complexity needed for something this small.
const assetModules = import.meta.glob<string>('../data/**/mocks/**/assets/*', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Same scheme, for the canonical Universal Chapter structure — direct
// chapters (src/data/chapters/{Subject}/{Chapter}/assets/*) and grouped
// chapters (src/data/chapters/{Subject}/{Category}/{Chapter}/assets/*,
// including Current Affairs' own topic-wise chapters). Question images
// referenced from chapter test JSON / question Markdown as
// `asset:filename.png`. Separate globs rather than widening the mocks
// pattern above so the content systems stay independently discoverable.
const chapterAssetModules = import.meta.glob<string>(
  ['../data/chapters/*/*/assets/*', '../data/chapters/*/*/*/assets/*'],
  { eager: true, query: '?url', import: 'default' }
);

// Precompute baseDir -> filename -> url for O(1) lookups instead of
// rescanning the glob map on every resolve call.
const byBaseDirAndFile = new Map<string, Map<string, string>>();
for (const [globKey, url] of Object.entries({ ...assetModules, ...chapterAssetModules })) {
  const marker = '/assets/';
  const idx = globKey.lastIndexOf(marker);
  if (idx < 0) continue;
  const baseDir = globKey.slice(0, idx + 1); // includes trailing slash, matches MockSourceFile.baseDir convention
  const fileName = globKey.slice(idx + marker.length);
  (byBaseDirAndFile.get(baseDir) ?? byBaseDirAndFile.set(baseDir, new Map()).get(baseDir)!).set(fileName, url);
}

/**
 * Resolves an `asset:filename.png` reference (or a bare filename) against
 * the mock folder it belongs to. Returns undefined — never throws — when the
 * asset genuinely isn't found, so a renderer can show a clear "image
 * unavailable" placeholder instead of a broken image icon.
 */
export function resolveMockAsset(baseDir: string | undefined, ref: string): string | undefined {
  if (!baseDir) return undefined;
  const fileName = ref.startsWith('asset:') ? ref.slice('asset:'.length) : ref;
  return byBaseDirAndFile.get(baseDir)?.get(fileName);
}

/** True for any Markdown image/link target this module knows how to resolve — lets a renderer distinguish "our asset scheme" from a normal external image URL. */
export function isMockAssetRef(ref: string): boolean {
  return ref.startsWith('asset:');
}
