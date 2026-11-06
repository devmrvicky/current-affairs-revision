import { describe, it, expect } from 'vitest';
import { chunkText, detectPrimaryLanguage, latexToWords, planUtterances, segmentByLanguage, splitSentences, toSpeakableText } from './speakable';

describe('language detection', () => {
  it('detects Hindi, English and neither', () => {
    expect(detectPrimaryLanguage('भारत का संविधान 26 जनवरी 1950 को लागू हुआ')).toBe('hi');
    expect(detectPrimaryLanguage('The Constitution came into force in 1950.')).toBe('en');
    expect(detectPrimaryLanguage('1950 + 12 = 1962')).toBeNull();
  });
  it('picks the dominant script for mixed text (the explanations in the bank mix both)', () => {
    expect(detectPrimaryLanguage('"An old head" means wise. हिंदी: अपनी उम्र से अधिक बुद्धिमान और समझदार व्यक्ति')).toBe('hi');
    expect(detectPrimaryLanguage('Article 21 protects life and personal liberty — जीवन')).toBe('en');
  });
});

describe('markdown → speakable text', () => {
  it('strips formatting but keeps the words', () => {
    const md = '## Why\n\n**Bold** and *italic* with `code`.\n\n- first\n- second\n\n1. one\n2. two\n\n[link text](http://x.y) ![alt](a.png)';
    const out = toSpeakableText(md);
    expect(out).toContain('Bold and italic with code.');
    expect(out).toContain('first');
    expect(out).toContain('link text');
    expect(out).not.toMatch(/[*#`[\]]|http|\.png/);
  });
  it('drops block math, reads simple inline math', () => {
    expect(toSpeakableText('Area is $x^2$ here. $$\\int_0^1 x\\,dx$$ done')).toBe('Area is x squared here. done');
    expect(latexToWords('\\frac{a}{b}')).toBe('a over b');
    expect(latexToWords('3 \\times 4 = 12')).toBe('3 times 4 equals 12');
  });
  it('leaves plain legacy text untouched', () => {
    expect(toSpeakableText('Plain explanation, no markup.')).toBe('Plain explanation, no markup.');
  });
});

describe('sentence splitting and segmentation', () => {
  it('treats the Devanagari danda as a sentence end', () => {
    expect(splitSentences('यह पहला वाक्य है। यह दूसरा है। Third one.')).toEqual(['यह पहला वाक्य है।', 'यह दूसरा है।', 'Third one.']);
  });
  it('splits mixed content into per-language runs and merges neighbours', () => {
    const segs = segmentByLanguage('This is English. So is this. यह हिंदी है। यह भी हिंदी है। Back to English.');
    expect(segs.map((s) => s.lang)).toEqual(['en', 'hi', 'en']);
    expect(segs[0].text).toBe('This is English. So is this.');
  });
  it('a number-only sentence joins the run before it', () => {
    const segs = segmentByLanguage('यह उत्तर है। 42। इसका अर्थ है।');
    expect(segs).toHaveLength(1);
    expect(segs[0].lang).toBe('hi');
  });
});

describe('chunking for engines that cut long utterances', () => {
  it('keeps every chunk within the limit and loses no words', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says something useful.`).join(' ');
    const chunks = chunkText(text, 120);
    expect(chunks.every((c) => c.length <= 120)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text);
  });
  it('hard-cuts an unbroken token instead of looping forever', () => {
    const chunks = chunkText('x'.repeat(500), 100);
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.join('')).toBe('x'.repeat(500));
  });
});

describe('planUtterances', () => {
  it('produces ordered, single-language, short utterances', () => {
    const plan = planUtterances('**Answer:** Delhi is the capital. दिल्ली भारत की राजधानी है।');
    expect(plan.map((u) => u.lang)).toEqual(['en', 'hi']);
    expect(plan[0].text).toBe('Answer: Delhi is the capital.');
  });
  it('returns nothing for an empty explanation', () => {
    expect(planUtterances('   ')).toEqual([]);
  });
});
