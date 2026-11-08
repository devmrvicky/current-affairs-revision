// ─── Practice by Topic hierarchy (pure) ──────────────────────────────────────
//   Subject → Category → Chapter → Topic → Subtopic → …deeper groups… → Tests
// Built from the library the app already has. Nothing is renamed or regenerated: every test keeps its id and its
// questions, every topic keeps its `topicId`, every chapter keeps its key. The tree only decides how they are grouped.
// Depth is unlimited — levels come from
//   • the category folder above a chapter,
//   • the chapter,
//   • the topic (and, when the registry gives a topic a `parentId`, its ancestors above it),
//   • folders nested under the chapter (PracticeTestDefinition.groupPath).
// A test with none of the optional metadata sits directly under its chapter, exactly as before.

import type { LibraryChapter, PracticeTestDefinition, TestLibrary } from './testLibraryBuilder';
import { shouldShowTopicGroups } from './testLibraryBuilder';

export type HierarchyKind = 'category' | 'chapter' | 'topic' | 'group';

export interface HierarchyNode {
  /** Unique within the tree and stable between builds. */
  key: string;
  kind: HierarchyKind;
  title: string;
  /** 0 = directly under the subject. */
  depth: number;
  /** The LibraryChapter this node belongs to (undefined for a category). */
  chapterKey?: string;
  /** The real, unchanged topicId, for kind === 'topic'. */
  topicId?: string;
  children: HierarchyNode[];
  /** Tests sitting directly at this level. */
  tests: PracticeTestDefinition[];
  /** Tests / questions in this node AND everything beneath it. */
  testCount: number;
  questionCount: number;
}

export interface TreeOptions {
  /** Parent topics above a topic, outermost first (excluding the topic itself). Optional registry metadata. */
  topicAncestors?: (topicId: string) => { id: string; title: string }[];
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function makeNode(key: string, kind: HierarchyKind, title: string, depth: number, extra: Partial<HierarchyNode> = {}): HierarchyNode {
  return { key, kind, title, depth, children: [], tests: [], testCount: 0, questionCount: 0, ...extra };
}

function child(parent: HierarchyNode, key: string, kind: HierarchyKind, title: string, extra: Partial<HierarchyNode> = {}): HierarchyNode {
  let node = parent.children.find((c) => c.key === key);
  if (!node) {
    node = makeNode(key, kind, title, parent.depth + 1, extra);
    parent.children.push(node);
  }
  return node;
}

function finalize(node: HierarchyNode): void {
  for (const c of node.children) finalize(c);
  node.children.sort((a, b) => natural(a.title, b.title));
  node.tests.sort((a, b) => natural(a.title, b.title));
  node.testCount = node.tests.length + node.children.reduce((n, c) => n + c.testCount, 0);
  node.questionCount = node.tests.reduce((n, t) => n + t.questionCount, 0) + node.children.reduce((n, c) => n + c.questionCount, 0);
}

function setDepth(node: HierarchyNode, depth: number): void {
  node.depth = depth;
  for (const c of node.children) setDepth(c, depth + 1);
}

/** One chapter and everything inside it, to any depth. */
export function buildChapterNode(chapter: LibraryChapter, opts: TreeOptions = {}): HierarchyNode {
  const root = makeNode(`ch:${chapter.key}`, 'chapter', chapter.title, 0, { chapterKey: chapter.key });
  const place = (anchor: HierarchyNode, groupPath: string[] | undefined, test: PracticeTestDefinition) => {
    let at = anchor;
    for (const seg of groupPath ?? []) at = child(at, `${at.key}/g:${seg}`, 'group', seg, { chapterKey: chapter.key });
    at.tests.push(test);
  };

  for (const t of chapter.chapterTests) place(root, t.groupPath, t);

  // Topic groups get their own level only when they tell something apart — same rule the flat list always used.
  const showTopics = shouldShowTopicGroups(chapter);
  for (const group of chapter.topics) {
    let anchor = root;
    if (showTopics) {
      for (const a of opts.topicAncestors?.(group.topicId) ?? []) anchor = child(anchor, `${anchor.key}/topic:${a.id}`, 'topic', a.title, { chapterKey: chapter.key, topicId: a.id });
      anchor = child(anchor, `${anchor.key}/topic:${group.topicId}`, 'topic', group.title, { chapterKey: chapter.key, topicId: group.topicId });
    }
    for (const t of group.tests) place(anchor, t.groupPath, t);
  }
  finalize(root);
  return root;
}

/** The whole subject: categories → chapters → … Chapters without a category sit at the top level. */
export function buildSubjectTree(library: Pick<TestLibrary, 'chapters'>, opts: TreeOptions = {}): HierarchyNode[] {
  const top: HierarchyNode[] = [];
  const categories = new Map<string, HierarchyNode>();
  for (const chapter of library.chapters) {
    const node = buildChapterNode(chapter, opts);
    if (chapter.kind === 'chapter' && chapter.categoryTitle) {
      let cat = categories.get(chapter.categoryTitle);
      if (!cat) {
        cat = makeNode(`cat:${chapter.categoryTitle}`, 'category', chapter.categoryTitle, 0);
        categories.set(chapter.categoryTitle, cat);
        top.push(cat);
      }
      setDepth(node, 1);
      cat.children.push(node);
    } else {
      top.push(node);
    }
  }
  for (const cat of categories.values()) finalize(cat);
  return top.sort((a, b) => natural(a.title, b.title));
}

// ─── Navigation helpers ──────────────────────────────────────────────────────

export function findNode(roots: readonly HierarchyNode[], key: string): HierarchyNode | undefined {
  for (const r of roots) {
    if (r.key === key) return r;
    const hit = findNode(r.children, key);
    if (hit) return hit;
  }
  return undefined;
}

/** Root → node, inclusive. Empty when the key isn't in the tree. */
export function pathTo(roots: readonly HierarchyNode[], key: string): HierarchyNode[] {
  for (const r of roots) {
    if (r.key === key) return [r];
    const sub = pathTo(r.children, key);
    if (sub.length) return [r, ...sub];
  }
  return [];
}

export function flattenTests(node: HierarchyNode): PracticeTestDefinition[] {
  return [...node.tests, ...node.children.flatMap(flattenTests)];
}

export function maxDepth(roots: readonly HierarchyNode[]): number {
  return roots.reduce((m, r) => Math.max(m, 1 + maxDepth(r.children)), 0);
}

export interface TreeSearchHit {
  test: PracticeTestDefinition;
  /** The levels above the test, outermost first — shown as its breadcrumb. */
  path: HierarchyNode[];
}

/** Every test whose own title, or the title of any level above it, contains the query (case-insensitive). */
export function searchTree(roots: readonly HierarchyNode[], query: string): TreeSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: TreeSearchHit[] = [];
  const walk = (node: HierarchyNode, trail: HierarchyNode[]) => {
    const here = [...trail, node];
    const levelMatches = here.some((n) => n.title.toLowerCase().includes(q));
    for (const t of node.tests) if (levelMatches || t.title.toLowerCase().includes(q)) hits.push({ test: t, path: here });
    for (const c of node.children) walk(c, here);
  };
  for (const r of roots) walk(r, []);
  return hits;
}

export type NodeSort = 'name' | 'tests' | 'questions';

/** Re-orders every level (levels and their tests are otherwise by name). Pure — returns a new tree. */
export function sortTree(roots: readonly HierarchyNode[], by: NodeSort): HierarchyNode[] {
  const cmp = (a: HierarchyNode, b: HierarchyNode) =>
    by === 'tests' ? b.testCount - a.testCount || natural(a.title, b.title)
      : by === 'questions' ? b.questionCount - a.questionCount || natural(a.title, b.title)
        : natural(a.title, b.title);
  return [...roots].sort(cmp).map((n) => ({ ...n, children: sortTree(n.children, by) }));
}

export function collectKeys(roots: readonly HierarchyNode[]): string[] {
  return roots.flatMap((r) => [r.key, ...collectKeys(r.children)]);
}

/** Does this level, or anything beneath it, belong to the chapter? (Lets a category open when its chapter should be open.) */
export function containsChapter(node: HierarchyNode, chapterKey: string | null): boolean {
  if (chapterKey === null) return false;
  return node.chapterKey === chapterKey || node.children.some((c) => containsChapter(c, chapterKey));
}
