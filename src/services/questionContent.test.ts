import { describe, expect, it } from 'vitest';
import { classifyContent, expandDisplayMath, prepareMarkdown } from './questionContent';

describe('question mathematical content detection', () => {
  it('recognizes inline and display LaTeX without changing ordinary text classification', () => {
    expect(classifyContent(String.raw`Find $\frac{3}{4}+\frac{1}{2}$`)).toBe('markdown');
    expect(classifyContent('Solve for $x$ and find $25\\%$')).toBe('markdown');
    expect(classifyContent(String.raw`$$\begin{aligned}x&=2\\y&=3\end{aligned}$$`)).toBe('markdown');
    expect(classifyContent('Find the value of 3/4 + 1/2')).toBe('plain');
  });

  it('leaves ordinary Hindi, English and currency text as plain content', () => {
    expect(classifyContent('भारतीय संविधान का अनुच्छेद 14 समानता के अधिकार से संबंधित है।')).toBe('plain');
    expect(classifyContent('The price is $5 and $10 today.')).toBe('plain');
    expect(classifyContent('A * B का मान निकालें')).toBe('plain');
    expect(classifyContent('साधारण भिन्न 3/4 और 1/2 जोड़ें')).toBe('plain');
  });

  it('expands a single-line display formula into block math fences', () => {
    expect(expandDisplayMath(String.raw`Simplify: $$\frac{1}{2}+\frac{1}{3}$$`)).toBe(
      String.raw`Simplify:` + '\n' + '$$' + '\n' + String.raw`\frac{1}{2}+\frac{1}{3}` + '\n' + '$$',
    );
    expect(expandDisplayMath(String.raw`$$\frac{1}{2}+\frac{1}{3}$$`)).toBe(
      '$$' + '\n' + String.raw`\frac{1}{2}+\frac{1}{3}` + '\n' + '$$',
    );
  });

  it('keeps currency-style dollar values protected while retaining real formulae', () => {
    expect(prepareMarkdown('Price $5 and $10')).toContain(String.raw`\$5 and \$10`);
    expect(prepareMarkdown(String.raw`Value: $\frac{1}{2}$`)).toBe(String.raw`Value: $\frac{1}{2}$`);
  });
});
