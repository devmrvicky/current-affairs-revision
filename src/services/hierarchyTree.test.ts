import { describe, expect, it } from 'vitest';
import { buildChapterNode, buildSubjectTree, findNode, flattenTests, maxDepth, pathTo, searchTree, sortTree } from './hierarchyTree';
import type { LibraryChapter, PracticeTestDefinition } from './testLibraryBuilder';

let n = 0;
function test(title: string, over: Partial<PracticeTestDefinition> = {}): PracticeTestDefinition {
  n++;
  return { id: `t${n}`, examId: 'e', subjectId: 'mathematics', topicIds: [], title, questionIds: [], source: 'chapter', questionCount: 10, difficulty: 'mixed', isFixedMock: false, rawSource: `chapter:m/c/${title}`, scope: 'chapter', topicCount: 0, skippedQuestionCount: 0, ...over };
}
function chapter(key: string, title: string, chapterTests: PracticeTestDefinition[], topics: { topicId: string; title: string; tests: PracticeTestDefinition[] }[] = [], categoryTitle?: string): LibraryChapter {
  const all = [...chapterTests, ...topics.flatMap((t) => t.tests)];
  return { key, kind: 'chapter', chapterId: key, title, categoryTitle, chapterTests, topics: topics.map((t) => ({ ...t, questionCount: t.tests.reduce((a, x) => a + x.questionCount, 0) })), testCount: all.length, questionCount: all.reduce((a, x) => a + x.questionCount, 0) };
}

describe('legacy shape (no new metadata) is unchanged', () => {
  it('a lone topic group with no chapter-level tests gets no extra level (the same rule the flat list always used)', () => {
    const ch = chapter('m/avg', 'Average', [], [{ topicId: 'avg', title: 'Avg', tests: [test('Test 1'), test('Test 2')] }]);
    const node = buildChapterNode(ch);
    expect(node.children).toEqual([]);
    expect(node.tests.map((t) => t.title)).toEqual(['Test 1', 'Test 2']);
    expect(node.testCount).toBe(2);
  });
  it('one topic alongside chapter-level tests is a real distinction, so it keeps its level', () => {
    const ch = chapter('m/avg', 'Average', [test('Chapter test')], [{ topicId: 'avg', title: 'Avg', tests: [test('Topic test')] }]);
    const node = buildChapterNode(ch);
    expect(node.tests.map((t) => t.title)).toEqual(['Chapter test']);
    expect(node.children.map((c) => c.topicId)).toEqual(['avg']);
  });
  it('two topic groups become a topic level, keeping the real topicId', () => {
    const ch = chapter('m/avg', 'Average', [], [{ topicId: 'speed', title: 'Speed', tests: [test('A')] }, { topicId: 'time', title: 'Time', tests: [test('B')] }]);
    const node = buildChapterNode(ch);
    expect(node.children.map((c) => [c.kind, c.topicId, c.title])).toEqual([['topic', 'speed', 'Speed'], ['topic', 'time', 'Time']]);
  });
});

describe('unlimited nesting', () => {
  const deep = chapter('m/tri', 'Triangles', [
    test('Intro'),
    test('SSS 1', { groupPath: ['Congruence', 'SSS and SAS'] }),
    test('SSS 2', { groupPath: ['Congruence', 'SSS and SAS'] }),
    test('ASA', { groupPath: ['Congruence'] }),
    test('Deep', { groupPath: ['Similarity', 'Basic', 'Level 2', 'Level 3', 'Level 4'] }),
  ]);

  it('builds as many levels as the folders go, with correct counts at every level', () => {
    const node = buildChapterNode(deep);
    const cong = findNode([node], `${node.key}/g:Congruence`)!;
    expect(cong.tests.map((t) => t.title)).toEqual(['ASA']);
    expect(cong.children[0].title).toBe('SSS and SAS');
    expect(cong.children[0].tests).toHaveLength(2);
    expect(cong.testCount).toBe(3);
    expect(node.testCount).toBe(5);
    expect(maxDepth([node])).toBe(6); // the chapter, then Similarity › Basic › Level 2 › Level 3 › Level 4
    expect(flattenTests(node)).toHaveLength(5);
  });

  it('every test still appears exactly once and keeps its id', () => {
    const node = buildChapterNode(deep);
    const ids = flattenTests(node).map((t) => t.id).sort();
    expect(ids).toEqual(deep.chapterTests.map((t) => t.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('topic ancestors from the registry add levels above the topic; the topicId itself is untouched', () => {
    const ch = chapter('m/alg', 'Algebra', [], [
      { topicId: 'quadratic', title: 'Quadratic', tests: [test('Q1', { groupPath: ['Level A'] })] },
      { topicId: 'linear', title: 'Linear', tests: [test('L1')] },
    ]);
    const node = buildChapterNode(ch, { topicAncestors: (id) => (id === 'quadratic' ? [{ id: 'equations', title: 'Equations' }, { id: 'polynomial', title: 'Polynomial equations' }] : []) });
    const quadKey = `${node.key}/topic:equations/topic:polynomial/topic:quadratic`;
    const quad = findNode([node], quadKey)!;
    expect(quad.topicId).toBe('quadratic');
    expect(pathTo([node], quadKey).map((x) => x.title)).toEqual(['Algebra', 'Equations', 'Polynomial equations', 'Quadratic']);
    expect(quad.children[0].title).toBe('Level A');
    expect(quad.children[0].tests[0].title).toBe('Q1');
  });
});

describe('subject tree', () => {
  const lib = {
    chapters: [
      chapter('m/tri', 'Triangles', [test('T1')], [], 'Geometry'),
      chapter('m/circ', 'Circles', [test('C1', { groupPath: ['Tangents'] })], [], 'Geometry'),
      chapter('m/avg', 'Average', [test('A1')]),
    ],
  };
  it('groups chapters under their category and puts category-less chapters at the top', () => {
    const tree = buildSubjectTree(lib);
    expect(tree.map((x) => [x.kind, x.title])).toEqual([['chapter', 'Average'], ['category', 'Geometry']]);
    const geo = tree[1];
    expect(geo.children.map((c) => c.title)).toEqual(['Circles', 'Triangles']);
    expect(geo.testCount).toBe(2);
    expect(geo.children[0].depth).toBe(1);
    expect(geo.children[0].children[0].depth).toBe(2); // Circles › Tangents
  });
  it('finds paths and searches across every level, with a breadcrumb', () => {
    const tree = buildSubjectTree(lib);
    const hits = searchTree(tree, 'tangent');
    expect(hits.map((h) => h.test.title)).toEqual(['C1']);
    expect(hits[0].path.map((p) => p.title)).toEqual(['Geometry', 'Circles', 'Tangents']);
    expect(searchTree(tree, 'geometry').map((h) => h.test.title).sort()).toEqual(['C1', 'T1']); // a level's name matches all its tests
    expect(searchTree(tree, 'nothing-matches')).toEqual([]);
    expect(searchTree(tree, '   ')).toEqual([]);
  });
  it('sorts every level by name, test count or question count without losing anything', () => {
    const tree = buildSubjectTree({ chapters: [chapter('a', 'Alpha', [test('x')]), chapter('b', 'Beta', [test('y'), test('z')]), chapter('c', 'Gamma', [test('w', { questionCount: 99 })])] });
    expect(sortTree(tree, 'name').map((x) => x.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sortTree(tree, 'tests')[0].title).toBe('Beta');
    expect(sortTree(tree, 'questions')[0].title).toBe('Gamma');
    expect(sortTree(tree, 'tests').flatMap(flattenTests)).toHaveLength(4);
  });
});
