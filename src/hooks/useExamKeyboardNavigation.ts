import { useEffect, useRef } from 'react';

export interface ExamKeyboardNavigationOptions {
  /** Turn the listener off while a dialog/drawer/pause overlay owns the keyboard. */
  enabled: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

/** Elements that use arrow keys for their own purposes — never steal them. */
function isKeyboardOwner(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // Composite widgets and anything inside a dialog manage arrow keys themselves.
  return Boolean(
    target.closest(
      '[role="textbox"], [role="combobox"], [role="listbox"], [role="slider"], [role="spinbutton"], [role="menu"], [role="tablist"], [role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"], [data-exam-keys="off"]'
    )
  );
}

/**
 * ← / → move to the previous / next question in an active test.
 *
 * One window-level listener per mounted test screen. It reads the latest
 * callbacks through a ref, so it is attached once and never re-subscribed (no
 * duplicate listeners, no stale closures) and is removed on unmount.
 *
 * Deliberately conservative:
 *  • only plain arrows navigate — Alt/Cmd+arrow is the browser's Back/Forward and
 *    is swallowed during a test instead of leaving it; Ctrl/Shift combos are left alone;
 *  • ignored while typing in a field or inside a dialog, or when a handler already
 *    consumed the event;
 *  • key auto-repeat is ignored so holding an arrow can't race through the paper;
 *  • a boundary press (← on Q1, → on the last question) does nothing.
 */
export function useExamKeyboardNavigation({ enabled, canGoPrevious, canGoNext, onPrevious, onNext }: ExamKeyboardNavigationOptions): void {
  const latest = useRef({ canGoPrevious, canGoNext, onPrevious, onNext });
  useEffect(() => {
    latest.current = { canGoPrevious, canGoNext, onPrevious, onNext };
  });

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.defaultPrevented || e.isComposing) return;
      if (isKeyboardOwner(e.target)) return;

      // Browser history shortcuts (Alt+←/→ on Windows/Linux, Cmd+←/→ on macOS): keep the learner inside the test.
      if (e.altKey || e.metaKey) {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.shiftKey) return;

      e.preventDefault(); // also stops the page from scrolling sideways
      if (e.repeat) return;

      const { canGoPrevious: prevOk, canGoNext: nextOk, onPrevious: prev, onNext: next } = latest.current;
      if (e.key === 'ArrowLeft') {
        if (prevOk) prev();
      } else if (nextOk) {
        next();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
