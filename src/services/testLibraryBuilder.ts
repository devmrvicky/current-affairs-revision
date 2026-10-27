// ─── Test library builder (pure) ─────────────────────────────────────────────
// Groups the already-loaded universal question pool into fixed, nameable tests
// and arranges them as  Subject → Chapter → Topic → Test.  Pure on purpose — no
// import.meta.glob, no IndexedDB — so identity and grouping rules can be
// exercised directly; practiceTestRepository.ts supplies the real pool and the
// chapter/topic display names.
//
// IDENTITY
//   A test is one *source file* (or one mock paper's slice of a subject). The
//   pool already tags every question with a unique `source` per file, so grouping
//   by `source` is what keeps two files of the same chapter — or the same topic —
//   as two separate tests. The test id formula is unchanged from the original
//   implementation (`${examId}-${subjectId}-${slug(source)}`) so attempt history
//   recorded against existing ids keeps matching.
//
// CHAPTER / TOPIC
//   • Chapter is read from the structured `source` string (`chapter:{subject}/
//     {chapterId}/{file}`), never inferred from a display title.
//   • Topic comes from the questions' own `topicId`. Chapter files default every
//     question's topicId to the chapter id, so topicId === chapterId means "no
//     distinct topic": a chapter-level test. A file whose questions all carry one
//     other topicId is a topic test; a file spanning several topics is a
//     multi-topic (chapter-wide) test and is listed at chapter level.
//   • Mock papers have no chapter and are not given one.

import type { UniversalQuestion, Difficulty } from '../types/universalQuestion';
import { isPlayableQuestion } from '../types/universalQuestion';

export type PracticeTestSource = 'exam-mock' | 'chapter' | 'mock-source';
export type TestScope = 'chapter' | 'topic' | 'multi-topic' | 'paper';

export interface PracticeTestDefinition {
  id: string;
  examId: string;
  subjectId: string;
  topicIds: string[];
  title: string;
  questionIds: string[];
  source: PracticeTestSource;
  questionCount: number;
  difficulty: Difficulty | 'mixed';
  /** Fixed Mock (question set + marking is authoritative, generic Practice Settings can't shrink/reshuffle it) vs Configurable Practice Set — product-refactor §100. */
  isFixedMock: boolean;

  // ── Hierarchy metadata (additive) ──
  /** The raw `source` string the questions share — the test's identity in the pool. */
  rawSource: string;
  scope: TestScope;
  chapterId?: string;
  /** Subject folder id as it appears inside the chapter source (the chapter's own subject, which is what /chapters/:subjectId/:chapterId routes use). */
  chapterSubjectId?: string;
  chapterTitle?: string;
  categoryTitle?: string;
  /** Set only for scope === 'topic'. */
  topicId?: string;
  topicTitle?: string;
  /** Distinct topics among the playable questions. */
  topicCount: number;
  /** Questions in the file that cannot be presented (no options / unresolved answer key) and are left out of the test. */
  skippedQuestionCount: number;
}

export interface ChapterRef {
  title: string;
  categoryTitle?: string;
}

/** Everything the builder needs from the outside world — lookups, so it stays pure. */
export interface LibraryLookups {
  /** Display info for a chapter, keyed by the chapter source's own subject folder id + chapter id. */
  chapter: (chapterSubjectId: string, chapterId: string) => ChapterRef | undefined;
  topicTitle: (subjectId: string, topicId: string) => string;
}

// ─── Titles ──────────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** "mock01" -> "Mock 01" */
function humanize(id: string): string {
  const spaced = id.replace(/([a-zA-Z])(\d)/g, '$1 $2');
  return spaced.split(/[-_\s]+/).map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

// Words that describe how a file was produced, not what is in it. Removed only
// when doing so still leaves every sibling test with a distinct name.
const NOISE_PATTERNS: RegExp[] = [
  /\bexam\s*verse\b/gi,
  /\banswer\s*key\s*matched\b/gi,
  /\bdeep\s*research\b/gi,
  /\bcorrect\s*format\b/gi,
  /\bconverted\b/gi,
  /\bfinal\b/gi,
  /\bv\d+\b/gi,
];

/** File name → readable title: extension and underscores gone, whitespace collapsed. */
export function lightlyCleanFileName(fileName: string): string {
  return fileName
    .replace(/\.(json|md)$/i, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(title: string): string {
  let out = title;
  for (const re of NOISE_PATTERNS) out = out.replace(re, ' ');
  out = out.replace(/\s+/g, ' ').replace(/^[\s\-–—,.]+|[\s\-–—,.]+$/g, '').trim();
  return out || title;
}

/**
 * Display titles for one group of sibling tests. Technical noise ("ExamVerse
 * Final v2", "AnswerKeyMatched") is dropped, but never at the price of two
 * siblings reading the same — any title that would collide keeps its lightly
 * cleaned file name instead, so distinct files always stay distinct.
 */
export function cleanSiblingTitles(fileNames: string[]): string[] {
  const light = fileNames.map(lightlyCleanFileName);
  const stripped = light.map(stripNoise);
  const counts = new Map<string, number>();
  for (const t of stripped) counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) ?? 0) + 1);
  return stripped.map((t, i) => ((counts.get(t.toLowerCase()) ?? 0) > 1 ? light[i] : t));
}

/**
 * A mock's own display name is assembled from several parts and sometimes says
 * the same thing twice ("… Shift 3 (PYQ) — Shift 3"). Drop any " — " segment that
 * an earlier segment already contains.
 */
export function tidyPaperTitle(raw: string): string {
  const kept: string[] = [];
  for (const part of raw.split(' — ').map((p) => p.trim()).filter(Boolean)) {
    if (!kept.some((k) => k.toLowerCase().includes(part.toLowerCase()))) kept.push(part);
  }
  return kept.join(' — ') || raw;
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// ─── Source parsing ──────────────────────────────────────────────────────────

interface ParsedChapterSource {
  kind: 'chapter';
  /** Present for canonical chapter tests (`chapter:{subject}/{chapterId}/{file}`). */
  chapterSubjectId?: string;
  chapterId?: string;
  /** Present for Current Affairs topic-wise chapter tests (`{chapterName}/{testLabel}`). */
  chapterName?: string;
  fileName: string;
}
type ParsedSource = { kind: 'exam-mock' | 'mock-source'; fileName: string } | ParsedChapterSource;

function parseSource(rawSource: string, subjectId: string): ParsedSource | null {
  if (rawSource.startsWith('mock:')) return { kind: 'exam-mock', fileName: rawSource.slice(5) };
  if (rawSource.startsWith('mock-source:')) return { kind: 'mock-source', fileName: rawSource.slice(12) };

  if (rawSource.startsWith('chapter:')) {
    const parts = rawSource.slice(8).split('/');
    if (parts.length < 3) return null;
    return { kind: 'chapter', chapterSubjectId: parts[0], chapterId: parts[1], fileName: parts.slice(2).join('/') };
  }

  // Current Affairs' own topic-wise chapters only. Any other `source` that happens
  // to contain a slash (an authored "SSC CGL 12/09/2025" note, say) is a label,
  // not a test identity — treating it as one would invent tests.
  if (subjectId === 'current-affairs' && rawSource.includes('/')) {
    const [chapterName, ...rest] = rawSource.split('/');
    return { kind: 'chapter', chapterName, fileName: rest.join('/') };
  }
  return null; // e.g. a bare daily-quiz filename — it has its own Daily Quiz entry point
}

// ─── Building ────────────────────────────────────────────────────────────────

const SOURCE_ORDER: Record<PracticeTestSource, number> = { 'exam-mock': 0, 'mock-source': 1, chapter: 2 };

export function buildPracticeTests(
  examId: string,
  subjectId: string,
  pool: UniversalQuestion[],
  lookups: LibraryLookups
): PracticeTestDefinition[] {
  const bySource = new Map<string, UniversalQuestion[]>();
  for (const q of pool) {
    if (q.subjectId !== subjectId || !q.source) continue;
    const bucket = bySource.get(q.source);
    if (bucket) bucket.push(q);
    else bySource.set(q.source, [q]);
  }

  interface Draft { rawSource: string; parsed: ParsedSource; playable: UniversalQuestion[]; skipped: number; chapterKey: string }
  const drafts: Draft[] = [];
  for (const [rawSource, qs] of bySource) {
    const parsed = parseSource(rawSource, subjectId);
    if (!parsed) continue;
    const playable = qs.filter(isPlayableQuestion);
    if (playable.length === 0) continue; // nothing in this file can be taken
    const chapterKey = parsed.kind === 'chapter' ? `${parsed.chapterSubjectId ?? subjectId}/${parsed.chapterId ?? parsed.chapterName}` : '';
    drafts.push({ rawSource, parsed, playable, skipped: qs.length - playable.length, chapterKey });
  }

  // Clean titles among siblings (same chapter / same paper group), never across them.
  const titleByRawSource = new Map<string, string>();
  const groups = new Map<string, Draft[]>();
  for (const d of drafts) {
    const key = d.parsed.kind === 'chapter' ? d.chapterKey : d.parsed.kind;
    const bucket = groups.get(key);
    if (bucket) bucket.push(d);
    else groups.set(key, [d]);
  }
  for (const [, siblings] of groups) {
    if (siblings[0].parsed.kind === 'chapter') {
      const cleaned = cleanSiblingTitles(siblings.map((d) => d.parsed.fileName));
      siblings.forEach((d, i) => titleByRawSource.set(d.rawSource, cleaned[i]));
    } else if (siblings[0].parsed.kind === 'mock-source') {
      siblings.forEach((d) => {
        // examSource ("<mock title> — <shift>") is the mock's own name; the file id is a fallback.
        const named = d.playable.find((q) => q.examSource)?.examSource;
        titleByRawSource.set(d.rawSource, named ? tidyPaperTitle(named) : humanize(d.parsed.fileName));
      });
    } else {
      siblings.forEach((d) => titleByRawSource.set(d.rawSource, humanize(d.parsed.fileName)));
    }
  }

  const defs: PracticeTestDefinition[] = drafts.map(({ rawSource, parsed, playable, skipped }) => {
    const topicSet = new Set(playable.map((q) => q.topicId).filter((t): t is string => Boolean(t)));
    const topicIds = Array.from(topicSet);
    const difficulties = new Set(playable.map((q) => q.difficulty));

    const def: PracticeTestDefinition = {
      id: `${examId}-${subjectId}-${slug(rawSource)}`,
      examId,
      subjectId,
      topicIds,
      title: titleByRawSource.get(rawSource) ?? lightlyCleanFileName(parsed.fileName),
      questionIds: playable.map((q) => q.id),
      source: parsed.kind,
      questionCount: playable.length,
      difficulty: difficulties.size === 1 ? (Array.from(difficulties)[0] as Difficulty) : 'mixed',
      isFixedMock: parsed.kind === 'exam-mock',
      rawSource,
      scope: 'paper',
      topicCount: topicIds.length,
      skippedQuestionCount: skipped,
    };

    if (parsed.kind === 'chapter') {
      // Canonical chapters carry their id in the source. A Current Affairs chapter
      // doesn't, but every question in it is tagged with the chapter's resolved
      // topic id, which is also the id the chapter pages use — so use that.
      const chapterId = parsed.chapterId ?? topicIds[0] ?? slug(parsed.chapterName ?? '');
      const chapterSubjectId = parsed.chapterSubjectId ?? subjectId;
      const ref = parsed.chapterId && parsed.chapterSubjectId ? lookups.chapter(parsed.chapterSubjectId, parsed.chapterId) : undefined;
      def.chapterId = chapterId;
      def.chapterSubjectId = chapterSubjectId;
      def.chapterTitle = ref?.title ?? parsed.chapterName ?? humanize(chapterId);
      def.categoryTitle = ref?.categoryTitle;

      // A chapter question's topicId defaults to the chapter id; only a *different* topic is real topic information.
      const distinct = topicIds.filter((t) => t !== chapterId);
      if (topicIds.length >= 2) {
        def.scope = 'multi-topic';
      } else if (distinct.length === 1) {
        def.scope = 'topic';
        def.topicId = distinct[0];
        def.topicTitle = lookups.topicTitle(subjectId, distinct[0]);
      } else {
        def.scope = 'chapter';
      }
    }
    return def;
  });

  // Featured mocks first, then chapter tests (product-refactor §97); natural order within.
  defs.sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || naturalCompare(a.title, b.title));
  return defs;
}

// ─── Hierarchy ───────────────────────────────────────────────────────────────

export interface LibraryTopicGroup {
  topicId: string;
  title: string;
  tests: PracticeTestDefinition[];
  questionCount: number;
}

export interface LibraryChapter {
  /** `${chapterSubjectId}/${chapterId}`, or 'papers' for the mock-paper group. */
  key: string;
  kind: 'chapter' | 'papers';
  chapterId?: string;
  chapterSubjectId?: string;
  title: string;
  categoryTitle?: string;
  /** Chapter-level and multi-topic tests — everything not scoped to one topic. */
  chapterTests: PracticeTestDefinition[];
  /** Topic-scoped tests grouped by topic. Rendered as sub-groups only when there is more than one group to tell apart. */
  topics: LibraryTopicGroup[];
  testCount: number;
  questionCount: number;
}

export interface TestLibrary {
  examId: string;
  subjectId: string;
  chapters: LibraryChapter[];
  tests: PracticeTestDefinition[];
  /** Display name for every topic id that appears in any test — drives topic search and the topic filter. */
  topicTitles: Map<string, string>;
}

export function buildLibrary(examId: string, subjectId: string, tests: PracticeTestDefinition[], lookups?: Pick<LibraryLookups, 'topicTitle'>): TestLibrary {
  const topicTitles = new Map<string, string>();
  for (const t of tests) {
    for (const id of t.topicIds) {
      if (!topicTitles.has(id)) topicTitles.set(id, lookups ? lookups.topicTitle(subjectId, id) : humanize(id));
    }
  }

  const chapters = new Map<string, LibraryChapter>();
  const papers: LibraryChapter = { key: 'papers', kind: 'papers', title: 'Mock papers', chapterTests: [], topics: [], testCount: 0, questionCount: 0 };

  for (const t of tests) {
    if (t.scope === 'paper' || !t.chapterId) {
      papers.chapterTests.push(t);
      continue;
    }
    const key = `${t.chapterSubjectId}/${t.chapterId}`;
    let ch = chapters.get(key);
    if (!ch) {
      ch = {
        key, kind: 'chapter', chapterId: t.chapterId, chapterSubjectId: t.chapterSubjectId,
        title: t.chapterTitle ?? t.chapterId, categoryTitle: t.categoryTitle,
        chapterTests: [], topics: [], testCount: 0, questionCount: 0,
      };
      chapters.set(key, ch);
    }
    if (t.scope === 'topic' && t.topicId) {
      let group = ch.topics.find((g) => g.topicId === t.topicId);
      if (!group) {
        group = { topicId: t.topicId, title: t.topicTitle ?? t.topicId, tests: [], questionCount: 0 };
        ch.topics.push(group);
      }
      group.tests.push(t);
      group.questionCount += t.questionCount;
    } else {
      ch.chapterTests.push(t);
    }
  }

  const list = Array.from(chapters.values());
  for (const ch of list) {
    ch.topics.sort((a, b) => naturalCompare(a.title, b.title));
    ch.testCount = ch.chapterTests.length + ch.topics.reduce((n, g) => n + g.tests.length, 0);
    ch.questionCount = ch.chapterTests.reduce((n, t) => n + t.questionCount, 0) + ch.topics.reduce((n, g) => n + g.questionCount, 0);
  }
  // Category-mates sit together (Geometry › Line and traingle next to other Geometry chapters), then by title.
  list.sort((a, b) => naturalCompare(a.categoryTitle ?? a.title, b.categoryTitle ?? b.title) || naturalCompare(a.title, b.title));

  if (papers.chapterTests.length > 0) {
    papers.testCount = papers.chapterTests.length;
    papers.questionCount = papers.chapterTests.reduce((n, t) => n + t.questionCount, 0);
    list.push(papers);
  }
  return { examId, subjectId, chapters: list, tests, topicTitles };
}

/** Topic sub-groups are only worth a level of nesting when they tell something apart. */
export function shouldShowTopicGroups(ch: LibraryChapter): boolean {
  return ch.topics.length >= 2 || (ch.topics.length === 1 && ch.chapterTests.length > 0);
}

export function countDistinctTopics(lib: TestLibrary): number {
  const set = new Set<string>();
  for (const t of lib.tests) for (const id of t.topicIds) set.add(`${t.chapterSubjectId ?? t.subjectId}/${id}`);
  return set.size;
}

// ─── Search / filter / sort ──────────────────────────────────────────────────

export type TypeFilter = 'all' | 'chapter' | 'topic' | 'multi-topic' | 'paper';
export type StatusFilter = 'all' | 'new' | 'attempted';
export type SortKey = 'name' | 'recent' | 'attempts' | 'questions' | 'best';

export interface LibraryFilters {
  query: string;
  type: TypeFilter;
  status: StatusFilter;
  chapterKey: string; // '' = any
  topicId: string; // '' = any
  sort: SortKey;
}

export const DEFAULT_FILTERS: LibraryFilters = { query: '', type: 'all', status: 'all', chapterKey: '', topicId: '', sort: 'name' };

/** The little the filter/sort layer needs to know about a test's history. */
export interface TestActivity {
  attempts: number;
  lastAttemptedAt: number;
  bestPercent: number;
}
export type ActivityLookup = (testId: string) => TestActivity | undefined;

export function activeFilterCount(f: LibraryFilters): number {
  return (f.type !== 'all' ? 1 : 0) + (f.status !== 'all' ? 1 : 0) + (f.chapterKey ? 1 : 0) + (f.topicId ? 1 : 0);
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFKC').replace(/_+/g, ' ');
}

/** Search covers the test name, its chapter (and category), and every topic it touches. */
function testMatchesQuery(t: PracticeTestDefinition, ch: LibraryChapter, tokens: string[], topicTitles: Map<string, string>): boolean {
  if (tokens.length === 0) return true;
  const topics = t.topicIds.map((id) => topicTitles.get(id) ?? id);
  const haystack = normalizeText([t.title, ch.title, ch.categoryTitle ?? '', t.topicTitle ?? '', ...topics].join(' '));
  const words: string[] = haystack.match(/[\p{L}\p{N}]+/gu) ?? [];
  // A one- or two-letter token ("b", "2d") only matches the START of a word — otherwise "b" would match inside
  // "probe". Longer tokens may match anywhere, so "mensur" still finds "2D mensuration".
  return tokens.every((tok) => (tok.length >= 3 ? haystack.includes(tok) : words.some((w) => w.startsWith(tok))));
}

function compareTests(sort: SortKey, activity: ActivityLookup) {
  return (a: PracticeTestDefinition, b: PracticeTestDefinition): number => {
    const aa = activity(a.id);
    const bb = activity(b.id);
    switch (sort) {
      case 'recent': return (bb?.lastAttemptedAt ?? 0) - (aa?.lastAttemptedAt ?? 0) || naturalCompare(a.title, b.title);
      case 'attempts': return (bb?.attempts ?? 0) - (aa?.attempts ?? 0) || naturalCompare(a.title, b.title);
      case 'questions': return b.questionCount - a.questionCount || naturalCompare(a.title, b.title);
      case 'best': return (bb?.bestPercent ?? -1) - (aa?.bestPercent ?? -1) || naturalCompare(a.title, b.title);
      default: return naturalCompare(a.title, b.title);
    }
  };
}

function chapterRank(sort: SortKey, activity: ActivityLookup, ch: LibraryChapter): number {
  const all = [...ch.chapterTests, ...ch.topics.flatMap((g) => g.tests)];
  switch (sort) {
    case 'recent': return Math.max(0, ...all.map((t) => activity(t.id)?.lastAttemptedAt ?? 0));
    case 'attempts': return all.reduce((n, t) => n + (activity(t.id)?.attempts ?? 0), 0);
    case 'questions': return ch.questionCount;
    case 'best': return Math.max(-1, ...all.map((t) => activity(t.id)?.bestPercent ?? -1));
    default: return 0;
  }
}

export interface FilteredLibrary {
  chapters: LibraryChapter[];
  testCount: number;
  questionCount: number;
  topicCount: number;
  /** True when anything narrows the list (search or filters), so the UI can open matching groups. */
  isNarrowed: boolean;
}

/**
 * Applies search, filters and sort, returning a pruned copy of the hierarchy
 * (chapters/topics with no remaining tests disappear). Test objects are shared,
 * not cloned — the library never duplicates question data.
 */
export function applyLibraryFilters(lib: TestLibrary, filters: LibraryFilters, activity: ActivityLookup): FilteredLibrary {
  const tokens = normalizeText(filters.query).split(/\s+/).filter(Boolean);
  const isNarrowed = tokens.length > 0 || activeFilterCount(filters) > 0;

  const keep = (t: PracticeTestDefinition, ch: LibraryChapter): boolean => {
    if (filters.chapterKey && ch.key !== filters.chapterKey) return false;
    if (filters.topicId && !t.topicIds.includes(filters.topicId)) return false;
    if (filters.type !== 'all' && t.scope !== filters.type) return false;
    if (filters.status !== 'all') {
      const attempted = (activity(t.id)?.attempts ?? 0) > 0;
      if (filters.status === 'attempted' !== attempted) return false;
    }
    return testMatchesQuery(t, ch, tokens, lib.topicTitles);
  };

  const cmp = compareTests(filters.sort, activity);
  const chapters: LibraryChapter[] = [];
  const topicSet = new Set<string>();
  let testCount = 0;
  let questionCount = 0;

  for (const ch of lib.chapters) {
    const chapterTests = ch.chapterTests.filter((t) => keep(t, ch)).sort(cmp);
    const topics = ch.topics
      .map((g) => {
        const tests = g.tests.filter((t) => keep(t, ch)).sort(cmp);
        return { ...g, tests, questionCount: tests.reduce((n, t) => n + t.questionCount, 0) };
      })
      .filter((g) => g.tests.length > 0);
    const n = chapterTests.length + topics.reduce((c, g) => c + g.tests.length, 0);
    if (n === 0) continue;
    const q = chapterTests.reduce((c, t) => c + t.questionCount, 0) + topics.reduce((c, g) => c + g.questionCount, 0);
    for (const t of [...chapterTests, ...topics.flatMap((g) => g.tests)]) for (const id of t.topicIds) topicSet.add(`${ch.key}/${id}`);
    chapters.push({ ...ch, chapterTests, topics, testCount: n, questionCount: q });
    testCount += n;
    questionCount += q;
  }

  if (filters.sort === 'name') {
    // Library order already groups by category then title; the mock-paper group stays last.
  } else {
    const papers = chapters.filter((c) => c.kind === 'papers');
    const rest = chapters.filter((c) => c.kind !== 'papers');
    rest.sort((a, b) => chapterRank(filters.sort, activity, b) - chapterRank(filters.sort, activity, a) || naturalCompare(a.title, b.title));
    chapters.length = 0;
    chapters.push(...rest, ...papers);
  }

  return { chapters, testCount, questionCount, topicCount: topicSet.size, isNarrowed };
}
