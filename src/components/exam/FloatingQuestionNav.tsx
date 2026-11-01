import { ChevronLeft, ChevronRight } from 'lucide-react';

interface FloatingQuestionNavProps {
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

const BUTTON =
  'pointer-events-auto absolute w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center shadow-md transition-all ' +
  'hover:scale-105 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ' +
  'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md';

/**
 * Subtle previous/next question buttons floating at the edges of the question area. They are only rendered
 * once the answer's correctness is on screen (Practice, after answering) — never to reveal it — and they call
 * the same navigation as the footer buttons, the palette and the arrow keys, so there is one way to change
 * question. Beside the question on wider screens; in the bottom corners on phones (the page reserves room so
 * they never sit on text or options).
 */
export function FloatingQuestionNav({ canPrevious, canNext, onPrevious, onNext }: FloatingQuestionNavProps) {
  const style = { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' };
  return (
    <>
      <button
        type="button"
        onClick={onPrevious}
        disabled={!canPrevious}
        aria-label="Previous question"
        title="Previous question"
        data-testid="floating-prev"
        className={`${BUTTON} left-1.5 bottom-3 md:left-3 md:bottom-auto md:top-1/2 md:-translate-y-1/2`}
        style={style}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next question"
        title="Next question"
        data-testid="floating-next"
        className={`${BUTTON} right-1.5 bottom-3 md:right-3 md:bottom-auto md:top-1/2 md:-translate-y-1/2`}
        style={style}
      >
        <ChevronRight size={18} />
      </button>
    </>
  );
}
