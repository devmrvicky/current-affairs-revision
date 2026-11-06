import { describe, it, expect } from 'vitest';
import { cleanName, ensureJsonName, isSameOrDescendant, nameKey, uniqueName, wouldCreateCycle } from './authorNames';

describe('names', () => {
  it('cleans or rejects', () => {
    expect(cleanName('  Maths  ')).toBe('Maths');
    for (const bad of ['', '   ', '.', '..', 'a/b', 'a\\b', 'x'.repeat(121), 'tab\there']) expect(cleanName(bad)).toBeNull();
    expect(cleanName('गणित अध्याय 1')).toBe('गणित अध्याय 1');
  });
  it('compares case-insensitively', () => {
    expect(nameKey(' Maths.JSON ')).toBe('maths.json');
  });
  it('adds .json only when missing', () => {
    expect(ensureJsonName('a')).toBe('a.json');
    expect(ensureJsonName('a.JSON')).toBe('a.JSON');
  });
  it('picks free names without overwriting', () => {
    expect(uniqueName(['a.json'], 'b.json', { hasExt: true })).toBe('b.json');
    expect(uniqueName(['a.json'], 'A.json', { hasExt: true })).toBe('A (2).json');
    expect(uniqueName(['a.json', 'a (2).json'], 'a.json', { hasExt: true })).toBe('a (3).json');
    expect(uniqueName(['a.json'], 'a.json', { hasExt: true, style: 'copy' })).toBe('a copy.json');
    expect(uniqueName(['a.json', 'a copy.json'], 'a.json', { hasExt: true, style: 'copy' })).toBe('a copy 2.json');
    // a folder called "v1.2" has no extension to protect
    expect(uniqueName(['v1.2'], 'v1.2')).toBe('v1.2 (2)');
  });
});

describe('cycles', () => {
  const tree = new Map([
    ['a', { id: 'a', parentId: null }], ['b', { id: 'b', parentId: 'a' }], ['c', { id: 'c', parentId: 'b' }], ['x', { id: 'x', parentId: null }],
  ]);
  it('detects descendants', () => {
    expect(isSameOrDescendant(tree, 'c', 'a')).toBe(true);
    expect(isSameOrDescendant(tree, 'x', 'a')).toBe(false);
  });
  it('refuses a move into itself or its own subtree, allows the rest', () => {
    expect(wouldCreateCycle(tree, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(tree, 'a', 'c')).toBe(true);
    expect(wouldCreateCycle(tree, 'c', 'x')).toBe(false);
    expect(wouldCreateCycle(tree, 'c', null)).toBe(false);
  });
  it('does not hang on a pre-existing corrupt loop', () => {
    const loop = new Map([['p', { id: 'p', parentId: 'q' }], ['q', { id: 'q', parentId: 'p' }]]);
    expect(isSameOrDescendant(loop, 'p', 'zzz')).toBe(false);
  });
});
