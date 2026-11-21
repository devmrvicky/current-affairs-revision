import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyOptionText, displayOrder, shuffleOptionsForDisplay } from './optionOrder';

afterEach(() => vi.restoreAllMocks());

describe('classifyOptionText', () => {
  it.each([
    'Delhi', '42', 'Neither the manager nor the staff', 'Neither of the students', 'Call option', 'Put options on stocks',
    'Above 50%', 'Pattern mirrored along both diagonals', 'केवल निष्कर्ष I और II दोनों अनुसरण करते हैं।', 'सभी निष्कर्ष अनुसरण करते हैं।', 'ऊपर की ओर', 'विकल्पों की संख्या',
  ])('treats a normal option as free: %s', (text) => {
    expect(classifyOptionText(text)).toBe('free');
  });

  it.each([
    'All of the above', 'None of the above', 'all the above', 'None of these', 'Neither of these', 'Cannot be determined', "Can't be determined",
    'Data inadequate', 'Data insufficient', 'उपरोक्त सभी', 'उपर्युक्त में से कोई नहीं', 'इनमें से कोई नहीं', 'इनमे से कोई नहीं', 'ऊपर के सभी', 'निर्धारित नहीं किया जा सकता', 'डेटा अपर्याप्त',
  ])('pins an order-independent catch-all: %s', (text) => {
    expect(classifyOptionText(text)).toBe('pinned');
  });

  it.each([
    'Option B', 'option (c)', 'Both options are correct', 'Both of the above', 'both the above', 'First two options', 'Neither option', 'उपरोक्त दोनों', 'विकल्प (a) और (b)', 'विकल्प 2', 'दोनों विकल्प सही हैं',
  ])('marks a reference to other options as positional: %s', (text) => {
    expect(classifyOptionText(text)).toBe('positional');
  });
});

describe('displayOrder', () => {
  const texts = ['alpha', 'beta', 'gamma', 'delta'];

  it('is always a permutation of the original indices — nothing dropped or duplicated', () => {
    for (let n = 0; n < 200; n++) expect([...displayOrder(texts)].sort()).toEqual([0, 1, 2, 3]);
  });

  it('puts the same option on every position over many shows, and reaches all 24 orders (not "always A", not a fixed rotation)', () => {
    const trials = 4000;
    const landed = [0, 0, 0, 0]; // where option index 2 (the "correct" one) ends up
    const seen = new Set<string>();
    for (let n = 0; n < trials; n++) {
      const order = displayOrder(texts);
      landed[order.indexOf(2)]++;
      seen.add(order.join(','));
    }
    for (const count of landed) {
      expect(count / trials).toBeGreaterThan(0.18);
      expect(count / trials).toBeLessThan(0.32); // ~25% each
    }
    expect(seen.size).toBe(24);
  });

  it('keeps pinned catch-alls last, in their original order, and shuffles the rest', () => {
    const t = ['one', 'All of the above', 'two', 'three', 'None of these'];
    const seen = new Set<string>();
    for (let n = 0; n < 300; n++) {
      const order = displayOrder(t);
      expect(order.slice(-2)).toEqual([1, 4]);
      expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
      seen.add(order.slice(0, 3).join(','));
    }
    expect(seen.size).toBe(6); // the three free options take all 3! orders
  });

  it('leaves a question untouched when any option points at other options by position', () => {
    for (let n = 0; n < 50; n++) expect(displayOrder(['red', 'green', 'Both of the above', 'blue'])).toEqual([0, 1, 2, 3]);
    for (let n = 0; n < 50; n++) expect(displayOrder(['Option A is true', 'x', 'y'])).toEqual([0, 1, 2]);
  });

  it('handles empty and single-option questions', () => {
    expect(displayOrder([])).toEqual([]);
    expect(displayOrder(['only'])).toEqual([0]);
  });

  it('follows Math.random (Fisher–Yates), so it is deterministic when random is fixed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(displayOrder(texts)).toEqual([1, 2, 3, 0]);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(displayOrder(texts)).toEqual([0, 1, 2, 3]);
  });
});

describe('shuffleOptionsForDisplay', () => {
  it('returns a new array and never mutates the input; objects keep their ids and fields', () => {
    const options = [{ id: 'A', text: 'alpha' }, { id: 'B', text: 'beta' }, { id: 'C', text: 'gamma' }, { id: 'D', text: 'delta' }];
    const snapshot = JSON.parse(JSON.stringify(options));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const out = shuffleOptionsForDisplay(options, (o) => o.text);
    expect(out).not.toBe(options);
    expect(options).toEqual(snapshot);
    expect(out.map((o) => o.id)).toEqual(['B', 'C', 'D', 'A']);
    expect(out.find((o) => o.id === 'B')).toBe(options[1]); // same object, so id → text/image stay tied together
  });
});
