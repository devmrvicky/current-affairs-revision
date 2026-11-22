import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';

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
  clickTarget: HTMLElement | null;
}

/**
 * One-finger horizontal navigation for the complete question viewport.
 * Interactive answer options are intentionally swipeable; only elements marked
 * data-swipe-ignore are excluded (for example, the pinned bottom controls).
 */
export function useQuestionSwipe({
  enabled,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  threshold = 44,
}: QuestionSwipeOptions) {
  const originRef = useRef<TouchOrigin | null>(null);
  const suppressClickUntilRef = useRef(0);
  const suppressClickTargetRef = useRef<HTMLElement | null>(null);
  const [direction, setDirection] = useState<-1 | 1>(-1);

  const onTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || event.touches.length !== 1) {
      originRef.current = null;
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest('[data-swipe-ignore="true"]')) {
      originRef.current = null;
      return;
    }

    const touch = event.touches[0];
    const clickTarget = target instanceof Element
      ? target.closest('button, [role="button"]') as HTMLElement | null
      : null;
    originRef.current = { x: touch.clientX, y: touch.clientY, clickTarget };
  }, [enabled]);

  const onTouchEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const origin = originRef.current;
    originRef.current = null;
    if (!enabled || !origin || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.15) return;

    // Swipe left advances (the outgoing question slides left); swipe right goes back.
    // Suppress the synthetic click only when a real navigation occurs, so a swipe
    // at the first/last question never blocks an intentional answer tap.
    if (dx < 0 && canGoNext) {
      if (origin.clickTarget) {
        suppressClickUntilRef.current = Date.now() + 450;
        suppressClickTargetRef.current = origin.clickTarget;
      }
      setDirection(-1);
      onNext();
    } else if (dx > 0 && canGoPrevious) {
      if (origin.clickTarget) {
        suppressClickUntilRef.current = Date.now() + 450;
        suppressClickTargetRef.current = origin.clickTarget;
      }
      setDirection(1);
      onPrevious();
    }
  }, [enabled, canGoNext, canGoPrevious, onNext, onPrevious, threshold]);

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const suppressedTarget = suppressClickTargetRef.current;
    if (Date.now() <= suppressClickUntilRef.current && suppressedTarget && event.target instanceof Node && suppressedTarget.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntilRef.current = 0;
      suppressClickTargetRef.current = null;
      return;
    }
    if (Date.now() > suppressClickUntilRef.current) suppressClickTargetRef.current = null;
  }, []);

  const onTouchCancel = useCallback(() => {
    originRef.current = null;
  }, []);

  return { onTouchStart, onTouchEnd, onTouchCancel, onClickCapture, direction };
}
