import { useRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff, Divide, Radical, Superscript, Brackets, Sigma, Calculator } from 'lucide-react';
import { QuestionMarkdownRenderer } from '../mock/QuestionMarkdownRenderer';

interface MathTemplate {
  id: string;
  label: string;
  title: string;
  icon?: ReactNode;
  value: string;
  /** Select a placeholder after insertion so the author can type over it. */
  select?: string;
}

const MATH_TEMPLATES: MathTemplate[] = [
  { id: 'fraction', label: 'भिन्न', title: 'Stacked fraction (बट्टा)', icon: <Divide size={13} />, value: String.raw`$\frac{a}{b}$`, select: 'a' },
  { id: 'mixed-fraction', label: 'मिश्र भिन्न', title: 'Mixed fraction', value: String.raw`$2\frac{1}{2}$` },
  { id: 'root', label: '√ मूल', title: 'Square root / nth root', icon: <Radical size={13} />, value: String.raw`$\sqrt{x}$`, select: 'x' },
  { id: 'power', label: 'घात', title: 'Superscript / power', icon: <Superscript size={13} />, value: String.raw`$x^{2}$`, select: '2' },
  { id: 'subscript', label: 'नीचे अंक', title: 'Subscript', value: String.raw`$a_{1}$`, select: '1' },
  { id: 'divide', label: '÷ बट्टा', title: 'Division sign', value: String.raw`$\div$` },
  { id: 'multiply', label: '× गुणा', title: 'Multiplication sign', value: String.raw`$\times$` },
  { id: 'brackets', label: '( )', title: 'Scalable brackets', icon: <Brackets size={13} />, value: String.raw`$\left(x+y\right)$`, select: 'x+y' },
  { id: 'ratio-percent', label: 'अनुपात %', title: 'Ratio and percentage', value: String.raw`$a:b \qquad x\%$`, select: 'a:b' },
  { id: 'comparison', label: '≤ ≥ ≠', title: 'Comparison and inequality signs', value: String.raw`$\leq\quad\geq\quad\neq\quad\approx$` },
  { id: 'geometry', label: '∠ ° △', title: 'Geometry angle, degree and triangle', value: String.raw`$\angle ABC=60^\circ,\quad \triangle ABC$`, select: 'ABC=60' },
  { id: 'absolute', label: '|x|', title: 'Absolute value / modulus', value: String.raw`$\left|x\right|$`, select: 'x' },
  { id: 'matrix', label: 'Matrix', title: 'Two by two matrix', value: String.raw`$$
\begin{bmatrix}
a & b \\
c & d
\end{bmatrix}
$$`, select: 'd' },
  { id: 'summation', label: 'Σ योग', title: 'Summation notation', value: String.raw`$\sum_{i=1}^{n} i$`, select: 'n' },
  { id: 'aligned', label: 'हल के Steps', title: 'Multiple aligned solution steps', icon: <Sigma size={13} />, value: String.raw`$$
\begin{aligned}
a &= b \\
  &= c \\
  &= d
\end{aligned}
$$`, select: 'a' },
  { id: 'column', label: 'खड़ी गणना', title: 'Vertical multiplication / subtraction layout', icon: <Calculator size={13} />, value: String.raw`$$
\begin{array}{r}
125 \\
\times 25 \\
\hline
625 \\
2500 \\
\hline
3125
\end{array}
$$`, select: '125' },
  { id: 'long-division', label: 'लंबा भाग', title: 'Long-division working layout', value: String.raw`$$
\begin{array}{r|l}
5 & 125 \\
  & 100 \\
\hline
  & 25 \\
  & 25 \\
\hline
  & 0
\end{array}
$$`, select: '5' },
  { id: 'aligned-equation', label: 'समीकरण', title: 'Aligned equations', value: String.raw`$$
\begin{aligned}
2x+5 &= 15 \\
2x &= 10 \\
x &= 5
\end{aligned}
$$`, select: '2x+5' },
];

interface MathTextFieldProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  previewLabel?: string;
  compact?: boolean;
}

/**
 * Text editor with no-code mathematical insertion helpers and a live KaTeX preview.
 * It stores ordinary Markdown/LaTeX text, so it remains compatible with ExamVerse's
 * existing question JSON schema and old questions.
 */
export function MathTextField({
  value,
  onChange,
  rows = 3,
  placeholder,
  className = '',
  ariaLabel,
  previewLabel = 'Live preview',
  compact = false,
}: MathTextFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showMathTools, setShowMathTools] = useState(false);

  function insertTemplate(template: MathTemplate) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${template.value}${value.slice(end)}`;
    const selectionStart = template.select
      ? start + template.value.indexOf(template.select)
      : start + template.value.length;
    const selectionEnd = template.select ? selectionStart + template.select.length : selectionStart;

    onChange(next);
    window.requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (!current) return;
      current.focus();
      current.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  return (
    <div className="math-text-field min-w-0">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-exam-keys="off"
        className={`mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent resize-y ${className}`}
        style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowMathTools((shown) => !shown)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium"
          style={{ color: 'var(--text-secondary)', background: 'var(--border)' }}
          aria-expanded={showMathTools}
        >
          <Sigma size={12} />
          {showMathTools ? 'गणितीय टूल्स बंद करें' : 'गणितीय टूल्स'}
        </button>
        {!compact && (
          <button
            type="button"
            onClick={() => setShowPreview((shown) => !shown)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium flex-shrink-0"
            style={{ color: 'var(--text-secondary)', background: 'var(--border)' }}
            aria-expanded={showPreview}
          >
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
            {showPreview ? 'Preview बंद करें' : 'Preview देखें'}
          </button>
        )}
      </div>

      {showMathTools && (
        <div className={`math-toolbar flex gap-1.5 overflow-x-auto pb-1 ${compact ? 'mt-1' : 'mt-2'}`} role="group" aria-label="Mathematical formula tools">
          {MATH_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              title={template.title}
              aria-label={template.title}
              onClick={() => insertTemplate(template)}
              className="inline-flex min-h-8 flex-shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium whitespace-nowrap"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--card)' }}
            >
              {template.icon}
              {template.label}
            </button>
          ))}
        </div>
      )}

      {!compact && showPreview && (
        <div
          className="mt-2 rounded-xl border p-3 math-editor-preview"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
          aria-label={previewLabel}
          aria-live="polite"
        >
          {value.trim() ? (
            <QuestionMarkdownRenderer content={value} />
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>यहाँ Formula का Preview दिखाई देगा।</p>
          )}
        </div>
      )}
    </div>
  );
}
