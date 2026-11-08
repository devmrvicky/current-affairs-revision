import { describe, expect, it } from 'vitest';
import { parseChapterFolderPath } from './chapterPath';

describe('chapter folder paths', () => {
  it('3-segment paths read exactly as before: [Subject, Chapter, file]', () => {
    expect(parseChapterFolderPath(['English', 'Idioms and phrases', 'Idioms_SN161.json'])).toEqual({
      subjectFolder: 'English', categoryFolder: undefined, chapterFolder: 'Idioms and phrases', groupPath: [], file: 'Idioms_SN161.json', fileName: 'Idioms_SN161.json',
    });
  });
  it('4-segment paths read exactly as before: [Subject, Category, Chapter, file]', () => {
    expect(parseChapterFolderPath(['English', 'One word substitution', 'OWN Most repeated', 'OWS_01.json'])).toMatchObject({
      categoryFolder: 'One word substitution', chapterFolder: 'OWN Most repeated', groupPath: [], fileName: 'OWS_01.json',
    });
  });
  it('deeper paths: the chapter stays the second folder, the rest become nested groups of any depth', () => {
    const p = parseChapterFolderPath(['Mathematics', 'Geometry', 'Triangles', 'Congruence', 'SSS and SAS', 'Level 2', 'T01.json'])!;
    expect(p).toMatchObject({ categoryFolder: 'Geometry', chapterFolder: 'Triangles', groupPath: ['Congruence', 'SSS and SAS', 'Level 2'], file: 'T01.json' });
    expect(p.fileName).toBe('Congruence/SSS and SAS/Level 2/T01.json');
    expect(parseChapterFolderPath(['S', 'C', 'Ch', ...Array.from({ length: 12 }, (_, i) => `g${i}`), 'f.json'])!.groupPath).toHaveLength(12); // no depth limit
  });
  it('a group folder never becomes a chapter, so nesting cannot split a chapter', () => {
    const a = parseChapterFolderPath(['S', 'C', 'Ch', 'g1', 'a.json'])!;
    const b = parseChapterFolderPath(['S', 'C', 'Ch', 'g1', 'g2', 'b.json'])!;
    expect([a.chapterFolder, a.categoryFolder]).toEqual([b.chapterFolder, b.categoryFolder]);
  });
  it('rejects shapes that are not chapter files', () => {
    expect(parseChapterFolderPath(['English', 'file.json'])).toBeNull();
    expect(parseChapterFolderPath(['', 'Ch', 'f.json'])).toBeNull();
    expect(parseChapterFolderPath([])).toBeNull();
  });
});

describe('regression: every file that ships today parses exactly as the old rules did', () => {
  const keys = Object.keys(import.meta.glob('../data/chapters/**/*.json'));
  const marker = '/data/chapters/';
  const all = keys.map((k) => k.slice(k.indexOf(marker) + marker.length).split('/'));

  it('sees the real data', () => {
    expect(all.length).toBeGreaterThan(250);
  });

  it('3- and 4-segment paths give the same chapter, category and file name as the previous implementation', () => {
    const legacy = all.filter((p) => (p.length === 3 || p.length === 4) && p[1] !== 'Current Affairs');
    expect(legacy.length).toBeGreaterThan(200);
    for (const parts of legacy) {
      const [, ...rest] = parts;
      const expected = { chapterFolder: rest[rest.length - 2], categoryFolder: rest.length === 3 ? rest[0] : undefined, fileName: rest[rest.length - 1] };
      const got = parseChapterFolderPath(parts)!;
      expect({ chapterFolder: got.chapterFolder, categoryFolder: got.categoryFolder, fileName: got.fileName }, parts.join('/')).toEqual(expected);
      expect(got.groupPath).toEqual([]);
    }
  });

  it('nothing outside Current Affairs is deeper than before, so no existing test or chapter changes identity', () => {
    const deeperNonCA = all.filter((p) => p.length > 4 && p[1] !== 'Current Affairs');
    expect(deeperNonCA).toEqual([]);
  });
});
