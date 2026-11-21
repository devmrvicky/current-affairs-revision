import { useCallback, useRef, type TouchEvent as ReactTouchEvent } from 'react';

interface QuestionSwipeOptions {
  enabled: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  threshold?: number;
}

interface TouchOrigin {
  x: number;
  y: number;
}

/** Horizontal one-finger question navigation; vertical scrolling and controls remain untouched. */
export function useQuestionSwipe({
  enabled,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  threshold = 56,
}: QuestionSwipeOptions) {
  const originRef = useRef<TouchOrigin | null>(null);

  const onTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || event.touches.length !== 1) {
      originRef.current = null;
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, textarea, select, [role="button"], [data-swipe-ignore="true"]')) {
      originRef.current = null;
      return;
    }

    const touch = event.touches[0];
    originRef.current = { x: touch.clientX, y: touch.clientY };
  }, [enabled]);

  const onTouchEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const origin = originRef.current;
    originRef.current = null;
    if (!enabled || !origin || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.25) return;

    // Swipe left advances to the next question; swipe right returns to the previous one.
    if (dx < 0 && canGoNext) onNext();
    else if (dx > 0 && canGoPrevious) onPrevious();
  }, [enabled, canGoNext, canGoPrevious, onNext, onPrevious, threshold]);

  const onTouchCancel = useCallback(() => {
    originRef.current = null;
  }, []);

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
