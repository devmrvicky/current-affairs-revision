import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Highlighter, StickyNote, X } from 'lucide-react';
import type { HighlightColor } from '../../types';

interface SelectionMenuState {
  text: string;
  /** Selection bounding rect, captured at the moment of release — used for clamped positioning */
  rect: { left: number; right: number; top: number; bottom: number; width: number };
}

interface HighlightMenuProps {
  containerRef: React.RefObject<HTMLElement>;
  onHighlight: (text: string, color: HighlightColor) => void;
  onAddNote: (text: string) => void;
}

const COLORS: { value: HighlightColor; hex: string; label: string }[] = [
  { value: 'yellow', hex: '#facc15', label: 'Yellow' },
  { value: 'green',  hex: '#4ade80', label: 'Green' },
  { value: 'blue',   hex: '#60a5fa', label: 'Blue' },
  { value: 'pink',   hex: '#f472b6', label: 'Pink' },
  { value: 'orange', hex: '#fb923c', label: 'Orange' },
];

const MENU_WIDTH_ESTIMATE = 230; // px, used for viewport clamping before layout
const MENU_HEIGHT_ESTIMATE = 48;
const VIEWPORT_MARGIN = 8;

export function HighlightMenu({ containerRef, onHighlight, onAddNote }: HighlightMenuProps) {
  const [selection, setSelection] = useState<SelectionMenuState | null>(null);
  const [showColors, setShowColors] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Guards against the menu being dismissed by the same gesture that opens it,
  // and against taps *on* the menu re-triggering a "clear" before onClick fires.
  const isPointerDownOnMenuRef = useRef(false);
  const justOpenedAtRef = useRef(0);

  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const text = sel.toString().trim();
    if (text.length < 3) return;

    const container = containerRef.current;
    if (!container) return;

    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return; // nothing actually selected on screen

    setSelection({
      text,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width },
    });
    setShowColors(false);
    justOpenedAtRef.current = Date.now();
  }, [containerRef]);

  // Explicit end-of-gesture capture — far more reliable than `selectionchange`,
  // which fires continuously during drag and races with touch/click handling.
  useEffect(() => {
    function handlePointerUp(e: PointerEvent | MouseEvent | TouchEvent) {
      // If the pointerup originated on our own menu, don't recapture/clobber selection.
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      // Defer one tick so the browser has finalized the selection object (critical on mobile).
      window.setTimeout(captureSelection, 10);
    }

    document.addEventListener('mouseup', handlePointerUp);
    document.addEventListener('touchend', handlePointerUp);
    // keyup covers keyboard-driven selection (shift+arrow) on desktop
    document.addEventListener('keyup', handlePointerUp as EventListener);

    return () => {
      document.removeEventListener('mouseup', handlePointerUp);
      document.removeEventListener('touchend', handlePointerUp);
      document.removeEventListener('keyup', handlePointerUp as EventListener);
    };
  }, [captureSelection]);

  // Dismiss only on a genuine new pointerdown OUTSIDE the menu (not on selectionchange,
  // which fires too eagerly and would close the menu before a tap on it registers).
  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) {
        isPointerDownOnMenuRef.current = true;
        return;
      }
      isPointerDownOnMenuRef.current = false;
      // Ignore the very first down event right after opening (covers the
      // mouseup->mousedown micro-sequence some browsers emit on selection end).
      if (Date.now() - justOpenedAtRef.current < 50) return;
      setSelection(null);
      setShowColors(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  function handlePickColor(color: HighlightColor) {
    if (!selection) return;
    onHighlight(selection.text, color);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setShowColors(false);
  }

  function handleNoteClick() {
    if (!selection) return;
    onAddNote(selection.text);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  // ─── Position with viewport collision detection ──────────────────────────────
  // Clamp horizontally so the menu never overflows left/right edges.
  // Flip below the selection if there isn't enough room above.
  function computePosition() {
    if (!selection) return { left: 0, top: 0, flipped: false };
    const { rect } = selection;
    const vw = window.innerWidth;

    let left = rect.left + rect.width / 2;
    const halfMenu = MENU_WIDTH_ESTIMATE / 2;
    left = Math.max(halfMenu + VIEWPORT_MARGIN, Math.min(left, vw - halfMenu - VIEWPORT_MARGIN));

    const spaceAbove = rect.top;
    const flipped = spaceAbove < MENU_HEIGHT_ESTIMATE + 16;
    const top = flipped ? rect.bottom + 10 : rect.top - 10;

    return { left, top, flipped };
  }

  const pos = selection ? computePosition() : null;

  return (
    <AnimatePresence>
      {selection && pos && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.92, y: pos.flipped ? -6 : 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.15 }}
          className={`fixed z-[120] -translate-x-1/2 ${pos.flipped ? '' : '-translate-y-full'}`}
          style={{ left: pos.left, top: pos.top }}
        >
          {!pos.flipped && (
            <div
              className="w-2.5 h-2.5 rotate-45 mx-auto mb-[-6px] relative z-0"
              style={{ background: 'var(--card)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
            />
          )}
          <div
            className="relative z-10 flex items-center gap-1 px-2 py-1.5 rounded-xl shadow-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            {!showColors ? (
              <>
                <button
                  onClick={() => setShowColors(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-gray-100 dark:hover:bg-white/10 transition-colors active:scale-95"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Highlighter size={14} className="text-amber-500" />
                  Highlight
                </button>
                <div className="w-px h-5" style={{ background: 'var(--border)' }} />
                <button
                  onClick={handleNoteClick}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-gray-100 dark:hover:bg-white/10 transition-colors active:scale-95"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <StickyNote size={14} className="text-blue-500" />
                  Note
                </button>
              </>
            ) : (
              <>
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => handlePickColor(c.value)}
                    className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 shadow-sm hover:scale-110 active:scale-95 transition-transform"
                    style={{ background: c.hex }}
                    title={c.label}
                  />
                ))}
                <button
                  onClick={() => setShowColors(false)}
                  className="ml-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
                >
                  <X size={13} style={{ color: 'var(--text-muted)' }} />
                </button>
              </>
            )}
          </div>
          {pos.flipped && (
            <div
              className="w-2.5 h-2.5 rotate-45 mx-auto mt-[-6px] relative z-0"
              style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
