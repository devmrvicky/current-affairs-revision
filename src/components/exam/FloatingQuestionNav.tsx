import { ChevronLeft, ChevronRight } from 'lucide-react';

interface FloatingQuestionNavProps {
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

// Large, edge-hugging tabs at the vertical centre of the question area: 40×80 px on phones, 48×96 px from tablets up —
// well past the 44 px touch-target minimum and reachable with a thumb on either side. They FLOAT OVER the options
// (absolute, so they take no layout space and the question/option spacing is untouched) and are almost transparent at
// rest (opacity-20) so the options underneath stay readable; they go fully opaque while hovered, pressed or focused.
const BUTTON =
  'pointer-events-auto absolute top-1/2 -translate-y-1/2 w-10 h-20 md:w-12 md:h-24 flex items-center justify-center shadow-lg transition-opacity backdrop-blur-sm ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ' +
  'opacity-20 touch-manipulation enabled:hover:opacity-100 enabled:active:opacity-100 enabled:focus-visible:opacity-100 enabled:active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed';

/**
 * Previous / Next question controls on the left and right sides of the question area.
 * They only move between questions — they never show whether an answer is right — and they call the same navigation as the
 * footer buttons, the palette and the arrow keys, so there is one way to change question (and time is always banked).
 * The page decides when they appear: in both modes only once an option has been chosen on the current question
 * (Practice: that is when its feedback is on screen).
 */
export function FloatingQuestionNav({ canPrevious, canNext, onPrevious, onNext }: FloatingQuestionNavProps) {
  const style = { background: 'color-mix(in srgb, var(--card) 88%, transparent)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  return (
    <>
      <button type="button" onClick={onPrevious} disabled={!canPrevious} aria-label="Previous question" title="Previous question" data-testid="floating-prev"
        className={`${BUTTON} left-0 rounded-r-2xl border-l-0`} style={style}>
        <ChevronLeft size={28} aria-hidden />
      </button>
      <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next question" title="Next question" data-testid="floating-next"
        className={`${BUTTON} right-0 rounded-l-2xl border-r-0`} style={style}>
        <ChevronRight size={28} aria-hidden />
      </button>
    </>
  );
}
